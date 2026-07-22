'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Plus,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCreatePortfolio, usePortfolios } from '@/hooks/use-data';
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { Currency, FieldKey, ImportPreview, MappedRow } from '@/lib/types';

/** Sentinel value for the "create new portfolio" entry in the picker. */
const CREATE_PORTFOLIO_VALUE = '__create_portfolio__';

const FIELD_OPTIONS: { value: FieldKey | 'ignore'; label: string }[] = [
  { value: 'ignore', label: '— Ignore —' },
  { value: 'symbol', label: 'Symbol' },
  { value: 'companyName', label: 'Company name' },
  { value: 'type', label: 'Type (buy/sell)' },
  { value: 'quantity', label: 'Quantity' },
  { value: 'price', label: 'Price' },
  { value: 'amount', label: 'Total amount' },
  { value: 'fees', label: 'Fees' },
  { value: 'date', label: 'Date' },
  { value: 'exchange', label: 'Exchange' },
  { value: 'currency', label: 'Currency' },
  { value: 'notes', label: 'Notes' },
];

export default function ImportPage() {
  const router = useRouter();
  const { data: portfolios } = usePortfolios();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [rawTable, setRawTable] = useState<string[][] | null>(null);
  const [portfolioId, setPortfolioId] = useState<string>('');
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline portfolio creation, so a first-time user never has to leave this
  // page (and lose the parsed preview) just to create a destination.
  const createPortfolio = useCreatePortfolio();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCurrency, setNewCurrency] = useState<Currency>('USD');

  const submitCreatePortfolio = () => {
    const name = newName.trim();
    if (!name) return toast.error('Portfolio name is required');
    createPortfolio.mutate(
      { name, baseCurrency: newCurrency },
      {
        onSuccess: (created) => {
          // Select it immediately so the user can import in one more click.
          setPortfolioId(created.id);
          setCreateOpen(false);
          setNewName('');
          toast.success(`Portfolio "${created.name}" created`);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  const previewFile = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.postForm<ImportPreview>('/import/preview/file', fd);
    },
    onSuccess: (data) => {
      setPreview(data);
      setRawTable(reconstructTable(data));
    },
    onError: (err) => toast.error(err.message),
  });

  const previewText = useMutation({
    mutationFn: (text: string) =>
      api.post<ImportPreview>('/import/preview/text', { text }),
    onSuccess: (data) => {
      setPreview(data);
      setRawTable(reconstructTable(data));
    },
    onError: (err) => toast.error(err.message),
  });

  const remap = useMutation({
    mutationFn: (input: {
      table: string[][];
      mapping: Record<string, FieldKey | null>;
      hasHeader: boolean;
    }) => api.post<ImportPreview>('/import/remap', input),
    onSuccess: (data) => setPreview(data),
    onError: (err) => toast.error(err.message),
  });

  const commit = useMutation({
    mutationFn: (input: { portfolioId: string; rows: unknown[] }) =>
      api.post<{ imported: number }>(
        `/import/portfolios/${input.portfolioId}/commit`,
        { rows: input.rows },
      ),
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} transactions`);
      router.push(`/portfolios/${portfolioId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        toast.error('File too large (max 10 MB)');
        return;
      }
      previewFile.mutate(file);
    },
    [previewFile],
  );

  const onMappingChange = (colIndex: number, field: FieldKey | 'ignore') => {
    if (!preview || !rawTable) return;
    const newMapping: Record<string, FieldKey | null> = {
      ...preview.mapping,
    };
    // A field can only map to one column — clear previous assignment
    if (field !== 'ignore') {
      for (const [k, v] of Object.entries(newMapping)) {
        if (v === field) newMapping[k] = null;
      }
    }
    newMapping[String(colIndex)] = field === 'ignore' ? null : field;
    remap.mutate({
      table: rawTable,
      mapping: newMapping,
      hasHeader: preview.hasHeader,
    });
  };

  const validRows = useMemo(
    () => (preview?.rows ?? []).filter((r) => r.errors.length === 0),
    [preview],
  );

  const doCommit = () => {
    if (!portfolioId) return toast.error('Choose a destination portfolio');
    if (validRows.length === 0) return toast.error('No valid rows to import');
    commit.mutate({
      portfolioId,
      rows: validRows.map((r) => ({
        symbol: r.parsed.symbol,
        exchange: r.parsed.exchange,
        type: r.parsed.type,
        quantity: r.parsed.quantity ?? 1,
        price: r.parsed.price ?? 0,
        fees: r.parsed.fees,
        currency: r.parsed.currency,
        companyName: r.parsed.companyName,
        notes: r.parsed.notes,
        date: r.parsed.date,
      })),
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import transactions</h1>
        <p className="text-sm text-muted-foreground">
          Upload broker exports (CSV, Excel, JSON) or paste any table — columns
          are detected automatically and you can adjust the mapping before
          importing.
        </p>
      </div>

      {!preview ? (
        <Tabs defaultValue="upload" className="max-w-3xl">
          <TabsList>
            <TabsTrigger value="upload">Upload file</TabsTrigger>
            <TabsTrigger value="paste">Paste data</TabsTrigger>
          </TabsList>
          <TabsContent value="upload">
            <Card
              className="border-dashed"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files[0]);
              }}
            >
              <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
                <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="font-medium">
                    Drag &amp; drop a file, or browse
                  </p>
                  <p className="text-sm text-muted-foreground">
                    CSV, TSV, Excel (.xlsx), JSON, or plain text — max 10 MB,
                    10,000 rows
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm,.json"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={previewFile.isPending}
                >
                  <Upload />
                  {previewFile.isPending ? 'Analyzing…' : 'Choose file'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="paste">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paste rows</CardTitle>
                <CardDescription>
                  Copy cells from Excel/Google Sheets or a table from any
                  website and paste below.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={10}
                  placeholder={
                    'Symbol\tQty\tPrice\tDate\nAAPL\t10\t150.25\t2024-01-15\nRELIANCE.NS\t5\t2890\t15/02/2024'
                  }
                  className="w-full rounded-md border border-input bg-transparent p-3 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <Button
                  onClick={() => previewText.mutate(pasteText)}
                  disabled={!pasteText.trim() || previewText.isPending}
                >
                  {previewText.isPending ? 'Analyzing…' : 'Analyze data'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">{preview.totalRows} rows</Badge>
            <Badge variant="gain">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {preview.validRows} valid
            </Badge>
            {preview.errorRows > 0 && (
              <Badge variant="loss">
                <AlertTriangle className="mr-1 h-3 w-3" />
                {preview.errorRows} with errors
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setRawTable(null);
                  setPasteText('');
                }}
              >
                Start over
              </Button>
              <Select
                value={portfolioId}
                onValueChange={(v: string) => {
                  if (v === CREATE_PORTFOLIO_VALUE) {
                    setCreateOpen(true);
                    return;
                  }
                  setPortfolioId(v);
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue
                    placeholder={
                      (portfolios ?? []).length === 0
                        ? 'Create a portfolio…'
                        : 'Import into portfolio…'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {(portfolios ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                  {(portfolios ?? []).length > 0 && <SelectSeparator />}
                  <SelectItem value={CREATE_PORTFOLIO_VALUE}>
                    <Plus aria-hidden="true" />
                    New portfolio…
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={doCommit}
                disabled={commit.isPending || validRows.length === 0}
              >
                {commit.isPending
                  ? 'Importing…'
                  : `Import ${validRows.length} rows`}
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Column mapping</CardTitle>
              <CardDescription>
                Detected automatically{preview.hasHeader ? ' from headers' : ''}.
                Change any column&apos;s assignment — the preview updates
                immediately.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {preview.headers.map((h, i) => (
                        <TableHead key={i} className="min-w-40 align-top">
                          <div className="space-y-1.5 py-1">
                            <div className="truncate text-xs font-semibold text-foreground">
                              {h}
                            </div>
                            <Select
                              value={preview.mapping[String(i)] ?? 'ignore'}
                              onValueChange={(v: string) =>
                                onMappingChange(i, v as FieldKey | 'ignore')
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {FIELD_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.slice(0, 8).map((row) => (
                      <TableRow key={row.index}>
                        {preview.headers.map((_, c) => (
                          <TableCell
                            key={c}
                            className="max-w-52 truncate text-xs"
                          >
                            {row.raw[c] ?? ''}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {preview.rows.length > 8 && (
                <p className="border-t p-2 text-center text-xs text-muted-foreground">
                  Showing first 8 of {preview.rows.length} rows
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Validation preview</CardTitle>
              <CardDescription>
                Rows with errors are highlighted and will be skipped. Fix them
                by adjusting the column mapping, or edit the source and
                re-upload.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] overflow-auto scrollbar-thin">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Exchange</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.rows.map((row) => (
                      <PreviewRow key={row.index} row={row} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New portfolio</DialogTitle>
            <DialogDescription>
              It will be selected automatically so you can import straight into
              it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-pf-name">Name</Label>
              <Input
                id="import-pf-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Long-term US"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitCreatePortfolio();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Base currency</Label>
              <Select
                value={newCurrency}
                onValueChange={(v: string) => setNewCurrency(v as Currency)}
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
            <Button
              onClick={submitCreatePortfolio}
              disabled={createPortfolio.isPending}
            >
              {createPortfolio.isPending ? 'Creating…' : 'Create portfolio'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PreviewRow({ row }: { row: MappedRow }) {
  const hasErrors = row.errors.length > 0;
  return (
    <TableRow className={cn(hasErrors && 'bg-loss/5 hover:bg-loss/10')}>
      <TableCell className="text-xs text-muted-foreground">
        {row.index + 1}
      </TableCell>
      <TableCell>
        {hasErrors ? (
          <Badge variant="loss">Error</Badge>
        ) : row.warnings.length > 0 ? (
          <Badge variant="secondary">OK*</Badge>
        ) : (
          <Badge variant="gain">OK</Badge>
        )}
      </TableCell>
      <TableCell className="font-medium">{row.parsed.symbol ?? '—'}</TableCell>
      <TableCell>{row.parsed.exchange ?? '—'}</TableCell>
      <TableCell>{row.parsed.type ?? '—'}</TableCell>
      <TableCell className="text-right">
        {row.parsed.quantity ?? '—'}
      </TableCell>
      <TableCell className="text-right">{row.parsed.price ?? '—'}</TableCell>
      <TableCell>{row.parsed.date ?? '—'}</TableCell>
      <TableCell className="max-w-72">
        {row.errors.length > 0 && (
          <p className="text-xs text-loss">{row.errors.join('; ')}</p>
        )}
        {row.warnings.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {row.warnings.join('; ')}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Rebuilds the raw table (header + rows) from a preview for remapping. */
function reconstructTable(preview: ImportPreview): string[][] {
  const rows = preview.rows.map((r) => r.raw);
  return preview.hasHeader ? [preview.headers, ...rows] : rows;
}
