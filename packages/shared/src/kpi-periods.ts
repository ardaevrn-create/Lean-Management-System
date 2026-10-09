/**
 * KPI dönem (period) yardımcıları — saf TypeScript, hem api hem web kullanır.
 *
 * Dönem anahtarları:
 *   DAILY 'YYYY-MM-DD' · WEEKLY ISO 'YYYY-Www' · MONTHLY 'YYYY-MM' · QUARTERLY 'YYYY-Qn' · YEARLY 'YYYY'
 * Tüm tarihler UTC gün başlangıcıdır (saat bileşeni yok).
 */

export const KPI_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export type KpiFrequency = (typeof KPI_FREQUENCIES)[number];

const DAY_MS = 86_400_000;
const MAX_PERIODS = 5_000;

export interface ParsedPeriod {
  frequency: KpiFrequency;
  year: number;
  month?: number;
  day?: number;
  week?: number;
  quarter?: number;
}

/* ------------------------------ Tarih yardımcıları ------------------------------ */

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}
function addDaysUtc(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}
export function utcDay(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}
function isRealDate(y: number, m: number, d: number): boolean {
  const date = utc(y, m, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
function mondayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

function isoWeekStart(year: number, week: number): Date {
  const jan4 = utc(year, 1, 4);
  return addDaysUtc(jan4, -mondayIndex(jan4) + (week - 1) * 7);
}

/** ISO 8601 hafta yılı ve hafta numarası. */
export function isoWeekOf(date: Date): { year: number; week: number } {
  const d = utcDay(date);
  const thursday = addDaysUtc(d, 3 - mondayIndex(d));
  const year = thursday.getUTCFullYear();
  const week1Thursday = addDaysUtc(isoWeekStart(year, 1), 3);
  const week = Math.floor((thursday.getTime() - week1Thursday.getTime()) / (7 * DAY_MS)) + 1;
  return { year, week };
}

export function isoWeeksInYear(year: number): number {
  return isoWeekOf(utc(year, 12, 28)).week;
}

/* ------------------------------ Ayrıştırma ------------------------------ */

const RE_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_WEEK = /^(\d{4})-W(\d{2})$/;
const RE_MONTH = /^(\d{4})-(\d{2})$/;
const RE_QUARTER = /^(\d{4})-Q([1-4])$/;
const RE_YEAR = /^(\d{4})$/;

export function parsePeriod(key: string): ParsedPeriod | null {
  if (typeof key !== 'string') return null;
  let m = RE_DAY.exec(key);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return isRealDate(y, mo, d) ? { frequency: 'DAILY', year: y, month: mo, day: d } : null;
  }
  m = RE_WEEK.exec(key);
  if (m) {
    const [y, w] = [+m[1], +m[2]];
    return w >= 1 && w <= isoWeeksInYear(y) ? { frequency: 'WEEKLY', year: y, week: w } : null;
  }
  m = RE_MONTH.exec(key);
  if (m) {
    const [y, mo] = [+m[1], +m[2]];
    return mo >= 1 && mo <= 12 ? { frequency: 'MONTHLY', year: y, month: mo } : null;
  }
  m = RE_QUARTER.exec(key);
  if (m) return { frequency: 'QUARTERLY', year: +m[1], quarter: +m[2] };
  m = RE_YEAR.exec(key);
  if (m) return { frequency: 'YEARLY', year: +m[1] };
  return null;
}

export function detectFrequency(key: string): KpiFrequency | null {
  return parsePeriod(key)?.frequency ?? null;
}

/** Anahtar geçerli mi? `frequency` verilirse o sıklıkta olmalı. */
export function isValidPeriod(key: string, frequency?: KpiFrequency): boolean {
  const p = parsePeriod(key);
  return !!p && (!frequency || p.frequency === frequency);
}

/* ------------------------------ Başlangıç / bitiş ------------------------------ */

/** Dönemin ilk günü (UTC). */
export function periodStart(key: string): Date {
  const p = parsePeriod(key);
  if (!p) throw new Error(`Invalid period: ${key}`);
  switch (p.frequency) {
    case 'DAILY': return utc(p.year, p.month!, p.day!);
    case 'WEEKLY': return isoWeekStart(p.year, p.week!);
    case 'MONTHLY': return utc(p.year, p.month!, 1);
    case 'QUARTERLY': return utc(p.year, (p.quarter! - 1) * 3 + 1, 1);
    case 'YEARLY': return utc(p.year, 1, 1);
  }
}

/** Dönemin son günü (UTC, dahil). */
export function periodEnd(key: string): Date {
  const p = parsePeriod(key);
  if (!p) throw new Error(`Invalid period: ${key}`);
  switch (p.frequency) {
    case 'DAILY': return utc(p.year, p.month!, p.day!);
    case 'WEEKLY': return addDaysUtc(isoWeekStart(p.year, p.week!), 6);
    case 'MONTHLY': return addDaysUtc(utc(p.year, p.month! + 1, 1), -1);
    case 'QUARTERLY': return addDaysUtc(utc(p.year, p.quarter! * 3 + 1, 1), -1);
    case 'YEARLY': return utc(p.year, 12, 31);
  }
}

/** Veri girişi için son gün = dönem sonu + entryDueDays. Bu günden sonra veri "eksik" sayılır. */
export function periodDueDate(key: string, entryDueDays: number): Date {
  return addDaysUtc(periodEnd(key), entryDueDays);
}

/* ------------------------------ Dönem üretimi ------------------------------ */

/** Verilen tarihi kapsayan dönemin anahtarı. */
export function currentPeriod(frequency: KpiFrequency, date: Date = new Date()): string {
  const d = utcDay(date);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  switch (frequency) {
    case 'DAILY': return `${y}-${pad(mo)}-${pad(d.getUTCDate())}`;
    case 'WEEKLY': {
      const w = isoWeekOf(d);
      return `${w.year}-W${pad(w.week)}`;
    }
    case 'MONTHLY': return `${y}-${pad(mo)}`;
    case 'QUARTERLY': return `${y}-Q${Math.floor((mo - 1) / 3) + 1}`;
    case 'YEARLY': return String(y);
  }
}

/** Dönemi n adım ileri (n < 0 ise geri) taşır. */
export function addPeriods(key: string, n: number): string {
  const p = parsePeriod(key);
  if (!p) throw new Error(`Invalid period: ${key}`);
  switch (p.frequency) {
    case 'DAILY': return currentPeriod('DAILY', addDaysUtc(periodStart(key), n));
    case 'WEEKLY': return currentPeriod('WEEKLY', addDaysUtc(periodStart(key), n * 7));
    case 'MONTHLY': {
      const idx = p.year * 12 + (p.month! - 1) + n;
      return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
    }
    case 'QUARTERLY': {
      const idx = p.year * 4 + (p.quarter! - 1) + n;
      return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
    }
    case 'YEARLY': return String(p.year + n);
  }
}

export const nextPeriod = (key: string) => addPeriods(key, 1);
export const prevPeriod = (key: string) => addPeriods(key, -1);

/** Aynı sıklıktaki iki dönemi karşılaştırır (anahtarlar sözlük sırasıyla zaman sırasındadır). */
export function comparePeriods(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** [from, to] aralığındaki tüm dönemler (dahil). from > to ise boş. */
export function periodsBetween(frequency: KpiFrequency, from: string, to: string): string[] {
  if (!isValidPeriod(from, frequency) || !isValidPeriod(to, frequency)) throw new Error(`Invalid period range: ${from}..${to}`);
  const out: string[] = [];
  let cur = from;
  while (comparePeriods(cur, to) <= 0) {
    out.push(cur);
    if (out.length > MAX_PERIODS) throw new Error('Period range too large');
    cur = nextPeriod(cur);
  }
  return out;
}

/** `endKey` dahil son n dönem (eskiden yeniye). */
export function recentPeriods(endKey: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addPeriods(endKey, -i));
  return out;
}

/** Bitiş tarihi `today`'den önce olan (tamamlanmış) son dönem. */
export function lastEndedPeriod(frequency: KpiFrequency, today: Date = new Date()): string {
  return prevPeriod(currentPeriod(frequency, today));
}

/** Bitiş tarihi `date` veya öncesi olan son dönem (örn. pano için referans tarih). */
export function lastPeriodEndingOnOrBefore(frequency: KpiFrequency, date: Date): string {
  const cur = currentPeriod(frequency, date);
  return periodEnd(cur).getTime() <= utcDay(date).getTime() ? cur : prevPeriod(cur);
}

/** Dönem anahtarının ait olduğu yıl (haftalıkta ISO hafta yılı). */
export function periodYear(key: string): number {
  const p = parsePeriod(key);
  if (!p) throw new Error(`Invalid period: ${key}`);
  return p.year;
}

export function firstPeriodOfYear(frequency: KpiFrequency, year: number): string {
  switch (frequency) {
    case 'DAILY': return `${year}-01-01`;
    case 'WEEKLY': return `${year}-W01`;
    case 'MONTHLY': return `${year}-01`;
    case 'QUARTERLY': return `${year}-Q1`;
    case 'YEARLY': return String(year);
  }
}

export function lastPeriodOfYear(frequency: KpiFrequency, year: number): string {
  switch (frequency) {
    case 'DAILY': return `${year}-12-31`;
    case 'WEEKLY': return `${year}-W${pad(isoWeeksInYear(year))}`;
    case 'MONTHLY': return `${year}-12`;
    case 'QUARTERLY': return `${year}-Q4`;
    case 'YEARLY': return String(year);
  }
}

export function periodsOfYear(frequency: KpiFrequency, year: number): string[] {
  return periodsBetween(frequency, firstPeriodOfYear(frequency, year), lastPeriodOfYear(frequency, year));
}

/** Bir önceki yılın karşılık gelen dönemi (YTD / önceki yıl kıyası için). */
export function previousYearPeriod(key: string): string {
  const p = parsePeriod(key);
  if (!p) throw new Error(`Invalid period: ${key}`);
  const y = p.year - 1;
  switch (p.frequency) {
    case 'DAILY': return isRealDate(y, p.month!, p.day!) ? `${y}-${pad(p.month!)}-${pad(p.day!)}` : `${y}-${pad(p.month!)}-28`;
    case 'WEEKLY': return `${y}-W${pad(Math.min(p.week!, isoWeeksInYear(y)))}`;
    case 'MONTHLY': return `${y}-${pad(p.month!)}`;
    case 'QUARTERLY': return `${y}-Q${p.quarter}`;
    case 'YEARLY': return String(y);
  }
}

/* ------------------------------ Etiketler ------------------------------ */

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** İnsan okunur etiket: "Eki 2026", "2026-Ç4", "Hf 41", "06.10.2026", "2026". */
export function periodLabel(key: string, locale: string = 'tr'): string {
  const p = parsePeriod(key);
  if (!p) return key;
  const en = locale === 'en';
  switch (p.frequency) {
    case 'DAILY': return en ? `${pad(p.day!)} ${MONTHS_EN[p.month! - 1]} ${p.year}` : `${pad(p.day!)}.${pad(p.month!)}.${p.year}`;
    case 'WEEKLY': return `${en ? 'Wk' : 'Hf'} ${p.week}`;
    case 'MONTHLY': return `${(en ? MONTHS_EN : MONTHS_TR)[p.month! - 1]} ${p.year}`;
    case 'QUARTERLY': return `${p.year}-${en ? 'Q' : 'Ç'}${p.quarter}`;
    case 'YEARLY': return String(p.year);
  }
}

/* ------------------------------ Dış girdiyi dönem anahtarına çevirme ------------------------------ */

const FREQ_RANK: Record<KpiFrequency, number> = { DAILY: 0, WEEKLY: 1, MONTHLY: 2, QUARTERLY: 3, YEARLY: 4 };

/**
 * Excel / entegrasyon girdisini (anahtar, tarih, Excel seri no, "10.2026" vb.) KPI sıklığının
 * dönem anahtarına çevirir. Çevrilemezse null.
 */
export function coercePeriodInput(raw: unknown, frequency: KpiFrequency): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : currentPeriod(frequency, raw);
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    if (Number.isInteger(raw) && raw >= 1900 && raw <= 2200) return frequency === 'YEARLY' ? String(raw) : null;
    if (raw > 20_000 && raw < 80_000) return currentPeriod(frequency, new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * DAY_MS));
    return null;
  }
  let s = String(raw).trim();
  if (!s) return null;
  if (isValidPeriod(s, frequency)) return s;
  s = s.replace(/-w(\d)/i, '-W$1').replace(/-q(\d)/i, '-Q$1').replace(/-W(\d)$/, '-W0$1');
  if (isValidPeriod(s, frequency)) return s;

  // Başka sıklıkta geçerli anahtar: yalnız daha ince bir anahtar daha kaba bir KPI'a çevrilebilir
  const other = detectFrequency(s);
  if (other) return FREQ_RANK[other] <= FREQ_RANK[frequency] ? currentPeriod(frequency, periodStart(s)) : null;

  let m = /^(\d{4})-(\d{2})-(\d{2})[T ]/.exec(s);
  if (m && isRealDate(+m[1], +m[2], +m[3])) return currentPeriod(frequency, utc(+m[1], +m[2], +m[3]));
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s);
  if (m && isRealDate(+m[3], +m[2], +m[1])) return currentPeriod(frequency, utc(+m[3], +m[2], +m[1]));
  if (FREQ_RANK[frequency] >= FREQ_RANK.MONTHLY) {
    m = /^(\d{1,2})[./-](\d{4})$/.exec(s);
    if (m && +m[1] >= 1 && +m[1] <= 12) return currentPeriod(frequency, utc(+m[2], +m[1], 1));
    m = /^(\d{4})[./](\d{1,2})$/.exec(s);
    if (m && +m[2] >= 1 && +m[2] <= 12) return currentPeriod(frequency, utc(+m[1], +m[2], 1));
  }
  return null;
}
