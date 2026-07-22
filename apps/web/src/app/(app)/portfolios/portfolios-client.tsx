'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Briefcase, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCreatePortfolio,
  useDeletePortfolio,
  usePortfolios,
} from '@/hooks/use-data';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import type { Currency } from '@/lib/types';

export default function PortfoliosPage() {
  const { data: portfolios, isLoading } = usePortfolios();
  const createPortfolio = useCreatePortfolio();
  const deletePortfolio = useDeletePortfolio();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState<Currency>('USD');

  const submitCreate = () => {
    if (!name.trim()) return toast.error('Portfolio name is required');
    createPortfolio.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        baseCurrency: currency,
      },
      {
        onSuccess: () => {
          toast.success('Portfolio created');
          setCreateOpen(false);
          setName('');
          setDescription('');
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Portfolios</h1>
          <p className="text-sm text-muted-foreground">
            Each portfolio has its own transactions and base currency.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> New portfolio
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (portfolios ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Briefcase className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No portfolios yet</p>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Create your first portfolio
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(portfolios ?? []).map((p) => (
            <Card key={p.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="truncate">{p.name}</CardTitle>
                  <Badge variant="secondary">{p.baseCurrency}</Badge>
                </div>
                {p.description && (
                  <CardDescription className="line-clamp-2">
                    {p.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="mt-auto flex items-end justify-between pt-4">
                <div className="text-sm text-muted-foreground">
                  <p>{p._count?.transactions ?? 0} transactions</p>
                  <p>Created {formatDate(p.createdAt)}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                  <Button asChild size="sm">
                    <Link href={`/portfolios/${p.id}`}>Open</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New portfolio</DialogTitle>
            <DialogDescription>
              Choose the base currency used for totals and analytics.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pf-name">Name</Label>
              <Input
                id="pf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Long-term US"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pf-desc">Description (optional)</Label>
              <Input
                id="pf-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Base currency</Label>
              <Select
                value={currency}
                onValueChange={(v: string) => setCurrency(v as Currency)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD — US Dollar</SelectItem>
                  <SelectItem value="INR">INR — Indian Rupee</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createPortfolio.isPending}>
              {createPortfolio.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete portfolio?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.name}” and all of its transactions will be
              permanently deleted. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deletePortfolio.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deletePortfolio.mutate(deleteTarget.id, {
                  onSuccess: () => {
                    toast.success('Portfolio deleted');
                    setDeleteTarget(null);
                  },
                  onError: (err) => toast.error(err.message),
                });
              }}
            >
              {deletePortfolio.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
