'use client';

import { use, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Download,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useDeleteTransaction,
  usePortfolio,
  usePortfolioSummary,
  useTransactions,
  type TransactionFilters,
} from '@/hooks/use-data';
import { downloadExport } from '@/lib/api';
import { StatCard } from '@/components/stat-card';
import { FlashValue } from '@/components/flash-value';
// Charts pull in the whole charting library. They live behind a tab / row
// selection, so loading them on demand keeps the initial page payload down.
const AllocationPie = dynamic(
  () => import('@/components/charts/allocation-pie').then((m) => m.AllocationPie),
  { loading: () => <Skeleton className="h-[280px] w-full" /> },
);
const PriceChart = dynamic(
  () => import('@/components/charts/price-chart').then((m) => m.PriceChart),
  { loading: () => <Skeleton className="h-64 w-full" /> },
);
import { TransactionDialog } from '@/components/transaction-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatQuantity,
  pnlColor,
} from '@/lib/format';
import type {
  EnrichedHolding,
  Exchange,
  Transaction,
  TransactionType,
} from '@/lib/types';

export default function PortfolioDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const router = useRouter();
  const { slug } = use(params);
  // Resolve the URL segment (slug or legacy UUID) to the portfolio so the rest
  // of the page can key its calls off the real id.
  const { data: portfolio, isError } = usePortfolio(slug);
  const id = portfolio?.id;
  const { data: summary, isLoading } = usePortfolioSummary(id);
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [selectedHolding, setSelectedHolding] = useState<EnrichedHolding | null>(
    null,
  );

  // If reached via an old /portfolios/<uuid> link, swap the address bar to the
  // readable slug without adding a history entry.
  useEffect(() => {
    if (portfolio?.slug && portfolio.slug !== slug) {
      router.replace(`/portfolios/${portfolio.slug}`);
    }
  }, [portfolio?.slug, slug, router]);

  if (isError) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-2xl font-bold">Portfolio not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been deleted, or the link is incorrect.
        </p>
      </div>
    );
  }

  if (isLoading || !summary || !id) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const cur = summary.baseCurrency;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{portfolio?.name ?? 'Portfolio'}</h1>
          <p className="text-sm text-muted-foreground">
            {summary.holdingsCount} holdings · base {cur} · USD/INR{' '}
            {formatNumber(summary.usdInrRate)}
          </p>
        </div>
        <div className="flex gap-2">
          <ExportMenu portfolioId={id} />
          <Button
            onClick={() => {
              setEditingTx(null);
              setTxDialogOpen(true);
            }}
          >
            <Plus /> Add transaction
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Market value"
          value={formatCurrency(summary.totalMarketValue, cur, true)}
          sub={`Invested ${formatCurrency(summary.totalCostBasis, cur, true)}`}
        />
        <StatCard
          label="Total P&L"
          value={formatCurrency(summary.totalPnl, cur, true)}
          sub={formatPercent(summary.totalReturnPercent)}
          valueClassName={pnlColor(summary.totalPnl)}
        />
        <StatCard
          label="Day change"
          value={formatCurrency(summary.dayChange, cur, true)}
          sub={formatPercent(summary.dayChangePercent)}
          valueClassName={pnlColor(summary.dayChange)}
        />
        <StatCard
          label="XIRR / CAGR"
          value={
            summary.xirr !== null
              ? formatPercent(summary.xirr * 100)
              : '—'
          }
          sub={
            summary.cagr !== null
              ? `CAGR ${formatPercent(summary.cagr * 100)}`
              : summary.xirr === null
                ? 'Needs 30+ days of history'
                : undefined
          }
          valueClassName={pnlColor(summary.xirr)}
        />
        <StatCard
          label="Unrealized P&L"
          value={formatCurrency(summary.totalUnrealizedPnl, cur, true)}
          valueClassName={pnlColor(summary.totalUnrealizedPnl)}
        />
        <StatCard
          label="Realized P&L"
          value={formatCurrency(summary.totalRealizedPnl, cur, true)}
          valueClassName={pnlColor(summary.totalRealizedPnl)}
        />
        <StatCard
          label="Dividends"
          value={formatCurrency(summary.totalDividends, cur, true)}
        />
        <StatCard
          label="Fees paid"
          value={formatCurrency(summary.totalFees, cur, true)}
        />
      </div>

      <Tabs defaultValue="holdings">
        <TabsList>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="allocation">Allocation</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings">
          <Card>
            <CardContent className="p-0">
              <HoldingsTable
                holdings={summary.holdings}
                onSelect={setSelectedHolding}
              />
            </CardContent>
          </Card>
          {selectedHolding && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>
                  {selectedHolding.symbol}{' '}
                  <Badge variant="secondary">{selectedHolding.exchange}</Badge>
                  {selectedHolding.companyName && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {selectedHolding.companyName}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <PriceChart
                  symbol={selectedHolding.symbol}
                  exchange={selectedHolding.exchange}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionsTab
            portfolioId={id}
            onEdit={(tx) => {
              setEditingTx(tx);
              setTxDialogOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="allocation">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>By stock</CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationPie
                  data={summary.allocation.bySymbol}
                  currency={cur}
                  label="Allocation by stock"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By exchange</CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationPie
                  data={summary.allocation.byExchange}
                  currency={cur}
                  label="Allocation by exchange"
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By currency</CardTitle>
              </CardHeader>
              <CardContent>
                <AllocationPie
                  data={summary.allocation.byCurrency}
                  currency={cur}
                  label="Allocation by currency"
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <TransactionDialog
        portfolioId={id}
        open={txDialogOpen}
        onOpenChange={setTxDialogOpen}
        editing={editingTx}
      />
    </div>
  );
}

function ExportMenu({ portfolioId }: { portfolioId: string }) {
  const doExport = (
    format: 'csv' | 'xlsx' | 'pdf' | 'json',
    scope: 'holdings' | 'transactions',
  ) => {
    toast.promise(downloadExport(portfolioId, format, scope), {
      loading: 'Preparing export…',
      success: 'Export downloaded',
      error: (e: Error) => e.message,
    });
  };
  const formats = ['csv', 'xlsx', 'pdf', 'json'] as const;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Download /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Holdings</DropdownMenuLabel>
        {formats.map((f) => (
          <DropdownMenuItem key={`h-${f}`} onClick={() => doExport(f, 'holdings')}>
            {f.toUpperCase()}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Transactions</DropdownMenuLabel>
        {formats.map((f) => (
          <DropdownMenuItem
            key={`t-${f}`}
            onClick={() => doExport(f, 'transactions')}
          >
            {f.toUpperCase()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HoldingsTable({
  holdings,
  onSelect,
}: {
  holdings: EnrichedHolding[];
  onSelect: (h: EnrichedHolding) => void;
}) {
  const active = holdings.filter((h) => h.quantity > 0);
  if (active.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No open positions. Add a transaction or import your data.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Symbol</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Avg cost</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Day</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">Unrealized P&L</TableHead>
          <TableHead className="text-right">Weight</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {active.map((h) => (
          <TableRow
            key={`${h.symbol}:${h.exchange}`}
            className="cursor-pointer"
            onClick={() => onSelect(h)}
          >
            <TableCell>
              <div className="font-semibold">{h.symbol}</div>
              <div className="text-xs text-muted-foreground">
                {h.exchange}
                {h.companyName ? ` · ${h.companyName}` : ''}
              </div>
            </TableCell>
            <TableCell className="text-right">
              {formatQuantity(h.quantity)}
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(h.avgCost, h.currency)}
            </TableCell>
            <TableCell className="text-right">
              <FlashValue value={h.currentPrice}>
                {formatCurrency(h.currentPrice, h.currency)}
              </FlashValue>
            </TableCell>
            <TableCell
              className={`text-right ${pnlColor(h.dayChangePercent)}`}
            >
              {formatPercent(h.dayChangePercent)}
            </TableCell>
            <TableCell className="text-right">
              {formatCurrency(h.marketValue, h.currency)}
            </TableCell>
            <TableCell className={`text-right ${pnlColor(h.unrealizedPnl)}`}>
              <div>{formatCurrency(h.unrealizedPnl, h.currency)}</div>
              <div className="text-xs">
                {formatPercent(h.unrealizedPnlPercent)}
              </div>
            </TableCell>
            <TableCell className="text-right">
              {h.weight !== null ? `${h.weight.toFixed(1)}%` : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const TX_TYPES: (TransactionType | 'ALL')[] = [
  'ALL', 'BUY', 'SELL', 'DIVIDEND', 'SPLIT',
];
const TX_EXCHANGES: (Exchange | 'ALL')[] = ['ALL', 'NYSE', 'NASDAQ', 'NSE', 'BSE'];
const PAGE_SIZE = 50;

function TransactionsTab({
  portfolioId,
  onEdit,
}: {
  portfolioId: string;
  onEdit: (tx: Transaction) => void;
}) {
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState<TransactionType | 'ALL'>('ALL');
  const [exchange, setExchange] = useState<Exchange | 'ALL'>('ALL');
  const [page, setPage] = useState(0);
  const deleteTx = useDeleteTransaction(portfolioId);

  const filters = useMemo<TransactionFilters>(
    () => ({
      symbol: symbol.trim() || undefined,
      type: type === 'ALL' ? undefined : type,
      exchange: exchange === 'ALL' ? undefined : exchange,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [symbol, type, exchange, page],
  );
  const { data, isLoading } = useTransactions(portfolioId, filters);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center gap-3 space-y-0">
        <Input
          value={symbol}
          onChange={(e) => {
            setSymbol(e.target.value.toUpperCase());
            setPage(0);
          }}
          placeholder="Filter by symbol…"
          className="w-44"
        />
        <Select
          value={type}
          onValueChange={(v: string) => {
            setType(v as TransactionType | 'ALL');
            setPage(0);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TX_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t === 'ALL' ? 'All types' : t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={exchange}
          onValueChange={(v: string) => {
            setExchange(v as Exchange | 'ALL');
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TX_EXCHANGES.map((e) => (
              <SelectItem key={e} value={e}>
                {e === 'ALL' ? 'All exchanges' : e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {data?.total ?? 0} transactions
        </span>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (data?.items ?? []).length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No transactions match the filters.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{formatDate(tx.executedAt)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        tx.type === 'BUY'
                          ? 'gain'
                          : tx.type === 'SELL'
                            ? 'loss'
                            : 'secondary'
                      }
                    >
                      {tx.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{tx.symbol}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      {tx.exchange}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatQuantity(Number(tx.quantity))}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(Number(tx.price), tx.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    {Number(tx.fees) > 0
                      ? formatCurrency(Number(tx.fees), tx.currency)
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Edit"
                        onClick={() => onEdit(tx)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Delete"
                        onClick={() => {
                          deleteTx.mutate(tx.id, {
                            onSuccess: () => toast.success('Transaction deleted'),
                            onError: (err) => toast.error(err.message),
                          });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t p-3">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
