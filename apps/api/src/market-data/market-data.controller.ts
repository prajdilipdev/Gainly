import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { Exchange } from '@prisma/client';
import { MarketDataService } from './market-data.service';

const RANGES = ['1mo', '3mo', '6mo', '1y', '2y', '5y', 'max'] as const;
type Range = (typeof RANGES)[number];

function parseExchange(value: string): Exchange {
  const upper = value?.toUpperCase();
  if (!Object.values(Exchange).includes(upper as Exchange)) {
    throw new BadRequestException(
      `Invalid exchange "${value}". Supported: NYSE, NASDAQ, NSE, BSE`,
    );
  }
  return upper as Exchange;
}

@Controller('market')
export class MarketDataController {
  constructor(private readonly marketData: MarketDataService) {}

  @Get('search')
  search(@Query('q') q: string) {
    if (!q || q.trim().length === 0) {
      throw new BadRequestException('Query parameter "q" is required');
    }
    return this.marketData.search(q);
  }

  @Get('quote/:exchange/:symbol')
  getQuote(@Param('exchange') exchange: string, @Param('symbol') symbol: string) {
    return this.marketData.getQuote(symbol, parseExchange(exchange));
  }

  @Get('quotes')
  async getQuotes(@Query('symbols') symbols: string) {
    if (!symbols) {
      throw new BadRequestException(
        'Query parameter "symbols" is required (format: NSE:INFY,NASDAQ:AAPL)',
      );
    }
    const pairs = symbols
      .split(',')
      .filter(Boolean)
      .slice(0, 100)
      .map((entry) => {
        const [exchange, symbol] = entry.split(':');
        if (!exchange || !symbol) {
          throw new BadRequestException(
            `Invalid entry "${entry}". Use EXCHANGE:SYMBOL`,
          );
        }
        return { symbol, exchange: parseExchange(exchange) };
      });
    return this.marketData.getQuotes(pairs);
  }

  @Get('history/:exchange/:symbol')
  getHistory(
    @Param('exchange') exchange: string,
    @Param('symbol') symbol: string,
    @Query('range') range?: string,
  ) {
    const r = (range ?? '1y') as Range;
    if (!RANGES.includes(r)) {
      throw new BadRequestException(
        `Invalid range. Supported: ${RANGES.join(', ')}`,
      );
    }
    return this.marketData.getHistory(symbol, parseExchange(exchange), r);
  }

  @Get('fx/usdinr')
  async getUsdInr() {
    return { rate: await this.marketData.getUsdInrRate() };
  }
}
