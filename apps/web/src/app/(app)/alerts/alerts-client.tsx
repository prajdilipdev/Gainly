'use client';

import { useState } from 'react';
import { BellRing, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAlerts,
  useCreateAlert,
  useDeleteAlert,
  useSetAlertStatus,
} from '@/hooks/use-data';
import { SymbolSearch } from '@/components/symbol-search';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/format';
import type { AlertCondition, Exchange } from '@/lib/types';

const CONDITIONS: { value: AlertCondition; label: string }[] = [
  { value: 'ABOVE', label: 'Price rises above' },
  { value: 'BELOW', label: 'Price falls below' },
  { value: 'PCT_CHANGE_UP', label: 'Day gain exceeds (%)' },
  { value: 'PCT_CHANGE_DOWN', label: 'Day loss exceeds (%)' },
];

export default function AlertsPage() {
  const { data: alerts, isLoading } = useAlerts();
  const createAlert = useCreateAlert();
  const setStatus = useSetAlertStatus();
  const deleteAlert = useDeleteAlert();
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState<Exchange>('NASDAQ');
  const [condition, setCondition] = useState<AlertCondition>('ABOVE');
  const [threshold, setThreshold] = useState('');
  const [note, setNote] = useState('');

  const submit = () => {
    const value = Number(threshold);
    if (!symbol.trim()) return toast.error('Pick a stock');
    if (!value || value <= 0) return toast.error('Enter a positive threshold');
    createAlert.mutate(
      {
        symbol: symbol.trim().toUpperCase(),
        exchange,
        condition,
        threshold: value,
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Alert created');
          setOpen(false);
          setSymbol('');
          setThreshold('');
          setNote('');
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Price alerts</h1>
          <p className="text-sm text-muted-foreground">
            Alerts are evaluated every minute against live prices. Triggered
            alerts appear in the notification bell and as browser
            notifications.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus /> New alert
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (alerts ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <BellRing className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No alerts configured</p>
            <Button onClick={() => setOpen(true)}>
              <Plus /> Create your first alert
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stock</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Triggered</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(alerts ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <span className="font-semibold">{a.symbol}</span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        {a.exchange}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {CONDITIONS.find((c) => c.value === a.condition)?.label}{' '}
                      <span className="font-medium">
                        {Number(a.threshold)}
                        {a.condition.startsWith('PCT') ? '%' : ''}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          a.status === 'ACTIVE'
                            ? 'gain'
                            : a.status === 'TRIGGERED'
                              ? 'default'
                              : 'secondary'
                        }
                      >
                        {a.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.triggeredAt ? formatDate(a.triggeredAt) : '—'}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-sm text-muted-foreground">
                      {a.note ?? '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={a.status === 'ACTIVE'}
                        onCheckedChange={(checked: boolean) =>
                          setStatus.mutate(
                            {
                              id: a.id,
                              status: checked ? 'ACTIVE' : 'DISABLED',
                            },
                            { onError: (err) => toast.error(err.message) },
                          )
                        }
                        aria-label="Toggle alert"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Delete alert"
                        onClick={() =>
                          deleteAlert.mutate(a.id, {
                            onSuccess: () => toast.success('Alert deleted'),
                            onError: (err) => toast.error(err.message),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New price alert</DialogTitle>
            <DialogDescription>
              Get notified when a stock crosses your target.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Stock</Label>
              <SymbolSearch
                onSelect={(r) => {
                  setSymbol(r.symbol);
                  setExchange(r.exchange);
                }}
              />
              {symbol && (
                <p className="text-xs text-muted-foreground">
                  Selected: <span className="font-semibold">{symbol}</span>{' '}
                  <Badge variant="secondary">{exchange}</Badge>
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Condition</Label>
                <Select
                  value={condition}
                  onValueChange={(v: string) => setCondition(v as AlertCondition)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>
                  {condition.startsWith('PCT') ? 'Threshold (%)' : 'Target price'}
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. buy the dip"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createAlert.isPending}>
              {createAlert.isPending ? 'Creating…' : 'Create alert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
