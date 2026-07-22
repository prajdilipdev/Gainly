import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from '../market-data/market-data.service';
import { openExchanges } from '../market-data/market-hours.util';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Periodically evaluates active alerts against live quotes. Runs every
 * minute; quotes are cached so distinct symbols are fetched at most once
 * per cache TTL.
 */
@Injectable()
export class AlertsScheduler {
  private readonly logger = new Logger(AlertsScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketData: MarketDataService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async evaluateAlerts() {
    if (this.running) return;

    // Prices only move while a venue is trading, so restrict the sweep to
    // open exchanges instead of scanning every active alert around the clock.
    const tradingNow = openExchanges();
    if (tradingNow.length === 0) return;

    this.running = true;
    try {
      const alerts = await this.prisma.alert.findMany({
        where: { status: 'ACTIVE', exchange: { in: tradingNow } },
      });
      if (alerts.length === 0) return;

      const pairs = alerts.map((a) => ({
        symbol: a.symbol,
        exchange: a.exchange,
      }));
      const quotes = await this.marketData.getQuotes(pairs);
      const quoteMap = new Map(
        quotes.map((q) => [`${q.symbol}:${q.exchange}`, q]),
      );

      for (const alert of alerts) {
        const quote = quoteMap.get(`${alert.symbol}:${alert.exchange}`);
        if (!quote || quote.price <= 0) continue;

        const threshold = alert.threshold.toNumber();
        let triggered = false;
        let description = '';
        switch (alert.condition) {
          case 'ABOVE':
            triggered = quote.price >= threshold;
            description = `crossed above ${threshold}`;
            break;
          case 'BELOW':
            triggered = quote.price <= threshold;
            description = `dropped below ${threshold}`;
            break;
          case 'PCT_CHANGE_UP':
            triggered = quote.changePercent >= threshold;
            description = `is up ${quote.changePercent.toFixed(2)}% today (target +${threshold}%)`;
            break;
          case 'PCT_CHANGE_DOWN':
            triggered = quote.changePercent <= -threshold;
            description = `is down ${quote.changePercent.toFixed(2)}% today (target -${threshold}%)`;
            break;
        }
        if (!triggered) continue;

        try {
          // Conditional transition guards against deleted alerts and
          // duplicate notifications when multiple instances run the cron
          const updated = await this.prisma.alert.updateMany({
            where: { id: alert.id, status: 'ACTIVE' },
            data: { status: 'TRIGGERED', triggeredAt: new Date() },
          });
          if (updated.count === 0) continue;
          await this.notifications.create(
            alert.userId,
            `Price alert: ${alert.symbol}`,
            `${alert.symbol} (${alert.exchange}) ${description}. Current price: ${quote.price.toFixed(2)} ${quote.currency}.`,
          );
          this.logger.log(`Alert ${alert.id} triggered for ${alert.symbol}`);
        } catch (err) {
          // One failing alert must not abort the rest of the batch
          this.logger.warn(
            `Failed to process alert ${alert.id}: ${(err as Error).message}`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(`Alert evaluation failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
