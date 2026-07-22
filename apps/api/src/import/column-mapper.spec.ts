import {
  detectColumns,
  mapRows,
  parseDate,
  parseNumber,
  parseType,
} from './column-mapper';

describe('parseNumber', () => {
  it('parses plain and formatted numbers', () => {
    expect(parseNumber('1234.56')).toBe(1234.56);
    expect(parseNumber('1,234.56')).toBe(1234.56);
    expect(parseNumber('₹1,23,456.78')).toBe(123456.78);
    expect(parseNumber('$45.20')).toBe(45.2);
    expect(parseNumber('(120.5)')).toBe(-120.5);
    expect(parseNumber('-99')).toBe(-99);
    expect(parseNumber('1.234,56')).toBe(1234.56); // European
    expect(parseNumber('?3,850.75')).toBe(3850.75); // mangled ₹ encoding
    expect(parseNumber('â‚¹3,850.75')).toBe(3850.75); // double-encoded ₹
  });

  it('rejects non-numbers', () => {
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('12abc')).toBeNull();
  });
});

describe('parseDate', () => {
  it('parses common formats to ISO', () => {
    expect(parseDate('2024-01-15')).toBe('2024-01-15');
    expect(parseDate('2024-01-15T10:30:00Z')).toBe('2024-01-15');
    expect(parseDate('15/01/2024')).toBe('2024-01-15');
    expect(parseDate('01/15/2024')).toBe('2024-01-15'); // day>12 disambiguates
    expect(parseDate('15-Jan-2024')).toBe('2024-01-15');
    expect(parseDate('Jan 15, 2024')).toBe('2024-01-15');
    expect(parseDate('2024/01/15')).toBe('2024-01-15');
  });

  it('parses Excel serial dates', () => {
    expect(parseDate('45306')).toBe('2024-01-15');
  });

  it('rejects invalid dates', () => {
    expect(parseDate('32/13/2024')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate('2024-02-30')).toBeNull();
  });
});

describe('parseType', () => {
  it('maps broker vocabulary', () => {
    expect(parseType('BUY')).toBe('BUY');
    expect(parseType('bought')).toBe('BUY');
    expect(parseType('Sale')).toBe('SELL');
    expect(parseType('DIV')).toBe('DIVIDEND');
    expect(parseType('Stock Split')).toBe('SPLIT');
    expect(parseType('transfer')).toBeNull();
  });
});

describe('detectColumns + mapRows', () => {
  it('maps a typical broker CSV by headers', () => {
    const table = [
      ['Trade Date', 'Action', 'Ticker', 'Shares', 'Avg Price', 'Commission'],
      ['2024-01-15', 'BUY', 'AAPL', '10', '185.50', '1.00'],
      ['2024-02-20', 'SELL', 'MSFT', '5', '410.00', '1.00'],
    ];
    const detection = detectColumns(table);
    expect(detection.hasHeader).toBe(true);
    expect(detection.mapping[0]).toBe('date');
    expect(detection.mapping[1]).toBe('type');
    expect(detection.mapping[2]).toBe('symbol');
    expect(detection.mapping[3]).toBe('quantity');
    expect(detection.mapping[4]).toBe('price');
    expect(detection.mapping[5]).toBe('fees');

    const rows = mapRows(table, detection.mapping, true);
    expect(rows).toHaveLength(2);
    expect(rows[0].errors).toHaveLength(0);
    expect(rows[0].parsed.symbol).toBe('AAPL');
    expect(rows[0].parsed.quantity).toBe(10);
    expect(rows[0].parsed.price).toBe(185.5);
    // Exchange missing → defaults to a US listing with a warning
    expect(rows[0].parsed.exchange).toBe('NASDAQ');
    expect(rows[0].warnings.join(' ')).toContain('assumed US listing');
  });

  it('infers NSE from .NS suffix and currency from exchange', () => {
    const table = [
      ['symbol', 'qty', 'price', 'date'],
      ['RELIANCE.NS', '5', '2890.50', '15/02/2024'],
    ];
    const detection = detectColumns(table);
    const rows = mapRows(table, detection.mapping, true);
    expect(rows[0].parsed.symbol).toBe('RELIANCE');
    expect(rows[0].parsed.exchange).toBe('NSE');
    expect(rows[0].parsed.currency).toBe('INR');
    expect(rows[0].errors).toHaveLength(0);
  });

  it('detects headerless numeric data heuristically', () => {
    const table = [
      ['AAPL', '2024-01-15', '10', '185.50'],
      ['MSFT', '2024-02-20', '5', '410.00'],
      ['GOOG', '2024-03-05', '8', '139.20'],
    ];
    const detection = detectColumns(table);
    expect(detection.hasHeader).toBe(false);
    const fields = Object.values(detection.mapping);
    expect(fields).toContain('symbol');
    expect(fields).toContain('date');
  });

  it('derives price from amount when price column is absent', () => {
    const table = [
      ['symbol', 'exchange', 'quantity', 'total amount', 'date'],
      ['TCS', 'NSE', '10', '38500', '2024-01-10'],
    ];
    const detection = detectColumns(table);
    const rows = mapRows(table, detection.mapping, true);
    expect(rows[0].parsed.price).toBeCloseTo(3850, 6);
    expect(rows[0].warnings.join(' ')).toContain('derived');
    expect(rows[0].errors).toHaveLength(0);
  });

  it('flags invalid rows with actionable errors', () => {
    const table = [
      ['symbol', 'exchange', 'quantity', 'price', 'date'],
      ['', 'NSE', '10', '100', '2024-01-10'],
      ['TCS', 'NSE', '-, bad', '100', 'not-a-date'],
    ];
    const detection = detectColumns(table);
    const rows = mapRows(table, detection.mapping, true);
    expect(rows[0].errors.join(' ')).toContain('Missing symbol');
    expect(rows[1].errors.length).toBeGreaterThan(0);
  });

  it('treats negative quantities as sells', () => {
    const table = [
      ['symbol', 'exchange', 'quantity', 'price', 'date'],
      ['AAPL', 'NASDAQ', '-10', '190', '2024-01-10'],
    ];
    const detection = detectColumns(table);
    const rows = mapRows(table, detection.mapping, true);
    expect(rows[0].parsed.type).toBe('SELL');
    expect(rows[0].parsed.quantity).toBe(10);
  });
});
