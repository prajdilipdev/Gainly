import { Exchange, TransactionType } from '@prisma/client';
import { RawTable } from './parsers';

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

export interface ColumnMapping {
  [columnIndex: number]: FieldKey | null;
}

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
    currency?: 'USD' | 'INR';
    notes?: string;
  };
  errors: string[];
  warnings: string[];
}

/** Header synonyms per canonical field, matched after normalization. */
const HEADER_SYNONYMS: Record<FieldKey, string[]> = {
  symbol: [
    'symbol', 'ticker', 'tickersymbol', 'stock', 'stocksymbol', 'scrip',
    'scripcode', 'scripname', 'tradingsymbol', 'instrument', 'security',
    'securityname', 'code', 'nsecode', 'bsecode', 'isin',
  ],
  companyName: [
    'company', 'companyname', 'name', 'stockname', 'description',
    'securitydescription', 'longname',
  ],
  type: [
    'type', 'transactiontype', 'txntype', 'trantype', 'action', 'side',
    'buysell', 'transaction', 'activity', 'activitytype', 'ordertype',
  ],
  quantity: [
    'quantity', 'qty', 'shares', 'units', 'noofshares', 'numberofshares',
    'volume', 'sharesqty', 'filledqty',
  ],
  price: [
    'price', 'buyprice', 'purchaseprice', 'costprice', 'avgprice',
    'averageprice', 'averagecost', 'avgcost', 'rate', 'tradeprice',
    'executionprice', 'priceshare', 'pricepershare', 'unitprice', 'nav',
    'sellprice', 'fillprice',
  ],
  fees: [
    'fees', 'fee', 'commission', 'brokerage', 'charges', 'totalcharges',
    'taxes', 'stt', 'transactioncost', 'costs',
  ],
  date: [
    'date', 'tradedate', 'transactiondate', 'txndate', 'buydate',
    'purchasedate', 'datetime', 'executedat', 'executiondate', 'orderdate',
    'settlementdate', 'timestamp', 'dateacquired', 'acquisitiondate',
  ],
  exchange: ['exchange', 'market', 'exch', 'exchangename', 'segment', 'listedon'],
  currency: ['currency', 'ccy', 'curr', 'currencycode'],
  notes: ['notes', 'note', 'remarks', 'comment', 'comments', 'memo', 'tag'],
  amount: [
    'amount', 'totalamount', 'value', 'totalvalue', 'total', 'netamount',
    'grossamount', 'cost', 'totalcost', 'investedamount', 'investment',
    'buyvalue', 'tradevalue',
  ],
};

const TYPE_ALIASES: Record<string, TransactionType> = {
  buy: 'BUY', b: 'BUY', bought: 'BUY', purchase: 'BUY', purchased: 'BUY',
  acquire: 'BUY', credit: 'BUY', deposit: 'BUY',
  sell: 'SELL', s: 'SELL', sold: 'SELL', sale: 'SELL', redeem: 'SELL',
  dividend: 'DIVIDEND', div: 'DIVIDEND', dividends: 'DIVIDEND',
  distribution: 'DIVIDEND', payout: 'DIVIDEND',
  split: 'SPLIT', stocksplit: 'SPLIT', bonus: 'SPLIT',
};

const EXCHANGE_ALIASES: Record<string, Exchange> = {
  nyse: 'NYSE', newyorkstockexchange: 'NYSE', ny: 'NYSE',
  nasdaq: 'NASDAQ', nasdaqgs: 'NASDAQ', nasdaqgm: 'NASDAQ', nasdaqcm: 'NASDAQ',
  nse: 'NSE', nationalstockexchange: 'NSE', nseindia: 'NSE',
  bse: 'BSE', bombaystockexchange: 'BSE', bseindia: 'BSE',
  us: 'NASDAQ', usa: 'NASDAQ', india: 'NSE', in: 'NSE',
};

function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Score how well a column's values look like a given field. */
function scoreValues(field: FieldKey, values: string[]): number {
  const nonEmpty = values.filter((v) => v.trim() !== '');
  if (nonEmpty.length === 0) return 0;
  const ratio = (pred: (v: string) => boolean) =>
    nonEmpty.filter(pred).length / nonEmpty.length;

  switch (field) {
    case 'symbol':
      return ratio((v) => /^[A-Za-z][A-Za-z0-9.\-&]{0,14}$/.test(v.trim())) * 0.8;
    case 'quantity':
      return ratio((v) => isNumericish(v) && Math.abs(parseNumber(v) ?? 0) < 1e9) * 0.6;
    case 'price':
    case 'fees':
    case 'amount':
      return ratio((v) => isNumericish(v)) * 0.5;
    case 'date':
      return ratio((v) => parseDate(v) !== null) * 0.9;
    case 'type':
      return ratio((v) => TYPE_ALIASES[normalizeHeader(v)] !== undefined) * 1.0;
    case 'exchange':
      return ratio((v) => EXCHANGE_ALIASES[normalizeHeader(v)] !== undefined) * 1.0;
    case 'currency':
      return ratio((v) => /^(usd|inr|\$|₹|rs\.?)$/i.test(v.trim())) * 1.0;
    default:
      return 0;
  }
}

function isNumericish(v: string): boolean {
  return parseNumber(v) !== null;
}

/** Parses "1,234.56", "₹1,23,456.78", "$45.2", "(120.5)", "1 234,56". */
export function parseNumber(value: string): number | null {
  let v = value.trim();
  if (v === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  if (v.startsWith('-')) {
    negative = true;
    v = v.slice(1);
  }
  v = v.replace(/[₹$€£]|rs\.?|inr|usd/gi, '').trim();
  // Tolerate currency symbols mangled by encoding issues (₹ → "?" or "â‚¹")
  v = v.replace(/^[^\d(.\-]+/, '');
  // European format "1.234,56" → detect comma as decimal separator
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)) {
    v = v.replace(/\./g, '').replace(',', '.');
  } else {
    v = v.replace(/,/g, '').replace(/\s/g, '');
  }
  if (!/^\d*\.?\d+([eE][+-]?\d+)?$/.test(v)) return null;
  const n = parseFloat(v);
  if (!isFinite(n)) return null;
  return negative ? -n : n;
}

/**
 * Parses common date formats to ISO (YYYY-MM-DD). Handles ISO, DD/MM/YYYY,
 * MM/DD/YYYY (disambiguated where possible), DD-MMM-YYYY, Unix epochs,
 * and Excel serial dates.
 */
export function parseDate(value: string): string | null {
  const v = value.trim();
  if (v === '') return null;

  // ISO or ISO datetime
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})([T ].*)?$/);
  if (m) return validateYmd(+m[1], +m[2], +m[3]);

  // YYYY/MM/DD
  m = v.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return validateYmd(+m[1], +m[2], +m[3]);

  // DD/MM/YYYY or MM/DD/YYYY (also with - or .)
  m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})([ T].*)?$/);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    let year = +m[3];
    if (year < 100) year += year > 50 ? 1900 : 2000;
    // Disambiguate: if first part > 12 it must be the day
    if (a > 12 && b <= 12) return validateYmd(year, b, a);
    if (b > 12 && a <= 12) return validateYmd(year, a, b);
    // Ambiguous — assume DD/MM (international convention; US brokers usually export ISO)
    return validateYmd(year, b, a);
  }

  // DD-MMM-YYYY / MMM DD, YYYY
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  m = v.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\-,]+(\d{2,4})$/);
  if (m) {
    const month = months[m[2].slice(0, 3).toLowerCase()];
    let year = +m[3];
    if (year < 100) year += year > 50 ? 1900 : 2000;
    if (month) return validateYmd(year, month, +m[1]);
  }
  m = v.match(/^([A-Za-z]{3,9})[\s\-]+(\d{1,2})[\s\-,]+(\d{2,4})$/);
  if (m) {
    const month = months[m[1].slice(0, 3).toLowerCase()];
    let year = +m[3];
    if (year < 100) year += year > 50 ? 1900 : 2000;
    if (month) return validateYmd(year, month, +m[2]);
  }

  // Excel serial date (plausible range 1990-2050 → 32874-54789)
  if (/^\d{5}$/.test(v)) {
    const serial = parseInt(v, 10);
    if (serial > 32874 && serial < 54789) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return date.toISOString().slice(0, 10);
    }
  }

  // Unix epoch seconds/millis
  if (/^\d{10}$/.test(v) || /^\d{13}$/.test(v)) {
    const ms = v.length === 10 ? +v * 1000 : +v;
    const date = new Date(ms);
    const year = date.getUTCFullYear();
    if (year >= 1990 && year <= 2050) return date.toISOString().slice(0, 10);
  }

  return null;
}

function validateYmd(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function parseType(value: string): TransactionType | null {
  return TYPE_ALIASES[normalizeHeader(value)] ?? null;
}

export function parseExchangeValue(value: string): Exchange | null {
  const direct = EXCHANGE_ALIASES[normalizeHeader(value)];
  if (direct) return direct;
  const v = value.trim().toUpperCase();
  if (v.endsWith('.NS')) return 'NSE';
  if (v.endsWith('.BO')) return 'BSE';
  return null;
}

export interface DetectionResult {
  hasHeader: boolean;
  headers: string[];
  mapping: ColumnMapping;
  confidence: Record<number, number>;
}

/**
 * Detects whether the first row is a header and maps each column to a
 * canonical field using header synonyms first, then value-shape heuristics
 * for unmatched columns.
 */
export function detectColumns(table: RawTable): DetectionResult {
  const width = Math.max(...table.map((r) => r.length));
  const firstRow = table[0].map((c) => c ?? '');
  const mapping: ColumnMapping = {};
  const confidence: Record<number, number> = {};
  const used = new Set<FieldKey>();

  // Header detection: does row 0 match synonyms and contain no data-like values?
  let headerMatches = 0;
  const headerFields: (FieldKey | null)[] = firstRow.map((h) => {
    const norm = normalizeHeader(h);
    if (!norm) return null;
    for (const [field, synonyms] of Object.entries(HEADER_SYNONYMS)) {
      if (synonyms.includes(norm)) {
        headerMatches++;
        return field as FieldKey;
      }
    }
    return null;
  });
  const numericInFirstRow = firstRow.filter((c) => isNumericish(c)).length;
  const hasHeader = headerMatches >= 2 || (headerMatches >= 1 && numericInFirstRow === 0);

  const dataRows = hasHeader ? table.slice(1) : table;
  const sample = dataRows.slice(0, 50);

  // Pass 1: header-based assignment
  if (hasHeader) {
    for (let c = 0; c < width; c++) {
      const field = headerFields[c];
      if (field && !used.has(field)) {
        mapping[c] = field;
        confidence[c] = 1;
        used.add(field);
      }
    }
  }

  // Pass 2: value heuristics for remaining columns
  const candidateFields: FieldKey[] = [
    'date', 'type', 'exchange', 'symbol', 'currency', 'quantity', 'price', 'fees', 'amount',
  ];
  for (const field of candidateFields) {
    if (used.has(field)) continue;
    let bestCol = -1;
    let bestScore = 0.55; // minimum confidence to auto-map
    for (let c = 0; c < width; c++) {
      if (mapping[c] !== undefined && mapping[c] !== null) continue;
      const values = sample.map((r) => r[c] ?? '');
      const score = scoreValues(field, values);
      if (score > bestScore) {
        bestScore = score;
        bestCol = c;
      }
    }
    if (bestCol >= 0) {
      mapping[bestCol] = field;
      confidence[bestCol] = bestScore;
      used.add(field);
    }
  }

  // Disambiguate quantity vs price when both numeric: quantities are usually
  // small-ish integers; prices have decimals. Swap if it looks inverted.
  const qtyCol = findCol(mapping, 'quantity');
  const priceCol = findCol(mapping, 'price');
  if (qtyCol >= 0 && priceCol >= 0) {
    const intRatio = (col: number) => {
      const nums = sample
        .map((r) => parseNumber(r[col] ?? ''))
        .filter((n): n is number => n !== null);
      if (nums.length === 0) return 0;
      return nums.filter((n) => Number.isInteger(n)).length / nums.length;
    };
    if (intRatio(priceCol) > 0.9 && intRatio(qtyCol) < 0.5 && confidence[qtyCol] < 1 && confidence[priceCol] < 1) {
      mapping[qtyCol] = 'price';
      mapping[priceCol] = 'quantity';
    }
  }

  for (let c = 0; c < width; c++) {
    if (mapping[c] === undefined) mapping[c] = null;
  }

  return {
    hasHeader,
    headers: hasHeader ? firstRow : firstRow.map((_, i) => `Column ${i + 1}`),
    mapping,
    confidence,
  };
}

function findCol(mapping: ColumnMapping, field: FieldKey): number {
  for (const [col, f] of Object.entries(mapping)) {
    if (f === field) return +col;
  }
  return -1;
}

/**
 * Applies a mapping to the data rows, parsing and validating each cell.
 * Derives price from amount/quantity when price is missing, infers exchange
 * from symbol suffixes or currency, and defaults type to BUY with a warning.
 */
export function mapRows(
  table: RawTable,
  mapping: ColumnMapping,
  hasHeader: boolean,
): MappedRow[] {
  const dataRows = hasHeader ? table.slice(1) : table;
  const rows: MappedRow[] = [];

  dataRows.forEach((raw, i) => {
    const row: MappedRow = { index: i, raw, parsed: {}, errors: [], warnings: [] };
    let amount: number | null = null;

    for (const [colStr, field] of Object.entries(mapping)) {
      const col = +colStr;
      if (!field) continue;
      const cell = (raw[col] ?? '').trim();
      if (cell === '') continue;

      switch (field) {
        case 'symbol': {
          const upper = cell.toUpperCase().replace(/\.(NS|BO)$/, (m) => m);
          if (upper.endsWith('.NS')) {
            row.parsed.symbol = upper.slice(0, -3);
            row.parsed.exchange = row.parsed.exchange ?? 'NSE';
          } else if (upper.endsWith('.BO')) {
            row.parsed.symbol = upper.slice(0, -3);
            row.parsed.exchange = row.parsed.exchange ?? 'BSE';
          } else {
            row.parsed.symbol = upper;
          }
          if (!/^[A-Z0-9.\-&]{1,20}$/.test(row.parsed.symbol)) {
            row.errors.push(`Invalid symbol "${cell}"`);
          }
          break;
        }
        case 'companyName':
          row.parsed.companyName = cell.slice(0, 200);
          break;
        case 'type': {
          const type = parseType(cell);
          if (type) row.parsed.type = type;
          else row.errors.push(`Unrecognized transaction type "${cell}"`);
          break;
        }
        case 'quantity': {
          const n = parseNumber(cell);
          if (n === null) row.errors.push(`Invalid quantity "${cell}"`);
          else if (n < 0) {
            // Negative quantity often means SELL in broker exports
            row.parsed.quantity = Math.abs(n);
            if (!row.parsed.type) row.parsed.type = 'SELL';
          } else row.parsed.quantity = n;
          break;
        }
        case 'price': {
          const n = parseNumber(cell);
          if (n === null) row.errors.push(`Invalid price "${cell}"`);
          else row.parsed.price = Math.abs(n);
          break;
        }
        case 'fees': {
          const n = parseNumber(cell);
          if (n === null) row.warnings.push(`Ignored invalid fees "${cell}"`);
          else row.parsed.fees = Math.abs(n);
          break;
        }
        case 'amount': {
          const n = parseNumber(cell);
          if (n !== null) amount = n;
          break;
        }
        case 'date': {
          const d = parseDate(cell);
          if (d === null) {
            row.errors.push(`Unrecognized date "${cell}"`);
          } else {
            row.parsed.date = d;
            const m = cell
              .trim()
              .match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
            if (m && +m[1] <= 12 && +m[2] <= 12 && +m[1] !== +m[2]) {
              row.warnings.push(
                `Ambiguous date "${cell}" read as DD/MM/YYYY (${d}) — verify if this export uses MM/DD`,
              );
            }
          }
          break;
        }
        case 'exchange': {
          const ex = parseExchangeValue(cell);
          if (ex) row.parsed.exchange = ex;
          else row.warnings.push(`Unknown exchange "${cell}"`);
          break;
        }
        case 'currency': {
          const c = cell.toUpperCase();
          if (c === 'USD' || c === '$') row.parsed.currency = 'USD';
          else if (c === 'INR' || c === '₹' || /^RS\.?$/.test(c)) row.parsed.currency = 'INR';
          else row.warnings.push(`Unknown currency "${cell}"`);
          break;
        }
        case 'notes':
          row.parsed.notes = cell.slice(0, 500);
          break;
      }
    }

    // Derivations and defaults
    if (row.parsed.price === undefined && amount !== null && row.parsed.quantity) {
      row.parsed.price = Math.abs(amount) / row.parsed.quantity;
      row.warnings.push('Price derived from amount ÷ quantity');
    }
    if (!row.parsed.type) {
      if (amount !== null && amount < 0) {
        row.parsed.type = 'SELL';
      } else {
        row.parsed.type = 'BUY';
        row.warnings.push('Type not found — defaulted to BUY');
      }
    }
    if (!row.parsed.exchange && row.parsed.currency) {
      row.parsed.exchange = row.parsed.currency === 'INR' ? 'NSE' : 'NASDAQ';
      row.warnings.push(
        `Exchange inferred from currency (${row.parsed.currency})`,
      );
    }
    if (!row.parsed.currency && row.parsed.exchange) {
      row.parsed.currency =
        row.parsed.exchange === 'NSE' || row.parsed.exchange === 'BSE'
          ? 'INR'
          : 'USD';
    }
    if (!row.parsed.exchange && row.parsed.symbol) {
      // No exchange signal at all — assume a US listing (Yahoo resolves plain
      // US symbols regardless of NYSE vs NASDAQ). Indian exports almost always
      // carry .NS/.BO suffixes, an exchange column, or INR amounts.
      row.parsed.exchange = 'NASDAQ';
      row.parsed.currency = row.parsed.currency ?? 'USD';
      row.warnings.push(
        'Exchange not found — assumed US listing (NASDAQ). Map an exchange column if these are NSE/BSE stocks.',
      );
    }

    // Required-field validation
    if (!row.parsed.symbol) row.errors.push('Missing symbol');
    if (!row.parsed.exchange) {
      row.errors.push('Missing exchange (NYSE, NASDAQ, NSE, or BSE)');
    }
    if (row.parsed.type === 'BUY' || row.parsed.type === 'SELL') {
      if (!row.parsed.quantity || row.parsed.quantity <= 0) {
        row.errors.push('Missing or invalid quantity');
      }
      if (row.parsed.price === undefined || row.parsed.price <= 0) {
        row.errors.push('Missing or invalid price');
      }
    }
    if (row.parsed.type === 'DIVIDEND' && row.parsed.price === undefined) {
      if (amount !== null) row.parsed.price = Math.abs(amount);
      else row.errors.push('Missing dividend amount');
      if (!row.parsed.quantity) row.parsed.quantity = 1;
    }
    if (row.parsed.type === 'SPLIT' && !row.parsed.quantity) {
      row.parsed.quantity = 1;
    }
    if (!row.parsed.date) {
      row.errors.push('Missing date');
    } else if (new Date(row.parsed.date) > new Date()) {
      row.errors.push(`Date ${row.parsed.date} is in the future`);
    }

    rows.push(row);
  });

  return rows;
}
