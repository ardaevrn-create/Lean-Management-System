import ExcelJS from 'exceljs';
import { BusinessException } from '../../common/errors';

export interface ParsedSheet {
  headers: string[];
  /** Başlık → ham değer; rowNumber Excel satır no */
  rows: { rowNumber: number; data: Record<string, unknown> }[];
}

export const MAX_IMPORT_ROWS = 20_000;

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('result' in v) return cellValue((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return (v as ExcelJS.CellHyperlinkValue).text;
    if ('error' in v) return null;
  }
  return v;
}

function parseCsv(text: string): string[][] {
  const delimiter = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** .xlsx veya .csv dosyasının ilk sayfasını başlık + satırlar olarak okur. */
export async function parseSpreadsheet(fileName: string, buffer: Buffer): Promise<ParsedSheet> {
  const lower = fileName.toLowerCase();
  let matrix: unknown[][];
  if (lower.endsWith('.csv')) {
    matrix = parseCsv(buffer.toString('utf8').replace(/^﻿/, ''));
  } else if (lower.endsWith('.xlsx')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BusinessException('EMPTY_FILE', 'Dosyada sayfa bulunamadı');
    matrix = [];
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => { values[col - 1] = cellValue(cell.value); });
      matrix[rowNumber - 1] = values;
    });
  } else {
    throw new BusinessException('UNSUPPORTED_FILE', 'Yalnızca .xlsx ve .csv dosyaları desteklenir (eski .xls dosyasını .xlsx olarak kaydedin)');
  }

  const headerRow = matrix[0] ?? [];
  const headers = headerRow.map((h, i) => (h === null || h === undefined || String(h).trim() === '' ? `Kolon ${i + 1}` : String(h).trim()));
  if (!headers.length) throw new BusinessException('EMPTY_FILE', 'Başlık satırı bulunamadı');

  const rows: ParsedSheet['rows'] = [];
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r || r.every((v) => v === null || v === undefined || String(v).trim() === '')) continue;
    rows.push({ rowNumber: i + 1, data: Object.fromEntries(headers.map((h, idx) => [h, r[idx] ?? null])) });
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new BusinessException('TOO_MANY_ROWS', `En fazla ${MAX_IMPORT_ROWS} satır içe aktarılabilir`);
  }
  return { headers, rows };
}

/** Başlık eşleştirme için normalize: küçük harf, Türkçe karakter sadeleştirme, boşluk/noktalama yok. */
export function normalizeHeader(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
