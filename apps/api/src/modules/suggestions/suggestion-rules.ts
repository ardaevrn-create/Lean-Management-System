/** Öneri modülü saf yardımcıları (istatistik, tarih, parse). */
import { isoWeekOf, type EvaluationCriterion, type PointRules, type RewardTier } from '@lean/shared';
import { DEFAULT_CRITERIA, DEFAULT_POINT_RULES, DEFAULT_REWARD_TIERS } from '@lean/shared';

/** Yüzde (0–100, tek ondalık); payda 0 ise null. Pay paydayı aşarsa 100'e sınırlanır. */
export function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round(Math.min(part / whole, 1) * 1000) / 10;
}

/** Katılım %: farklı öneri veren / aktif çalışan. */
export function participationPct(distinctSubmitters: number, activeEmployees: number): number | null {
  return pct(distinctSubmitters, activeEmployees);
}

/** Kişi başı öneri (iki ondalık); çalışan yoksa null. */
export function perEmployee(count: number, activeEmployees: number): number | null {
  if (activeEmployees <= 0) return null;
  return Math.round((count / activeEmployees) * 100) / 100;
}

/** İki tarih arası ortalama gün (tek ondalık); çift yoksa null. */
export function avgDays(pairs: { from: Date | null; to: Date | null }[]): number | null {
  const days = pairs.filter((p) => p.from && p.to).map((p) => (p.to!.getTime() - p.from!.getTime()) / 86_400_000);
  if (!days.length) return null;
  return Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10;
}

export const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** ISO hafta anahtarı: 2026-W41 */
export function isoWeekKey(d: Date): string {
  const { year, week } = isoWeekOf(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export const ACCEPTED_LIKE = ['ACCEPTED', 'IN_IMPLEMENTATION', 'IMPLEMENTED', 'CLOSED'] as const;
export const IMPLEMENTED_LIKE = ['IMPLEMENTED', 'CLOSED'] as const;

/** Json alanlarından güvenli okuma (eksikse varsayılan). */
export function parseCriteria(v: unknown): EvaluationCriterion[] {
  return Array.isArray(v) && v.length ? (v as EvaluationCriterion[]) : DEFAULT_CRITERIA;
}
export function parsePointRules(v: unknown): PointRules {
  const o = (v ?? {}) as Partial<PointRules>;
  return {
    submission: o.submission ?? DEFAULT_POINT_RULES.submission,
    acceptanceBands: o.acceptanceBands?.length ? o.acceptanceBands : DEFAULT_POINT_RULES.acceptanceBands,
    implementation: o.implementation ?? DEFAULT_POINT_RULES.implementation,
    kaizenPublished: o.kaizenPublished ?? DEFAULT_POINT_RULES.kaizenPublished,
  };
}
export function parseTiers(v: unknown): RewardTier[] {
  return Array.isArray(v) ? (v as RewardTier[]) : DEFAULT_REWARD_TIERS;
}

export const num = (d: { toString(): string } | null | undefined): number | null => (d === null || d === undefined ? null : Number(d.toString()));
