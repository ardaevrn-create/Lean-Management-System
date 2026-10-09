import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PERMISSIONS, type ActionDetail, type ActionListItem, type ActionSourceType, type ActionStats, type ActionStatus,
  type ActionComment as ActionCommentDto, type DueDateRequest, type Paginated, type Priority,
} from '@lean/shared';
import { startOfUtcDay } from '../../common/dates';
import { BusinessException } from '../../common/errors';
import { pageArgs, paginated, parseSort } from '../../common/pagination';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../auth/access.service';
import { AuditService } from '../audit/audit.service';
import { ActionEvents, DomainEvents, type ActionStatusChangedEvent } from '../events/domain-events';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../prisma/sequence.service';
import { ACTIVE_STATUSES, actionCode, overdueInfo, TRANSITIONS } from './action-rules';
import type { ActionQuery, CreateActionDto, UpdateActionDto } from './actions.dto';

const userRef = { select: { id: true, fullName: true, username: true } } as const;

const listInclude = {
  owner: userRef,
  orgUnit: { select: { id: true, name: true, code: true } },
} satisfies Prisma.ActionInclude;

const detailInclude = {
  ...listInclude,
  owner: { select: { id: true, fullName: true, username: true, employee: { select: { managerId: true } } } },
  orgUnit: { select: { id: true, name: true, code: true, path: true } },
  createdBy: userRef,
  supporters: { include: { user: userRef } },
  history: { include: { user: userRef }, orderBy: { createdAt: 'desc' } },
  comments: { include: { user: userRef }, orderBy: { createdAt: 'asc' } },
  dueDateRequests: { include: { requestedBy: userRef, decidedBy: userRef }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.ActionInclude;

type ListRow = Prisma.ActionGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.ActionGetPayload<{ include: typeof detailInclude }>;

/** Diğer modüllerin aksiyon açarken kullandığı giriş. */
export interface CreateActionInput {
  title: string;
  description?: string | null;
  ownerId: string;
  dueDate: Date | string;
  startDate?: Date | string | null;
  priority?: Priority;
  orgUnitId?: string | null;
  supporterIds?: string[];
  sourceType?: ActionSourceType;
  sourceId?: string | null;
  sourceLabel?: string | null;
}

const toDate = (d: Date | string) => startOfUtcDay(new Date(d));

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly sequences: SequenceService,
    private readonly events: DomainEvents,
  ) {}

  /* ------------------------------ Sorgular ------------------------------ */

  async list(query: ActionQuery): Promise<Paginated<ActionListItem>> {
    const where = await this.buildWhere(query);
    const orderBy = parseSort(query.sort, ['dueDate', 'createdAt', 'priority', 'status', 'number'] as const, { dueDate: 'asc' });
    const [rows, total] = await Promise.all([
      this.prisma.db.action.findMany({ where, include: listInclude, orderBy, ...pageArgs(query) }),
      this.prisma.db.action.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toListItem(r)), total, query);
  }

  /** Dışa aktarma için sayfalama olmadan (en fazla 10.000) */
  async listAll(query: ActionQuery): Promise<ActionListItem[]> {
    const where = await this.buildWhere(query);
    const rows = await this.prisma.db.action.findMany({ where, include: listInclude, orderBy: { dueDate: 'asc' }, take: 10_000 });
    return rows.map((r) => this.toListItem(r));
  }

  /** Modüller için: belirli bir kaynağa bağlı aksiyonlar (erişim filtresi uygulanmaz). */
  async listBySource(sourceType: ActionSourceType, sourceIds: string | string[]): Promise<ActionListItem[]> {
    const rows = await this.prisma.db.action.findMany({
      where: { sourceType, sourceId: Array.isArray(sourceIds) ? { in: sourceIds } : sourceIds, deletedAt: null },
      include: listInclude,
      orderBy: { number: 'asc' },
    });
    return rows.map((r) => this.toListItem(r));
  }

  async stats(query: ActionQuery): Promise<ActionStats> {
    const where = await this.buildWhere({ ...query, status: undefined, overdue: undefined } as ActionQuery);
    const today = startOfUtcDay();
    const [byStatus, overdue, bySource, overdueBySource, completed] = await Promise.all([
      this.prisma.db.action.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.db.action.count({ where: { AND: [where, { status: { in: ACTIVE_STATUSES }, dueDate: { lt: today } }] } }),
      this.prisma.db.action.groupBy({ by: ['sourceType'], where: { AND: [where, { status: { in: ACTIVE_STATUSES } }] }, _count: true }),
      this.prisma.db.action.groupBy({ by: ['sourceType'], where: { AND: [where, { status: { in: ACTIVE_STATUSES }, dueDate: { lt: today } }] }, _count: true }),
      this.prisma.db.action.findMany({
        where: { AND: [where, { status: { in: ['DONE', 'VERIFIED'] }, completedAt: { not: null } }] },
        select: { completedAt: true, dueDate: true },
      }),
    ]);
    const count = (s: ActionStatus) => byStatus.find((b) => b.status === s)?._count ?? 0;
    const onTime = completed.filter((c) => startOfUtcDay(c.completedAt!) <= c.dueDate).length;
    return {
      open: count('OPEN'),
      inProgress: count('IN_PROGRESS'),
      done: count('DONE'),
      verified: count('VERIFIED'),
      overdue,
      onTimeCompletionRate: completed.length ? Math.round((onTime / completed.length) * 1000) / 10 : null,
      bySource: bySource.map((b) => ({
        sourceType: b.sourceType,
        open: b._count,
        overdue: overdueBySource.find((o) => o.sourceType === b.sourceType)?._count ?? 0,
      })),
    };
  }

  async get(id: string): Promise<ActionDetail> {
    const row = await this.load(id);
    if (!(await this.canView(row))) throw new ForbiddenException();
    return this.toDetail(row);
  }

  /* ------------------------------ Komutlar ------------------------------ */

  async create(input: CreateActionInput | CreateActionDto): Promise<ActionDetail> {
    const tenantId = this.ctx.tenantId;
    const userId = this.ctx.userId;
    await this.assertActiveUsers([input.ownerId, ...(input.supporterIds ?? [])]);
    const dueDate = toDate(input.dueDate);

    const action = await this.prisma.db.$transaction(async (tx) => {
      const number = await this.sequences.next('action', tx);
      return tx.action.create({
        data: {
          tenantId,
          number,
          title: input.title,
          description: input.description ?? null,
          ownerId: input.ownerId,
          createdById: userId,
          priority: input.priority ?? 'MEDIUM',
          orgUnitId: input.orgUnitId ?? (await this.defaultOrgUnit(input.ownerId)),
          startDate: input.startDate ? toDate(input.startDate) : null,
          dueDate,
          originalDueDate: dueDate,
          sourceType: input.sourceType ?? 'MANUAL',
          sourceId: input.sourceId ?? null,
          sourceLabel: input.sourceLabel ?? null,
          supporters: {
            create: [...new Set(input.supporterIds ?? [])].filter((s) => s !== input.ownerId).map((uid) => ({ tenantId, userId: uid })),
          },
          history: { create: { tenantId, userId, type: 'CREATED' } },
        },
      });
    });

    await this.audit.log('action', action.id, 'created', input);
    await this.notifications.notify({
      userIds: [input.ownerId, ...(input.supporterIds ?? [])],
      type: 'ACTION_ASSIGNED',
      title: `Yeni aksiyon: ${actionCode(action.number)} ${action.title}`,
      body: `Termin: ${dueDate.toISOString().slice(0, 10)}`,
      link: `/actions/${action.id}`,
    });
    return this.toDetail(await this.load(action.id));
  }

  async update(id: string, dto: UpdateActionDto): Promise<ActionDetail> {
    const row = await this.load(id);
    const can = this.rights(row);
    const ownerOnlyFields = Object.entries(dto).every(([k, v]) => v === undefined || k === 'progress');
    if (!(can.edit || (ownerOnlyFields && can.changeStatus))) throw new ForbiddenException();
    if (['VERIFIED', 'CANCELLED'].includes(row.status)) throw new BusinessException('ACTION_CLOSED', 'Kapalı aksiyon güncellenemez');

    const tenantId = this.ctx.tenantId;
    const userId = this.ctx.userId;
    const history: Prisma.ActionHistoryCreateManyInput[] = [];
    const data: Prisma.ActionUncheckedUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.orgUnitId !== undefined) data.orgUnitId = dto.orgUnitId;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? toDate(dto.startDate) : null;
    if (dto.progress !== undefined && dto.progress !== row.progress) {
      data.progress = dto.progress;
      history.push({ tenantId, actionId: id, userId, type: 'PROGRESS', fromValue: String(row.progress), toValue: String(dto.progress) });
      if (row.status === 'OPEN' && dto.progress > 0) {
        data.status = 'IN_PROGRESS';
        history.push({ tenantId, actionId: id, userId, type: 'STATUS_CHANGED', fromValue: 'OPEN', toValue: 'IN_PROGRESS' });
      }
    }
    if (dto.ownerId && dto.ownerId !== row.ownerId) {
      await this.assertActiveUsers([dto.ownerId]);
      data.ownerId = dto.ownerId;
      history.push({ tenantId, actionId: id, userId, type: 'OWNER_CHANGED', fromValue: row.owner.fullName, toValue: dto.ownerId });
    }
    if (dto.dueDate) {
      const newDue = toDate(dto.dueDate);
      if (newDue.getTime() !== row.dueDate.getTime()) {
        data.dueDate = newDue;
        history.push({ tenantId, actionId: id, userId, type: 'DUE_DATE_CHANGED', fromValue: row.dueDate.toISOString().slice(0, 10), toValue: dto.dueDate.slice(0, 10) });
      }
    }
    if (Object.keys(data).some((k) => !['progress', 'ownerId', 'dueDate', 'status'].includes(k))) {
      history.push({ tenantId, actionId: id, userId, type: 'UPDATED' });
    }

    await this.prisma.db.$transaction(async (tx) => {
      await tx.action.update({ where: { id }, data });
      if (dto.supporterIds) {
        await tx.actionSupporter.deleteMany({ where: { actionId: id } });
        const ownerId = (data.ownerId as string | undefined) ?? row.ownerId;
        await tx.actionSupporter.createMany({
          data: [...new Set(dto.supporterIds)].filter((s) => s !== ownerId).map((uid) => ({ tenantId, actionId: id, userId: uid })),
        });
      }
      if (history.length) await tx.actionHistory.createMany({ data: history });
    });
    await this.audit.log('action', id, 'updated', dto);

    if (data.ownerId) {
      await this.notifications.notify({
        userIds: [data.ownerId as string],
        type: 'ACTION_ASSIGNED',
        title: `Aksiyon size atandı: ${actionCode(row.number)} ${row.title}`,
        link: `/actions/${id}`,
      });
    }
    return this.toDetail(await this.load(id));
  }

  async changeStatus(id: string, status: ActionStatus, note?: string): Promise<ActionDetail> {
    const row = await this.load(id);
    const required = TRANSITIONS[row.status][status];
    if (!required) throw new BusinessException('INVALID_TRANSITION', `${row.status} → ${status} geçişi yapılamaz`);
    if (!this.rights(row)[required]) throw new ForbiddenException();
    if (status === 'DONE' && !note?.trim()) throw new BusinessException('NOTE_REQUIRED', 'Tamamlama açıklaması zorunludur');
    if (status === 'IN_PROGRESS' && row.status === 'DONE' && !note?.trim()) {
      throw new BusinessException('NOTE_REQUIRED', 'Reddetme gerekçesi zorunludur');
    }

    const now = new Date();
    const data: Prisma.ActionUncheckedUpdateInput = { status };
    if (status === 'DONE') Object.assign(data, { completedAt: now, completionNote: note, progress: 100 });
    if (status === 'VERIFIED') Object.assign(data, { verifiedAt: now, verifiedById: this.ctx.userId });
    if (status === 'IN_PROGRESS' && row.status === 'DONE') Object.assign(data, { completedAt: null });
    if (status === 'OPEN' && row.status === 'CANCELLED') Object.assign(data, { completedAt: null });

    await this.prisma.db.$transaction([
      this.prisma.db.action.update({ where: { id }, data }),
      this.prisma.db.actionHistory.create({
        data: { tenantId: this.ctx.tenantId, actionId: id, userId: this.ctx.userId, type: 'STATUS_CHANGED', fromValue: row.status, toValue: status, note: note ?? null },
      }),
    ]);
    await this.audit.log('action', id, 'statusChanged', { from: row.status, to: status, note });

    const code = `${actionCode(row.number)} ${row.title}`;
    if (status === 'DONE') {
      await this.notifications.notify({ userIds: [row.createdById, ...(await this.managerUserIds(row))], type: 'ACTION_STATUS_CHANGED', title: `Doğrulama bekliyor: ${code}`, body: note, link: `/actions/${id}` });
    } else {
      await this.notifications.notify({ userIds: [row.ownerId], type: 'ACTION_STATUS_CHANGED', title: `Aksiyon durumu: ${status} — ${code}`, body: note, link: `/actions/${id}` });
    }
    await this.events.emit<ActionStatusChangedEvent>(ActionEvents.StatusChanged, {
      actionId: id, sourceType: row.sourceType, sourceId: row.sourceId, from: row.status, to: status,
    });
    return this.toDetail(await this.load(id));
  }

  async addComment(id: string, body: string): Promise<ActionCommentDto> {
    const row = await this.load(id);
    if (!(await this.canView(row))) throw new ForbiddenException();
    const comment = await this.prisma.db.actionComment.create({
      data: { tenantId: this.ctx.tenantId, actionId: id, userId: this.ctx.userId, body },
      include: { user: userRef },
    });
    await this.notifications.notify({
      userIds: [row.ownerId, row.createdById, ...row.supporters.map((s) => s.userId)],
      type: 'ACTION_COMMENT',
      title: `Yorum: ${actionCode(row.number)} ${row.title}`,
      body: body.slice(0, 200),
      link: `/actions/${id}`,
    });
    return { id: comment.id, body: comment.body, user: comment.user, createdAt: comment.createdAt.toISOString() };
  }

  async requestDueDate(id: string, newDueDate: string, reason: string): Promise<DueDateRequest> {
    const row = await this.load(id);
    if (!this.rights(row).changeStatus) throw new ForbiddenException();
    if (!ACTIVE_STATUSES.includes(row.status)) throw new BusinessException('ACTION_CLOSED', 'Yalnız açık aksiyonlarda termin revizyonu istenebilir');
    if (row.dueDateRequests.some((r) => r.status === 'PENDING')) {
      throw new BusinessException('REQUEST_PENDING', 'Bekleyen bir termin revizyon talebi var');
    }
    const req = await this.prisma.db.actionDueDateRequest.create({
      data: { tenantId: this.ctx.tenantId, actionId: id, requestedById: this.ctx.userId, newDueDate: toDate(newDueDate), reason },
      include: { requestedBy: userRef, decidedBy: userRef },
    });
    await this.notifications.notify({
      userIds: [row.createdById, ...(await this.managerUserIds(row))],
      type: 'GENERIC',
      title: `Termin revizyon talebi: ${actionCode(row.number)}`,
      body: `${newDueDate.slice(0, 10)} — ${reason}`,
      link: `/actions/${id}`,
    });
    return this.toDueDateRequest(req);
  }

  async decideDueDate(requestId: string, approve: boolean, note?: string): Promise<DueDateRequest> {
    const req = await this.prisma.db.actionDueDateRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException();
    if (req.status !== 'PENDING') throw new BusinessException('REQUEST_DECIDED', 'Talep zaten sonuçlandırılmış');
    const row = await this.load(req.actionId);
    if (!this.rights(row).decideDueDate) throw new ForbiddenException();

    const tenantId = this.ctx.tenantId;
    const userId = this.ctx.userId;
    await this.prisma.db.$transaction(async (tx) => {
      await tx.actionDueDateRequest.update({
        where: { id: requestId },
        data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: userId, decidedAt: new Date(), decisionNote: note ?? null },
      });
      if (approve) {
        await tx.action.update({ where: { id: row.id }, data: { dueDate: req.newDueDate } });
        await tx.actionHistory.create({
          data: {
            tenantId, actionId: row.id, userId, type: 'DUE_DATE_CHANGED',
            fromValue: row.dueDate.toISOString().slice(0, 10), toValue: req.newDueDate.toISOString().slice(0, 10), note: req.reason,
          },
        });
      }
    });
    await this.audit.log('action', row.id, approve ? 'dueDateApproved' : 'dueDateRejected', { requestId, note });
    await this.notifications.notify({
      userIds: [req.requestedById],
      type: 'GENERIC',
      title: `Termin revizyonu ${approve ? 'onaylandı' : 'reddedildi'}: ${actionCode(row.number)}`,
      body: note,
      link: `/actions/${row.id}`,
    });
    const updated = await this.prisma.db.actionDueDateRequest.findUniqueOrThrow({ where: { id: requestId }, include: { requestedBy: userRef, decidedBy: userRef } });
    return this.toDueDateRequest(updated);
  }

  /* ------------------------------ Yardımcılar ------------------------------ */

  private async buildWhere(query: ActionQuery): Promise<Prisma.ActionWhereInput> {
    const user = this.ctx.user;
    const and: Prisma.ActionWhereInput[] = [{ deletedAt: null }];

    switch (query.view) {
      case 'mine':
        and.push({ OR: [{ ownerId: user.id }, { supporters: { some: { userId: user.id } } }] });
        break;
      case 'created':
        and.push({ createdById: user.id });
        break;
      case 'team': {
        const managedPaths = await this.managedUnitPaths();
        const or: Prisma.ActionWhereInput[] = [];
        if (user.employeeId) or.push({ owner: { employee: { managerId: user.employeeId } } });
        if (managedPaths.length) or.push({ orgUnit: { OR: managedPaths.map((p) => ({ path: { startsWith: p } })) } });
        and.push(or.length ? { OR: or } : { id: '__none__' });
        break;
      }
      case 'all': {
        this.access.assert(PERMISSIONS.ACTION_VIEW_ALL);
        const filter = this.access.orgUnitFilter(PERMISSIONS.ACTION_VIEW_ALL);
        if (filter) and.push({ orgUnit: filter });
        break;
      }
    }

    if (query.status?.length) and.push({ status: { in: query.status } });
    if (query.overdue) and.push({ status: { in: ACTIVE_STATUSES }, dueDate: { lt: startOfUtcDay() } });
    if (query.sourceType) and.push({ sourceType: query.sourceType });
    if (query.sourceId) and.push({ sourceId: query.sourceId });
    if (query.ownerId) and.push({ ownerId: query.ownerId });
    if (query.orgUnitId) {
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: query.orgUnitId } });
      and.push({ orgUnit: { path: { startsWith: unit?.path ?? '__none__' } } });
    }
    if (query.q) {
      const q = query.q.trim();
      const num = Number(q.replace(/^AKS-0*/i, ''));
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { sourceLabel: { contains: q, mode: 'insensitive' } },
          ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : []),
        ],
      });
    }
    return { AND: and };
  }

  /** Kullanıcının yöneticisi olduğu birimlerin path'leri */
  private async managedUnitPaths(): Promise<string[]> {
    const employeeId = this.ctx.user.employeeId;
    if (!employeeId) return [];
    const units = await this.prisma.db.orgUnit.findMany({ where: { managerEmployeeId: employeeId }, select: { path: true } });
    return units.map((u) => u.path);
  }

  private async load(id: string): Promise<DetailRow> {
    const row = await this.prisma.db.action.findFirst({ where: { id, deletedAt: null }, include: detailInclude });
    if (!row) throw new NotFoundException('Action not found');
    return row;
  }

  private rights(row: DetailRow) {
    const user = this.ctx.user;
    const isOwner = row.ownerId === user.id;
    const isCreator = row.createdById === user.id;
    const isManagerOfOwner = !!user.employeeId && row.owner.employee?.managerId === user.employeeId;
    const hasManage = this.access.has(PERMISSIONS.ACTION_MANAGE) && this.access.inScope(PERMISSIONS.ACTION_MANAGE, row.orgUnit?.path);
    const edit = isCreator || isManagerOfOwner || hasManage;
    const active = ACTIVE_STATUSES.includes(row.status);
    return {
      edit,
      changeStatus: isOwner || edit,
      verify: edit && row.status === 'DONE',
      decideDueDate: edit && active,
      isOwner,
      isSupporter: row.supporters.some((s) => s.userId === user.id),
    };
  }

  private async canView(row: DetailRow): Promise<boolean> {
    const r = this.rights(row);
    if (r.changeStatus || r.isSupporter) return true;
    if (this.access.has(PERMISSIONS.ACTION_VIEW_ALL) && this.access.inScope(PERMISSIONS.ACTION_VIEW_ALL, row.orgUnit?.path)) return true;
    const managed = await this.managedUnitPaths();
    return !!row.orgUnit && managed.some((p) => row.orgUnit!.path.startsWith(p));
  }

  /** Aksiyon sahibinin yöneticisinin kullanıcı id'si */
  private async managerUserIds(row: DetailRow): Promise<string[]> {
    const managerId = row.owner.employee?.managerId;
    if (!managerId) return [];
    const manager = await this.prisma.db.user.findFirst({ where: { employeeId: managerId, isActive: true }, select: { id: true } });
    return manager ? [manager.id] : [];
  }

  private async defaultOrgUnit(ownerId: string): Promise<string | null> {
    const owner = await this.prisma.db.user.findUnique({ where: { id: ownerId }, select: { employee: { select: { orgUnitId: true } } } });
    return owner?.employee?.orgUnitId ?? null;
  }

  private async assertActiveUsers(ids: string[]) {
    const unique = [...new Set(ids)];
    const count = await this.prisma.db.user.count({ where: { id: { in: unique }, isActive: true } });
    if (count !== unique.length) throw new BusinessException('INVALID_USER', 'Sorumlu veya destek kişisi bulunamadı ya da pasif');
  }

  private toListItem(r: ListRow): ActionListItem {
    return {
      id: r.id,
      number: r.number,
      code: actionCode(r.number),
      title: r.title,
      status: r.status,
      priority: r.priority,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      sourceLabel: r.sourceLabel,
      owner: { id: r.owner.id, fullName: r.owner.fullName, username: r.owner.username },
      orgUnit: r.orgUnit ? { id: r.orgUnit.id, name: r.orgUnit.name, code: r.orgUnit.code } : null,
      dueDate: r.dueDate.toISOString().slice(0, 10),
      startDate: r.startDate?.toISOString().slice(0, 10) ?? null,
      progress: r.progress,
      ...overdueInfo(r.status, r.dueDate),
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toDueDateRequest(r: Prisma.ActionDueDateRequestGetPayload<{ include: { requestedBy: typeof userRef; decidedBy: typeof userRef } }>): DueDateRequest {
    return {
      id: r.id, newDueDate: r.newDueDate.toISOString().slice(0, 10), reason: r.reason, status: r.status,
      requestedBy: r.requestedBy, decidedBy: r.decidedBy, decidedAt: r.decidedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
    };
  }

  private toDetail(r: DetailRow): ActionDetail {
    const rights = this.rights(r);
    return {
      ...this.toListItem(r),
      description: r.description,
      originalDueDate: r.originalDueDate.toISOString().slice(0, 10),
      completedAt: r.completedAt?.toISOString() ?? null,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      completionNote: r.completionNote,
      createdBy: r.createdBy,
      supporters: r.supporters.map((s) => s.user),
      history: r.history.map((h) => ({
        id: h.id, type: h.type, fromValue: h.fromValue, toValue: h.toValue, note: h.note, user: h.user, createdAt: h.createdAt.toISOString(),
      })),
      comments: r.comments.map((c) => ({ id: c.id, body: c.body, user: c.user, createdAt: c.createdAt.toISOString() })),
      dueDateRequests: r.dueDateRequests.map((d) => this.toDueDateRequest(d)),
      can: { edit: rights.edit, changeStatus: rights.changeStatus, verify: rights.verify, decideDueDate: rights.decideDueDate },
    };
  }
}
