import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortfoliosService } from '../portfolios/portfolios.service';
import { parseBuffer, parseText, RawTable } from './parsers';
import {
  ColumnMapping,
  detectColumns,
  FieldKey,
  mapRows,
  MappedRow,
} from './column-mapper';
import { currencyForExchange } from '../market-data/symbol.util';

export interface ImportPreview {
  headers: string[];
  hasHeader: boolean;
  mapping: ColumnMapping;
  confidence: Record<number, number>;
  totalRows: number;
  validRows: number;
  errorRows: number;
  rows: MappedRow[];
}

const MAX_ROWS = 10_000;

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfoliosService: PortfoliosService,
  ) {}

  async previewFile(buffer: Buffer, filename: string): Promise<ImportPreview> {
    const table = await parseBuffer(buffer, filename);
    return this.buildPreview(table);
  }

  previewText(text: string): ImportPreview {
    const table = parseText(text);
    return this.buildPreview(table);
  }

  /** Re-run mapping with user-adjusted column assignments. */
  remap(
    rawTable: unknown[],
    mapping: Record<string, FieldKey | null>,
    hasHeader: boolean,
  ): ImportPreview {
    // The DTO only guarantees an outer array; normalize every cell to a string
    if (rawTable.length === 0) {
      throw new BadRequestException('Table must not be empty');
    }
    const table: RawTable = rawTable.map((row, i) => {
      if (!Array.isArray(row)) {
        throw new BadRequestException(`Row ${i} is not an array`);
      }
      return row.map((cell) =>
        cell === null || cell === undefined ? '' : String(cell),
      );
    });
    const normalized: ColumnMapping = {};
    for (const [k, v] of Object.entries(mapping)) normalized[+k] = v;
    const rows = mapRows(table, normalized, hasHeader);
    const detection = detectColumns(table);
    return {
      headers: hasHeader
        ? table[0]
        : table[0].map((_, i) => `Column ${i + 1}`),
      hasHeader,
      mapping: normalized,
      confidence: detection.confidence,
      totalRows: rows.length,
      validRows: rows.filter((r) => r.errors.length === 0).length,
      errorRows: rows.filter((r) => r.errors.length > 0).length,
      rows,
    };
  }

  private buildPreview(table: RawTable): ImportPreview {
    if (table.length === 0) {
      throw new BadRequestException('No rows found in the provided data');
    }
    if (table.length > MAX_ROWS + 1) {
      throw new BadRequestException(
        `Too many rows (${table.length}). Maximum is ${MAX_ROWS}.`,
      );
    }
    const detection = detectColumns(table);
    const rows = mapRows(table, detection.mapping, detection.hasHeader);
    return {
      headers: detection.headers,
      hasHeader: detection.hasHeader,
      mapping: detection.mapping,
      confidence: detection.confidence,
      totalRows: rows.length,
      validRows: rows.filter((r) => r.errors.length === 0).length,
      errorRows: rows.filter((r) => r.errors.length > 0).length,
      rows,
    };
  }

  /**
   * Commits validated rows into a portfolio in a single transaction.
   * Every row is re-validated server-side; any invalid row aborts the commit.
   */
  async commit(
    userId: string,
    portfolioId: string,
    rows: {
      symbol: string;
      exchange: string;
      type: string;
      quantity: number;
      price: number;
      fees?: number;
      currency?: string;
      companyName?: string;
      notes?: string;
      date: string;
    }[],
  ) {
    await this.portfoliosService.findOne(userId, portfolioId);
    if (rows.length === 0) {
      throw new BadRequestException('No rows to import');
    }
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(`Maximum ${MAX_ROWS} rows per import`);
    }

    const validExchanges = ['NYSE', 'NASDAQ', 'NSE', 'BSE'];
    const validTypes = ['BUY', 'SELL', 'DIVIDEND', 'SPLIT'];
    const data: Prisma.TransactionCreateManyInput[] = [];
    const errors: { row: number; message: string }[] = [];

    rows.forEach((r, i) => {
      const rowErrors: string[] = [];
      // Guard field types before touching values — the DTO cannot express this
      if (
        typeof r?.symbol !== 'string' ||
        typeof r?.exchange !== 'string' ||
        typeof r?.type !== 'string' ||
        typeof r?.date !== 'string' ||
        typeof r?.quantity !== 'number' ||
        typeof r?.price !== 'number' ||
        (r.fees !== undefined && typeof r.fees !== 'number') ||
        (r.currency !== undefined && typeof r.currency !== 'string') ||
        (r.companyName !== undefined && typeof r.companyName !== 'string') ||
        (r.notes !== undefined && typeof r.notes !== 'string')
      ) {
        errors.push({ row: i, message: 'invalid field types' });
        return;
      }
      const symbol = r.symbol.toUpperCase().trim();
      if (!/^[A-Z0-9.\-&]{1,20}$/.test(symbol)) rowErrors.push('invalid symbol');
      if (!validExchanges.includes(r.exchange)) rowErrors.push('invalid exchange');
      if (!validTypes.includes(r.type)) rowErrors.push('invalid type');
      if (!(r.quantity > 0) || r.quantity > 1e9) rowErrors.push('invalid quantity');
      if (!(r.price >= 0) || r.price > 1e11) rowErrors.push('invalid price');
      if ((r.type === 'BUY' || r.type === 'SELL') && !(r.price > 0)) {
        rowErrors.push('price must be positive');
      }
      const date = new Date(r.date);
      // Same clock-skew tolerance as the transactions API (see there for why)
      if (
        isNaN(date.getTime()) ||
        date.getTime() - Date.now() > 5 * 60 * 1000
      ) {
        rowErrors.push('invalid date');
      }
      if (r.fees !== undefined && (r.fees < 0 || r.fees > 1e9)) {
        rowErrors.push('invalid fees');
      }

      if (rowErrors.length > 0) {
        errors.push({ row: i, message: rowErrors.join(', ') });
        return;
      }

      const exchange = r.exchange as Prisma.TransactionCreateManyInput['exchange'];
      data.push({
        portfolioId,
        type: r.type as Prisma.TransactionCreateManyInput['type'],
        symbol,
        exchange,
        companyName: r.companyName?.slice(0, 200),
        quantity: new Prisma.Decimal(r.quantity),
        price: new Prisma.Decimal(r.price),
        fees: new Prisma.Decimal(r.fees ?? 0),
        currency:
          r.currency === 'USD' || r.currency === 'INR'
            ? r.currency
            : currencyForExchange(exchange as never),
        notes: r.notes?.slice(0, 500),
        executedAt: date,
      });
    });

    if (errors.length > 0) {
      throw new BadRequestException({
        message: `${errors.length} row(s) failed validation`,
        details: errors.slice(0, 50),
      });
    }

    await this.assertSellsCovered(portfolioId, data);

    const result = await this.prisma.transaction.createMany({ data });
    return { imported: result.count };
  }

  /**
   * Replays existing + imported transactions per (symbol, exchange) and
   * rejects the batch if any SELL would exceed the split-adjusted quantity
   * held at its date — the same invariant the transactions API enforces.
   */
  private async assertSellsCovered(
    portfolioId: string,
    data: Prisma.TransactionCreateManyInput[],
  ) {
    if (!data.some((d) => d.type === 'SELL')) return;

    const symbols = [...new Set(data.map((d) => d.symbol))];
    const existing = await this.prisma.transaction.findMany({
      where: { portfolioId, symbol: { in: symbols } },
      select: {
        type: true,
        symbol: true,
        exchange: true,
        quantity: true,
        price: true,
        executedAt: true,
      },
    });

    interface SimTx {
      type: string;
      quantity: number;
      price: number;
      executedAt: Date;
    }
    const byKey = new Map<string, SimTx[]>();
    const push = (key: string, tx: SimTx) => {
      const list = byKey.get(key) ?? [];
      list.push(tx);
      byKey.set(key, list);
    };
    for (const t of existing) {
      push(`${t.symbol}:${t.exchange}`, {
        type: t.type,
        quantity: t.quantity.toNumber(),
        price: t.price.toNumber(),
        executedAt: t.executedAt,
      });
    }
    for (const d of data) {
      push(`${d.symbol}:${d.exchange}`, {
        type: d.type as string,
        quantity: Number(d.quantity),
        price: Number(d.price),
        executedAt: new Date(d.executedAt as Date | string),
      });
    }

    const TYPE_ORDER: Record<string, number> = {
      BUY: 0, SPLIT: 1, DIVIDEND: 2, SELL: 3,
    };
    const problems: string[] = [];
    for (const [key, txs] of byKey) {
      txs.sort(
        (a, b) =>
          a.executedAt.getTime() - b.executedAt.getTime() ||
          (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9),
      );
      let qty = 0;
      for (const tx of txs) {
        if (tx.type === 'BUY') qty += tx.quantity;
        else if (tx.type === 'SELL') qty -= tx.quantity;
        else if (tx.type === 'SPLIT') qty *= tx.price;
        if (qty < -1e-9) {
          const [sym, exch] = key.split(':');
          problems.push(
            `${sym} (${exch}): sell of ${tx.quantity} on ${tx.executedAt.toISOString().slice(0, 10)} exceeds shares held`,
          );
          break;
        }
      }
    }
    if (problems.length > 0) {
      throw new BadRequestException({
        message: 'Import rejected: some sells exceed the quantity held',
        details: problems.slice(0, 20),
      });
    }
  }
}
