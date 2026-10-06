import { ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  PERMISSIONS, auditCode, auditScaleMax,
  type ActionDetail, type ActionListItem, type AuditDetail, type AuditListItem, type AuditsDashboardWidget, type AuditSectionScore, type Paginated,
} from '@lean/shared';
import { startOfUtcDay } from '../../common/dates';
import { BusinessException } from '../../common/errors';
import { pageArgs, paginated, parseSort } from '../../common/pagination';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../../core/auth/access.service';
import { ActionsService } from '../../core/actions/actions.service';
import { AuditService } from '../../core/audit/audit.service';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SequenceService } from '../../core/prisma/sequence.service';
import { AuditAccessService } from './audit-access.service';
import { computeAuditScore, daysBetween, isValidScore } from './audit-rules';
import type { AuditQuery, CreateAuditDto, CreateFindingActionDto, UpdateAnswerDto, UpdateAuditDto } from './audits.dto';

const userRef = { select: { id: true, fullName: true, username: true } } as const;
const areaRef = { select: { id: true, code: true, name: true, responsibleId: true, orgUnit: { select: { id: true, name: true, code: true, path: true } } } } as const;

const listInclude = {
  template: { select: { id: true, name: true, code: true, type: true } },
  area: areaRef,
  equipment: { select: { id: true, code: true, name: true } },
  auditor: userRef,
  answers: { select: { score: true, isFinding: true } },
} satisfies Prisma.AuditInclude;

const detailInclude = {
  ...listInclude,
  answers: { orderBy: [{ sectionSortOrder: 'asc' }, { sortOrder: 'asc' }] },
} satisfies Prisma.AuditInclude;

type ListRow = Prisma.AuditGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.AuditGetPayload<{ include: typeof detailInclude }>;

const OPEN_STATUSES = ['PLANNED', 'IN_PROGRESS'] as const;
const shortText = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

@Injectable()
export class AuditsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly access: AccessService,
    private readonly auditAccess: AuditAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly sequences: SequenceService,
    private readonly actions: ActionsService,
    private readonly dashboard: DashboardService,
  ) {}

  onModuleInit() {
    this.dashboard.registerWidget('audits', () => this.dashboardWidget());
  }

  /* ------------------------------ Sorgular ------------------------------ */

  async list(query: AuditQuery): Promise<Paginated<AuditListItem>> {
    const where = await this.buildWhere(query);
    const orderBy = parseSort(query.sort, ['dueDate', 'number', 'status', 'scorePct', 'completedAt', 'createdAt'] as const, { dueDate: 'desc' });
    const [rows, total] = await Promise.all([
      this.prisma.db.audit.findMany({ where, include: listInclude, orderBy, ...pageArgs(query) }),
      this.prisma.db.audit.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toListItem(r)), total, query);
  }

  async listAll(query: AuditQuery): Promise<AuditListItem[]> {
    const where = await this.buildWhere(query);
    const rows = await this.prisma.db.audit.findMany({ where, include: listInclude, orderBy: { dueDate: 'desc' }, take: 5000 });
    return rows.map((r) => this.toListItem(r));
  }

  /** Yetki kontrolü yapılmadan, verilen id'lerin liste öğeleri (planlama servisi içindir). */
  async listByIds(ids: string[]): Promise<AuditListItem[]> {
    const rows = await this.prisma.db.audit.findMany({ where: { id: { in: ids } }, include: listInclude, orderBy: [{ dueDate: 'asc' }, { number: 'asc' }] });
    return rows.map((r) => this.toListItem(r));
  }

  async get(id: string): Promise<AuditDetail> {
    const row = await this.load(id);
    if (!this.auditAccess.rights(row).view) throw new ForbiddenException();
    return this.toDetail(row);
  }

  async listActions(id: string): Promise<ActionListItem[]> {
    const row = await this.load(id);
    if (!this.auditAccess.rights(row).view) throw new ForbiddenException();
    return this.actions.listBySource('AUDIT_FINDING', row.id);
  }

  /* ------------------------------ Komutlar ------------------------------ */

  /** Plansız (ad-hoc) denetim. Yalnız audit.manage ile başkasına atanabilir. */
  async create(dto: CreateAuditDto): Promise<AuditDetail> {
    const [template, area] = await Promise.all([
      this.prisma.db.auditTemplate.findUnique({ where: { id: dto.templateId } }),
      this.prisma.db.auditArea.findUnique({ where: { id: dto.areaId }, include: { orgUnit: { select: { path: true } } } }),
    ]);
    if (!template || !template.isActive) throw new BusinessException('INVALID_TEMPLATE', 'Şablon bulunamadı ya da pasif');
    if (!area || !area.isActive) throw new BusinessException('INVALID_AREA', 'Alan bulunamadı ya da pasif');
    if (dto.equipmentId) {
      const eq = await this.prisma.db.equipment.findUnique({ where: { id: dto.equipmentId } });
      if (!eq || eq.areaId !== area.id) throw new BusinessException('INVALID_EQUIPMENT', 'Ekipman bu alana ait değil');
    }
    const me = this.ctx.userId;
    const auditorId = dto.auditorId ?? me;
    if (auditorId !== me) {
      this.auditAccess.assertManage(area.orgUnit.path);
      await this.assertAuditor(auditorId);
    } else if (!this.access.has(PERMISSIONS.AUDIT_PERFORM)) {
      throw new ForbiddenException('Missing permission: audit.perform');
    }
    const id = await this.prisma.db.$transaction(async (tx) => {
      const number = await this.sequences.next('audit', tx);
      const row = await tx.audit.create({
        data: {
          tenantId: this.ctx.tenantId, number, templateId: template.id, templateVersion: template.version, scaleType: template.scaleType,
          areaId: area.id, equipmentId: dto.equipmentId ?? null, auditorId, createdById: me,
          dueDate: dto.dueDate ? startOfUtcDay(new Date(dto.dueDate)) : startOfUtcDay(),
        },
      });
      return row.id;
    });
    await this.audit.log('audit', id, 'created', dto);
    if (auditorId !== me) await this.notifyAssigned(id, auditorId);
    return this.toDetail(await this.load(id));
  }

  async update(id: string, dto: UpdateAuditDto): Promise<AuditDetail> {
    const row = await this.load(id);
    const rights = this.auditAccess.rights(row);
    if (!rights.view) throw new ForbiddenException();
    if (row.status === 'CANCELLED') throw new BusinessException('AUDIT_CANCELLED', 'İptal edilmiş denetim değiştirilemez');
    const reassign = dto.auditorId !== undefined || dto.dueDate !== undefined;
    if (reassign && !rights.manage) throw new ForbiddenException('Only audit managers can reassign');
    if (dto.notes !== undefined && !(rights.manage || rights.perform)) throw new ForbiddenException();
    if (reassign && row.status === 'COMPLETED') throw new BusinessException('AUDIT_COMPLETED', 'Tamamlanmış denetim yeniden atanamaz');
    if (dto.auditorId) await this.assertAuditor(dto.auditorId);
    await this.prisma.db.audit.update({
      where: { id },
      data: { auditorId: dto.auditorId, dueDate: dto.dueDate ? startOfUtcDay(new Date(dto.dueDate)) : undefined, notes: dto.notes },
    });
    await this.audit.log('audit', id, 'updated', dto);
    if (dto.auditorId && dto.auditorId !== row.auditorId) await this.notifyAssigned(id, dto.auditorId);
    return this.toDetail(await this.load(id));
  }

  /** Denetimi başlatır: şablon soruları denetim cevap satırlarına kopyalanır (anlık görüntü). */
  async start(id: string): Promise<AuditDetail> {
    const row = await this.load(id);
    const rights = this.auditAccess.rights(row);
    if (!(rights.perform || rights.manage)) throw new ForbiddenException();
    if (row.status === 'IN_PROGRESS') return this.toDetail(row);
    if (row.status !== 'PLANNED') throw new BusinessException('INVALID_STATUS', 'Yalnız planlı denetimler başlatılabilir');
    const template = await this.prisma.db.auditTemplate.findUniqueOrThrow({
      where: { id: row.templateId },
      include: { sections: { orderBy: { sortOrder: 'asc' }, include: { questions: { orderBy: { sortOrder: 'asc' } } } } },
    });
    const tenantId = this.ctx.tenantId;
    await this.prisma.db.$transaction(async (tx) => {
      await tx.auditAnswer.createMany({
        data: template.sections.flatMap((s) =>
          s.questions.map((q) => ({
            tenantId, auditId: id, sectionTitle: s.title, sectionSortOrder: s.sortOrder, sectionWeight: s.weight,
            questionText: q.text, guidance: q.guidance, weight: q.weight, sortOrder: q.sortOrder, photoRequiredBelow: q.photoRequiredBelow,
          })),
        ),
      });
      await tx.audit.update({
        where: { id },
        data: { status: 'IN_PROGRESS', startedAt: new Date(), templateVersion: template.version, scaleType: template.scaleType },
      });
    });
    await this.audit.log('audit', id, 'started');
    return this.toDetail(await this.load(id));
  }

  async updateAnswer(id: string, answerId: string, dto: UpdateAnswerDto): Promise<AuditDetail['answers'][number]> {
    const row = await this.load(id);
    const rights = this.auditAccess.rights(row);
    if (!(rights.perform || rights.manage)) throw new ForbiddenException();
    if (row.status !== 'IN_PROGRESS') throw new BusinessException('INVALID_STATUS', 'Yalnız devam eden denetimde cevap girilebilir');
    const answer = row.answers.find((a) => a.id === answerId);
    if (!answer) throw new NotFoundException('Answer not found');
    const max = auditScaleMax(row.scaleType);
    if (dto.score !== undefined && dto.score !== null && !isValidScore(dto.score, row.scaleType)) {
      throw new BusinessException('INVALID_SCORE', `Puan 0 ile ${max} arasında olmalı`);
    }
    const score = dto.score === undefined ? answer.score : dto.score;
    let isFinding = dto.isFinding ?? answer.isFinding;
    if (isFinding && (score === null || score >= max)) {
      if (dto.isFinding === true) throw new BusinessException('FINDING_NOT_ALLOWED', 'Yalnız tam puandan düşük cevaplar bulgu olarak işaretlenebilir');
      isFinding = answer.actionId ? true : false;
    }
    if (!isFinding && answer.actionId) isFinding = true;
    const updated = await this.prisma.db.auditAnswer.update({
      where: { id: answerId },
      data: { score: dto.score, comment: dto.comment, isFinding },
    });
    const photos = await this.prisma.db.attachment.count({ where: { entityType: 'AUDIT_ANSWER', entityId: answerId } });
    return this.toAnswer(updated, photos);
  }

  async complete(id: string): Promise<AuditDetail> {
    const row = await this.load(id);
    const rights = this.auditAccess.rights(row);
    if (!(rights.perform || rights.manage)) throw new ForbiddenException();
    if (row.status !== 'IN_PROGRESS') throw new BusinessException('INVALID_STATUS', 'Yalnız devam eden denetim tamamlanabilir');
    const missing = row.answers.filter((a) => a.score === null);
    if (missing.length) {
      throw new BusinessException('ANSWERS_INCOMPLETE', `${missing.length} soru puanlanmadı`, { answerIds: missing.map((a) => a.id) });
    }
    const needPhoto = row.answers.filter((a) => a.photoRequiredBelow != null && a.score! < a.photoRequiredBelow);
    if (needPhoto.length) {
      const withPhoto = await this.prisma.db.attachment.groupBy({
        by: ['entityId'], where: { entityType: 'AUDIT_ANSWER', entityId: { in: needPhoto.map((a) => a.id) } },
      });
      const have = new Set(withPhoto.map((g) => g.entityId));
      const lacking = needPhoto.filter((a) => !have.has(a.id));
      if (lacking.length) {
        throw new BusinessException('PHOTO_REQUIRED', `${lacking.length} soru için fotoğraf zorunlu`, { answerIds: lacking.map((a) => a.id) });
      }
    }
    const result = computeAuditScore(row.answers, row.scaleType);
    await this.prisma.db.audit.update({
      where: { id },
      data: {
        status: 'COMPLETED', completedAt: new Date(), scorePct: result.scorePct,
        sectionScores: result.sections as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit.log('audit', id, 'completed', { scorePct: result.scorePct });
    if (row.area.responsibleId) {
      await this.notifications.notify({
        userIds: [row.area.responsibleId],
        type: 'GENERIC',
        title: `Denetim tamamlandı: ${auditCode(row.number)} ${row.area.name}`,
        body: `Skor: %${result.scorePct ?? '-'}`,
        link: `/audits/${id}`,
      });
    }
    return this.toDetail(await this.load(id));
  }

  async cancel(id: string, reason?: string): Promise<AuditDetail> {
    const row = await this.load(id);
    if (!this.auditAccess.rights(row).manage) throw new ForbiddenException();
    if (!OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number])) {
      throw new BusinessException('INVALID_STATUS', 'Yalnız planlı veya devam eden denetim iptal edilebilir');
    }
    await this.prisma.db.audit.update({ where: { id }, data: { status: 'CANCELLED', cancelledReason: reason ?? null } });
    await this.audit.log('audit', id, 'cancelled', { reason });
    return this.toDetail(await this.load(id));
  }

  /** Bulgudan aksiyon açar (kaynak: AUDIT_FINDING, sourceId = denetim). */
  async createFindingAction(id: string, answerId: string, dto: CreateFindingActionDto): Promise<ActionDetail> {
    const row = await this.load(id);
    const rights = this.auditAccess.rights(row);
    if (!(rights.perform || rights.manage)) throw new ForbiddenException();
    if (row.status !== 'IN_PROGRESS' && row.status !== 'COMPLETED') {
      throw new BusinessException('INVALID_STATUS', 'Aksiyon yalnız başlamış denetimlerde açılabilir');
    }
    const answer = row.answers.find((a) => a.id === answerId);
    if (!answer) throw new NotFoundException('Answer not found');
    if (answer.actionId) throw new BusinessException('ACTION_EXISTS', 'Bu bulgu için zaten aksiyon açılmış');
    if (answer.score === null || answer.score >= auditScaleMax(row.scaleType)) {
      throw new BusinessException('FINDING_NOT_ALLOWED', 'Yalnız tam puandan düşük cevaplar için aksiyon açılabilir');
    }
    const ownerId = dto.ownerId ?? row.area.responsibleId ?? row.auditorId;
    const action = await this.actions.create({
      title: dto.title ?? `${row.area.name}: ${shortText(answer.questionText, 120)}`,
      description: dto.description ?? [answer.questionText, answer.comment].filter(Boolean).join('\n'),
      ownerId,
      dueDate: dto.dueDate,
      priority: dto.priority,
      orgUnitId: row.area.orgUnit.id,
      sourceType: 'AUDIT_FINDING',
      sourceId: row.id,
      sourceLabel: `${auditCode(row.number)} ${row.area.name} – ${shortText(answer.questionText)}`.slice(0, 300),
    });
    await this.prisma.db.auditAnswer.update({ where: { id: answerId }, data: { actionId: action.id, isFinding: true } });
    await this.audit.log('audit', id, 'finding.action', { answerId, actionId: action.id });
    return action;
  }

  /* ------------------------------ Pano kartı ------------------------------ */

  async dashboardWidget(): Promise<AuditsDashboardWidget> {
    const userId = this.ctx.userId;
    const today = startOfUtcDay();
    const mine = { auditorId: userId, status: { in: [...OPEN_STATUSES] } };
    const [myDue, myOverdue, tagsAssigned] = await Promise.all([
      this.prisma.db.audit.count({ where: { ...mine, dueDate: { gte: today } } }),
      this.prisma.db.audit.count({ where: { ...mine, dueDate: { lt: today } } }),
      this.prisma.db.abnormalityTag.count({ where: { assignedToId: userId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);
    return { myDue, myOverdue, tagsAssigned };
  }

  /* ------------------------------ Yardımcılar ------------------------------ */

  async load(id: string): Promise<DetailRow> {
    const row = await this.prisma.db.audit.findUnique({ where: { id }, include: detailInclude });
    if (!row) throw new NotFoundException('Audit not found');
    return row;
  }

  private async assertAuditor(userId: string) {
    const u = await this.prisma.db.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } });
    if (!u) throw new BusinessException('INVALID_USER', 'Denetçi bulunamadı ya da pasif');
  }

  private async notifyAssigned(id: string, userId: string) {
    const a = await this.prisma.db.audit.findUnique({ where: { id }, include: { area: { select: { name: true } } } });
    if (!a) return;
    await this.notifications.notify({
      userIds: [userId], type: 'GENERIC',
      title: `Yeni denetim atandı: ${auditCode(a.number)} ${a.area.name}`,
      body: `Termin: ${a.dueDate.toISOString().slice(0, 10)}`, link: `/audits/${id}`,
    });
  }

  private async buildWhere(query: AuditQuery): Promise<Prisma.AuditWhereInput> {
    const and: Prisma.AuditWhereInput[] = [];
    if (query.view === 'mine') and.push({ auditorId: this.ctx.userId });
    else and.push(this.auditAccess.visibleAuditWhere());
    const today = startOfUtcDay();
    if (query.status) and.push({ status: query.status });
    if (query.open) and.push({ status: { in: [...OPEN_STATUSES] } });
    if (query.overdue) and.push({ status: { in: [...OPEN_STATUSES] }, dueDate: { lt: today } });
    if (query.areaId) and.push({ areaId: query.areaId });
    if (query.templateId) and.push({ templateId: query.templateId });
    if (query.templateType) and.push({ template: { type: query.templateType } });
    if (query.auditorId) and.push({ auditorId: query.auditorId });
    if (query.from) and.push({ dueDate: { gte: startOfUtcDay(new Date(query.from)) } });
    if (query.to) and.push({ dueDate: { lte: startOfUtcDay(new Date(query.to)) } });
    if (query.orgUnitId) {
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: query.orgUnitId } });
      and.push({ area: { orgUnit: { path: { startsWith: unit?.path ?? '__none__' } } } });
    }
    if (query.q) {
      const q = query.q.trim();
      const num = /^(?:DNT-?)?0*(\d+)$/i.exec(q);
      and.push({
        OR: [
          { area: { name: { contains: q, mode: 'insensitive' } } },
          { template: { name: { contains: q, mode: 'insensitive' } } },
          ...(num ? [{ number: Number(num[1]) }] : []),
        ],
      });
    }
    return { AND: and };
  }

  private toListItem(r: ListRow): AuditListItem {
    const today = startOfUtcDay();
    const open = (OPEN_STATUSES as readonly string[]).includes(r.status);
    const overdue = open && r.dueDate < today;
    return {
      id: r.id, number: r.number, code: auditCode(r.number), status: r.status, dueDate: r.dueDate.toISOString().slice(0, 10),
      template: r.template, templateVersion: r.templateVersion, scaleType: r.scaleType,
      area: { id: r.area.id, code: r.area.code, name: r.area.name, orgUnit: { id: r.area.orgUnit.id, name: r.area.orgUnit.name, code: r.area.orgUnit.code } },
      equipment: r.equipment, auditor: r.auditor, planId: r.planId, periodKey: r.periodKey,
      startedAt: r.startedAt?.toISOString() ?? null, completedAt: r.completedAt?.toISOString() ?? null, scorePct: r.scorePct,
      isOverdue: overdue, daysOverdue: overdue ? daysBetween(today, r.dueDate) : 0,
      answeredCount: r.answers.filter((a) => a.score !== null).length, questionCount: r.answers.length,
      findingCount: r.answers.filter((a) => a.isFinding).length,
    };
  }

  private toAnswer(a: DetailRow['answers'][number], photoCount: number): AuditDetail['answers'][number] {
    return {
      id: a.id, sectionTitle: a.sectionTitle, sectionSortOrder: a.sectionSortOrder, sectionWeight: a.sectionWeight,
      questionText: a.questionText, guidance: a.guidance, weight: a.weight, sortOrder: a.sortOrder,
      photoRequiredBelow: a.photoRequiredBelow, score: a.score, comment: a.comment, isFinding: a.isFinding,
      actionId: a.actionId, photoCount,
    };
  }

  private async toDetail(r: DetailRow): Promise<AuditDetail> {
    const rights = this.auditAccess.rights(r);
    const photos = r.answers.length
      ? await this.prisma.db.attachment.groupBy({ by: ['entityId'], where: { entityType: 'AUDIT_ANSWER', entityId: { in: r.answers.map((a) => a.id) } }, _count: true })
      : [];
    const photoMap = new Map(photos.map((p) => [p.entityId, p._count]));
    const [createdBy, responsible] = await Promise.all([
      r.createdById ? this.prisma.db.user.findUnique({ where: { id: r.createdById }, ...userRef }) : null,
      r.area.responsibleId ? this.prisma.db.user.findUnique({ where: { id: r.area.responsibleId }, ...userRef }) : null,
    ]);
    const sectionScores: AuditSectionScore[] =
      r.status === 'COMPLETED' && Array.isArray(r.sectionScores)
        ? (r.sectionScores as unknown as AuditSectionScore[])
        : computeAuditScore(r.answers, r.scaleType).sections;
    const live = r.status === 'COMPLETED' ? r.scorePct : computeAuditScore(r.answers, r.scaleType).scorePct;
    return {
      ...this.toListItem(r), scorePct: live,
      notes: r.notes, cancelledReason: r.cancelledReason, createdBy, responsible, sectionScores,
      answers: r.answers.map((a) => this.toAnswer(a, photoMap.get(a.id) ?? 0)),
      can: {
        perform: rights.perform && r.status === 'IN_PROGRESS',
        manage: rights.manage,
        createAction: (rights.perform || rights.manage) && (r.status === 'IN_PROGRESS' || r.status === 'COMPLETED'),
      },
    };
  }
}
