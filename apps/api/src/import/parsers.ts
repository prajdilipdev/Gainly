import { BadRequestException } from '@nestjs/common';
import * as Papa from 'papaparse';
import * as ExcelJS from 'exceljs';

export type RawTable = string[][];

/**
 * Parses any supported payload (CSV/TSV text, pasted tables, JSON arrays,
 * Excel buffers) into a uniform 2D string table. Empty rows are dropped.
 */
export async function parseBuffer(
  buffer: Buffer,
  filename: string,
): Promise<RawTable> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.xlsm')) {
    return parseExcel(buffer);
  }
  const text = buffer.toString('utf-8').replace(/^﻿/, '');
  if (lower.endsWith('.json')) return parseJsonText(text);
  return parseDelimitedText(text);
}

export function parseText(text: string): RawTable {
  const trimmed = text.trim().replace(/^﻿/, '');
  if (!trimmed) throw new BadRequestException('No data provided');
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      return parseJsonText(trimmed);
    } catch {
      // fall through to delimited parsing
    }
  }
  return parseDelimitedText(trimmed);
}

async function parseExcel(buffer: Buffer): Promise<RawTable> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new BadRequestException(
      'Could not read the Excel file. Please save it as .xlsx and retry.',
    );
  }
  const sheet =
    workbook.worksheets.find((ws) => ws.rowCount > 0) ?? workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('The Excel file has no sheets');

  const rows: RawTable = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    const cellCount = Math.max(row.cellCount, sheet.columnCount);
    for (let c = 1; c <= cellCount; c++) {
      values.push(cellToString(row.getCell(c)));
    }
    if (values.some((v) => v.trim() !== '')) rows.push(values);
  });
  if (rows.length === 0) throw new BadRequestException('The Excel sheet is empty');
  return rows;
}

function cellToString(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v && v.result !== undefined && v.result !== null) {
      return v.result instanceof Date
        ? v.result.toISOString().slice(0, 10)
        : String(v.result);
    }
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((t) => t.text).join('');
    }
    if ('text' in v) return String(v.text);
    if ('hyperlink' in v) return String((v as { hyperlink: string }).hyperlink);
    return '';
  }
  return String(v);
}

function parseJsonText(text: string): RawTable {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BadRequestException('Invalid JSON');
  }
  // Accept { transactions: [...] } / { holdings: [...] } / { data: [...] } wrappers
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const arrayKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
    if (arrayKey) data = obj[arrayKey];
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new BadRequestException('JSON must contain a non-empty array of records');
  }
  if (typeof data[0] === 'object' && data[0] !== null && !Array.isArray(data[0])) {
    const keys = [
      ...new Set(
        (data as Record<string, unknown>[]).flatMap((row) => Object.keys(row)),
      ),
    ];
    const table: RawTable = [keys];
    for (const row of data as Record<string, unknown>[]) {
      table.push(keys.map((k) => stringifyJsonValue(row[k])));
    }
    return table;
  }
  if (Array.isArray(data[0])) {
    return (data as unknown[][]).map((row) => row.map(stringifyJsonValue));
  }
  throw new BadRequestException('Unsupported JSON structure');
}

function stringifyJsonValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Handles CSV, TSV, semicolon/pipe-delimited files, and tables pasted from
 * websites or spreadsheets (tab or multi-space separated).
 */
function parseDelimitedText(text: string): RawTable {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) throw new BadRequestException('No data provided');

  // Prefer tab when present (spreadsheet paste)
  const delimiter = detectDelimiter(lines);
  if (delimiter === 'whitespace') {
    // Column-aligned text tables: split on runs of 2+ spaces
    return lines.map((l) => l.trim().split(/\s{2,}/).map((c) => c.trim()));
  }

  const result = Papa.parse<string[]>(lines.join('\n'), {
    delimiter,
    skipEmptyLines: true,
  });
  if (result.errors.length > 0 && result.data.length === 0) {
    throw new BadRequestException(
      `Could not parse the data: ${result.errors[0].message}`,
    );
  }
  return result.data.map((row) => row.map((c) => (c ?? '').trim()));
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 10);
  const candidates = ['\t', ',', ';', '|'];
  let best = '';
  let bestScore = 0;
  for (const d of candidates) {
    const counts = sample.map((l) => l.split(d).length - 1);
    const min = Math.min(...counts);
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    // Consistent and present across rows
    const score = min > 0 ? avg + min * 2 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  if (best) return best;
  // Fall back to multi-space alignment if most lines contain runs of spaces
  const spacey = sample.filter((l) => /\s{2,}/.test(l.trim())).length;
  if (spacey >= sample.length / 2) return 'whitespace';
  return ','; // single-column degenerate case
}
