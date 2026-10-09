import type { ImportColumn } from '@lean/shared';

const TRUE_VALUES = new Set(['1', 'true', 'evet', 'e', 'yes', 'y', 'x', 'var']);
const FALSE_VALUES = new Set(['0', 'false', 'hayir', 'hayır', 'h', 'no', 'n', 'yok', '']);

/** Ham hücre değerini kolon tipine çevirir. Hata durumunda { error } döner. */
export function coerce(raw: unknown, column: ImportColumn): { value: string | number | boolean | Date | null } | { error: string } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return column.required ? { error: 'Zorunlu alan boş' } : { value: null };
  }
  switch (column.type) {
    case 'string':
      return { value: String(raw).trim() };
    case 'number': {
      if (typeof raw === 'number') return { value: raw };
      // "1.234,56" (TR) ve "1,234.56" (EN) biçimlerini destekle
      let s = String(raw).trim().replace(/\s/g, '').replace('%', '');
      if (/,\d{1,}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
      else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
      else s = s.replace(/,/g, '');
      const n = Number(s);
      return Number.isFinite(n) ? { value: n } : { error: `Sayı değil: "${raw}"` };
    }
    case 'boolean': {
      const s = String(raw).trim().toLocaleLowerCase('tr-TR');
      if (typeof raw === 'boolean') return { value: raw };
      if (TRUE_VALUES.has(s)) return { value: true };
      if (FALSE_VALUES.has(s)) return { value: false };
      return { error: `Evet/Hayır değil: "${raw}"` };
    }
    case 'date': {
      const d = parseDate(raw);
      return d ? { value: d } : { error: `Geçersiz tarih: "${raw}" (GG.AA.YYYY veya YYYY-AA-GG)` };
    }
  }
}

function parseDate(raw: unknown): Date | null {
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === 'number') {
    // Excel seri tarih
    const d = new Date(Date.UTC(1899, 11, 30) + raw * 86_400_000);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  return null;
}

function validDate(y: number, mo: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}
