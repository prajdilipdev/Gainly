import { cagr, xirr, MIN_ANNUALIZATION_DAYS } from './xirr';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysFrom = (start: Date, days: number) =>
  new Date(start.getTime() + days * DAY_MS);

describe('xirr', () => {
  it('returns null for fewer than 2 flows', () => {
    expect(xirr([{ amount: -1000, date: new Date('2023-01-01') }])).toBeNull();
  });

  it('returns null when all flows have the same sign', () => {
    expect(
      xirr([
        { amount: -1000, date: new Date('2023-01-01') },
        { amount: -500, date: new Date('2023-06-01') },
      ]),
    ).toBeNull();
  });

  it('computes ~10% for a simple one-year doubling period', () => {
    const result = xirr([
      { amount: -1000, date: new Date('2022-01-01') },
      { amount: 1100, date: new Date('2023-01-01') },
    ]);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0.1, 2);
  });

  it('computes a known multi-flow example', () => {
    // Classic Excel XIRR example ≈ 37.34%
    const result = xirr([
      { amount: -10000, date: new Date('2008-01-01') },
      { amount: 2750, date: new Date('2008-03-01') },
      { amount: 4250, date: new Date('2008-10-30') },
      { amount: 3250, date: new Date('2009-02-15') },
      { amount: 2750, date: new Date('2009-04-01') },
    ]);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0.3734, 2);
  });

  it('handles negative returns', () => {
    const result = xirr([
      { amount: -1000, date: new Date('2022-01-01') },
      { amount: 800, date: new Date('2023-01-01') },
    ]);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(-0.2, 2);
  });

  describe('short-period guard', () => {
    const start = new Date('2025-06-01');

    it('returns null for a one-day holding period', () => {
      // Without the guard an 8.8% one-day gain annualises to ~1.3e11 percent
      expect(
        xirr([
          { amount: -1640, date: start },
          { amount: 1784, date: daysFrom(start, 1) },
        ]),
      ).toBeNull();
    });

    it('returns null just below the threshold', () => {
      expect(
        xirr([
          { amount: -1000, date: start },
          { amount: 1100, date: daysFrom(start, MIN_ANNUALIZATION_DAYS - 1) },
        ]),
      ).toBeNull();
    });

    it('computes a value at exactly the threshold', () => {
      const result = xirr([
        { amount: -1000, date: start },
        { amount: 1100, date: daysFrom(start, MIN_ANNUALIZATION_DAYS) },
      ]);
      expect(result).not.toBeNull();
      expect(Number.isFinite(result!)).toBe(true);
    });
  });
});

describe('cagr', () => {
  it('computes annualized growth', () => {
    const result = cagr(
      1000,
      2000,
      new Date('2020-01-01'),
      new Date('2030-01-01'),
    );
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(Math.pow(2, 1 / 10) - 1, 4);
  });

  it('returns null for zero start value or same-day period', () => {
    expect(cagr(0, 100, new Date('2020-01-01'), new Date('2021-01-01'))).toBeNull();
    expect(cagr(100, 200, new Date('2020-01-01'), new Date('2020-01-01'))).toBeNull();
  });

  describe('short-period guard', () => {
    const start = new Date('2025-06-01');

    it('returns null below the threshold', () => {
      expect(
        cagr(1000, 1100, start, daysFrom(start, MIN_ANNUALIZATION_DAYS - 1)),
      ).toBeNull();
    });

    it('computes a value at exactly the threshold', () => {
      const result = cagr(
        1000,
        1100,
        start,
        daysFrom(start, MIN_ANNUALIZATION_DAYS),
      );
      expect(result).not.toBeNull();
      expect(Number.isFinite(result!)).toBe(true);
    });
  });
});
