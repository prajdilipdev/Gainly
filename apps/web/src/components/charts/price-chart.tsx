'use client';

import { useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useHistory } from '@/hooks/use-data';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/format';
import type { Exchange } from '@/lib/types';

const RANGES = ['1mo', '3mo', '6mo', '1y', '2y', '5y'] as const;

export function PriceChart({
  symbol,
  exchange,
}: {
  symbol: string;
  exchange: Exchange;
}) {
  const [range, setRange] = useState<string>('1y');
  const { data: bars, isLoading } = useHistory(symbol, exchange, range);

  const positive =
    bars && bars.length > 1 ? bars[bars.length - 1].close >= bars[0].close : true;
  const color = positive ? 'var(--gain)' : 'var(--loss)';

  return (
    <div>
      <Tabs value={range} onValueChange={setRange}>
        <TabsList>
          {RANGES.map((r) => (
            <TabsTrigger key={r} value={r} className="text-xs">
              {r.toUpperCase()}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div
        className="mt-3 h-64"
        {...(bars && bars.length > 0
          ? {
              role: 'img',
              // The SVG itself is meaningless to a screen reader, so expose
              // the trend, range and endpoints as the accessible name.
              'aria-label':
                `${symbol} price chart, ${range} range. ` +
                `${positive ? 'Up' : 'Down'} from ${formatNumber(bars[0].close)} ` +
                `on ${bars[0].date} to ${formatNumber(bars[bars.length - 1].close)} ` +
                `on ${bars[bars.length - 1].date}.`,
            }
          : {})}
      >
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : !bars || bars.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No history available
          </p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={bars} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(v: number) => formatNumber(v, 0)}
              />
              <Tooltip
                formatter={(value: number) => [formatNumber(value), 'Close']}
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--popover-foreground)',
                }}
                labelStyle={{ color: 'var(--popover-foreground)' }}
                itemStyle={{ color: 'var(--popover-foreground)' }}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke={color}
                strokeWidth={2}
                fill={`url(#grad-${symbol})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
