/** Saf (veritabanından bağımsız) denetim kuralları: puanlama, dönem hesapları, denetçi rotasyonu. */
import { auditScaleMax, type AuditPlanFrequency, type AuditScaleType } from '@lean/shared';

/* ------------------------------ Puanlama ------------------------------ */

export interface ScorableAnswer {
  sectionTitle: string;
  sectionWeight: number;
  sectionSortOrder?: number;
  weight: number;
  score: number | null;
}

export interface SectionScoreResult { title: string; weight: number; scorePct: number | null }
export interface ScoreResult { scorePct: number | null; sections: SectionScoreResult[] }

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Cevap puanı skalaya göre % olarak normalize edilir; bölüm içinde soru ağırlığıyla,
 * bölümler arasında bölüm ağırlığıyla ağırlıklandırılır. Puanlanmamış cevaplar (null) hesaba katılmaz.
 */
export function computeAuditScore(answers: ScorableAnswer[], scale: AuditScaleType): ScoreResult {
  const max = auditScaleMax(scale);
  const order: string[] = [];
  const bySection = new Map<string, { weight: number; sort: number; num: number; den: number }>();
  for (const a of answers) {
    let s = bySection.get(a.sectionTitle);
    if (!s) {
      s = { weight: a.sectionWeight, sort: a.sectionSortOrder ?? order.length, num: 0, den: 0 };
      bySection.set(a.sectionTitle, s);
      order.push(a.sectionTitle);
    }
    if (a.score === null || a.score === undefined || !(a.weight > 0)) continue;
    s.num += a.weight * (Math.min(Math.max(a.score, 0), max) / max);
    s.den += a.weight;
  }
  const sections: SectionScoreResult[] = [];
  let totalNum = 0;
  let totalDen = 0;
  for (const title of order) {
    const s = bySection.get(title)!;
    if (s.den === 0) {
      sections.push({ title, weight: s.weight, scorePct: null });
      continue;
    }
    const pct = s.num / s.den;
    sections.push({ title, weight: s.weight, scorePct: round1(pct * 100) });
    const w = s.weight > 0 ? s.weight : 0;
    totalNum += w * pct;
    totalDen += w;
  }
  return { scorePct: totalDen === 0 ? null : round1((totalNum / totalDen) * 100), sections };
}

/** Puan geçerli mi (skalaya uygun tam sayı)? */
export function isValidScore(score: number, scale: AuditScaleType): boolean {
  return Number.isInteger(score) && score >= 0 && score <= auditScaleMax(scale);
}

/* ------------------------------ Dönemler ------------------------------ */

export interface AuditPeriod { key: string; start: Date; end: Date }

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const pad = (n: number) => String(n).padStart(2, '0');

/** ISO hafta numarası ve yılı. */
export function isoWeek(d: Date): { year: number; week: number } {
  const t = utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = utc(t.getUTCFullYear(), 0, 1);
  return { year: t.getUTCFullYear(), week: Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7) };
}

/** Verilen tarihin içinde bulunduğu denetim dönemi; bitiş = dönemin son günü (termin). */
export function periodOf(frequency: AuditPlanFrequency, date: Date): AuditPeriod {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  if (frequency === 'MONTHLY') {
    return { key: `${y}-${pad(m + 1)}`, start: utc(y, m, 1), end: utc(y, m + 1, 0) };
  }
  if (frequency === 'QUARTERLY') {
    const q = Math.floor(m / 3);
    return { key: `${y}-Q${q + 1}`, start: utc(y, q * 3, 1), end: utc(y, q * 3 + 3, 0) };
  }
  const day = date.getUTCDay() || 7;
  const start = utc(y, m, date.getUTCDate() - day + 1);
  const end = utc(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6);
  const w = isoWeek(date);
  return { key: `${w.year}-W${pad(w.week)}`, start, end };
}

/** startDate'in içinde bulunduğu dönemden `until` tarihini içeren döneme kadar tüm dönemler (endDate ile sınırlı). */
export function enumeratePeriods(frequency: AuditPlanFrequency, startDate: Date, until: Date, endDate?: Date | null): AuditPeriod[] {
  const limit = endDate && endDate < until ? endDate : until;
  const result: AuditPeriod[] = [];
  let p = periodOf(frequency, startDate);
  let guard = 0;
  while (p.start <= limit && guard++ < 1000) {
    result.push(p);
    p = periodOf(frequency, new Date(p.end.getTime() + 86_400_000));
  }
  return result;
}

/* ------------------------------ Denetçi rotasyonu ------------------------------ */

export interface RotationAuditor { userId: string; orgPath: string | null }

/**
 * Rotasyondan denetçi seçer: `startIndex`'ten başlayarak listeyi dolaşır. Çapraz denetimde, alanın birim ağacına
 * (alt birimler dahil) ait denetçiler atlanır. Uygun denetçi yoksa null.
 */
export function pickRotationAuditor(opts: {
  auditors: RotationAuditor[]; startIndex: number; areaPath: string | null; crossAudit: boolean;
}): string | null {
  const n = opts.auditors.length;
  for (let i = 0; i < n; i++) {
    const a = opts.auditors[(((opts.startIndex + i) % n) + n) % n];
    if (opts.crossAudit && opts.areaPath && a.orgPath && a.orgPath.startsWith(opts.areaPath)) continue;
    return a.userId;
  }
  return null;
}

/* ------------------------------ Gecikme ------------------------------ */

export function daysBetween(later: Date, earlier: Date): number {
  const a = utc(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate()).getTime();
  const b = utc(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate()).getTime();
  return Math.round((a - b) / 86_400_000);
}
