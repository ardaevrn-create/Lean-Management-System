import { Injectable } from '@nestjs/common';
import {
  DEFAULT_TOLERANCE_PCT, aggregateValues, bowlingStatus, computeGoalAchievement, computePaceAchievement, monthOfPeriod, monthPeriod,
  rollUpAchievement, statusFromAchievement, ytdOf,
  type BowlingCell, type BowlingStatus, type GoalProgress, type KpiDirection,
} from '@lean/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import { num, type GoalRow } from './hoshin-core';

export interface GoalMetrics {
  progress: GoalProgress;
  cells: BowlingCell[];
}

export const emptyProgress = (): GoalProgress => ({
  source: 'NONE', measured: false, achievement: null, status: 'NO_DATA', ytd: { plan: null, actual: null, status: 'NO_DATA', months: 0 }, lastMonth: null,
});

const blankCells = (): BowlingCell[] =>
  Array.from({ length: 12 }, (_, i) => ({ month: i + 1, period: null, plan: null, actual: null, status: 'NO_DATA' as BowlingStatus, comment: null }));

/** Bowling hücreleri, YTD, başarım % ve ağaç boyunca roll-up hesabı. */
@Injectable()
export class HoshinMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Planın verilen yıldaki tüm hedeflerinin metrikleri. goals: plan hedeflerinin tamamı. */
  async compute(goals: GoalRow[], year: number): Promise<Map<string, GoalMetrics>> {
    const active = goals.filter((g) => g.status !== 'CANCELLED' && (g.level === 'BREAKTHROUGH' || g.year === year));
    const kpiGoals = active.filter((g) => g.kpi);
    const manualGoals = active.filter((g) => !g.kpi);
    const kpiIds = [...new Set(kpiGoals.map((g) => g.kpi!.id))];

    const [targets, values, monthly] = await Promise.all([
      kpiIds.length ? this.prisma.db.kpiTarget.findMany({ where: { kpiId: { in: kpiIds }, period: { startsWith: String(year) } } }) : [],
      kpiIds.length ? this.prisma.db.kpiValue.findMany({ where: { kpiId: { in: kpiIds }, period: { startsWith: String(year) } } }) : [],
      manualGoals.length
        ? this.prisma.db.hoshinMonthlyPlan.findMany({ where: { goalId: { in: manualGoals.map((g) => g.id) }, period: { startsWith: `${year}-` } } })
        : [],
    ]);
    const targetsByKpi = groupBy(targets, (t) => t.kpiId);
    const valuesByKpi = groupBy(values, (v) => v.kpiId);
    const monthlyByGoal = groupBy(monthly, (m) => m.goalId);

    const out = new Map<string, GoalMetrics>();
    for (const g of active) {
      const m = g.kpi
        ? this.fromKpi(g, year, targetsByKpi.get(g.kpi.id) ?? [], valuesByKpi.get(g.kpi.id) ?? [])
        : this.fromManual(g, year, monthlyByGoal.get(g.id) ?? []);
      out.set(g.id, m);
    }
    this.rollUp(active, out);
    return out;
  }

  private fromKpi(
    g: GoalRow, year: number,
    targets: { period: string; target: unknown; targetMax: unknown }[],
    values: { period: string; value: unknown }[],
  ): GoalMetrics {
    const kpi = g.kpi!;
    const cells = blankCells();
    const buckets = new Map<number, { periods: Set<string>; targets: { t: number; max: number | null }[]; values: number[] }>();
    const bucket = (month: number) => {
      let b = buckets.get(month);
      if (!b) buckets.set(month, (b = { periods: new Set(), targets: [], values: [] }));
      return b;
    };
    for (const t of targets) {
      const mo = monthOfPeriod(t.period, year);
      if (!mo) continue;
      const b = bucket(mo);
      b.periods.add(t.period);
      b.targets.push({ t: Number(t.target), max: t.targetMax === null ? null : Number(t.targetMax) });
    }
    for (const v of values) {
      const mo = monthOfPeriod(v.period, year);
      if (!mo) continue;
      const b = bucket(mo);
      b.periods.add(v.period);
      b.values.push(Number(v.value));
    }
    const tol = Number(kpi.warningTolerancePct);
    for (const [month, b] of buckets) {
      const single = b.periods.size === 1;
      let plan: number | null = null;
      let planMax: number | null = null;
      if (b.targets.length) {
        if (single || b.targets.length === 1) {
          plan = b.targets[0].t;
          planMax = b.targets[0].max;
        } else {
          const ts = b.targets.map((x) => x.t);
          plan = aggregateValues(ts, kpi.aggregation === 'SUM' ? 'SUM' : 'AVERAGE');
        }
      }
      const actual = b.values.length ? (b.values.length === 1 ? b.values[0] : aggregateValues(b.values, kpi.aggregation)) : null;
      if (plan === null && actual !== null && g.targetValue !== null && kpi.aggregation !== 'SUM') plan = num(g.targetValue);
      cells[month - 1] = {
        month,
        period: single ? [...b.periods][0] : monthPeriod(year, month),
        plan, actual,
        status: bowlingStatus({ plan, actual, direction: kpi.direction as KpiDirection, tolerancePct: tol, planMax }),
        comment: null,
      };
    }
    return this.summarize(year, g, cells, 'KPI', kpi.aggregation, kpi.direction as KpiDirection, tol);
  }

  private fromManual(g: GoalRow, year: number, rows: { period: string; plan: unknown; actual: unknown; comment: string | null }[]): GoalMetrics {
    const cells = blankCells();
    for (const r of rows) {
      const mo = Number(r.period.slice(5, 7));
      if (!mo || mo < 1 || mo > 12) continue;
      const plan = r.plan === null ? null : Number(r.plan);
      const actual = r.actual === null ? null : Number(r.actual);
      cells[mo - 1] = { month: mo, period: r.period, plan, actual, status: bowlingStatus({ plan, actual, direction: g.direction }), comment: r.comment };
    }
    const measured = rows.some((r) => r.plan !== null || r.actual !== null);
    return this.summarize(year, g, cells, measured ? 'MANUAL' : 'NONE', g.aggregation, g.direction, DEFAULT_TOLERANCE_PCT);
  }

  private summarize(year: number, g: GoalRow, cells: BowlingCell[], source: 'KPI' | 'MANUAL' | 'NONE', aggregation: GoalRow['aggregation'], direction: KpiDirection, tol: number): GoalMetrics {
    const ytd = ytdOf(cells, aggregation);
    const withActual = cells.filter((c) => c.actual !== null);
    const lastCell = withActual[withActual.length - 1] ?? null;
    const ytdStatus: BowlingStatus =
      direction === 'RANGE' ? lastCell?.status ?? 'NO_DATA' : bowlingStatus({ plan: ytd.plan, actual: ytd.actual, direction, tolerancePct: tol });

    let achievement: number | null = null;
    if (ytd.actual !== null) {
      const target = num(g.targetValue);
      achievement =
        target !== null
          ? computePaceAchievement({
              baseline: num(g.baseline), target, actual: ytd.actual, direction: g.direction, aggregation, monthsElapsed: lastCell!.month, ytdPlan: ytd.plan,
            })
          : ytd.plan !== null
            ? computeGoalAchievement({ baseline: null, target: ytd.plan, actual: ytd.actual, direction: g.direction })
            : null;
    }
    let status: BowlingStatus = lastCell && lastCell.status !== 'NO_DATA' ? lastCell.status : statusFromAchievement(achievement, tol);
    if (g.level === 'BREAKTHROUGH' && achievement !== null) status = statusFromAchievement(achievement, tol);
    return {
      cells,
      progress: {
        source, measured: source !== 'NONE', achievement, status: lastCell || achievement !== null ? status : 'NO_DATA',
        ytd: { plan: ytd.plan, actual: ytd.actual, status: ytdStatus, months: ytd.months },
        lastMonth: lastCell ? monthPeriod(year, lastCell.month) : null,
      },
    };
  }

  /** Ölçümü olmayan (veya verisi olmayan) üst hedeflerde alt hedeflerin ağırlıklı ortalaması. */
  private rollUp(goals: GoalRow[], out: Map<string, GoalMetrics>) {
    const children = new Map<string, GoalRow[]>();
    for (const g of goals) if (g.parentId) children.set(g.parentId, [...(children.get(g.parentId) ?? []), g]);
    const byId = new Map(goals.map((g) => [g.id, g]));
    const depth = (g: GoalRow) => {
      let d = 0;
      for (let c: GoalRow | undefined = g; c?.parentId; c = byId.get(c.parentId)) d++;
      return d;
    };
    for (const g of [...goals].sort((a, b) => depth(b) - depth(a))) {
      const m = out.get(g.id)!;
      const kids = children.get(g.id) ?? [];
      if (m.progress.achievement !== null || !kids.length) continue;
      const a = rollUpAchievement(kids.map((k) => ({ achievement: out.get(k.id)?.progress.achievement ?? null, weight: num(k.weight) ?? 1 })));
      if (a === null) continue;
      m.progress = { ...m.progress, source: 'ROLLUP', achievement: a, status: statusFromAchievement(a) };
    }
  }
}

function groupBy<T, K>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const i of items) {
    const k = key(i);
    map.set(k, [...(map.get(k) ?? []), i]);
  }
  return map;
}
