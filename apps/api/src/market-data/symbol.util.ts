import { Exchange } from '@prisma/client';

/**
 * Maps an app-level (symbol, exchange) pair to the Yahoo Finance ticker.
 * US symbols are used as-is; NSE gets the ".NS" suffix, BSE gets ".BO".
 */
export function toYahooSymbol(symbol: string, exchange: Exchange): string {
  const clean = symbol.trim().toUpperCase();
  switch (exchange) {
    case 'NSE':
      return clean.endsWith('.NS') ? clean : `${clean}.NS`;
    case 'BSE':
      return clean.endsWith('.BO') ? clean : `${clean}.BO`;
    default:
      return clean;
  }
}

/** Parses a Yahoo ticker back into (symbol, exchange-hint). */
export function fromYahooSymbol(yahooSymbol: string): {
  symbol: string;
  exchange: Exchange | null;
} {
  const upper = yahooSymbol.toUpperCase();
  if (upper.endsWith('.NS')) return { symbol: upper.slice(0, -3), exchange: 'NSE' };
  if (upper.endsWith('.BO')) return { symbol: upper.slice(0, -3), exchange: 'BSE' };
  return { symbol: upper, exchange: null };
}

const SUPPORTED_YAHOO_EXCHANGES: Record<string, Exchange> = {
  NYQ: 'NYSE',
  NMS: 'NASDAQ',
  NGM: 'NASDAQ',
  NCM: 'NASDAQ',
  ASE: 'NYSE', // NYSE American
  NSI: 'NSE',
  BSE: 'BSE',
};

export function mapYahooExchange(code: string | undefined): Exchange | null {
  if (!code) return null;
  return SUPPORTED_YAHOO_EXCHANGES[code] ?? null;
}

export function currencyForExchange(exchange: Exchange): 'USD' | 'INR' {
  return exchange === 'NSE' || exchange === 'BSE' ? 'INR' : 'USD';
}
