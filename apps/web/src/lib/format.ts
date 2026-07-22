const CURRENCY_LOCALES: Record<string, string> = {
  USD: 'en-US',
  INR: 'en-IN',
};

export function formatCurrency(
  value: number | null | undefined,
  currency = 'USD',
  compact = false,
): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const locale = CURRENCY_LOCALES[currency] ?? 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: compact && Math.abs(value) >= 100_000 ? 'compact' : 'standard',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPercent(
  value: number | null | undefined,
  signed = true,
): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const sign = signed && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatQuantity(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 6,
  }).format(value);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function pnlColor(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return '';
  return value > 0 ? 'text-gain' : 'text-loss';
}
