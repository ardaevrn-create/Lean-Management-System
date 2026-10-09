import { Injectable, NotFoundException } from '@nestjs/common';
import { PERMISSIONS, type StrategicObjectiveDto, type StrategyPlanBrief, type StrategyPlanDetail, type SwotItemDto } from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../../core/auth/access.service';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { CreatePlanDto, ObjectiveDto, SwotDto, UpdateObjectiveDto, UpdatePlanDto, UpdateSwotDto } from './strategy.dto';

const userSel = { select: { id: true, fullName: true, username: true } } as const;

export const toPlanBrief = (p: { id: string; name: string; startYear: number; endYear: number; status: StrategyPlanBrief['status']; version: number }): StrategyPlanBrief => ({
  id: p.id, name: p.name, startYear: p.startYear, endYear: p.endYear, status: p.status, version: p.version,
});

/** M2 — Stratejik plan, SWOT ve stratejik amaçlar. */
@Injectable()
export class StrategyPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Plan özetleri (strateji yetkisi gerekmez; hoshin ekranları plan seçiciyi bununla doldurur). */
  async briefs(): Promise<StrategyPlanBrief[]> {
    const rows = await this.prisma.db.strategyPlan.findMany({ orderBy: [{ startYear: 'desc' }, { version: 'desc' }] });
    return rows.map(toPlanBrief);
  }

  async loadBrief(id: string): Promise<StrategyPlanBrief> {
    const p = await this.prisma.db.strategyPlan.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Plan not found');
    return toPlanBrief(p);
  }

  async activeBrief(): Promise<StrategyPlanBrief | null> {
    const p = await this.prisma.db.strategyPlan.findFirst({ where: { status: 'ACTIVE' } });
    return p ? toPlanBrief(p) : null;
  }

  async list(): Promise<StrategyPlanBrief[]> {
    return this.briefs();
  }

  async get(id: string): Promise<StrategyPlanDetail> {
    const p = await this.prisma.db.strategyPlan.findUnique({
      where: { id },
      include: {
        approvedBy: userSel,
        swotItems: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        objectives: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }], include: { owner: userSel, _count: { select: { goals: true } } } },
        _count: { select: { goals: true } },
      },
    });
    if (!p) throw new NotFoundException('Plan not found');
    return {
      ...toPlanBrief(p),
      vision: p.vision,
      mission: p.mission,
      values: p.values,
      previousVersionId: p.previousVersionId,
      approvedBy: p.approvedBy,
      approvedAt: p.approvedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      swot: p.swotItems.map((s) => this.toSwot(s)),
      objectives: p.objectives.map((o) => this.toObjective(o)),
      goalCount: p._count.goals,
      can: { manage: this.access.has(PERMISSIONS.STRATEGY_MANAGE) },
    };
  }

  private toSwot(s: { id: string; planId: string; type: SwotItemDto['type']; text: string; impact: number; sortOrder: number }): SwotItemDto {
    return { id: s.id, planId: s.planId, type: s.type, text: s.text, impact: s.impact, sortOrder: s.sortOrder };
  }

  private toObjective(o: {
    id: string; planId: string; code: string; title: string; description: string | null; perspective: StrategicObjectiveDto['perspective'];
    owner: StrategicObjectiveDto['owner']; sortOrder: number; _count: { goals: number };
  }): StrategicObjectiveDto {
    return {
      id: o.id, planId: o.planId, code: o.code, title: o.title, description: o.description, perspective: o.perspective,
      owner: o.owner, sortOrder: o.sortOrder, goalCount: o._count.goals,
    };
  }

  private assertYears(start: number, end: number) {
    if (end < start) throw new BusinessException('INVALID_YEAR', 'Bitiş yılı başlangıç yılından önce olamaz');
  }

  /* ------------------------------ Plan ------------------------------ */

  async create(dto: CreatePlanDto): Promise<StrategyPlanDetail> {
    this.assertYears(dto.startYear, dto.endYear);
    const p = await this.prisma.db.strategyPlan.create({
      data: {
        tenantId: this.ctx.tenantId, name: dto.name.trim(), startYear: dto.startYear, endYear: dto.endYear, vision: dto.vision ?? null,
        mission: dto.mission ?? null, values: dto.values ?? [], createdById: this.ctx.userId,
      },
    });
    await this.audit.log('strategyPlan', p.id, 'create', { name: p.name });
    return this.get(p.id);
  }

  async update(id: string, dto: UpdatePlanDto): Promise<StrategyPlanDetail> {
    const cur = await this.prisma.db.strategyPlan.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Plan not found');
    this.assertYears(dto.startYear ?? cur.startYear, dto.endYear ?? cur.endYear);
    const data = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.startYear !== undefined ? { startYear: dto.startYear } : {}),
      ...(dto.endYear !== undefined ? { endYear: dto.endYear } : {}),
      ...(dto.vision !== undefined ? { vision: dto.vision } : {}),
      ...(dto.mission !== undefined ? { mission: dto.mission } : {}),
      ...(dto.values !== undefined ? { values: dto.values.map((v) => v.trim()).filter(Boolean) } : {}),
    };
    await this.prisma.db.strategyPlan.update({ where: { id }, data });
    await this.audit.log('strategyPlan', id, 'update', AuditService.diff(cur, data));
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const cur = await this.prisma.db.strategyPlan.findUnique({ where: { id }, include: { _count: { select: { goals: true } } } });
    if (!cur) throw new NotFoundException('Plan not found');
    if (cur.status !== 'DRAFT') throw new BusinessException('PLAN_NOT_DRAFT', 'Yalnız taslak planlar silinebilir');
    if (cur._count.goals > 0) throw new BusinessException('PLAN_NOT_DRAFT', 'Hedefleri olan plan silinemez');
    await this.prisma.db.strategyPlan.delete({ where: { id } });
    await this.audit.log('strategyPlan', id, 'delete', { name: cur.name });
  }

  /** Planı onaylayıp aktif yapar; önceki aktif plan arşivlenir (şirkette tek aktif plan). */
  async activate(id: string): Promise<StrategyPlanDetail> {
    const cur = await this.prisma.db.strategyPlan.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Plan not found');
    if (cur.status !== 'ACTIVE') {
      await this.prisma.db.$transaction(async (tx) => {
        await tx.strategyPlan.updateMany({ where: { status: 'ACTIVE', id: { not: id } }, data: { status: 'ARCHIVED' } });
        await tx.strategyPlan.update({ where: { id }, data: { status: 'ACTIVE', approvedById: this.ctx.userId, approvedAt: new Date() } });
      });
      await this.audit.log('strategyPlan', id, 'activate', { from: cur.status });
    }
    return this.get(id);
  }

  /** "Yeni versiyon": planı (SWOT, amaçlar, hedef ağacı, X-matrix) taslak olarak kopyalar. */
  async newVersion(id: string): Promise<StrategyPlanDetail> {
    const src = await this.prisma.db.strategyPlan.findUnique({
      where: { id },
      include: { swotItems: true, objectives: true, goals: true, correlations: true },
    });
    if (!src) throw new NotFoundException('Plan not found');
    const tenantId = this.ctx.tenantId;
    const maxVersion = await this.prisma.db.strategyPlan.aggregate({ where: { name: src.name }, _max: { version: true } });
    const newId = await this.prisma.db.$transaction(async (tx) => {
      const plan = await tx.strategyPlan.create({
        data: {
          tenantId, name: src.name, startYear: src.startYear, endYear: src.endYear, vision: src.vision, mission: src.mission, values: src.values,
          version: (maxVersion._max.version ?? src.version) + 1, previousVersionId: src.id, createdById: this.ctx.userId,
        },
      });
      for (const s of src.swotItems) {
        await tx.swotItem.create({ data: { tenantId, planId: plan.id, type: s.type, text: s.text, impact: s.impact, sortOrder: s.sortOrder } });
      }
      const objMap = new Map<string, string>();
      for (const o of src.objectives) {
        const n = await tx.strategicObjective.create({
          data: { tenantId, planId: plan.id, code: o.code, title: o.title, description: o.description, perspective: o.perspective, ownerId: o.ownerId, sortOrder: o.sortOrder },
        });
        objMap.set(o.id, n.id);
      }
      // Üst hedefler önce oluşsun: seviye sırasına göre
      const order = ['BREAKTHROUGH', 'ANNUAL', 'PRIORITY', 'DEPARTMENT', 'INDIVIDUAL'];
      const goalMap = new Map<string, string>();
      for (const g of [...src.goals].sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level))) {
        const n = await tx.hoshinGoal.create({
          data: {
            tenantId, planId: plan.id, parentId: g.parentId ? goalMap.get(g.parentId) ?? null : null, level: g.level, code: g.code, title: g.title,
            description: g.description, year: g.year, objectiveId: g.objectiveId ? objMap.get(g.objectiveId) ?? null : null, orgUnitId: g.orgUnitId,
            ownerId: g.ownerId, kpiId: g.kpiId, unit: g.unit, baseline: g.baseline, targetValue: g.targetValue, direction: g.direction,
            aggregation: g.aggregation, weight: g.weight, startDate: g.startDate, endDate: g.endDate, sortOrder: g.sortOrder, createdById: this.ctx.userId,
            status: g.status === 'PROPOSED' || g.status === 'IN_CATCHBALL' || g.status === 'AGREED' ? 'DRAFT' : g.status,
          },
        });
        goalMap.set(g.id, n.id);
      }
      for (const c of src.correlations) {
        const from = goalMap.get(c.fromGoalId);
        const target = c.targetType === 'GOAL' ? goalMap.get(c.targetId) : c.targetId;
        if (!from || !target) continue;
        await tx.hoshinCorrelation.create({
          data: { tenantId, planId: plan.id, year: c.year, fromGoalId: from, targetType: c.targetType, targetId: target, strength: c.strength, userRole: c.userRole },
        });
      }
      return plan.id;
    });
    await this.audit.log('strategyPlan', newId, 'new-version', { from: src.id });
    return this.get(newId);
  }

  /* ------------------------------ SWOT ------------------------------ */

  private async assertPlan(planId: string) {
    const p = await this.prisma.db.strategyPlan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!p) throw new NotFoundException('Plan not found');
  }

  async addSwot(planId: string, dto: SwotDto): Promise<SwotItemDto> {
    await this.assertPlan(planId);
    const text = dto.text.trim();
    if (!text) throw new BusinessException('TEXT_REQUIRED', 'Metin zorunludur');
    const max = await this.prisma.db.swotItem.aggregate({ where: { planId, type: dto.type }, _max: { sortOrder: true } });
    const row = await this.prisma.db.swotItem.create({
      data: { tenantId: this.ctx.tenantId, planId, type: dto.type, text, impact: dto.impact ?? 3, sortOrder: dto.sortOrder ?? (max._max.sortOrder ?? 0) + 1 },
    });
    await this.audit.log('swotItem', row.id, 'create', { planId, type: row.type, text });
    return this.toSwot(row);
  }

  async updateSwot(id: string, dto: UpdateSwotDto): Promise<SwotItemDto> {
    const cur = await this.prisma.db.swotItem.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('SWOT item not found');
    const data = {
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.text !== undefined ? { text: dto.text.trim() } : {}),
      ...(dto.impact !== undefined ? { impact: dto.impact } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    };
    const row = await this.prisma.db.swotItem.update({ where: { id }, data });
    await this.audit.log('swotItem', id, 'update', AuditService.diff(cur, data));
    return this.toSwot(row);
  }

  async removeSwot(id: string): Promise<void> {
    const cur = await this.prisma.db.swotItem.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('SWOT item not found');
    await this.prisma.db.swotItem.delete({ where: { id } });
    await this.audit.log('swotItem', id, 'delete', { text: cur.text });
  }

  /* ------------------------------ Stratejik amaçlar ------------------------------ */

  private async assertOwner(ownerId: string | null | undefined) {
    if (!ownerId) return;
    const u = await this.prisma.db.user.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!u) throw new BusinessException('INVALID_OWNER', 'Sahip bulunamadı');
  }

  async addObjective(planId: string, dto: ObjectiveDto): Promise<StrategicObjectiveDto> {
    await this.assertPlan(planId);
    await this.assertOwner(dto.ownerId);
    const existing = await this.prisma.db.strategicObjective.findMany({ where: { planId }, select: { code: true, sortOrder: true } });
    let code = dto.code?.trim().toUpperCase();
    if (!code) {
      const max = existing.reduce((m, o) => Math.max(m, Number(/^SA(\d+)$/.exec(o.code)?.[1] ?? 0)), 0);
      code = `SA${max + 1}`;
    }
    if (existing.some((o) => o.code === code)) throw new BusinessException('CODE_TAKEN', `Kod kullanımda: ${code}`);
    const row = await this.prisma.db.strategicObjective.create({
      data: {
        tenantId: this.ctx.tenantId, planId, code, title: dto.title.trim(), description: dto.description ?? null, perspective: dto.perspective ?? null,
        ownerId: dto.ownerId ?? null, sortOrder: dto.sortOrder ?? existing.reduce((m, o) => Math.max(m, o.sortOrder), 0) + 1,
      },
      include: { owner: userSel, _count: { select: { goals: true } } },
    });
    await this.audit.log('strategicObjective', row.id, 'create', { planId, code, title: row.title });
    return this.toObjective(row);
  }

  async updateObjective(id: string, dto: UpdateObjectiveDto): Promise<StrategicObjectiveDto> {
    const cur = await this.prisma.db.strategicObjective.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Objective not found');
    await this.assertOwner(dto.ownerId);
    const code = dto.code?.trim().toUpperCase();
    if (code && code !== cur.code) {
      const dup = await this.prisma.db.strategicObjective.findFirst({ where: { planId: cur.planId, code } });
      if (dup) throw new BusinessException('CODE_TAKEN', `Kod kullanımda: ${code}`);
    }
    const data = {
      ...(code ? { code } : {}),
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.perspective !== undefined ? { perspective: dto.perspective } : {}),
      ...(dto.ownerId !== undefined ? { ownerId: dto.ownerId } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    };
    const row = await this.prisma.db.strategicObjective.update({ where: { id }, data, include: { owner: userSel, _count: { select: { goals: true } } } });
    await this.audit.log('strategicObjective', id, 'update', AuditService.diff(cur, data));
    return this.toObjective(row);
  }

  async removeObjective(id: string): Promise<void> {
    const cur = await this.prisma.db.strategicObjective.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException('Objective not found');
    await this.prisma.db.strategicObjective.delete({ where: { id } });
    await this.audit.log('strategicObjective', id, 'delete', { code: cur.code });
  }
}
