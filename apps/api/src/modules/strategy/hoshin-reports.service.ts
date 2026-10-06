import { Injectable, NotFoundException } from '@nestjs/common';
import {
  rollUpAchievement,
  type DrilldownItem, type DrilldownOrgUnit, type DrilldownResponse, type HoshinDashboardWidget, type ReviewResponse, type ReviewRow,
} from '@lean/shared';
import type { RequestUser } from '../../common/request-user';
import { ActionsService } from '../../core/actions/actions.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { HoshinAccessService } from './hoshin-access.service';
import { HoshinCatchballService } from './hoshin-catchball.service';
import { iso, num, toGoalBrief, toKpiRef, type GoalRow } from './hoshin-core';
import { HoshinGoalsService } from './hoshin-goals.service';
import { emptyProgress, HoshinMetricsService } from './hoshin-metrics.service';

const natural = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });

/** M3-09 drill-down, M3-10 yıllık değerlendirme ve ana sayfa kartı. */
@Injectable()
export class HoshinReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HoshinAccessService,
    private readonly goals: HoshinGoalsService,
    private readonly metrics: HoshinMetricsService,
    private readonly actions: ActionsService,
    private readonly catchball: HoshinCatchballService,
  ) {}

  async drilldown(planId: string | undefined, yearQ: number | undefined, parentId?: string): Promise<DrilldownResponse> {
    const plan = await this.goals.resolvePlan(planId);
    const year = this.goals.resolveYear(plan, yearQ);
    const all = await this.goals.loadPlanGoals(plan.id);
    const metrics = await this.metrics.compute(all, year);
    const visible = this.access.visibleIds(all);
    const vis = (g: GoalRow) => (!visible || visible.has(g.id)) && g.status !== 'CANCELLED' && (g.level === 'BREAKTHROUGH' || g.year === year);
    let parent: GoalRow | null = null;
    if (parentId) {
      parent = all.find((g) => g.id === parentId) ?? null;
      if (!parent || !vis(parent)) throw new NotFoundException('Goal not found');
    }
    const shown = all.filter(vis);
    const shownIds = new Set(shown.map((g) => g.id));
    const childCount = (id: string) => shown.filter((g) => g.parentId === id).length;
    const items: DrilldownItem[] = shown
      .filter((g) => (parent ? g.parentId === parent.id : !g.parentId || !shownIds.has(g.parentId)))
      .sort((a, b) => a.sortOrder - b.sortOrder || natural(a.code, b.code))
      .map((g) => ({
        ...toGoalBrief(g), progress: metrics.get(g.id)?.progress ?? emptyProgress(), childCount: childCount(g.id), targetValue: num(g.targetValue), baseline: num(g.baseline),
      }));

    const byUnit = new Map<string, { unit: DrilldownOrgUnit['orgUnit']; goals: GoalRow[] }>();
    for (const g of shown.filter((x) => x.level === 'DEPARTMENT' && x.orgUnit)) {
      const e = byUnit.get(g.orgUnit!.id) ?? { unit: { id: g.orgUnit!.id, name: g.orgUnit!.name, code: g.orgUnit!.code }, goals: [] };
      e.goals.push(g);
      byUnit.set(g.orgUnit!.id, e);
    }
    const orgUnits: DrilldownOrgUnit[] = [...byUnit.values()].map(({ unit, goals }) => {
      const st = goals.map((g) => metrics.get(g.id)?.progress.status ?? 'NO_DATA');
      return {
        orgUnit: unit, goalCount: goals.length,
        achievement: rollUpAchievement(goals.map((g) => ({ achievement: metrics.get(g.id)?.progress.achievement ?? null, weight: num(g.weight) ?? 1 }))),
        green: st.filter((s) => s === 'GREEN').length, yellow: st.filter((s) => s === 'YELLOW').length, red: st.filter((s) => s === 'RED').length,
        noData: st.filter((s) => s === 'NO_DATA').length,
      };
    }).sort((a, b) => a.orgUnit.name.localeCompare(b.orgUnit.name, 'tr'));

    return { plan, year, parent: parent ? toGoalBrief(parent) : null, items, orgUnits };
  }

  async review(planId: string | undefined, yearQ?: number): Promise<ReviewResponse> {
    const plan = await this.goals.resolvePlan(planId);
    const year = this.goals.resolveYear(plan, yearQ);
    const all = await this.goals.loadPlanGoals(plan.id);
    const metrics = await this.metrics.compute(all, year);
    const visible = this.access.visibleIds(all);
    const byId = new Map(all.map((g) => [g.id, g]));
    const shown = all.filter((g) => (!visible || visible.has(g.id)) && g.status !== 'CANCELLED' && (g.level === 'BREAKTHROUGH' || g.year === year));
    const acts = shown.length ? await this.actions.listBySource('HOSHIN', shown.map((g) => g.id)) : [];
    const order = ['BREAKTHROUGH', 'ANNUAL', 'PRIORITY', 'DEPARTMENT', 'INDIVIDUAL'];
    shown.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level) || natural(a.code, b.code));

    const rows: ReviewRow[] = shown.map((g) => {
      const p = metrics.get(g.id)?.progress ?? emptyProgress();
      const mine = acts.filter((a) => a.sourceId === g.id && ['OPEN', 'IN_PROGRESS'].includes(a.status));
      return {
        goal: toGoalBrief(g), parentCode: g.parentId ? byId.get(g.parentId)?.code ?? null : null, kpi: toKpiRef(g.kpi), baseline: num(g.baseline),
        targetValue: num(g.targetValue), ytdActual: p.ytd.actual, ytdPlan: p.ytd.plan, achievement: p.achievement, status: p.status,
        openActions: mine.length, overdueActions: mine.filter((a) => a.isOverdue).length, agreedAt: iso(g.agreedAt),
      };
    });
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    const measured = rows.filter((r) => r.goal.level !== 'BREAKTHROUGH' && r.achievement !== null).map((r) => ({ achievement: r.achievement, weight: 1 }));
    return {
      plan, year, generatedAt: new Date().toISOString(),
      summary: {
        goals: rows.length, green: count('GREEN'), yellow: count('YELLOW'), red: count('RED'), noData: count('NO_DATA'),
        averageAchievement: rollUpAchievement(measured), openActions: rows.reduce((s, r) => s + r.openActions, 0), overdueActions: rows.reduce((s, r) => s + r.overdueActions, 0),
      },
      rows,
    };
  }

  /** Ana sayfa kartı: sahibi olduğum hedefler, kırmızı olanlar, yanıt bekleyen catchball. */
  async widget(user: RequestUser): Promise<HoshinDashboardWidget> {
    const plan = await this.prisma.db.strategyPlan.findFirst({ where: { status: 'ACTIVE' } });
    let myGoals = 0;
    let redGoals = 0;
    if (plan) {
      const all = await this.goals.loadPlanGoals(plan.id);
      const year = this.goals.resolveYear({ id: plan.id, name: plan.name, startYear: plan.startYear, endYear: plan.endYear, status: plan.status, version: plan.version });
      const mine = all.filter((g) => g.ownerId === user.id && ['ACTIVE', 'AGREED', 'PROPOSED', 'IN_CATCHBALL'].includes(g.status) && (g.level === 'BREAKTHROUGH' || g.year === year));
      myGoals = mine.length;
      if (mine.length) {
        const metrics = await this.metrics.compute(all, year);
        redGoals = mine.filter((g) => metrics.get(g.id)?.progress.status === 'RED').length;
      }
    }
    return { myGoals, redGoals, catchballPending: await this.catchball.pendingCount(user) };
  }
}
