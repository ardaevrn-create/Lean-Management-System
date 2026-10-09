import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isValidCorrelation, type HoshinLevel, type XMatrixItem, type XMatrixResponse } from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { HoshinAccessService } from './hoshin-access.service';
import { HoshinGoalsService } from './hoshin-goals.service';
import { toUserRef, type GoalRow } from './hoshin-core';
import type { SetCorrelationsDto } from './strategy.dto';

/** M3-04 X-Matrix: korelasyonlar ve render'a hazır yapı. */
@Injectable()
export class HoshinXMatrixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly access: HoshinAccessService,
    private readonly goals: HoshinGoalsService,
  ) {}

  private item(g: GoalRow): XMatrixItem {
    return { id: g.id, code: g.code, title: g.title, owner: toUserRef(g.owner), status: g.status };
  }

  async get(planId: string | undefined, yearQ?: number): Promise<XMatrixResponse> {
    const plan = await this.goals.resolvePlan(planId);
    const year = this.goals.resolveYear(plan, yearQ);
    const all = await this.goals.loadPlanGoals(plan.id);
    const visible = this.access.visibleIds(all);
    const vis = (g: GoalRow) => !visible || visible.has(g.id);
    const live = (g: GoalRow) => g.status !== 'CANCELLED';
    const breakthroughs = all.filter((g) => g.level === 'BREAKTHROUGH' && vis(g) && live(g));
    const annuals = all.filter((g) => g.level === 'ANNUAL' && g.year === year && vis(g) && live(g));
    const priorities = all.filter((g) => g.level === 'PRIORITY' && g.year === year && vis(g) && live(g));
    const shown = new Set([...breakthroughs, ...annuals, ...priorities].map((g) => g.id));

    const rows = await this.prisma.db.hoshinCorrelation.findMany({ where: { planId: plan.id, year } });
    const correlations = rows.filter((c) => shown.has(c.fromGoalId) && (c.targetType !== 'GOAL' || shown.has(c.targetId)));

    const kpiIds = new Set<string>();
    for (const g of [...breakthroughs, ...priorities]) if (g.kpiId) kpiIds.add(g.kpiId);
    for (const c of correlations) if (c.targetType === 'KPI') kpiIds.add(c.targetId);
    const kpis = kpiIds.size ? await this.prisma.db.kpiDefinition.findMany({ where: { id: { in: [...kpiIds] } }, orderBy: { code: 'asc' } }) : [];

    const ownerIds = new Set<string>();
    for (const g of priorities) if (g.ownerId) ownerIds.add(g.ownerId);
    for (const c of correlations) if (c.targetType === 'USER') ownerIds.add(c.targetId);
    const owners = ownerIds.size
      ? await this.prisma.db.user.findMany({ where: { id: { in: [...ownerIds] } }, select: { id: true, fullName: true, username: true }, orderBy: { fullName: 'asc' } })
      : [];

    return {
      plan, year,
      breakthroughs: breakthroughs.map((g) => this.item(g)),
      annuals: annuals.map((g) => this.item(g)),
      priorities: priorities.map((g) => this.item(g)),
      kpis: kpis.map((k) => ({ id: k.id, code: k.code, name: k.name, unit: k.unit })),
      owners: owners.map((o) => toUserRef(o)!),
      correlations: correlations.map((c) => ({ fromGoalId: c.fromGoalId, targetType: c.targetType, targetId: c.targetId, strength: c.strength, role: c.userRole })),
      can: { edit: this.access.isCompanyManager() },
    };
  }

  /** Plan + yıl için korelasyon kümesinin tamamını değiştirir. */
  async set(planId: string, dto: SetCorrelationsDto): Promise<XMatrixResponse> {
    if (!this.access.isCompanyManager()) throw new ForbiddenException();
    const plan = await this.goals.resolvePlan(planId);
    const all = await this.goals.loadPlanGoals(plan.id);
    const byId = new Map(all.map((g) => [g.id, g]));
    const seen = new Set<string>();
    const data: Prisma.HoshinCorrelationCreateManyInput[] = [];
    for (const it of dto.items) {
      const from = byId.get(it.fromGoalId);
      if (!from) throw new BusinessException('INVALID_CORRELATION', `Hedef bulunamadı: ${it.fromGoalId}`);
      if (from.level !== 'BREAKTHROUGH' && from.year !== dto.year) throw new BusinessException('INVALID_CORRELATION', `${from.code} hedefi ${dto.year} yılına ait değil`);
      let targetLevel: HoshinLevel | null = null;
      if (it.targetType === 'GOAL') {
        const t = byId.get(it.targetId);
        if (!t) throw new BusinessException('INVALID_CORRELATION', `Hedef bulunamadı: ${it.targetId}`);
        targetLevel = t.level;
      } else if (it.targetType === 'KPI') {
        if (!(await this.prisma.db.kpiDefinition.findUnique({ where: { id: it.targetId }, select: { id: true } }))) throw new BusinessException('INVALID_CORRELATION', 'KPI bulunamadı');
      } else if (!(await this.prisma.db.user.findUnique({ where: { id: it.targetId }, select: { id: true } }))) {
        throw new BusinessException('INVALID_CORRELATION', 'Kullanıcı bulunamadı');
      }
      if (!isValidCorrelation(from.level, it.targetType, targetLevel)) {
        throw new BusinessException('INVALID_CORRELATION', `${from.level} → ${it.targetType}${targetLevel ? `(${targetLevel})` : ''} korelasyonu geçersiz`);
      }
      const key = `${it.fromGoalId}|${it.targetType}|${it.targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      data.push({
        tenantId: this.ctx.tenantId, planId: plan.id, year: dto.year, fromGoalId: it.fromGoalId, targetType: it.targetType, targetId: it.targetId,
        strength: it.strength, userRole: it.targetType === 'USER' ? it.role ?? 'RESPONSIBLE' : null,
      });
    }
    await this.prisma.db.$transaction(async (tx) => {
      await tx.hoshinCorrelation.deleteMany({ where: { planId: plan.id, year: dto.year } });
      if (data.length) await tx.hoshinCorrelation.createMany({ data });
    });
    await this.audit.log('hoshinCorrelation', plan.id, 'set', { year: dto.year, count: data.length });
    return this.get(plan.id, dto.year);
  }
}
