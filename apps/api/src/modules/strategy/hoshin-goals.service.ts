import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isYearInPlan, monthPeriod, nextGoalCode, validateGoalParent,
  type BowlingResponse, type BowlingRow, type HoshinGoalDetail, type HoshinGoalRow, type HoshinLevel, type HoshinTreeNode,
  type HoshinTreeResponse, type OffTargetDetail, type StrategyPlanBrief,
} from '@lean/shared';
import { startOfUtcDay } from '../../common/dates';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { ActionsService } from '../../core/actions/actions.service';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { HoshinAccessService } from './hoshin-access.service';
import { HoshinCatchballService } from './hoshin-catchball.service';
import { goalInclude, iso, manualLabel, num, toGoalBrief, toKpiRef, toUserRef, type GoalRow } from './hoshin-core';
import { emptyProgress, HoshinMetricsService, type GoalMetrics } from './hoshin-metrics.service';
import { StrategyPlansService } from './strategy-plans.service';
import type { CountermeasureDto, CreateGoalDto, GoalStatusDto, SetMonthlyDto, UpdateGoalDto } from './strategy.dto';

const natural = (a: string, b: string) => a.localeCompare(b, 'tr', { numeric: true });

/** M3 — hedef ağacı, hedef detayı, aylık takip ve karşı önlemler. */
@Injectable()
export class HoshinGoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly access: HoshinAccessService,
    private readonly metrics: HoshinMetricsService,
    private readonly plans: StrategyPlansService,
    private readonly catchball: HoshinCatchballService,
    private readonly actions: ActionsService,
  ) {}

  /* ------------------------------ Yükleyiciler ------------------------------ */

  async loadPlanGoals(planId: string): Promise<GoalRow[]> {
    return this.prisma.db.hoshinGoal.findMany({ where: { planId }, include: goalInclude, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
  }

  async load(id: string): Promise<GoalRow> {
    const g = await this.prisma.db.hoshinGoal.findUnique({ where: { id }, include: goalInclude });
    if (!g) throw new NotFoundException('Goal not found');
    return g;
  }

  /** Hedefi ve plan hedeflerini yükler; görünürlük kontrolü uygular. */
  async loadVisible(id: string): Promise<{ goal: GoalRow; goals: GoalRow[]; byId: Map<string, GoalRow> }> {
    const goal = await this.load(id);
    const goals = await this.loadPlanGoals(goal.planId);
    this.access.assertVisible(goal, goals);
    return { goal, goals, byId: new Map(goals.map((g) => [g.id, g])) };
  }

  /** Yıl verilmezse bugünün yılı (plan aralığına sıkıştırılmış). */
  resolveYear(plan: StrategyPlanBrief, year?: number): number {
    if (year) return year;
    const y = new Date().getUTCFullYear();
    return Math.min(plan.endYear, Math.max(plan.startYear, y));
  }

  async resolvePlan(planId?: string): Promise<StrategyPlanBrief> {
    if (planId) return this.plans.loadBrief(planId);
    const active = await this.plans.activeBrief();
    if (active) return active;
    const all = await this.plans.briefs();
    if (!all.length) throw new NotFoundException('No plan found');
    return all[0];
  }

  /* ------------------------------ Satır / ağaç ------------------------------ */

  toRow(g: GoalRow, byId: Map<string, GoalRow>, metrics: Map<string, GoalMetrics>, childCount: number): HoshinGoalRow {
    return {
      ...toGoalBrief(g),
      description: g.description,
      objective: g.objective,
      kpi: toKpiRef(g.kpi),
      baseline: num(g.baseline),
      targetValue: num(g.targetValue),
      weight: num(g.weight) ?? 1,
      aggregation: g.aggregation,
      startDate: iso(g.startDate),
      endDate: iso(g.endDate),
      agreedAt: iso(g.agreedAt),
      progress: metrics.get(g.id)?.progress ?? emptyProgress(),
      childCount,
      can: { edit: this.access.canEdit(g, byId), addChild: this.access.canAddChild(g) },
    };
  }

  bowlingRow(g: GoalRow, goalById: Map<string, GoalRow>, metrics: Map<string, GoalMetrics>, year: number): BowlingRow {
    const m = metrics.get(g.id);
    const cells = m?.cells ?? Array.from({ length: 12 }, (_, i) => ({ month: i + 1, period: null, plan: null, actual: null, status: 'NO_DATA' as const, comment: null }));
    void year;
    const progress = m?.progress ?? emptyProgress();
    return {
      goal: toGoalBrief(g),
      kpi: toKpiRef(g.kpi),
      source: progress.source,
      measured: progress.measured,
      baseline: num(g.baseline),
      targetValue: num(g.targetValue),
      cells,
      ytd: progress.ytd,
      achievement: progress.achievement,
      status: progress.status,
      canEditActuals: !g.kpi && this.access.canEditActuals(g, goalById),
      canEditPlan: !g.kpi && this.access.canEditPlan(g, goalById),
    };
  }

  async tree(planId: string | undefined, yearQ?: number): Promise<HoshinTreeResponse> {
    const plan = await this.resolvePlan(planId);
    const year = this.resolveYear(plan, yearQ);
    const goals = await this.loadPlanGoals(plan.id);
    const byId = new Map(goals.map((g) => [g.id, g]));
    const metrics = await this.metrics.compute(goals, year);
    const visible = this.access.visibleIds(goals);
    const shown = goals.filter((g) => (g.level === 'BREAKTHROUGH' || g.year === year) && (!visible || visible.has(g.id)));
    const shownIds = new Set(shown.map((g) => g.id));
    const kids = new Map<string | null, GoalRow[]>();
    for (const g of shown) {
      const key = g.parentId && shownIds.has(g.parentId) ? g.parentId : null;
      kids.set(key, [...(kids.get(key) ?? []), g]);
    }
    const build = (g: GoalRow): HoshinTreeNode => {
      const children = (kids.get(g.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || natural(a.code, b.code)).map(build);
      return { ...this.toRow(g, byId, metrics, children.length), children };
    };
    const nodes = (kids.get(null) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || natural(a.code, b.code)).map(build);
    return { plan, year, nodes, can: { manage: this.access.isCompanyManager() } };
  }

  async list(planId: string | undefined, year: number | undefined, level?: HoshinLevel, mine?: boolean): Promise<HoshinGoalRow[]> {
    const plan = await this.resolvePlan(planId);
    const y = this.resolveYear(plan, year);
    const goals = await this.loadPlanGoals(plan.id);
    const byId = new Map(goals.map((g) => [g.id, g]));
    const metrics = await this.metrics.compute(goals, y);
    const visible = this.access.visibleIds(goals);
    const uid = this.ctx.userId;
    const childCount = new Map<string, number>();
    for (const g of goals) if (g.parentId) childCount.set(g.parentId, (childCount.get(g.parentId) ?? 0) + 1);
    return goals
      .filter((g) => (g.level === 'BREAKTHROUGH' || g.year === y) && (!visible || visible.has(g.id)) && (!level || g.level === level) && (!mine || g.ownerId === uid))
      .map((g) => this.toRow(g, byId, metrics, childCount.get(g.id) ?? 0));
  }

  /* ------------------------------ Detay ------------------------------ */

  async detail(id: string, yearQ?: number): Promise<HoshinGoalDetail> {
    const { goal, goals, byId } = await this.loadVisible(id);
    const plan = await this.plans.loadBrief(goal.planId);
    const year = yearQ ?? goal.year ?? this.resolveYear(plan);
    const metrics = await this.metrics.compute(goals, year);
    const visible = this.access.visibleIds(goals);
    const kids = goals.filter((g) => g.parentId === goal.id && (!visible || visible.has(g.id))).sort((a, b) => a.sortOrder - b.sortOrder || natural(a.code, b.code));
    const childCount = (gid: string) => goals.filter((g) => g.parentId === gid).length;
    const breadcrumb: HoshinGoalDetail['breadcrumb'] = [];
    for (let p = goal.parentId ? byId.get(goal.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) {
      breadcrumb.unshift({ id: p.id, code: p.code, title: p.title, level: p.level });
    }
    const parent = goal.parentId ? byId.get(goal.parentId) ?? null : null;
    const [entries, actions] = await Promise.all([this.catchball.thread(goal.id), this.actions.listBySource('HOSHIN', goal.id)]);
    const row = this.toRow(goal, byId, metrics, childCount(goal.id));
    return {
      ...row,
      breadcrumb,
      bowling: this.bowlingRow(goal, byId, metrics, year),
      children: kids.map((k) => this.toRow(k, byId, metrics, childCount(k.id))),
      catchball: entries,
      actions,
      parent: parent ? { ...toGoalBrief(parent), owner: toUserRef(parent.owner) } : null,
      catchballState: this.catchball.state(goal, entries, byId),
      can: {
        ...row.can,
        editActuals: !goal.kpi && this.access.canEditActuals(goal, byId),
        editPlan: !goal.kpi && this.access.canEditPlan(goal, byId),
        changeStatus: this.access.canManage(goal) || this.access.isParentOwner(goal, byId),
      },
    };
  }

  async bowling(planId: string | undefined, yearQ: number | undefined, q: { orgUnitId?: string; goalId?: string; level?: HoshinLevel; measuredOnly?: boolean }): Promise<BowlingResponse> {
    const plan = await this.resolvePlan(planId);
    const year = this.resolveYear(plan, yearQ);
    const goals = await this.loadPlanGoals(plan.id);
    const byId = new Map(goals.map((g) => [g.id, g]));
    const metrics = await this.metrics.compute(goals, year);
    const visible = this.access.visibleIds(goals);

    let scope = goals.filter((g) => g.level !== 'BREAKTHROUGH' && g.year === year && (!visible || visible.has(g.id)));
    if (q.goalId) {
      const root = byId.get(q.goalId);
      if (!root) throw new NotFoundException('Goal not found');
      const inTree = new Set<string>([root.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const g of goals) if (g.parentId && inTree.has(g.parentId) && !inTree.has(g.id)) (inTree.add(g.id), (grew = true));
      }
      scope = scope.filter((g) => inTree.has(g.id));
    }
    if (q.orgUnitId) {
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: q.orgUnitId } });
      if (!unit) throw new BusinessException('INVALID_ORG_UNIT', 'Birim bulunamadı');
      scope = scope.filter((g) => g.orgUnit?.path.startsWith(unit.path));
    }
    if (q.level) scope = scope.filter((g) => g.level === q.level);
    if (q.measuredOnly) scope = scope.filter((g) => metrics.get(g.id)?.progress.measured);
    const order = ['ANNUAL', 'PRIORITY', 'DEPARTMENT', 'INDIVIDUAL'];
    scope.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level) || natural(a.code, b.code));
    return { plan, year, rows: scope.map((g) => this.bowlingRow(g, byId, metrics, year)) };
  }

  /* ------------------------------ Oluşturma / güncelleme ------------------------------ */

  private async assertRefs(planId: string, dto: Pick<CreateGoalDto, 'objectiveId' | 'orgUnitId' | 'ownerId'>) {
    if (dto.objectiveId) {
      const o = await this.prisma.db.strategicObjective.findFirst({ where: { id: dto.objectiveId, planId } });
      if (!o) throw new BusinessException('INVALID_OBJECTIVE', 'Stratejik amaç bulunamadı');
    }
    if (dto.orgUnitId) {
      const u = await this.prisma.db.orgUnit.findUnique({ where: { id: dto.orgUnitId } });
      if (!u) throw new BusinessException('INVALID_ORG_UNIT', 'Birim bulunamadı');
    }
    if (dto.ownerId) {
      const u = await this.prisma.db.user.findFirst({ where: { id: dto.ownerId, isActive: true } });
      if (!u) throw new BusinessException('INVALID_OWNER', 'Sahip bulunamadı');
    }
  }

  private async kpiDefaults(kpiId: string) {
    const k = await this.prisma.db.kpiDefinition.findUnique({ where: { id: kpiId } });
    if (!k) throw new BusinessException('KPI_NOT_FOUND', 'KPI bulunamadı');
    return { unit: k.unit, aggregation: k.aggregation, direction: k.direction === 'LOWER_BETTER' ? ('LOWER_BETTER' as const) : ('HIGHER_BETTER' as const) };
  }

  async create(dto: CreateGoalDto): Promise<HoshinGoalDetail> {
    const plan = await this.plans.loadBrief(dto.planId);
    const goals = await this.loadPlanGoals(plan.id);
    const byId = new Map(goals.map((g) => [g.id, g]));
    let parent: GoalRow | null = null;
    if (dto.parentId) {
      parent = byId.get(dto.parentId) ?? null;
      if (!parent) throw new BusinessException('INVALID_PARENT_LEVEL', 'Üst hedef bu planda bulunamadı');
    }
    const check = validateGoalParent(dto.level, parent?.level ?? null);
    if (!check.ok) throw new BusinessException(check.code, check.message);

    const orgUnit = dto.orgUnitId ? await this.prisma.db.orgUnit.findUnique({ where: { id: dto.orgUnitId } }) : null;
    const allowed = this.access.canManage({ level: dto.level, orgUnit }) || (!!parent && parent.ownerId === this.ctx.userId);
    if (!allowed) throw new ForbiddenException();
    await this.assertRefs(plan.id, dto);

    const year = dto.level === 'BREAKTHROUGH' ? dto.year ?? plan.endYear : dto.year ?? parent?.year ?? null;
    if (dto.level !== 'BREAKTHROUGH' && (year === null || !isYearInPlan(year, plan))) {
      throw new BusinessException('INVALID_YEAR', `Hedef yılı plan aralığında (${plan.startYear}–${plan.endYear}) olmalı`);
    }
    let code = dto.code?.trim().toUpperCase();
    if (code) {
      if (goals.some((g) => g.code === code)) throw new BusinessException('CODE_TAKEN', `Kod kullanımda: ${code}`);
    } else {
      code = nextGoalCode(dto.level, goals.map((g) => g.code));
    }
    const defaults = dto.kpiId ? await this.kpiDefaults(dto.kpiId) : null;
    const siblings = goals.filter((g) => g.parentId === (dto.parentId ?? null) && g.level === dto.level).length;

    const row = await this.prisma.db.hoshinGoal.create({
      data: {
        tenantId: this.ctx.tenantId, planId: plan.id, parentId: dto.parentId ?? null, level: dto.level, code, title: dto.title.trim(),
        description: dto.description ?? null, year, objectiveId: dto.objectiveId ?? null, orgUnitId: dto.orgUnitId ?? null, ownerId: dto.ownerId ?? null,
        kpiId: dto.kpiId ?? null, unit: dto.unit ?? defaults?.unit ?? '', baseline: dto.baseline ?? null, targetValue: dto.targetValue ?? null,
        direction: dto.direction ?? defaults?.direction ?? 'HIGHER_BETTER', aggregation: defaults?.aggregation ?? dto.aggregation ?? 'LAST',
        weight: dto.weight ?? 1, startDate: dto.startDate ? new Date(dto.startDate) : null, endDate: dto.endDate ? new Date(dto.endDate) : null,
        sortOrder: dto.sortOrder ?? siblings + 1, createdById: this.ctx.userId,
      },
    });
    await this.audit.log('hoshinGoal', row.id, 'create', { code, level: dto.level, title: row.title, planId: plan.id });
    if (dto.propose) await this.catchball.addEntry(row.id, { type: 'PROPOSAL', message: '', proposedTarget: dto.targetValue ?? null });
    return this.detail(row.id);
  }

  async update(id: string, dto: UpdateGoalDto): Promise<HoshinGoalDetail> {
    const { goal, goals, byId } = await this.loadVisible(id);
    if (!this.access.canEdit(goal, byId)) throw new ForbiddenException();
    await this.assertRefs(goal.planId, dto);
    const code = dto.code?.trim().toUpperCase();
    if (code && code !== goal.code && goals.some((g) => g.code === code)) throw new BusinessException('CODE_TAKEN', `Kod kullanımda: ${code}`);
    if (dto.year !== undefined && dto.year !== null && goal.level !== 'BREAKTHROUGH') {
      const plan = await this.plans.loadBrief(goal.planId);
      if (!isYearInPlan(dto.year, plan)) throw new BusinessException('INVALID_YEAR', 'Hedef yılı plan aralığında olmalı');
    }
    const kpiChanged = dto.kpiId !== undefined && dto.kpiId !== goal.kpiId;
    const defaults = kpiChanged && dto.kpiId ? await this.kpiDefaults(dto.kpiId) : null;
    const data: Prisma.HoshinGoalUncheckedUpdateInput = {
      ...(code ? { code } : {}),
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.year !== undefined ? { year: dto.year } : {}),
      ...(dto.objectiveId !== undefined ? { objectiveId: dto.objectiveId } : {}),
      ...(dto.orgUnitId !== undefined ? { orgUnitId: dto.orgUnitId } : {}),
      ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
      ...(dto.kpiId !== undefined ? { kpiId: dto.kpiId } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit } : defaults ? { unit: defaults.unit } : {}),
      ...(dto.baseline !== undefined ? { baseline: dto.baseline } : {}),
      ...(dto.targetValue !== undefined ? { targetValue: dto.targetValue } : {}),
      ...(dto.direction !== undefined ? { direction: dto.direction } : defaults ? { direction: defaults.direction } : {}),
      ...(defaults ? { aggregation: defaults.aggregation } : dto.aggregation !== undefined ? { aggregation: dto.aggregation } : {}),
      ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
      ...(dto.startDate !== undefined ? { startDate: dto.startDate ? new Date(dto.startDate) : null } : {}),
      ...(dto.endDate !== undefined ? { endDate: dto.endDate ? new Date(dto.endDate) : null } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    };
    await this.prisma.db.hoshinGoal.update({ where: { id }, data });
    await this.audit.log('hoshinGoal', id, 'update', AuditService.diff(goal, data));
    return this.detail(id);
  }

  async remove(id: string): Promise<void> {
    const { goal, goals, byId } = await this.loadVisible(id);
    if (!this.access.canEdit(goal, byId)) throw new ForbiddenException();
    if (goals.some((g) => g.parentId === id)) throw new BusinessException('HAS_CHILDREN', 'Alt hedefleri olan hedef silinemez');
    if (['ACTIVE', 'COMPLETED', 'AGREED'].includes(goal.status)) throw new BusinessException('NOT_DELETABLE', 'Aktif/tamamlanmış hedef silinemez; iptal edin');
    await this.prisma.db.hoshinGoal.delete({ where: { id } });
    await this.audit.log('hoshinGoal', id, 'delete', { code: goal.code });
  }

  async setStatus(id: string, dto: GoalStatusDto): Promise<HoshinGoalDetail> {
    if (dto.status === 'ACTIVE') return this.catchball.activate(id).then(() => this.detail(id));
    const { goal, byId } = await this.loadVisible(id);
    if (!(this.access.canManage(goal) || this.access.isParentOwner(goal, byId))) throw new ForbiddenException();
    if (dto.status === 'COMPLETED' && goal.status !== 'ACTIVE') throw new BusinessException('INVALID_STATUS', 'Yalnız aktif hedef tamamlanabilir');
    if (goal.status === 'COMPLETED' || goal.status === 'CANCELLED') throw new BusinessException('INVALID_STATUS', 'Hedef zaten kapalı');
    await this.prisma.db.hoshinGoal.update({ where: { id }, data: { status: dto.status } });
    await this.audit.log('hoshinGoal', id, 'status', { from: goal.status, to: dto.status });
    return this.detail(id);
  }

  /* ------------------------------ Aylık takip ------------------------------ */

  async setMonthly(id: string, dto: SetMonthlyDto): Promise<BowlingRow> {
    const { goal, goals, byId } = await this.loadVisible(id);
    if (goal.kpi) throw new BusinessException('KPI_LINKED', 'KPI bağlı hedefte aylık veri KPI modülünden gelir');
    if (!this.access.canEditActuals(goal, byId)) throw new ForbiddenException();
    const canPlan = this.access.canEditPlan(goal, byId);
    const seen = new Set<number>();
    for (const m of dto.months) {
      if (seen.has(m.month)) throw new BusinessException('INVALID_PERIOD', `Ay tekrarlandı: ${m.month}`);
      seen.add(m.month);
      const period = monthPeriod(dto.year, m.month);
      const existing = await this.prisma.db.hoshinMonthlyPlan.findFirst({ where: { goalId: id, period } });
      if (m.plan !== undefined && !canPlan && num(existing?.plan) !== m.plan) throw new ForbiddenException('Aylık planı yalnız yönetici / üst hedef sahibi değiştirebilir');
      const data = {
        ...(m.plan !== undefined && canPlan ? { plan: m.plan } : {}),
        ...(m.actual !== undefined ? { actual: m.actual } : {}),
        ...(m.comment !== undefined ? { comment: m.comment } : {}),
        updatedById: this.ctx.userId,
      };
      const merged = {
        plan: 'plan' in data ? data.plan ?? null : num(existing?.plan),
        actual: 'actual' in data ? data.actual ?? null : num(existing?.actual),
        comment: 'comment' in data ? data.comment ?? null : existing?.comment ?? null,
      };
      if (merged.plan === null && merged.actual === null && !merged.comment) {
        if (existing) await this.prisma.db.hoshinMonthlyPlan.delete({ where: { id: existing.id } });
      } else if (existing) {
        await this.prisma.db.hoshinMonthlyPlan.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.db.hoshinMonthlyPlan.create({ data: { tenantId: this.ctx.tenantId, goalId: id, period, ...merged, updatedById: this.ctx.userId } });
      }
    }
    await this.audit.log('hoshinGoal', id, 'monthly', { year: dto.year, months: dto.months });
    const metrics = await this.metrics.compute(goals, dto.year);
    return this.bowlingRow(goal, byId, metrics, dto.year);
  }

  /** Hedef altı ay: KPI sapması veya elle karşı önlem + aksiyonlar. */
  async offTarget(id: string, period: string): Promise<OffTargetDetail> {
    const { goal, goals, byId } = await this.loadVisible(id);
    const year = Number(period.slice(0, 4));
    const month = Number(period.slice(5, 7));
    if (!(month >= 1 && month <= 12)) throw new BusinessException('INVALID_PERIOD', 'Geçersiz dönem');
    const metrics = await this.metrics.compute(goals, year);
    const m = metrics.get(id);
    const cell = m?.cells[month - 1];
    let kpiDeviation: OffTargetDetail['kpiDeviation'] = null;
    let actions;
    if (goal.kpi) {
      const dev = cell?.period ? await this.prisma.db.kpiDeviation.findFirst({ where: { kpiId: goal.kpi.id, period: cell.period } }) : null;
      if (dev) {
        kpiDeviation = { id: dev.id, kpiId: dev.kpiId, period: dev.period, explanation: dev.explanation, rootCause: dev.rootCause, approvalStatus: dev.approvalStatus };
      }
      actions = dev ? await this.actions.listBySource('KPI_DEVIATION', dev.id) : [];
    } else {
      actions = (await this.actions.listBySource('HOSHIN', goal.id)).filter((a) => a.sourceLabel?.endsWith(period));
    }
    return {
      goalId: id, year, month, period, source: goal.kpi ? 'KPI' : m?.progress.source ?? 'NONE', status: cell?.status ?? 'NO_DATA', plan: cell?.plan ?? null,
      actual: cell?.actual ?? null, comment: cell?.comment ?? null, kpi: toKpiRef(goal.kpi), kpiDeviation, actions,
      canEdit: !goal.kpi && this.access.canEditActuals(goal, byId),
    };
  }

  /** Elle takip edilen hedefte karşı önlem: açıklama + HOSHIN kaynaklı aksiyon. */
  async countermeasure(id: string, dto: CountermeasureDto): Promise<OffTargetDetail> {
    const { goal, byId } = await this.loadVisible(id);
    if (goal.kpi) throw new BusinessException('KPI_LINKED', 'KPI bağlı hedefte sapma açıklaması KPI modülünden girilir');
    if (!this.access.canEditActuals(goal, byId)) throw new ForbiddenException();
    const year = Number(dto.period.slice(0, 4));
    if (dto.explanation !== undefined && dto.explanation.trim()) {
      const existing = await this.prisma.db.hoshinMonthlyPlan.findFirst({ where: { goalId: id, period: dto.period } });
      if (existing) await this.prisma.db.hoshinMonthlyPlan.update({ where: { id: existing.id }, data: { comment: dto.explanation.trim(), updatedById: this.ctx.userId } });
      else await this.prisma.db.hoshinMonthlyPlan.create({ data: { tenantId: this.ctx.tenantId, goalId: id, period: dto.period, comment: dto.explanation.trim(), updatedById: this.ctx.userId } });
    }
    await this.actions.create({
      title: dto.title, description: dto.description, ownerId: dto.ownerId, dueDate: dto.dueDate, priority: dto.priority, orgUnitId: goal.orgUnitId,
      sourceType: 'HOSHIN', sourceId: goal.id, sourceLabel: manualLabel(goal, dto.period),
    });
    await this.audit.log('hoshinGoal', id, 'countermeasure', { period: dto.period, title: dto.title });
    void year;
    return this.offTarget(id, dto.period);
  }

  today(): Date {
    return startOfUtcDay();
  }
}
