import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  KPI_FREQUENCIES, addPeriods, currentPeriod, deviationRequirements, isValidPeriod, periodLabel,
  type ActionDetail, type KpiDeviationDetail, type KpiDeviationListItem,
} from '@lean/shared';
import { startOfUtcDay } from '../../common/dates';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { ActionsService } from '../../core/actions/actions.service';
import { AuditService } from '../../core/audit/audit.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { KpiAccessService } from './kpi-access.service';
import { KpiDefinitionsService } from './kpi-definitions.service';
import { LOOKBACK_PERIODS, toBrief, toUserRef, userRef, type KpiRow, type PeriodCell } from './kpi-core';
import { KpiSnapshotService } from './kpi-snapshot.service';
import type { DeviationActionDto, DeviationListQuery, SaveDeviationDto } from './kpi.dto';

@Injectable()
export class KpiDeviationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly access: KpiAccessService,
    private readonly snapshots: KpiSnapshotService,
    private readonly defs: KpiDefinitionsService,
    private readonly actions: ActionsService,
    private readonly notifications: NotificationsService,
  ) {}

  /* ------------------------------ Sorgular ------------------------------ */

  /** Sapma açıklaması gereken / onay bekleyen / tüm hedef altı KPI dönemleri. */
  async list(query: DeviationListQuery, today: Date = startOfUtcDay()): Promise<KpiDeviationListItem[]> {
    const state = query.state ?? 'required';
    const and: Prisma.KpiDefinitionWhereInput[] = [this.access.visibleWhere(), { isActive: true }];
    if (query.orgUnitId) and.push({ orgUnit: await this.defs.subtreeFilter(query.orgUnitId) });
    const kpiWhere: Prisma.KpiDefinitionWhereInput = { AND: and };

    const windows = KPI_FREQUENCIES.map((f) => ({
      kpi: { frequency: f },
      period: { gte: addPeriods(currentPeriod(f, today), -LOOKBACK_PERIODS) },
    }));
    const values = await this.prisma.db.kpiValue.findMany({
      where: { status: { in: ['YELLOW', 'RED'] }, kpi: kpiWhere, OR: windows },
      select: { kpiId: true, period: true, enteredAt: true },
      take: 3000,
    });
    if (!values.length) return [];

    const periodsByKpi = new Map<string, string[]>();
    for (const v of values) periodsByKpi.set(v.kpiId, [...(periodsByKpi.get(v.kpiId) ?? []), v.period]);
    const kpis = await this.defs.loadMany({ id: { in: [...periodsByKpi.keys()] } }, 3000);
    const cells = await this.snapshots.cells(kpis, (k) => periodsByKpi.get(k.id) ?? [], today);

    const wanted = state === 'required' ? ['DEVIATION_REQUIRED'] : state === 'pending' ? ['PENDING_APPROVAL'] : ['DEVIATION_REQUIRED', 'PENDING_APPROVAL', 'COMPLETE'];
    const items: KpiDeviationListItem[] = [];
    for (const k of kpis) {
      for (const c of cells.get(k.id) ?? []) {
        if (c.value === null || !wanted.includes(c.entryState)) continue;
        if (c.status !== 'YELLOW' && c.status !== 'RED') continue;
        items.push(this.toItem(k, c));
      }
    }
    const rank: Record<string, number> = { DEVIATION_REQUIRED: 0, PENDING_APPROVAL: 1, COMPLETE: 2 };
    items.sort((a, b) => rank[a.entryState] - rank[b.entryState] || (b.enteredAt ?? '').localeCompare(a.enteredAt ?? ''));
    return items;
  }

  /** Bir KPI/dönemin sapma detayı (sapma kaydı henüz yoksa da döner). */
  async detail(kpiId: string, period: string): Promise<KpiDeviationDetail> {
    const kpi = await this.access.loadVisible(kpiId);
    if (!isValidPeriod(period, kpi.frequency)) throw new BusinessException('INVALID_PERIOD', `Geçersiz dönem: ${period}`);
    return this.buildDetail(kpi, period);
  }

  async getById(id: string): Promise<KpiDeviationDetail> {
    const dev = await this.prisma.db.kpiDeviation.findUnique({ where: { id } });
    if (!dev) throw new NotFoundException('Deviation not found');
    return this.detail(dev.kpiId, dev.period);
  }

  private async buildDetail(kpi: KpiRow, period: string): Promise<KpiDeviationDetail> {
    const cell = await this.snapshots.cell(kpi, period);
    if (cell.value === null) throw new NotFoundException('Bu dönem için değer yok');
    const dev = cell.deviation;
    const [actions, logs] = dev
      ? await Promise.all([
          this.actions.listBySource('KPI_DEVIATION', dev.id),
          this.prisma.db.auditLog.findMany({ where: { entity: 'kpiDeviation', entityId: dev.id }, include: { user: userRef }, orderBy: { createdAt: 'desc' }, take: 50 }),
        ])
      : [[], []];
    return {
      ...this.toItem(kpi, cell),
      actions,
      history: logs.map((l) => ({ id: l.id, action: l.action, user: l.user ? toUserRef(l.user) : null, createdAt: l.createdAt.toISOString() })),
    };
  }

  private toItem(k: KpiRow, c: PeriodCell): KpiDeviationListItem {
    return {
      kpi: toBrief(k),
      period: c.period,
      value: c.value!,
      target: c.target,
      targetMax: c.targetMax,
      status: c.status!,
      entryState: c.entryState,
      deviation: c.deviation,
      actionCount: c.actionCount,
      needsActions: deviationRequirements(c.status).actions,
      canApprove: this.access.canApprove(k),
      enteredAt: c.enteredAt?.toISOString() ?? null,
    };
  }

  /* ------------------------------ Komutlar ------------------------------ */

  private canExplain(k: KpiRow) {
    return this.access.canEnter(k) || this.access.canManage(k) || this.access.canApprove(k);
  }

  async save(dto: SaveDeviationDto): Promise<KpiDeviationDetail> {
    const kpi = await this.access.load(dto.kpiId);
    if (!this.canExplain(kpi)) throw new ForbiddenException();
    if (!isValidPeriod(dto.period, kpi.frequency)) throw new BusinessException('INVALID_PERIOD', `Geçersiz dönem: ${dto.period}`);
    const value = await this.prisma.db.kpiValue.findFirst({ where: { kpiId: kpi.id, period: dto.period } });
    if (!value) throw new BusinessException('NO_VALUE', 'Bu dönem için değer girilmemiş');
    if (!deviationRequirements(value.status).explanation) {
      throw new BusinessException('DEVIATION_NOT_REQUIRED', 'Bu dönem hedefte; sapma açıklaması gerekmiyor');
    }
    const explanation = dto.explanation.trim();
    if (!explanation) throw new BusinessException('EXPLANATION_REQUIRED', 'Açıklama zorunludur');
    const rootCause = dto.rootCause?.trim() || null;

    const existing = await this.prisma.db.kpiDeviation.findFirst({ where: { kpiId: kpi.id, period: dto.period } });
    let id: string;
    if (existing) {
      const edited = existing.explanation !== explanation || existing.rootCause !== rootCause;
      const reset = existing.approvalStatus === 'REJECTED' || (existing.approvalStatus === 'APPROVED' && edited);
      await this.prisma.db.kpiDeviation.update({
        where: { id: existing.id },
        data: {
          explanation, rootCause, valueId: value.id,
          ...(reset ? { approvalStatus: 'PENDING', decidedById: null, decidedAt: null, decisionNote: null } : {}),
        },
      });
      id = existing.id;
    } else {
      id = (
        await this.prisma.db.kpiDeviation.create({
          data: { tenantId: this.ctx.tenantId, kpiId: kpi.id, period: dto.period, valueId: value.id, explanation, rootCause, createdById: this.ctx.userId },
        })
      ).id;
    }
    await this.audit.log('kpiDeviation', id, existing ? 'updated' : 'created', { kpi: kpi.code, period: dto.period, explanation, rootCause });
    await this.notifyApproversIfReady(kpi, dto.period);
    return this.buildDetail(kpi, dto.period);
  }

  /** Sapmaya bağlı karşı önlem aksiyonu açar (ActionsService.create, kaynak KPI_DEVIATION). */
  async createAction(deviationId: string, dto: DeviationActionDto): Promise<ActionDetail> {
    const dev = await this.prisma.db.kpiDeviation.findUnique({ where: { id: deviationId } });
    if (!dev) throw new NotFoundException('Deviation not found');
    const kpi = await this.access.load(dev.kpiId);
    if (!this.canExplain(kpi)) throw new ForbiddenException();
    const action = await this.actions.create({
      ...dto,
      orgUnitId: kpi.orgUnitId,
      sourceType: 'KPI_DEVIATION',
      sourceId: dev.id,
      sourceLabel: `KPI ${kpi.code} ${dev.period}: ${kpi.name}`.slice(0, 300),
    });
    await this.audit.log('kpiDeviation', dev.id, 'actionAdded', { actionId: action.id, title: dto.title });
    await this.notifyApproversIfReady(kpi, dev.period);
    return action;
  }

  async decide(id: string, approve: boolean, note?: string): Promise<KpiDeviationDetail> {
    const dev = await this.prisma.db.kpiDeviation.findUnique({ where: { id } });
    if (!dev) throw new NotFoundException('Deviation not found');
    const kpi = await this.access.load(dev.kpiId);
    if (!this.access.canApprove(kpi)) throw new ForbiddenException();
    if (dev.approvalStatus !== 'PENDING') throw new BusinessException('ALREADY_DECIDED', 'Sapma açıklaması zaten sonuçlandırılmış');
    if (!approve && !note?.trim()) throw new BusinessException('NOTE_REQUIRED', 'Reddetme gerekçesi zorunludur');
    if (approve) {
      const cell = await this.snapshots.cell(kpi, dev.period);
      if (cell.entryState !== 'PENDING_APPROVAL') {
        throw new BusinessException('ACTION_REQUIRED', 'Kırmızı sapma için en az bir karşı önlem aksiyonu olmadan onaylanamaz');
      }
    }
    await this.prisma.db.kpiDeviation.update({
      where: { id },
      data: { approvalStatus: approve ? 'APPROVED' : 'REJECTED', decidedById: this.ctx.userId, decidedAt: new Date(), decisionNote: note?.trim() || null },
    });
    await this.audit.log('kpiDeviation', id, approve ? 'approved' : 'rejected', { note });
    await this.notifications.notify({
      userIds: [dev.createdById, kpi.ownerId],
      type: approve ? 'GENERIC' : 'KPI_DEVIATION_REQUIRED',
      title: `Sapma açıklaması ${approve ? 'onaylandı' : 'reddedildi'}: ${kpi.code} ${periodLabel(dev.period)}`,
      body: note?.trim() || undefined,
      link: `/kpi?tab=deviations`,
    });
    return this.buildDetail(kpi, dev.period);
  }

  /* ------------------------------ Bildirim ------------------------------ */

  /** Onaylayabilecek kişiler: birim yöneticisi ve KPI sahibinin yöneticisi. */
  async approverUserIds(kpi: KpiRow): Promise<string[]> {
    const employeeIds = [kpi.orgUnit.managerEmployeeId, kpi.owner.employee?.managerId].filter((x): x is string => !!x);
    if (!employeeIds.length) return [];
    const users = await this.prisma.db.user.findMany({ where: { employeeId: { in: employeeIds }, isActive: true }, select: { id: true } });
    return users.map((u) => u.id);
  }

  private async notifyApproversIfReady(kpi: KpiRow, period: string) {
    const cell = await this.snapshots.cell(kpi, period);
    if (cell.entryState !== 'PENDING_APPROVAL' || !cell.deviation) return;
    await this.notifications.notify({
      userIds: await this.approverUserIds(kpi),
      type: 'GENERIC',
      title: `Sapma açıklaması onay bekliyor: ${kpi.code} ${periodLabel(period)}`,
      body: cell.deviation.explanation.slice(0, 200),
      link: '/kpi?tab=deviations',
      dedupeKey: `kpi-approval:${cell.deviation.id}:${(await this.prisma.db.kpiDeviation.findUnique({ where: { id: cell.deviation.id } }))?.updatedAt.getTime()}`,
    });
  }
}
