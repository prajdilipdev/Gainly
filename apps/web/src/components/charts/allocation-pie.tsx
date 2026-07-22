'use client';

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { AllocationSlice } from '@/lib/types';
import { formatCurrency } from '@/lib/format';

const COLORS = [
  '#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#6366f1',
];

export function AllocationPie({
  data,
  currency,
  maxSlices = 8,
  label = 'Allocation',
}: {
  data: AllocationSlice[];
  currency: string;
  maxSlices?: number;
  /** Describes what the slices represent, used in the accessible name. */
  label?: string;
}) {
  if (data.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        No holdings to display
      </p>
    );
  }

  let slices = data;
  if (data.length > maxSlices) {
    const top = data.slice(0, maxSlices - 1);
    const other = data
      .slice(maxSlices - 1)
      .reduce((s, d) => s + d.value, 0);
    slices = [...top, { label: 'Other', value: other }];
  }

  // Screen readers cannot interpret the SVG, so the chart is exposed as a
  // single labelled image whose name carries the same information the
  // sighted user gets from the slices and legend.
  const total = slices.reduce((s, d) => s + d.value, 0);
  const summary = slices
    .map((s) => {
      const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : '0';
      return `${s.label} ${formatCurrency(s.value, currency)} (${pct}%)`;
    })
    .join(', ');

  return (
    <div role="img" aria-label={`${label} donut chart. ${summary}.`}>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius={60}
            outerRadius={95}
            paddingAngle={2}
            strokeWidth={0}
            // Recharts focuses this layer by default, creating an unlabelled
            // keyboard stop; the wrapper above carries the accessible name.
            rootTabIndex={-1}
          >
            {slices.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => formatCurrency(value, currency)}
            contentStyle={{
              backgroundColor: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--popover-foreground)',
            }}
            labelStyle={{ color: 'var(--popover-foreground)' }}
            itemStyle={{ color: 'var(--popover-foreground)' }}
          />
          <Legend
            formatter={(value: string) => (
              <span className="text-xs text-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
