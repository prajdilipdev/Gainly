export type Exchange = 'NYSE' | 'NASDAQ' | 'NSE' | 'BSE';
export type Currency = 'USD' | 'INR';
export type TransactionType = 'BUY' | 'SELL' | 'DIVIDEND' | 'SPLIT';
export type AlertCondition =
  | 'ABOVE'
  | 'BELOW'
  | 'PCT_CHANGE_UP'
  | 'PCT_CHANGE_DOWN';
export type AlertStatus = 'ACTIVE' | 'TRIGGERED' | 'DISABLED';

export interface User {
  id: string;
  email: string;
  name: string;
  baseCurrency: Currency;
}

export interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  baseCurrency: Currency;
  createdAt: string;
  _count?: { transactions: number };
}

export interface Transaction {
  id: string;
  portfolioId: string;
  type: TransactionType;
  symbol: string;
  exchange: Exchange;
  companyName: string | null;
  quantity: string;
  price: string;
  fees: string;
  currency: Currency;
  notes: string | null;
  executedAt: string;
}

export interface Quote {
  symbol: string;
  exchange: Exchange;
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

export interface EnrichedHolding {
  symbol: string;
  exchange: Exchange;
  companyName: string | null;
  currency: string;
  quantity: number;
  avgCost: number;
  costBasis: number;
  realizedPnl: number;
  dividends: number;
  totalFees: number;
  firstBuyDate: string | null;
  currentPrice: number | null;
  marketValue: number | null;
  marketValueBase: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
  dayChange: number | null;
  dayChangePercent: number | null;
  weight: number | null;
}

export interface AllocationSlice {
  label: string;
  value: number;
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
    byExchange: AllocationSlice[];
    byCurrency: AllocationSlice[];
    bySymbol: AllocationSlice[];
  };
}

export interface DashboardEntry {
  id: string;
  name: string;
  baseCurrency: Currency;
  summary: PortfolioSummary;
}

export interface Watchlist {
  id: string;
  name: string;
  createdAt: string;
  _count?: { items: number };
  items?: WatchlistItem[];
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  exchange: Exchange;
  companyName: string | null;
  addedAt: string;
  quote?: Quote | null;
}

export interface Alert {
  id: string;
  symbol: string;
  exchange: Exchange;
  condition: AlertCondition;
  threshold: string;
  status: AlertStatus;
  note: string | null;
  triggeredAt: string | null;
  createdAt: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface SearchResult {
  symbol: string;
  exchange: Exchange;
  name: string;
  type: string;
}

export interface HistoricalBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type FieldKey =
  | 'symbol'
  | 'companyName'
  | 'type'
  | 'quantity'
  | 'price'
  | 'fees'
  | 'date'
  | 'exchange'
  | 'currency'
  | 'notes'
  | 'amount';

export interface MappedRow {
  index: number;
  raw: string[];
  parsed: {
    symbol?: string;
    companyName?: string;
    type?: TransactionType;
    quantity?: number;
    price?: number;
    fees?: number;
    date?: string;
    exchange?: Exchange;
    currency?: Currency;
    notes?: string;
  };
  errors: string[];
  warnings: string[];
}

export interface ImportPreview {
  headers: string[];
  hasHeader: boolean;
  mapping: Record<string, FieldKey | null>;
  confidence: Record<string, number>;
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: MappedRow[];
}
