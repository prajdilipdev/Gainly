import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { PortfoliosService } from '../portfolios/portfolios.service';
import {
  AnalyticsService,
  PortfolioSummary,
} from '../analytics/analytics.service';

export interface ExportPayload {
  contentType: string;
  filename: string;
  buffer: Buffer;
}

const TX_HEADERS = [
  'Date', 'Type', 'Symbol', 'Exchange', 'Company', 'Quantity', 'Price',
  'Fees', 'Currency', 'Notes',
];

const HOLDING_HEADERS = [
  'Symbol', 'Exchange', 'Company', 'Quantity', 'Avg Cost', 'Cost Basis',
  'Current Price', 'Market Value', 'Unrealized P&L', 'Unrealized P&L %',
  'Realized P&L', 'Dividends', 'Currency', 'Weight %',
];

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfoliosService: PortfoliosService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async export(
    userId: string,
    portfolioId: string,
    format: 'csv' | 'xlsx' | 'pdf' | 'json',
    scope: 'transactions' | 'holdings',
  ): Promise<ExportPayload> {
    const portfolio = await this.portfoliosService.findOne(userId, portfolioId);
    const stamp = new Date().toISOString().slice(0, 10);
    const safeName = portfolio.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const base = `${safeName}_${scope}_${stamp}`;

    if (scope === 'transactions') {
      const txs = await this.prisma.transaction.findMany({
        where: { portfolioId },
        orderBy: { executedAt: 'asc' },
      });
      const rows = txs.map((t) => [
        t.executedAt.toISOString().slice(0, 10),
        t.type,
        t.symbol,
        t.exchange,
        t.companyName ?? '',
        t.quantity.toNumber(),
        t.price.toNumber(),
        t.fees.toNumber(),
        t.currency,
        t.notes ?? '',
      ]);
      return this.render(format, base, TX_HEADERS, rows, {
        title: `${portfolio.name} — Transactions`,
        jsonKey: 'transactions',
      });
    }

    const summary = await this.analyticsService.getPortfolioSummary(
      userId,
      portfolioId,
    );
    const rows = summary.holdings
      .filter((h) => h.quantity > 0)
      .map((h) => [
        h.symbol,
        h.exchange,
        h.companyName ?? '',
        h.quantity,
        round(h.avgCost),
        round(h.costBasis),
        h.currentPrice !== null ? round(h.currentPrice) : '',
        h.marketValue !== null ? round(h.marketValue) : '',
        h.unrealizedPnl !== null ? round(h.unrealizedPnl) : '',
        h.unrealizedPnlPercent !== null ? round(h.unrealizedPnlPercent) : '',
        round(h.realizedPnl),
        round(h.dividends),
        h.currency,
        h.weight !== null ? round(h.weight) : '',
      ]);
    return this.render(format, base, HOLDING_HEADERS, rows, {
      title: `${portfolio.name} — Holdings`,
      jsonKey: 'holdings',
      summary,
    });
  }

  private async render(
    format: 'csv' | 'xlsx' | 'pdf' | 'json',
    base: string,
    headers: string[],
    rows: (string | number)[][],
    opts: { title: string; jsonKey: string; summary?: PortfolioSummary },
  ): Promise<ExportPayload> {
    switch (format) {
      case 'csv':
        return {
          contentType: 'text/csv; charset=utf-8',
          filename: `${base}.csv`,
          buffer: Buffer.from(this.toCsv(headers, rows), 'utf-8'),
        };
      case 'json': {
        const objects = rows.map((r) =>
          Object.fromEntries(headers.map((h, i) => [h, r[i]])),
        );
        const body: Record<string, unknown> = { [opts.jsonKey]: objects };
        if (opts.summary) {
          const { holdings: _h, ...meta } = opts.summary;
          body.summary = meta;
        }
        return {
          contentType: 'application/json; charset=utf-8',
          filename: `${base}.json`,
          buffer: Buffer.from(JSON.stringify(body, null, 2), 'utf-8'),
        };
      }
      case 'xlsx':
        return {
          contentType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          filename: `${base}.xlsx`,
          buffer: await this.toExcel(opts.title, headers, rows),
        };
      case 'pdf':
        return {
          contentType: 'application/pdf',
          filename: `${base}.pdf`,
          buffer: await this.toPdf(opts.title, headers, rows),
        };
    }
  }

  private toCsv(headers: string[], rows: (string | number)[][]): string {
    const escape = (v: string | number) => {
      let s = String(v);
      // Neutralize spreadsheet formula injection from user-controlled text
      if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) {
        s = `'${s}`;
      }
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [
      headers.map(escape).join(','),
      ...rows.map((r) => r.map(escape).join(',')),
    ].join('\r\n');
  }

  private async toExcel(
    title: string,
    headers: string[],
    rows: (string | number)[][],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Stock Portfolio Tracker';
    const sheet = workbook.addWorksheet(title.slice(0, 31));
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EEF7' },
    };
    for (const row of rows) sheet.addRow(row);
    sheet.columns.forEach((col, i) => {
      const maxLen = Math.max(
        headers[i]?.length ?? 10,
        ...rows.map((r) => String(r[i] ?? '').length),
      );
      col.width = Math.min(Math.max(maxLen + 2, 10), 40);
    });
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };
    const data = await workbook.xlsx.writeBuffer();
    return Buffer.from(data);
  }

  private toPdf(
    title: string,
    headers: string[],
    rows: (string | number)[][],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: 36,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 72;
      const colWidth = pageWidth / headers.length;
      const rowHeight = 18;

      doc.fontSize(16).font('Helvetica-Bold').text(title);
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor('#666666')
        .text(`Generated ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`);
      doc.moveDown(1);
      doc.fillColor('#000000');

      const drawHeader = () => {
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(8);
        headers.forEach((h, i) => {
          doc.text(h, 36 + i * colWidth, y, {
            width: colWidth - 4,
            ellipsis: true,
          });
        });
        doc
          .moveTo(36, y + rowHeight - 5)
          .lineTo(36 + pageWidth, y + rowHeight - 5)
          .strokeColor('#999999')
          .stroke();
        doc.y = y + rowHeight;
        doc.font('Helvetica').fontSize(8);
      };

      drawHeader();
      for (const row of rows) {
        if (doc.y + rowHeight > doc.page.height - 36) {
          doc.addPage();
          drawHeader();
        }
        const y = doc.y;
        row.forEach((cell, i) => {
          doc.text(String(cell), 36 + i * colWidth, y, {
            width: colWidth - 4,
            ellipsis: true,
          });
        });
        doc.y = y + rowHeight;
      }
      doc.end();
    });
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
