import { Injectable } from '@nestjs/common';
import { computeEntryState, periodDueDate, periodEnd, periodStart, type KpiFrequency, type KpiStatus } from '@lean/shared';
import { startOfUtcDay } from '../../common/dates';
import { PrismaService } from '../../core/prisma/prisma.service';
import { num, toUserRef, userRef, type KpiRow, type PeriodCell } from './kpi-core';

const cellKey = (kpiId: string, period: string) => `${kpiId}|${period}`;

/**
 * KPI × dönem hücrelerini hesaplar: hedef, değer, sapma, aksiyon sayısı ve giriş durumu.
 * Toplu sorgularla çalışır (KPI başına sorgu yok).
 */
@Injectable()
export class KpiSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async cells(kpis: KpiRow[], periodsFor: (k: KpiRow) => string[], today: Date = startOfUtcDay()): Promise<Map<string, PeriodCell[]>> {
    const out = new Map<string, PeriodCell[]>();
    const plan = new Map<string, string[]>();
    const groups = new Map<KpiFrequency, { ids: string[]; min: string; max: string }>();
    for (const k of kpis) {
      const periods = [...new Set(periodsFor(k))].sort();
      plan.set(k.id, periods);
      out.set(k.id, []);
      if (!periods.length) continue;
      const g = groups.get(k.frequency) ?? { ids: [], min: periods[0], max: periods[periods.length - 1] };
      g.ids.push(k.id);
      if (periods[0] < g.min) g.min = periods[0];
      if (periods[periods.length - 1] > g.max) g.max = periods[periods.length - 1];
      groups.set(k.frequency, g);
    }
    if (!groups.size) return out;

    const range = [...groups.values()].map((g) => ({ kpiId: { in: g.ids }, period: { gte: g.min, lte: g.max } }));
    const [values, targets, deviations] = await Promise.all([
      this.prisma.db.kpiValue.findMany({ where: { OR: range }, include: { enteredBy: userRef } }),
      this.prisma.db.kpiTarget.findMany({ where: { OR: range } }),
      this.prisma.db.kpiDeviation.findMany({ where: { OR: range }, include: { decidedBy: userRef } }),
    ]);
    const actionCounts = await this.actionCounts(deviations.map((d) => d.id));

    const valueMap = new Map(values.map((v) => [cellKey(v.kpiId, v.period), v]));
    const targetMap = new Map(targets.map((t) => [cellKey(t.kpiId, t.period), t]));
    const devMap = new Map(deviations.map((d) => [cellKey(d.kpiId, d.period), d]));

    for (const k of kpis) {
      const cells = out.get(k.id)!;
      for (const period of plan.get(k.id)!) {
        const v = valueMap.get(cellKey(k.id, period));
        const t = targetMap.get(cellKey(k.id, period));
        const d = devMap.get(cellKey(k.id, period));
        const dueDate = periodDueDate(period, k.entryDueDays);
        const deviation = d
          ? {
              id: d.id,
              explanation: d.explanation,
              rootCause: d.rootCause,
              approvalStatus: d.approvalStatus,
              decidedBy: d.decidedBy ? toUserRef(d.decidedBy) : null,
              decidedAt: d.decidedAt?.toISOString() ?? null,
              decisionNote: d.decisionNote,
            }
          : null;
        const actionCount = d ? (actionCounts.get(d.id) ?? 0) : 0;
        const status: KpiStatus | null = v ? v.status : null;
        cells.push({
          kpiId: k.id,
          period,
          periodStart: periodStart(period),
          periodEnd: periodEnd(period),
          dueDate,
          target: num(t?.target),
          targetMax: num(t?.targetMax),
          valueId: v?.id ?? null,
          value: num(v?.value),
          status,
          source: v?.source ?? null,
          note: v?.note ?? null,
          isLate: v?.isLate ?? false,
          enteredAt: v?.enteredAt ?? null,
          enteredBy: v ? toUserRef(v.enteredBy) : null,
          deviation,
          actionCount,
          entryState: computeEntryState({ hasValue: !!v, status, dueDate, today, deviation, actionCount }),
        });
      }
    }
    return out;
  }

  /** Sapmalara bağlı, iptal edilmemiş aksiyon sayıları (deviationId → sayı). */
  async actionCounts(deviationIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!deviationIds.length) return map;
    const rows = await this.prisma.db.action.groupBy({
      by: ['sourceId'],
      where: { sourceType: 'KPI_DEVIATION', sourceId: { in: deviationIds }, deletedAt: null, status: { not: 'CANCELLED' } },
      _count: true,
    });
    for (const r of rows) if (r.sourceId) map.set(r.sourceId, r._count);
    return map;
  }

  /** Tek bir KPI/dönem hücresi. */
  async cell(k: KpiRow, period: string, today: Date = startOfUtcDay()): Promise<PeriodCell> {
    return (await this.cells([k], () => [period], today)).get(k.id)![0];
  }
}
