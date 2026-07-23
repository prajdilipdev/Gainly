import { Injectable } from '@nestjs/common';
import { Currency, Exchange } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfoliosService } from '../portfolios/portfolios.service';
import { MarketDataService, Quote } from '../market-data/market-data.service';
import { computeHoldings, EngineTransaction, Holding } from './holdings.engine';
import { cagr, CashFlow, xirr } from './xirr';

export interface EnrichedHolding extends Omit<Holding, 'lots'> {
  currentPrice: number | null;
  marketValue: number | null;
  marketValueBase: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  weight: number | null;
}

export interface PortfolioSummary {
  portfolioId: string;
  baseCurrency: Currency;
  usdInrRate: number;
  totalMarketValue: number;
  totalCostBasis: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  totalDividends: number;
  totalFees: number;
  totalPnl: number;
  totalReturnPercent: number | null;
  dayChange: number;
  dayChangePercent: number | null;
  xirr: number | null;
  cagr: number | null;
  holdingsCount: number;
  holdings: EnrichedHolding[];
  allocation: {
    byExchange: { label: string; value: number }[];
    byCurrency: { label: string; value: number }[];
    bySymbol: { label: string; value: number }[];
  };
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfoliosService: PortfoliosService,
    private readonly marketData: MarketDataService,
  ) {}

  async getPortfolioSummary(
    userId: string,
    portfolioId: string,
  ): Promise<PortfolioSummary> {
    const portfolio = await this.portfoliosService.findOne(userId, portfolioId);
    const txs = await this.prisma.transaction.findMany({
      where: { portfolioId },
      orderBy: { executedAt: 'asc' },
    });

    const engineTxs: EngineTransaction[] = txs.map((t) => ({
      type: t.type,
      symbol: t.symbol,
      exchange: t.exchange,
      companyName: t.companyName,
      quantity: t.quantity.toNumber(),
      price: t.price.toNumber(),
      fees: t.fees.toNumber(),
      currency: t.currency,
      executedAt: t.executedAt,
    }));

    const holdings = computeHoldings(engineTxs);
    const active = holdings.filter((h) => h.quantity > 0);
    const base = portfolio.baseCurrency;

    // FX rate and quotes are independent network calls — fetch concurrently
    const [usdInr, quotes] = await Promise.all([
      this.marketData.getUsdInrRate(),
      this.marketData.getQuotes(
        active.map((h) => ({ symbol: h.symbol, exchange: h.exchange })),
      ),
    ]);
    const quoteMap = new Map<string, Quote>(
      quotes.map((q) => [`${q.symbol}:${q.exchange}`, q]),
    );

    const toBase = (amount: number, currency: string): number => {
      if (currency === base) return amount;
      if (currency === 'USD' && base === 'INR') return amount * usdInr;
      if (currency === 'INR' && base === 'USD') return amount / usdInr;
      return amount;
    };

    let totalMarketValue = 0;
    let totalCostBasis = 0;
    let totalDayChange = 0;
    let totalPrevValue = 0;

    const enriched: EnrichedHolding[] = holdings.map((h) => {
      const { lots: _lots, ...rest } = h;
      const q = quoteMap.get(`${h.symbol}:${h.exchange}`) ?? null;
      const price = q?.price ?? null;
      const marketValue = price !== null ? price * h.quantity : null;
      const marketValueBase =
        marketValue !== null ? toBase(marketValue, h.currency) : null;
      const unrealized =
        marketValue !== null ? marketValue - h.costBasis : null;
      const dayChange =
        q && h.quantity > 0 ? q.change * h.quantity : null;

      if (h.quantity > 0) {
        totalCostBasis += toBase(h.costBasis, h.currency);
        if (marketValueBase !== null) totalMarketValue += marketValueBase;
        if (q && dayChange !== null) {
          totalDayChange += toBase(dayChange, h.currency);
          totalPrevValue += toBase(q.previousClose * h.quantity, h.currency);
        }
      }

      return {
        ...rest,
        currentPrice: price,
        marketValue,
        marketValueBase,
        unrealizedPnl: unrealized,
        unrealizedPnlPercent:
          unrealized !== null && h.costBasis > 0
            ? (unrealized / h.costBasis) * 100
            : null,
        dayChange,
        dayChangePercent: q?.changePercent ?? null,
        weight: null, // filled below
      };
    });

    for (const h of enriched) {
      if (h.quantity > 0 && h.marketValueBase !== null && totalMarketValue > 0) {
        h.weight = (h.marketValueBase / totalMarketValue) * 100;
      }
    }

    const totalRealizedPnl = holdings.reduce(
      (s, h) => s + toBase(h.realizedPnl, h.currency),
      0,
    );
    const totalDividends = holdings.reduce(
      (s, h) => s + toBase(h.dividends, h.currency),
      0,
    );
    const totalFees = holdings.reduce(
      (s, h) => s + toBase(h.totalFees, h.currency),
      0,
    );
    const totalUnrealizedPnl = totalMarketValue - totalCostBasis;
    const totalPnl = totalUnrealizedPnl + totalRealizedPnl + totalDividends;

    // XIRR from the actual cash-flow ledger + current value as terminal flow
    const flows: CashFlow[] = [];
    let investedTotal = 0;
    for (const t of engineTxs) {
      const gross =
        t.type === 'BUY'
          ? -(t.quantity * t.price + t.fees)
          : t.type === 'SELL'
            ? t.quantity * t.price - t.fees
            : t.type === 'DIVIDEND'
              ? t.price - t.fees
              : 0;
      if (gross !== 0) {
        flows.push({ amount: toBase(gross, t.currency), date: t.executedAt });
        if (gross < 0) investedTotal += -toBase(gross, t.currency);
      }
    }
    if (totalMarketValue > 0) {
      flows.push({ amount: totalMarketValue, date: new Date() });
    }
    const xirrValue = xirr(flows);

    const firstDate =
      engineTxs.length > 0 ? engineTxs[0].executedAt : null;
    const cagrValue =
      firstDate && investedTotal > 0
        ? cagr(
            investedTotal,
            totalMarketValue + totalRealizedPnl + totalDividends,
            firstDate,
            new Date(),
          )
        : null;

    const allocation = this.buildAllocation(enriched);

    return {
      portfolioId,
      baseCurrency: base,
      usdInrRate: usdInr,
      totalMarketValue,
      totalCostBasis,
      totalUnrealizedPnl,
      totalRealizedPnl,
      totalDividends,
      totalFees,
      totalPnl,
      totalReturnPercent:
        totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : null,
      dayChange: totalDayChange,
      dayChangePercent:
        totalPrevValue > 0 ? (totalDayChange / totalPrevValue) * 100 : null,
      xirr: xirrValue,
      cagr: cagrValue,
      holdingsCount: enriched.filter((h) => h.quantity > 0).length,
      holdings: enriched,
      allocation,
    };
  }

  /** Aggregated summary across every portfolio the user owns. */
  async getDashboard(userId: string) {
    const portfolios = await this.portfoliosService.findAll(userId);
    const summaries = await Promise.all(
      portfolios.map((p) => this.getPortfolioSummary(userId, p.id)),
    );
    return portfolios.map((p, i) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      baseCurrency: p.baseCurrency,
      summary: summaries[i],
    }));
  }

  private buildAllocation(holdings: EnrichedHolding[]) {
    const active = holdings.filter(
      (h) => h.quantity > 0 && h.marketValueBase !== null,
    );
    const sumBy = (keyFn: (h: EnrichedHolding) => string) => {
      const map = new Map<string, number>();
      for (const h of active) {
        const key = keyFn(h);
        map.set(key, (map.get(key) ?? 0) + (h.marketValueBase ?? 0));
      }
      return [...map.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);
    };
    return {
      byExchange: sumBy((h) => h.exchange),
      byCurrency: sumBy((h) => h.currency),
      bySymbol: sumBy((h) => h.symbol),
    };
  }
}
