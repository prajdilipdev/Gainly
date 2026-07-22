import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Exchange } from '@prisma/client';
import yahooFinance from 'yahoo-finance2';
import { CacheService } from '../cache/cache.service';
import {
  currencyForExchange,
  mapYahooExchange,
  toYahooSymbol,
} from './symbol.util';

export interface Quote {
  symbol: string;
  exchange: Exchange;
  yahooSymbol: string;
  currency: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketCap: number | null;
  volume: number | null;
  shortName: string | null;
  marketState: string | null;
  asOf: string;
}

export interface HistoricalBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SearchResult {
  symbol: string;
  exchange: Exchange;
  name: string;
  type: string;
}

// Yahoo throttles default library user agents aggressively; a browser UA is
// required for reliable access.
const FETCH_OPTIONS = {
  fetchOptions: {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    },
  },
} as const;

yahooFinance.suppressNotices(['yahooSurvey']);

const QUOTE_TTL_SECONDS = 30;
const HISTORY_TTL_SECONDS = 15 * 60;
const SEARCH_TTL_SECONDS = 24 * 60 * 60;
const FX_TTL_SECONDS = 5 * 60;

@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  constructor(private readonly cache: CacheService) {}

  async getQuote(symbol: string, exchange: Exchange): Promise<Quote> {
    const yahooSymbol = toYahooSymbol(symbol, exchange);
    const cacheKey = `quote:${yahooSymbol}`;
    const cached = await this.cache.get<Quote>(cacheKey);
    if (cached) return cached;

    try {
      const q = await yahooFinance.quote(yahooSymbol, {}, FETCH_OPTIONS);
      const price = q.regularMarketPrice ?? 0;
      const prevClose = q.regularMarketPreviousClose ?? price;
      const quote: Quote = {
        symbol: symbol.toUpperCase(),
        exchange,
        yahooSymbol,
        currency: q.currency ?? currencyForExchange(exchange),
        price,
        previousClose: prevClose,
        change: q.regularMarketChange ?? price - prevClose,
        changePercent:
          q.regularMarketChangePercent ??
          (prevClose ? ((price - prevClose) / prevClose) * 100 : 0),
        dayHigh: q.regularMarketDayHigh ?? null,
        dayLow: q.regularMarketDayLow ?? null,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
        marketCap: q.marketCap ?? null,
        volume: q.regularMarketVolume ?? null,
        shortName: q.shortName ?? q.longName ?? null,
        marketState: q.marketState ?? null,
        asOf: new Date().toISOString(),
      };
      await this.cache.set(cacheKey, quote, QUOTE_TTL_SECONDS);
      return quote;
    } catch (err) {
      this.logger.warn(
        `Quote fetch failed for ${yahooSymbol}: ${(err as Error).message}`,
      );
      // Serve stale data if available rather than failing hard
      const stale = await this.cache.get<Quote>(`stale:${cacheKey}`);
      if (stale) return stale;
      throw new ServiceUnavailableException(
        `Unable to fetch quote for ${symbol} (${exchange})`,
      );
    }
  }

  async getQuotes(
    pairs: { symbol: string; exchange: Exchange }[],
  ): Promise<Quote[]> {
    const unique = new Map(
      pairs.map((p) => [`${p.symbol.toUpperCase()}:${p.exchange}`, p]),
    );
    const results = await Promise.allSettled(
      [...unique.values()].map((p) => this.getQuote(p.symbol, p.exchange)),
    );
    const quotes: Quote[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        quotes.push(r.value);
        // Keep a long-lived stale copy for graceful degradation
        void this.cache.set(
          `stale:quote:${r.value.yahooSymbol}`,
          r.value,
          24 * 60 * 60,
        );
      }
    }
    return quotes;
  }

  async getHistory(
    symbol: string,
    exchange: Exchange,
    range: '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | 'max',
  ): Promise<HistoricalBar[]> {
    const yahooSymbol = toYahooSymbol(symbol, exchange);
    const cacheKey = `history:${yahooSymbol}:${range}`;
    const cached = await this.cache.get<HistoricalBar[]>(cacheKey);
    if (cached) return cached;

    const period1 = this.rangeToStartDate(range);
    try {
      const result = await yahooFinance.chart(
        yahooSymbol,
        {
          period1,
          interval: range === '1mo' || range === '3mo' ? '1d' : '1wk',
        },
        FETCH_OPTIONS,
      );
      const bars: HistoricalBar[] = (result.quotes ?? [])
        .filter((b) => b.close != null)
        .map((b) => ({
          date: new Date(b.date).toISOString().slice(0, 10),
          open: b.open ?? b.close ?? 0,
          high: b.high ?? b.close ?? 0,
          low: b.low ?? b.close ?? 0,
          close: b.close ?? 0,
          volume: b.volume ?? 0,
        }));
      await this.cache.set(cacheKey, bars, HISTORY_TTL_SECONDS);
      return bars;
    } catch (err) {
      this.logger.warn(
        `History fetch failed for ${yahooSymbol}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        `Unable to fetch history for ${symbol} (${exchange})`,
      );
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim();
    if (q.length < 1) return [];
    const cacheKey = `search:${q.toLowerCase()}`;
    const cached = await this.cache.get<SearchResult[]>(cacheKey);
    if (cached) return cached;

    try {
      const res = await yahooFinance.search(
        q,
        { quotesCount: 20, newsCount: 0 },
        FETCH_OPTIONS,
      );
      const results: SearchResult[] = [];
      for (const item of res.quotes ?? []) {
        if (!('symbol' in item)) continue;
        const exchange = mapYahooExchange(
          (item as { exchange?: string }).exchange,
        );
        if (!exchange) continue; // Restrict to NYSE/NASDAQ/NSE/BSE
        const { symbol } = { symbol: item.symbol.toUpperCase() };
        const clean = symbol.replace(/\.(NS|BO)$/, '');
        results.push({
          symbol: clean,
          exchange,
          name:
            (item as { shortname?: string; longname?: string }).shortname ??
            (item as { longname?: string }).longname ??
            clean,
          type: (item as { quoteType?: string }).quoteType ?? 'EQUITY',
        });
      }
      await this.cache.set(cacheKey, results, SEARCH_TTL_SECONDS);
      return results;
    } catch (err) {
      this.logger.warn(`Search failed for "${q}": ${(err as Error).message}`);
      return [];
    }
  }

  /** USD/INR spot rate used to convert holdings into the account base currency. */
  async getUsdInrRate(): Promise<number> {
    const cacheKey = 'fx:USDINR';
    const cached = await this.cache.get<number>(cacheKey);
    if (cached) return cached;
    try {
      const q = await yahooFinance.quote('USDINR=X', {}, FETCH_OPTIONS);
      const rate = q.regularMarketPrice ?? 83;
      await this.cache.set(cacheKey, rate, FX_TTL_SECONDS);
      await this.cache.set('stale:fx:USDINR', rate, 7 * 24 * 60 * 60);
      return rate;
    } catch {
      const stale = await this.cache.get<number>('stale:fx:USDINR');
      return stale ?? 83;
    }
  }

  private rangeToStartDate(range: string): Date {
    const now = new Date();
    const d = new Date(now);
    switch (range) {
      case '1mo':
        d.setMonth(d.getMonth() - 1);
        break;
      case '3mo':
        d.setMonth(d.getMonth() - 3);
        break;
      case '6mo':
        d.setMonth(d.getMonth() - 6);
        break;
      case '1y':
        d.setFullYear(d.getFullYear() - 1);
        break;
      case '2y':
        d.setFullYear(d.getFullYear() - 2);
        break;
      case '5y':
        d.setFullYear(d.getFullYear() - 5);
        break;
      default:
        d.setFullYear(d.getFullYear() - 20);
    }
    return d;
  }
}
