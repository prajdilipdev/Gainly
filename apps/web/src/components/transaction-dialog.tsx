'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  useCreateTransaction,
  useQuote,
  useUpdateTransaction,
  type TransactionInput,
} from '@/hooks/use-data';
import { formatCurrency } from '@/lib/format';
import { SymbolSearch } from '@/components/symbol-search';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Exchange, Transaction, TransactionType } from '@/lib/types';

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'BUY', label: 'Buy' },
  { value: 'SELL', label: 'Sell' },
  { value: 'DIVIDEND', label: 'Dividend' },
  { value: 'SPLIT', label: 'Split' },
];

// The four exchanges collapse to two markets for the picker; each market has
// a sensible default exchange for manually-entered symbols. Picking a symbol
// from search still sets the precise exchange (incl. NYSE/BSE) underneath.
type Market = 'US' | 'IN';

function marketForExchange(exchange: Exchange): Market {
  return exchange === 'NSE' || exchange === 'BSE' ? 'IN' : 'US';
}

function defaultExchangeForMarket(market: Market): Exchange {
  return market === 'IN' ? 'NSE' : 'NASDAQ';
}

const MARKETS: { value: Market; label: string; currency: string }[] = [
  { value: 'US', label: 'US — $ USD', currency: 'USD' },
  { value: 'IN', label: 'India — ₹ INR', currency: 'INR' },
];

interface FormState {
  type: TransactionType;
  symbol: string;
  exchange: Exchange;
  companyName: string;
  quantity: string;
  price: string;
  fees: string;
  notes: string;
  executedAt: string;
}

/** YYYY-MM-DD for the given date in the user's local timezone (not UTC). */
function toLocalDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Turns a plain YYYY-MM-DD (from the date picker) into a timestamp that is
 * guaranteed not to be "in the future" relative to the actual current
 * instant, regardless of the user's UTC offset.
 *
 * A fixed hour like noon UTC breaks for anyone east of UTC during their
 * morning (e.g. IST is UTC+5:30, so 8am local is still 2:30am UTC — noon
 * UTC on "today" hasn't happened yet). Instead: if the picked date is today
 * (in local time), use the exact current instant; otherwise use local noon,
 * which is always safely in the past for any earlier calendar day.
 */
function buildExecutedAt(dateInput: string): string {
  const now = new Date();
  if (dateInput === toLocalDateInput(now)) {
    return now.toISOString();
  }
  return new Date(`${dateInput}T12:00:00`).toISOString();
}

const emptyForm = (): FormState => ({
  type: 'BUY',
  symbol: '',
  exchange: 'NASDAQ',
  companyName: '',
  quantity: '',
  price: '',
  fees: '',
  notes: '',
  executedAt: toLocalDateInput(new Date()),
});

export function TransactionDialog({
  portfolioId,
  open,
  onOpenChange,
  editing,
}: {
  portfolioId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Transaction | null;
}) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const createTx = useCreateTransaction(portfolioId);
  const updateTx = useUpdateTransaction(portfolioId);
  const isPending = createTx.isPending || updateTx.isPending;

  useEffect(() => {
    if (open) {
      setForm(
        editing
          ? {
              type: editing.type,
              symbol: editing.symbol,
              exchange: editing.exchange,
              companyName: editing.companyName ?? '',
              quantity: String(Number(editing.quantity)),
              price: String(Number(editing.price)),
              fees: String(Number(editing.fees) || ''),
              notes: editing.notes ?? '',
              executedAt: toLocalDateInput(new Date(editing.executedAt)),
            }
          : emptyForm(),
      );
    }
  }, [open, editing]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isDividend = form.type === 'DIVIDEND';
  const isSplit = form.type === 'SPLIT';
  // Currency is decided by the selected market, mirroring the server.
  const currency = marketForExchange(form.exchange) === 'IN' ? 'INR' : 'USD';
  const currencySymbol = currency === 'INR' ? '₹' : '$';

  // Live LTP for the selected stock, shown as faded placeholder text in the
  // price field. Debounced so hand-typed partial symbols don't spam quotes.
  const [quoteSymbol, setQuoteSymbol] = useState('');
  useEffect(() => {
    if (!open) {
      setQuoteSymbol('');
      return;
    }
    const t = setTimeout(() => setQuoteSymbol(form.symbol.trim()), 400);
    return () => clearTimeout(t);
  }, [open, form.symbol]);
  const { data: quote } = useQuote(
    quoteSymbol || undefined,
    quoteSymbol ? form.exchange : undefined,
  );
  const ltp =
    quote && quote.symbol === form.symbol.trim().toUpperCase()
      ? quote.price
      : null;
  const showLtp = ltp !== null && !isSplit && !isDividend;

  const submit = () => {
    const quantity = isDividend || isSplit ? Number(form.quantity || 1) : Number(form.quantity);
    const price = Number(form.price);
    if (!form.symbol.trim()) return toast.error('Symbol is required');
    if (!isDividend && !isSplit && (!quantity || quantity <= 0)) {
      return toast.error('Quantity must be positive');
    }
    if (!price || price <= 0) {
      return toast.error(
        isDividend
          ? 'Enter the total dividend amount'
          : isSplit
            ? 'Enter the split ratio (e.g. 2 for 2-for-1)'
            : 'Price must be positive',
      );
    }

    const payload: TransactionInput = {
      type: form.type,
      symbol: form.symbol.trim().toUpperCase(),
      exchange: form.exchange,
      companyName: form.companyName.trim() || undefined,
      quantity: quantity || 1,
      price,
      fees: form.fees ? Number(form.fees) : undefined,
      notes: form.notes.trim() || undefined,
      executedAt: buildExecutedAt(form.executedAt),
    };

    const mutation = editing
      ? updateTx.mutateAsync({ id: editing.id, ...payload })
      : createTx.mutateAsync(payload);

    void mutation
      .then(() => {
        toast.success(editing ? 'Transaction updated' : 'Transaction added');
        onOpenChange(false);
      })
      .catch((err: Error) => toast.error(err.message));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Edit transaction' : 'Add transaction'}
          </DialogTitle>
          <DialogDescription>
            Record a buy, sell, dividend, or stock split.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {!editing && (
            <div className="space-y-2">
              <Label>Find stock</Label>
              <SymbolSearch
                onSelect={(r) => {
                  setForm((f) => ({
                    ...f,
                    symbol: r.symbol,
                    exchange: r.exchange,
                    companyName: r.name,
                  }));
                }}
              />
              {form.symbol && (
                <p className="text-xs text-muted-foreground">
                  Selected: <span className="font-semibold">{form.symbol}</span>{' '}
                  <Badge variant="secondary">{form.exchange}</Badge>{' '}
                  {form.companyName}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(v: string) => set('type', v as TransactionType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.executedAt}
                onChange={(e) => set('executedAt', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Symbol</Label>
              <Input
                value={form.symbol}
                onChange={(e) => set('symbol', e.target.value.toUpperCase())}
                placeholder="AAPL"
              />
            </div>
            <div className="space-y-2">
              <Label>Market</Label>
              <Select
                value={marketForExchange(form.exchange)}
                onValueChange={(v: string) =>
                  set('exchange', defaultExchangeForMarket(v as Market))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARKETS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {!isDividend && !isSplit && (
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={form.quantity}
                  onChange={(e) => set('quantity', e.target.value)}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>
                {isDividend
                  ? `Total amount (${currencySymbol})`
                  : isSplit
                    ? 'Split ratio'
                    : `Price / share (${currencySymbol})`}
              </Label>
              <Input
                type="number"
                min="0"
                step="any"
                placeholder={
                  isSplit
                    ? 'e.g. 2 for 2-for-1'
                    : showLtp
                      ? `LTP ${ltp.toFixed(2)}`
                      : undefined
                }
                value={form.price}
                onChange={(e) => set('price', e.target.value)}
              />
              {showLtp && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
                  onClick={() => set('price', String(ltp))}
                >
                  Use LTP {formatCurrency(ltp, quote?.currency ?? 'USD')}
                </button>
              )}
            </div>
            {!isSplit && (
              <div className="space-y-2">
                <Label>Fees (optional)</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={form.fees}
                  onChange={(e) => set('fees', e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Notes (optional)</Label>
            <Input
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="e.g. long-term position"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
