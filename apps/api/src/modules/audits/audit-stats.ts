/** Saf rapor toplulaştırma yardımcıları. */
import type { AuditAreaStat, AuditTrendPoint, TagCategory, TagColor } from '@lean/shared';

export interface StatAudit {
  id: string;
  areaId: string;
  completedAt: Date;
  scorePct: number;
  sectionScores: { title: string; scorePct: number | null }[];
}

export interface AreaInfo { id: string; code: string; name: string; orgUnit: { id: string; name: string; code: string | null } | null }

const round1 = (n: number) => Math.round(n * 10) / 10;
const avg = (xs: number[]) => (xs.length ? round1(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** Bölüm ortalamaları (null puanlar atlanır), ilk görülme sırasıyla. */
export function sectionAverages(audits: Pick<StatAudit, 'sectionScores'>[]): { title: string; scorePct: number }[] {
  const acc = new Map<string, number[]>();
  for (const a of audits) {
    for (const s of a.sectionScores) {
      if (s.scorePct === null) continue;
      if (!acc.has(s.title)) acc.set(s.title, []);
      acc.get(s.title)!.push(s.scorePct);
    }
  }
  return [...acc].map(([title, xs]) => ({ title, scorePct: avg(xs)! }));
}

/** Alan bazında son skor, önceki skor, son N denetimlik trend ve bölüm ortalamaları. */
export function buildAreaStats(areas: AreaInfo[], audits: StatAudit[], trendSize = 6): AuditAreaStat[] {
  return areas.map((area) => {
    const own = audits.filter((a) => a.areaId === area.id).sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
    const last = own.slice(-trendSize);
    const trend: AuditTrendPoint[] = last.map((a) => ({ auditId: a.id, date: a.completedAt.toISOString(), scorePct: a.scorePct }));
    const latest = own[own.length - 1];
    const previous = own[own.length - 2];
    return {
      areaId: area.id, code: area.code, name: area.name, orgUnit: area.orgUnit,
      auditCount: own.length,
      latestScore: latest?.scorePct ?? null,
      latestAt: latest ? latest.completedAt.toISOString() : null,
      previousScore: previous?.scorePct ?? null,
      average: avg(own.map((a) => a.scorePct)),
      trend,
      sectionAverages: sectionAverages(last),
    };
  });
}

/** En iyi / en kötü alanlar (son skora göre; skoru olmayanlar dışarıda). */
export function rankAreas(stats: AuditAreaStat[], size = 3): { best: AuditAreaStat[]; worst: AuditAreaStat[] } {
  const scored = stats.filter((s) => s.latestScore !== null);
  const desc = [...scored].sort((a, b) => b.latestScore! - a.latestScore! || a.name.localeCompare(b.name, 'tr'));
  return { best: desc.slice(0, size), worst: [...desc].reverse().slice(0, size) };
}

export interface ComplianceAudit { status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'; dueDate: Date }

/** Planlanan / tamamlanan / geciken (yapılmayan) denetim sayıları. */
export function complianceCounts(audits: ComplianceAudit[], today: Date) {
  let completed = 0, planned = 0, overdue = 0, cancelled = 0;
  for (const a of audits) {
    if (a.status === 'COMPLETED') completed++;
    else if (a.status === 'CANCELLED') cancelled++;
    else if (a.dueDate < today) overdue++;
    else planned++;
  }
  const total = audits.length - cancelled;
  return { total, completed, planned, overdue, cancelled, completionRate: total ? round1((completed / total) * 100) : null };
}

export interface TagForStats {
  color: TagColor; category: TagCategory; status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED' | 'CANCELLED';
  dueDate: Date | null; createdAt: Date; closedAt: Date | null;
}

export function tagStats(tags: TagForStats[], today: Date) {
  const byColor: Record<TagColor, number> = { RED: 0, BLUE: 0 };
  const byCategory: Record<TagCategory, number> = { LEAK: 0, LOOSENESS: 0, CONTAMINATION: 0, DAMAGE: 0, SAFETY: 0, MISSING_PART: 0, OTHER: 0 };
  let open = 0, overdue = 0, closed = 0;
  const closureDays: number[] = [];
  for (const t of tags) {
    if (t.status === 'OPEN' || t.status === 'IN_PROGRESS') {
      open++;
      byColor[t.color]++;
      byCategory[t.category]++;
      if (t.dueDate && t.dueDate < today) overdue++;
    } else if (t.status === 'CLOSED' && t.closedAt) {
      closed++;
      closureDays.push((t.closedAt.getTime() - t.createdAt.getTime()) / 86_400_000);
    }
  }
  return { open, overdue, closed, byColor, byCategory, avgClosureDays: avg(closureDays) };
}
