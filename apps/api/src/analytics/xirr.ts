/**
 * Cash flow for XIRR: negative = money invested, positive = money returned.
 */
export interface CashFlow {
  amount: number;
  date: Date;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Annualised returns are extrapolations. Over a very short window the
 * exponent (1/years) explodes, so a few percent across a couple of days
 * annualises to absurd figures (billions of percent) that are arithmetically
 * correct but meaningless to a user. Below this span we report "no result"
 * instead of a misleading number.
 */
export const MIN_ANNUALIZATION_DAYS = 30;

function npv(rate: number, flows: CashFlow[], t0: number): number {
  let sum = 0;
  for (const f of flows) {
    const years = (f.date.getTime() - t0) / MS_PER_YEAR;
    sum += f.amount / Math.pow(1 + rate, years);
  }
  return sum;
}

function npvDerivative(rate: number, flows: CashFlow[], t0: number): number {
  let sum = 0;
  for (const f of flows) {
    const years = (f.date.getTime() - t0) / MS_PER_YEAR;
    sum -= (years * f.amount) / Math.pow(1 + rate, years + 1);
  }
  return sum;
}

/**
 * Computes the annualized internal rate of return (XIRR) for irregular cash
 * flows using Newton–Raphson with a bisection fallback. Returns null when no
 * meaningful rate exists: fewer than 2 flows, all flows the same sign, or a
 * span shorter than {@link MIN_ANNUALIZATION_DAYS}.
 */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const hasNegative = flows.some((f) => f.amount < 0);
  const hasPositive = flows.some((f) => f.amount > 0);
  if (!hasNegative || !hasPositive) return null;

  const times = flows.map((f) => f.date.getTime());
  const t0 = Math.min(...times);
  const spanDays = (Math.max(...times) - t0) / MS_PER_DAY;
  if (spanDays < MIN_ANNUALIZATION_DAYS) return null;

  // Newton–Raphson
  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const value = npv(rate, flows, t0);
    const derivative = npvDerivative(rate, flows, t0);
    if (Math.abs(derivative) < 1e-12) break;
    const next = rate - value / derivative;
    if (!isFinite(next) || next <= -0.999999) break;
    if (Math.abs(next - rate) < 1e-9) {
      return Math.abs(npv(next, flows, t0)) < 1e-3 ? next : null;
    }
    rate = next;
  }

  // Bisection fallback over (-0.9999, 100)
  let lo = -0.9999;
  let hi = 100;
  let fLo = npv(lo, flows, t0);
  const fHi = npv(hi, flows, t0);
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fMid = npv(mid, flows, t0);
    if (Math.abs(fMid) < 1e-9 || hi - lo < 1e-9) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Compound annual growth rate. Returns null for invalid inputs or a period
 * shorter than {@link MIN_ANNUALIZATION_DAYS} (see that constant for why).
 */
export function cagr(
  startValue: number,
  endValue: number,
  startDate: Date,
  endDate: Date,
): number | null {
  if (startValue <= 0 || endValue < 0) return null;
  const days = (endDate.getTime() - startDate.getTime()) / MS_PER_DAY;
  if (days < MIN_ANNUALIZATION_DAYS) return null;
  const years = (endDate.getTime() - startDate.getTime()) / MS_PER_YEAR;
  return Math.pow(endValue / startValue, 1 / years) - 1;
}
