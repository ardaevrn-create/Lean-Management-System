import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { auditCode, type AuditListItem, type AuditPlanGenerateResult, type AuditPlanItem } from '@lean/shared';
import { startOfUtcDay } from '../../common/dates';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../../core/audit/audit.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService, type TenantTx } from '../../core/prisma/prisma.service';
import { SequenceService } from '../../core/prisma/sequence.service';
import { AuditAccessService } from './audit-access.service';
import { enumeratePeriods, periodOf, pickRotationAuditor, type RotationAuditor } from './audit-rules';
import type { CreatePlanDto, UpdatePlanDto } from './audits.dto';
import { AuditsService } from './audits.service';

const userRef = { select: { id: true, fullName: true, username: true } } as const;

const planInclude = {
  template: { select: { id: true, name: true, code: true, version: true, type: true } },
  areas: { include: { area: { select: { id: true, code: true, name: true, orgUnit: { select: { path: true } } } } } },
  fixedAuditor: userRef,
  auditors: { include: { user: userRef }, orderBy: { sortOrder: 'asc' } },
  _count: { select: { audits: true } },
} satisfies Prisma.AuditPlanInclude;
type PlanRow = Prisma.AuditPlanGetPayload<{ include: typeof planInclude }>;

/** Denetim planı / takvimi (M6-04): periyodik denetim üretimi, denetçi rotasyonu ve çapraz denetim. */
@Injectable()
export class AuditPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly access: AuditAccessService,
    private readonly sequences: SequenceService,
    private readonly notifications: NotificationsService,
    private readonly audits: AuditsService,
  ) {}

  async list(): Promise<AuditPlanItem[]> {
    this.access.assertAnyPermission();
    const rows = await this.prisma.db.auditPlan.findMany({ include: planInclude, orderBy: { createdAt: 'desc' } });
    return Promise.all(rows.map((r) => this.toItem(r)));
  }

  async get(id: string): Promise<AuditPlanItem> {
    this.access.assertAnyPermission();
    return this.toItem(await this.load(id));
  }

  async create(dto: CreatePlanDto): Promise<AuditPlanItem> {
    await this.validate(dto);
    const id = await this.prisma.db.$transaction(async (tx) => {
      const plan = await tx.auditPlan.create({
        data: {
          tenantId: this.ctx.tenantId, name: dto.name, templateId: dto.templateId, frequency: dto.frequency ?? 'MONTHLY',
          assignMode: dto.assignMode ?? 'ROTATION', fixedAuditorId: dto.assignMode === 'FIXED' ? dto.fixedAuditorId ?? null : null,
          crossAudit: dto.crossAudit ?? false, startDate: startOfUtcDay(new Date(dto.startDate)),
          endDate: dto.endDate ? startOfUtcDay(new Date(dto.endDate)) : null,
        },
      });
      await this.writeRelations(tx, plan.id, dto.areaIds, dto.auditorIds ?? []);
      return plan.id;
    });
    await this.audit.log('audit_plan', id, 'created', dto);
    return this.toItem(await this.load(id));
  }

  async update(id: string, dto: UpdatePlanDto): Promise<AuditPlanItem> {
    const current = await this.load(id);
    const merged = {
      templateId: dto.templateId ?? current.templateId,
      areaIds: dto.areaIds ?? current.areas.map((a) => a.areaId),
      assignMode: dto.assignMode ?? current.assignMode,
      fixedAuditorId: dto.fixedAuditorId === undefined ? current.fixedAuditorId : dto.fixedAuditorId,
      auditorIds: dto.auditorIds ?? current.auditors.map((a) => a.userId),
    };
    await this.validate(merged);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.auditPlan.update({
        where: { id },
        data: {
          name: dto.name, templateId: dto.templateId, frequency: dto.frequency, assignMode: dto.assignMode,
          fixedAuditorId: merged.assignMode === 'FIXED' ? merged.fixedAuditorId : null, crossAudit: dto.crossAudit,
          startDate: dto.startDate ? startOfUtcDay(new Date(dto.startDate)) : undefined,
          endDate: dto.endDate === undefined ? undefined : dto.endDate ? startOfUtcDay(new Date(dto.endDate)) : null,
          isActive: dto.isActive,
        },
      });
      if (dto.areaIds || dto.auditorIds) {
        if (dto.areaIds) await tx.auditPlanArea.deleteMany({ where: { planId: id } });
        if (dto.auditorIds) await tx.auditPlanAuditor.deleteMany({ where: { planId: id } });
        await this.writeRelations(tx, id, dto.areaIds ? merged.areaIds : [], dto.auditorIds ? merged.auditorIds : []);
      }
    });
    await this.audit.log('audit_plan', id, 'updated', dto);
    return this.toItem(await this.load(id));
  }

  async deactivate(id: string): Promise<AuditPlanItem> {
    return this.update(id, { isActive: false });
  }

  /**
   * Plana bağlı PLANNED denetimleri üretir: her alan x dönem için bir denetim, termin = dönemin son günü.
   * Idempotent: (plan, alan, dönem) üçlüsü için varsa tekrar üretilmez.
   */
  async generate(id: string, untilIso?: string): Promise<AuditPlanGenerateResult> {
    const plan = await this.load(id);
    if (!plan.isActive) throw new BusinessException('PLAN_INACTIVE', 'Pasif plan için denetim üretilemez');
    const until = untilIso ? startOfUtcDay(new Date(untilIso)) : startOfUtcDay();
    const periods = enumeratePeriods(plan.frequency, plan.startDate, periodOf(plan.frequency, until).end, plan.endDate);
    const areas = [...plan.areas].map((a) => a.area).sort((a, b) => a.code.localeCompare(b.code));
    const rotation = await this.rotationAuditors(plan);

    const existing = await this.prisma.db.audit.findMany({
      where: { planId: id, periodKey: { in: periods.map((p) => p.key) } }, select: { areaId: true, periodKey: true },
    });
    const have = new Set(existing.map((e) => `${e.areaId}|${e.periodKey}`));
    // Rotasyon, plan başlangıcından itibaren dönem sırasına bağlı olduğundan ilk dönem indeksi sabittir.
    const created: string[] = [];
    const skipped: AuditPlanGenerateResult['skipped'] = [];
    for (const [pi, period] of periods.entries()) {
      for (const [ai, area] of areas.entries()) {
        if (have.has(`${area.id}|${period.key}`)) continue;
        const auditorId =
          plan.assignMode === 'FIXED'
            ? plan.fixedAuditorId
            : pickRotationAuditor({ auditors: rotation, startIndex: pi + ai, areaPath: area.orgUnit.path, crossAudit: plan.crossAudit });
        if (!auditorId) {
          skipped.push({ areaId: area.id, periodKey: period.key, reason: 'NO_ELIGIBLE_AUDITOR' });
          continue;
        }
        const auditId = await this.createPlanned(plan, area.id, auditorId, period.key, period.end);
        if (auditId) created.push(auditId);
      }
    }
    await this.audit.log('audit_plan', id, 'generated', { created: created.length, until: until.toISOString().slice(0, 10) });

    if (created.length) await this.notifyAuditors(created);
    const items: AuditListItem[] = created.length ? await this.audits.listByIds(created) : [];
    return { created: created.length, existing: existing.length, skipped, audits: items };
  }

  /* ------------------------------ Yardımcılar ------------------------------ */

  private async createPlanned(plan: PlanRow, areaId: string, auditorId: string, periodKey: string, dueDate: Date): Promise<string | null> {
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const number = await this.sequences.next('audit', tx);
        const row = await tx.audit.create({
          data: {
            tenantId: this.ctx.tenantId, number, templateId: plan.templateId, templateVersion: plan.template.version,
            scaleType: (await tx.auditTemplate.findUniqueOrThrow({ where: { id: plan.templateId }, select: { scaleType: true } })).scaleType,
            areaId, planId: plan.id, periodKey, auditorId, dueDate, createdById: this.ctx.optionalUser?.id ?? null,
          },
        });
        return row.id;
      });
    } catch (err) {
      // Eşzamanlı üretim: benzersiz (plan, alan, dönem) ihlali sessizce atlanır
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
  }

  private async notifyAuditors(auditIds: string[]) {
    const rows = await this.prisma.db.audit.findMany({ where: { id: { in: auditIds } }, include: { area: { select: { name: true } } } });
    const byAuditor = new Map<string, typeof rows>();
    for (const r of rows) byAuditor.set(r.auditorId, [...(byAuditor.get(r.auditorId) ?? []), r]);
    for (const [userId, list] of byAuditor) {
      await this.notifications.notify({
        userIds: [userId], type: 'GENERIC',
        title: list.length === 1 ? `Yeni denetim atandı: ${auditCode(list[0].number)} ${list[0].area.name}` : `${list.length} yeni denetim atandı`,
        body: `En yakın termin: ${list.map((l) => l.dueDate.toISOString().slice(0, 10)).sort()[0]}`,
        link: '/audits',
      });
    }
  }

  private async rotationAuditors(plan: PlanRow): Promise<RotationAuditor[]> {
    if (plan.assignMode !== 'ROTATION') return [];
    const users = await this.prisma.db.user.findMany({
      where: { id: { in: plan.auditors.map((a) => a.userId) }, isActive: true },
      select: { id: true, employee: { select: { orgUnit: { select: { path: true } } } } },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return plan.auditors
      .filter((a) => byId.has(a.userId))
      .map((a) => ({ userId: a.userId, orgPath: byId.get(a.userId)!.employee?.orgUnit?.path ?? null }));
  }

  private async validate(d: { templateId: string; areaIds: string[]; assignMode?: string; fixedAuditorId?: string | null; auditorIds?: string[] }) {
    const template = await this.prisma.db.auditTemplate.findUnique({ where: { id: d.templateId } });
    if (!template || !template.isActive) throw new BusinessException('INVALID_TEMPLATE', 'Şablon bulunamadı ya da pasif');
    if (!d.areaIds.length) throw new BusinessException('NO_AREAS', 'Plana en az bir alan eklenmeli');
    const areas = await this.prisma.db.auditArea.findMany({ where: { id: { in: [...new Set(d.areaIds)] }, isActive: true }, include: { orgUnit: { select: { path: true } } } });
    if (areas.length !== new Set(d.areaIds).size) throw new BusinessException('INVALID_AREA', 'Alanlardan biri bulunamadı ya da pasif');
    for (const a of areas) this.access.assertManage(a.orgUnit.path);
    const mode = d.assignMode ?? 'ROTATION';
    if (mode === 'FIXED' && !d.fixedAuditorId) throw new BusinessException('AUDITOR_REQUIRED', 'Sabit denetçi seçilmeli');
    if (mode === 'ROTATION' && !(d.auditorIds ?? []).length) throw new BusinessException('AUDITOR_REQUIRED', 'Rotasyon için en az bir denetçi seçilmeli');
    const ids = [...new Set([...(d.auditorIds ?? []), ...(d.fixedAuditorId ? [d.fixedAuditorId] : [])])];
    if (ids.length && (await this.prisma.db.user.count({ where: { id: { in: ids }, isActive: true } })) !== ids.length) {
      throw new BusinessException('INVALID_USER', 'Denetçilerden biri bulunamadı ya da pasif');
    }
  }

  private async writeRelations(tx: TenantTx, planId: string, areaIds: string[], auditorIds: string[]) {
    const tenantId = this.ctx.tenantId;
    if (areaIds.length) await tx.auditPlanArea.createMany({ data: [...new Set(areaIds)].map((areaId) => ({ tenantId, planId, areaId })) });
    if (auditorIds.length) {
      await tx.auditPlanAuditor.createMany({ data: [...new Set(auditorIds)].map((userId, i) => ({ tenantId, planId, userId, sortOrder: i })) });
    }
  }

  private async load(id: string): Promise<PlanRow> {
    const row = await this.prisma.db.auditPlan.findUnique({ where: { id }, include: planInclude });
    if (!row) throw new NotFoundException('Plan not found');
    return row;
  }

  private async toItem(r: PlanRow): Promise<AuditPlanItem> {
    const [planned, completed] = await Promise.all([
      this.prisma.db.audit.count({ where: { planId: r.id, status: { in: ['PLANNED', 'IN_PROGRESS'] } } }),
      this.prisma.db.audit.count({ where: { planId: r.id, status: 'COMPLETED' } }),
    ]);
    return {
      id: r.id, name: r.name, frequency: r.frequency, assignMode: r.assignMode, crossAudit: r.crossAudit,
      startDate: r.startDate.toISOString().slice(0, 10), endDate: r.endDate?.toISOString().slice(0, 10) ?? null, isActive: r.isActive,
      template: r.template, areas: r.areas.map((a) => ({ id: a.area.id, code: a.area.code, name: a.area.name })),
      fixedAuditor: r.fixedAuditor, auditors: r.auditors.map((a) => a.user), plannedCount: planned, completedCount: completed,
    };
  }
}
