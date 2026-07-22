'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ArrowRight, Briefcase, Plus } from 'lucide-react';
import { useDashboard } from '@/hooks/use-data';
import { useCurrentUser } from '@/hooks/use-auth';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  formatCurrency,
  formatPercent,
  pnlColor,
} from '@/lib/format';
import type { AllocationSlice } from '@/lib/types';

// Deferred so the charting library is not part of the dashboard's first load.
const AllocationPie = dynamic(
  () => import('@/components/charts/allocation-pie').then((m) => m.AllocationPie),
  { loading: () => <Skeleton className="h-[280px] w-full" /> },
);

export default function DashboardPage() {
  const { data: user } = useCurrentUser();
  const { data: entries, isLoading } = useDashboard();
  const baseCurrency = user?.baseCurrency ?? 'USD';

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const portfolios = entries ?? [];
  // Note: per-portfolio summaries are in their own base currency; the
  // aggregate below is only shown when all portfolios share one currency.
  const currencies = new Set(portfolios.map((p) => p.summary.baseCurrency));
  const aggregatable = currencies.size <= 1;
  const totals = portfolios.reduce(
    (acc, p) => ({
      value: acc.value + p.summary.totalMarketValue,
      cost: acc.cost + p.summary.totalCostBasis,
      pnl: acc.pnl + p.summary.totalPnl,
      day: acc.day + p.summary.dayChange,
    }),
    { value: 0, cost: 0, pnl: 0, day: 0 },
  );
  const aggCurrency = aggregatable
    ? (portfolios[0]?.summary.baseCurrency ?? baseCurrency)
    : baseCurrency;

  const mergedAllocation: AllocationSlice[] = aggregatable
    ? mergeSlices(portfolios.flatMap((p) => p.summary.allocation.bySymbol))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back{user ? `, ${user.name}` : ''}. Live prices refresh
            automatically.
          </p>
        </div>
        <Button asChild>
          <Link href="/portfolios">
            <Briefcase /> Manage portfolios
          </Link>
        </Button>
      </div>

      {portfolios.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No portfolios yet</p>
              <p className="text-sm text-muted-foreground">
                Create a portfolio or import your existing holdings to get
                started.
              </p>
            </div>
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/portfolios">
                  <Plus /> Create portfolio
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/import">Import data</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {aggregatable && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total value"
                value={formatCurrency(totals.value, aggCurrency, true)}
              />
              <StatCard
                label="Total P&L"
                value={formatCurrency(totals.pnl, aggCurrency, true)}
                sub={
                  totals.cost > 0
                    ? formatPercent((totals.pnl / totals.cost) * 100)
                    : undefined
                }
                valueClassName={pnlColor(totals.pnl)}
              />
              <StatCard
                label="Day change"
                value={formatCurrency(totals.day, aggCurrency, true)}
                valueClassName={pnlColor(totals.day)}
              />
              <StatCard
                label="Invested"
                value={formatCurrency(totals.cost, aggCurrency, true)}
              />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Portfolios</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {portfolios.map((p) => (
                  <Link
                    key={p.id}
                    href={`/portfolios/${p.id}`}
                    className="flex items-center justify-between gap-4 rounded-lg border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-semibold">{p.name}</span>
                        <Badge variant="secondary">
                          {p.summary.holdingsCount} holdings
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {formatCurrency(
                          p.summary.totalMarketValue,
                          p.summary.baseCurrency,
                          true,
                        )}{' '}
                        ·{' '}
                        <span className={pnlColor(p.summary.totalPnl)}>
                          {formatCurrency(
                            p.summary.totalPnl,
                            p.summary.baseCurrency,
                            true,
                          )}{' '}
                          ({formatPercent(p.summary.totalReturnPercent)})
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Day</p>
                        <p
                          className={`text-sm font-medium ${pnlColor(p.summary.dayChange)}`}
                        >
                          {formatPercent(p.summary.dayChangePercent)}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Allocation</CardTitle>
              </CardHeader>
              <CardContent>
                {aggregatable ? (
                  <AllocationPie
                    data={mergedAllocation}
                    currency={aggCurrency}
                    label="Allocation by stock across all portfolios"
                  />
                ) : (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Portfolios use different base currencies — open a portfolio
                    to see its allocation.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function mergeSlices(slices: AllocationSlice[]): AllocationSlice[] {
  const map = new Map<string, number>();
  for (const s of slices) map.set(s.label, (map.get(s.label) ?? 0) + s.value);
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
