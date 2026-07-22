import { computeHoldings, EngineTransaction } from './holdings.engine';

const tx = (partial: Partial<EngineTransaction>): EngineTransaction => ({
  type: 'BUY',
  symbol: 'AAPL',
  exchange: 'NASDAQ',
  companyName: null,
  quantity: 0,
  price: 0,
  fees: 0,
  currency: 'USD',
  executedAt: new Date('2023-01-01'),
  ...partial,
});

describe('computeHoldings', () => {
  it('computes average cost including fees', () => {
    const holdings = computeHoldings([
      tx({ quantity: 10, price: 100, fees: 10 }),
      tx({ quantity: 10, price: 200, fees: 0, executedAt: new Date('2023-02-01') }),
    ]);
    expect(holdings).toHaveLength(1);
    const h = holdings[0];
    expect(h.quantity).toBe(20);
    // (10*101 + 10*200) / 20 = 150.5
    expect(h.avgCost).toBeCloseTo(150.5, 6);
    expect(h.costBasis).toBeCloseTo(3010, 6);
  });

  it('realizes P&L FIFO on sells', () => {
    const holdings = computeHoldings([
      tx({ quantity: 10, price: 100 }),
      tx({ quantity: 10, price: 200, executedAt: new Date('2023-02-01') }),
      tx({
        type: 'SELL',
        quantity: 15,
        price: 300,
        executedAt: new Date('2023-03-01'),
      }),
    ]);
    const h = holdings[0];
    // FIFO: 10 @ 100 → +2000; 5 @ 200 → +500 = 2500... wait:
    // 10*(300-100) + 5*(300-200) = 2000 + 500 = 2500
    expect(h.realizedPnl).toBeCloseTo(2500, 6);
    expect(h.quantity).toBe(5);
    expect(h.avgCost).toBeCloseTo(200, 6);
  });

  it('adjusts lots for splits', () => {
    const holdings = computeHoldings([
      tx({ quantity: 10, price: 100 }),
      tx({
        type: 'SPLIT',
        quantity: 1,
        price: 2, // 2-for-1
        executedAt: new Date('2023-02-01'),
      }),
    ]);
    const h = holdings[0];
    expect(h.quantity).toBe(20);
    expect(h.avgCost).toBeCloseTo(50, 6);
    expect(h.costBasis).toBeCloseTo(1000, 6);
  });

  it('accumulates dividends net of fees', () => {
    const holdings = computeHoldings([
      tx({ quantity: 10, price: 100 }),
      tx({
        type: 'DIVIDEND',
        quantity: 1,
        price: 55,
        fees: 5,
        executedAt: new Date('2023-06-01'),
      }),
    ]);
    expect(holdings[0].dividends).toBeCloseTo(50, 6);
  });

  it('keeps symbols on different exchanges separate', () => {
    const holdings = computeHoldings([
      tx({ symbol: 'INFY', exchange: 'NSE', currency: 'INR', quantity: 5, price: 1500 }),
      tx({ symbol: 'INFY', exchange: 'NYSE', currency: 'USD', quantity: 5, price: 18 }),
    ]);
    expect(holdings).toHaveLength(2);
  });

  it('processes same-day BUY before SELL regardless of input order', () => {
    const holdings = computeHoldings([
      tx({ type: 'SELL', quantity: 10, price: 120, executedAt: new Date('2023-05-01') }),
      tx({ type: 'BUY', quantity: 10, price: 100, executedAt: new Date('2023-05-01') }),
    ]);
    const h = holdings[0];
    expect(h.quantity).toBe(0);
    expect(h.realizedPnl).toBeCloseTo(200, 6); // 10 * (120 - 100)
  });

  it('sells before buys on the same symbol are handled without crashing', () => {
    const holdings = computeHoldings([
      tx({ type: 'SELL', quantity: 5, price: 100 }),
    ]);
    expect(holdings[0].quantity).toBe(0);
    expect(holdings[0].realizedPnl).toBeCloseTo(500, 6);
  });
});
