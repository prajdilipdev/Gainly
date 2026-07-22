'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useSymbolSearch } from '@/hooks/use-data';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import type { SearchResult } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Debounced Yahoo-Finance-backed symbol autocomplete restricted to
 * NYSE/NASDAQ/NSE/BSE listings.
 */
export function SymbolSearch({
  onSelect,
  placeholder = 'Search stocks (e.g. AAPL, RELIANCE)…',
  className,
}: {
  onSelect: (result: SearchResult) => void;
  placeholder?: string;
  className?: string;
}) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: results, isFetching } = useSymbolSearch(query);

  useEffect(() => {
    const t = setTimeout(() => setQuery(input), 300);
    return () => clearTimeout(t);
  }, [input]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-8"
          aria-label="Search stocks"
        />
      </div>
      {open && query.trim().length >= 2 && (
        <div className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-md border bg-popover shadow-md scrollbar-thin">
          {isFetching && (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          )}
          {!isFetching && (results ?? []).length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No US/India listings found
            </p>
          )}
          {(results ?? []).map((r) => (
            <button
              key={`${r.symbol}:${r.exchange}`}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                onSelect(r);
                setInput('');
                setOpen(false);
              }}
            >
              <span className="min-w-0">
                <span className="font-semibold">{r.symbol}</span>
                <span className="ml-2 truncate text-muted-foreground">
                  {r.name}
                </span>
              </span>
              <Badge variant="secondary">{r.exchange}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
