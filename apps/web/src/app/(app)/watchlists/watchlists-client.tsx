'use client';

import { useEffect, useState } from 'react';
import { Eye, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAddWatchlistItem,
  useCreateWatchlist,
  useDeleteWatchlist,
  useRemoveWatchlistItem,
  useWatchlist,
  useWatchlists,
} from '@/hooks/use-data';
import { SymbolSearch } from '@/components/symbol-search';
import { FlashValue } from '@/components/flash-value';
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  pnlColor,
} from '@/lib/format';

export default function WatchlistsPage() {
  const { data: watchlists, isLoading } = useWatchlists();
  const createWatchlist = useCreateWatchlist();
  const deleteWatchlist = useDeleteWatchlist();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!selectedId && (watchlists ?? []).length > 0) {
      setSelectedId(watchlists![0].id);
    }
  }, [watchlists, selectedId]);

  const submitCreate = () => {
    if (!newName.trim()) return toast.error('Name is required');
    createWatchlist.mutate(newName.trim(), {
      onSuccess: (wl) => {
        toast.success('Watchlist created');
        setCreateOpen(false);
        setNewName('');
        setSelectedId(wl.id);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Watchlists</h1>
          <p className="text-sm text-muted-foreground">
            Track stocks you don&apos;t own yet — live quotes refresh
            automatically.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> New watchlist
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-80" />
      ) : (watchlists ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Eye className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No watchlists yet</p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Create a watchlist
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(watchlists ?? []).map((wl) => (
              <button
                key={wl.id}
                onClick={() => setSelectedId(wl.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
                  selectedId === wl.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'hover:bg-accent',
                )}
              >
                {wl.name}
                <Badge variant="secondary">{wl._count?.items ?? 0}</Badge>
              </button>
            ))}
          </div>
          {selectedId && (
            <WatchlistDetail
              watchlistId={selectedId}
              onDelete={() => {
                deleteWatchlist.mutate(selectedId, {
                  onSuccess: () => {
                    toast.success('Watchlist deleted');
                    setSelectedId(null);
                  },
                  onError: (err) => toast.error(err.message),
                });
              }}
            />
          )}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New watchlist</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. India large caps"
            onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createWatchlist.isPending}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WatchlistDetail({
  watchlistId,
  onDelete,
}: {
  watchlistId: string;
  onDelete: () => void;
}) {
  const { data: watchlist, isLoading } = useWatchlist(watchlistId);
  const addItem = useAddWatchlistItem(watchlistId);
  const removeItem = useRemoveWatchlistItem(watchlistId);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{watchlist?.name ?? 'Watchlist'}</CardTitle>
        <div className="flex items-center gap-2">
          <SymbolSearch
            className="w-72"
            placeholder="Add a stock…"
            onSelect={(r) => {
              addItem.mutate(
                { symbol: r.symbol, exchange: r.exchange, companyName: r.name },
                {
                  onSuccess: () => toast.success(`${r.symbol} added`),
                  onError: (err) => toast.error(err.message),
                },
              );
            }}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete watchlist"
            onClick={onDelete}
          >
            <Trash2 className="text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (watchlist?.items ?? []).length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Empty watchlist — search above to add stocks.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Day range</TableHead>
                <TableHead className="text-right">52-week range</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(watchlist?.items ?? []).map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="font-semibold">{item.symbol}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.exchange}
                      {item.companyName ? ` · ${item.companyName}` : ''}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <FlashValue value={item.quote?.price}>
                      {item.quote
                        ? formatCurrency(item.quote.price, item.quote.currency)
                        : '—'}
                    </FlashValue>
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right',
                      pnlColor(item.quote?.changePercent),
                    )}
                  >
                    {item.quote ? (
                      <>
                        <div>
                          {formatCurrency(
                            item.quote.change,
                            item.quote.currency,
                          )}
                        </div>
                        <div className="text-xs">
                          {formatPercent(item.quote.changePercent)}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {item.quote?.dayLow != null && item.quote.dayHigh != null
                      ? `${formatNumber(item.quote.dayLow)} – ${formatNumber(item.quote.dayHigh)}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {item.quote?.fiftyTwoWeekLow != null &&
                    item.quote.fiftyTwoWeekHigh != null
                      ? `${formatNumber(item.quote.fiftyTwoWeekLow)} – ${formatNumber(item.quote.fiftyTwoWeekHigh)}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Remove ${item.symbol}`}
                      onClick={() =>
                        removeItem.mutate(item.id, {
                          onError: (err) => toast.error(err.message),
                        })
                      }
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
