import { ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  acceptancePoints, averageScore, canFastTrack, canTransition, kaizenCode, PERMISSIONS, suggestionCode, validateScores, weightedScore,
  type ActionDetail, type ActionListItem, type EvaluationStage, type Paginated, type SuggestionDetail, type SuggestionListItem,
  type SuggestionsDashboardWidget, type SuggestionStatus,
} from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { pageArgs, paginated, parseSort } from '../../common/pagination';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../../core/auth/access.service';
import { ActionsService } from '../../core/actions/actions.service';
import { AuditService } from '../../core/audit/audit.service';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { ActionEvents, DomainEvents, type ActionStatusChangedEvent } from '../../core/events/domain-events';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SequenceService } from '../../core/prisma/sequence.service';
import { SuggestionAccessService, type CommitteeContext } from './suggestion-access.service';
import { SuggestionPointsService } from './suggestion-points.service';
import { num } from './suggestion-rules';
import { SuggestionSettingsService } from './suggestion-settings.service';
import type {
  AssignImplementerDto, CreateSuggestionDto, DecisionDto, EvaluateDto, ImplementedDto, SuggestionActionDto, SuggestionQuery,
  UpdateSuggestionDto,
} from './suggestions.dto';

const userRef = { select: { id: true, fullName: true, username: true } } as const;

const listInclude = {
  submittedBy: userRef,
  implementer: userRef,
  orgUnit: { select: { id: true, name: true, path: true } },
  _count: { select: { members: true } },
} satisfies Prisma.SuggestionInclude;

const detailInclude = {
  submittedBy: userRef,
  implementer: userRef,
  preEvaluator: userRef,
  orgUnit: { select: { id: true, name: true, path: true } },
  members: { include: { user: userRef } },
  evaluations: { include: { evaluator: userRef }, orderBy: { createdAt: 'asc' } },
  events: { include: { user: userRef }, orderBy: { createdAt: 'asc' } },
  kaizens: { select: { id: true, number: true, status: true } },
} satisfies Prisma.SuggestionInclude;

type ListRow = Prisma.SuggestionGetPayload<{ include: typeof listInclude }> & { evaluations?: { stage: EvaluationStage }[] };
type DetailRow = Prisma.SuggestionGetPayload<{ include: typeof detailInclude }>;

const OPEN_ACTION = ['OPEN', 'IN_PROGRESS'] as const;

@Injectable()
export class SuggestionsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly access: AccessService,
    private readonly sAccess: SuggestionAccessService,
    private readonly settings: SuggestionSettingsService,
    private readonly points: SuggestionPointsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly sequences: SequenceService,
    private readonly actions: ActionsService,
    private readonly dashboard: DashboardService,
    private readonly events: DomainEvents,
  ) {}

  onModuleInit() {
    this.dashboard.registerWidget('suggestions', async (user) =>
      user.permissions.has(PERMISSIONS.SUGGESTION_CREATE) ? this.dashboardWidget() : undefined,
    );
    this.events.on<ActionStatusChangedEvent>(ActionEvents.StatusChanged, (e) => this.onActionStatusChanged(e));
  }

  /* ------------------------------ Sorgular ------------------------------ */

  private async buildWhere(query: SuggestionQuery, committee: CommitteeContext): Promise<Prisma.SuggestionWhereInput> {
    const and: Prisma.SuggestionWhereInput[] = [];
    if (query.view === 'all') {
      const manage = this.sAccess.manageWhere();
      if (!manage) throw new ForbiddenException();
      and.push(manage);
    } else if (query.view === 'queue') {
      and.push(this.sAccess.queueWhere(committee, query.stage));
    } else {
      and.push(this.sAccess.mineWhere());
    }
    if (query.status) and.push({ status: query.status });
    if (query.category) and.push({ category: query.category });
    if (query.submittedById) and.push({ submittedById: query.submittedById });
    if (query.orgUnitId) {
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: query.orgUnitId } });
      and.push({ orgUnit: { path: { startsWith: unit?.path ?? '__none__' } } });
    }
    if (query.from) and.push({ submittedAt: { gte: new Date(query.from) } });
    if (query.to) and.push({ submittedAt: { lte: new Date(query.to) } });
    if (query.q) {
      const n = Number(query.q.replace(/\D/g, ''));
      and.push({
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { proposedState: { contains: query.q, mode: 'insensitive' } },
          ...(Number.isFinite(n) && n > 0 && /^(onr)?[-\s]?\d+$/i.test(query.q.trim()) ? [{ number: n }] : []),
        ],
      });
    }
    return { AND: and };
  }

  async list(query: SuggestionQuery): Promise<Paginated<SuggestionListItem>> {
    const committee = await this.sAccess.committeeContext();
    const where = await this.buildWhere(query, committee);
    const orderBy = parseSort(query.sort, ['submittedAt', 'number', 'title', 'status', 'finalScore', 'decidedAt'] as const, { submittedAt: 'desc' });
    const me = this.ctx.userId;
    const include = { ...listInclude, evaluations: { where: { evaluatorId: me, stage: 'COMMITTEE' as const }, select: { stage: true } } };
    const [rows, total] = await Promise.all([
      this.prisma.db.suggestion.findMany({ where, include, orderBy, ...pageArgs(query) }),
      this.prisma.db.suggestion.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toListItem(r, committee)), total, query);
  }

  async listAll(query: SuggestionQuery): Promise<SuggestionListItem[]> {
    const committee = await this.sAccess.committeeContext();
    const where = await this.buildWhere(query, committee);
    const rows = await this.prisma.db.suggestion.findMany({ where, include: listInclude, orderBy: { number: 'desc' }, take: 10_000 });
    return rows.map((r) => this.toListItem(r, committee));
  }

  async get(id: string): Promise<SuggestionDetail> {
    const row = await this.load(id);
    const committee = await this.sAccess.committeeContext();
    await this.assertVisible(id);
    return this.toDetail(row, committee);
  }

  async listActions(id: string): Promise<ActionListItem[]> {
    await this.get(id);
    return this.actions.listBySource('SUGGESTION', id);
  }

  /* ------------------------------ Komutlar ------------------------------ */

  async create(dto: CreateSuggestionDto): Promise<SuggestionDetail> {
    const tenantId = this.ctx.tenantId;
    const me = this.ctx.userId;
    const settings = await this.settings.load();
    const myEmployee = await this.prisma.db.employee.findFirst({ where: { user: { id: me } }, select: { id: true, orgUnitId: true, managerId: true } });
    const orgUnitId = dto.orgUnitId ?? myEmployee?.orgUnitId ?? null;
    if (orgUnitId && !(await this.prisma.db.orgUnit.findUnique({ where: { id: orgUnitId } }))) throw new BusinessException('INVALID_ORG_UNIT', 'Geçersiz birim');
    const coIds = await this.validateCoSubmitters(dto.coSubmitterIds ?? [], me);
    const preEvaluatorId = await this.resolvePreEvaluator(settings.preEvaluation, myEmployee?.managerId ?? null, orgUnitId, me);

    const created = await this.prisma.db.$transaction(async (tx) => {
      const number = await this.sequences.next('suggestion', tx);
      return tx.suggestion.create({
        data: {
          tenantId, number, title: dto.title, currentState: dto.currentState, proposedState: dto.proposedState, expectedBenefit: dto.expectedBenefit,
          category: dto.category ?? 'OTHER', orgUnitId, submittedById: me, estimatedCost: dto.estimatedCost ?? null,
          estimatedSaving: dto.estimatedSaving ?? null, selfImplementable: dto.selfImplementable ?? false,
          status: preEvaluatorId ? 'PRE_EVALUATION' : 'SUBMITTED', preEvaluatorId,
          members: { create: coIds.map((userId) => ({ tenantId, userId })) },
          events: { create: { tenantId, userId: me, type: 'SUBMITTED', toStatus: preEvaluatorId ? 'PRE_EVALUATION' : 'SUBMITTED' } },
        },
      });
    });
    const code = suggestionCode(created.number);
    await this.audit.log('suggestion', created.id, 'created', dto);
    await this.points.award([me, ...coIds], 'SUBMISSION', settings.pointRules.submission, 'SUGGESTION', created.id);

    const notifyIds = preEvaluatorId ? [preEvaluatorId] : await this.sAccess.manageUserIds();
    await this.notifications.notify({
      userIds: notifyIds, type: 'GENERIC', title: `Yeni öneri değerlendirmenizi bekliyor: ${code} ${created.title}`,
      link: `/suggestions/${created.id}`, dedupeKey: `sugg-new:${created.id}`,
    });
    return this.get(created.id);
  }

  async update(id: string, dto: UpdateSuggestionDto): Promise<SuggestionDetail> {
    const row = await this.load(id);
    const committee = await this.sAccess.committeeContext();
    if (!this.sAccess.rights(row, committee).edit) throw new ForbiddenException();
    const tenantId = this.ctx.tenantId;
    const coIds = dto.coSubmitterIds ? await this.validateCoSubmitters(dto.coSubmitterIds, row.submittedById) : null;
    const { coSubmitterIds: _ignored, ...fields } = dto;
    void _ignored;
    await this.prisma.db.$transaction(async (tx) => {
      await tx.suggestion.update({ where: { id }, data: { ...fields, revisionNote: null } });
      if (coIds) {
        await tx.suggestionMember.deleteMany({ where: { suggestionId: id } });
        await tx.suggestionMember.createMany({ data: coIds.map((userId) => ({ tenantId, suggestionId: id, userId })) });
      }
      await tx.suggestionEvent.create({ data: { tenantId, suggestionId: id, userId: this.ctx.userId, type: 'EDITED' } });
    });
    await this.audit.log('suggestion', id, 'updated', dto);
    return this.get(id);
  }

  async withdraw(id: string): Promise<SuggestionDetail> {
    const row = await this.load(id);
    const committee = await this.sAccess.committeeContext();
    if (!this.sAccess.rights(row, committee).withdraw) throw new ForbiddenException();
    await this.transition(row, 'WITHDRAWN', { withdrawnAt: new Date() }, 'WITHDRAWN');
    return this.get(id);
  }

  /** Ön değerlendirme (ilk yönetici): FORWARD → komite, ACCEPT → hızlı onay, REJECT, REVISE. */
  async preEvaluate(id: string, dto: EvaluateDto): Promise<SuggestionDetail> {
    const row = await this.load(id);
    const committee = await this.sAccess.committeeContext();
    if (row.status !== 'SUBMITTED' && row.status !== 'PRE_EVALUATION') throw new BusinessException('INVALID_TRANSITION', 'Öneri ön değerlendirme aşamasında değil');
    if (!this.sAccess.rights(row, committee).preEvaluate) throw new ForbiddenException();
    const decision = (dto.decision ?? 'FORWARD') as 'FORWARD' | 'ACCEPT' | 'REJECT' | 'REVISE';
    if (!['FORWARD', 'ACCEPT', 'REJECT', 'REVISE'].includes(decision)) throw new BusinessException('INVALID_DECISION', 'Geçersiz karar');
    const settings = await this.settings.load();
    if (decision === 'FORWARD' || decision === 'ACCEPT') this.assertScores(settings.criteria, dto.scores);
    const total = weightedScore(settings.criteria, dto.scores);
    const reason = dto.reason?.trim() || dto.comment?.trim();
    if ((decision === 'REJECT' || decision === 'REVISE') && !reason) throw new BusinessException('REASON_REQUIRED', 'Gerekçe zorunludur');
    if (decision === 'ACCEPT' && !canFastTrack(settings, total, num(row.estimatedCost))) {
      throw new BusinessException('FAST_TRACK_NOT_ALLOWED', 'Hızlı onay koşulları sağlanmıyor (puan eşiği veya maliyet sınırı)');
    }

    const now = new Date();
    await this.upsertEvaluation(id, 'PRE', dto, total, decision);
    const base = { preScore: total, preEvaluatedAt: now, preEvaluatorId: row.preEvaluatorId ?? this.ctx.userId };
    switch (decision) {
      case 'FORWARD':
        await this.transition(row, 'COMMITTEE', base, 'FORWARDED', dto.comment);
        await this.notifyCommittee(row.id, suggestionCode(row.number), row.title);
        break;
      case 'ACCEPT':
        await this.transition(row, 'ACCEPTED', { ...base, finalScore: total, fastTrack: true, decidedAt: now, decisionNote: dto.comment ?? null }, 'FAST_TRACK_ACCEPTED', dto.comment);
        await this.awardAcceptance(row.id, total);
        break;
      case 'REJECT':
        await this.transition(row, 'REJECTED', { ...base, rejectionReason: reason!, decidedAt: now }, 'REJECTED', reason);
        break;
      case 'REVISE':
        await this.transition(row, 'SUBMITTED', { ...base, revisionNote: reason! }, 'REVISION_REQUESTED', reason);
        break;
    }
    await this.notifyOwners(row, `Öneriniz değerlendirildi: ${suggestionCode(row.number)} ${row.title}`, decision === 'FORWARD' ? 'Komiteye iletildi' : undefined);
    return this.get(id);
  }

  /** Komite üyesi puanı (her üye kendi puanını girer/günceller). */
  async committeeScore(id: string, dto: EvaluateDto): Promise<SuggestionDetail> {
    const row = await this.load(id);
    const committee = await this.sAccess.committeeContext();
    if (row.status !== 'COMMITTEE' && row.status !== 'ON_HOLD') throw new BusinessException('INVALID_TRANSITION', 'Öneri komite aşamasında değil');
    if (!this.sAccess.rights(row, committee).committeeScore) throw new ForbiddenException();
    const settings = await this.settings.load();
    this.assertScores(settings.criteria, dto.scores);
    const decision = dto.decision && ['ACCEPT', 'REJECT', 'HOLD'].includes(dto.decision) ? dto.decision : null;
    await this.upsertEvaluation(id, 'COMMITTEE', dto, weightedScore(settings.criteria, dto.scores), decision);
    return this.get(id);
  }

  /** Komite kararı (suggestion.manage veya komite başkanı). */
  async decide(id: string, dto: DecisionDto): Promise<SuggestionDetail> {
    const row = await this.load(id);
    const committee = await this.sAccess.committeeContext();
    if (row.status !== 'COMMITTEE' && row.status !== 'ON_HOLD') throw new BusinessException('INVALID_TRANSITION', 'Öneri komite aşamasında değil');
    if (!this.sAccess.rights(row, committee).decide) throw new ForbiddenException();
    const now = new Date();
    const note = dto.note?.trim() || null;
    if (dto.decision === 'REJECT') {
      const reason = dto.reason?.trim();
      if (!reason) throw new BusinessException('REASON_REQUIRED', 'Ret gerekçesi zorunludur');
      await this.transition(row, 'REJECTED', { rejectionReason: reason, decidedAt: now, decisionNote: note }, 'REJECTED', reason);
    } else if (dto.decision === 'HOLD') {
      if (row.status === 'ON_HOLD') throw new BusinessException('INVALID_TRANSITION', 'Öneri zaten beklemede');
      await this.transition(row, 'ON_HOLD', { decisionNote: note ?? dto.reason ?? null }, 'ON_HOLD', note ?? dto.reason);
    } else {
      const scores = await this.prisma.db.suggestionEvaluation.findMany({ where: { suggestionId: id, stage: 'COMMITTEE' }, select: { totalScore: true } });
      const final = averageScore(scores.map((s) => s.totalScore));
      if (final === null) throw new BusinessException('NO_COMMITTEE_SCORES', 'Kabul için en az bir komite puanı gerekli');
      await this.transition(row, 'ACCEPTED', { finalScore: final, decidedAt: now, decisionNote: note }, 'ACCEPTED', note ?? undefined);
      await this.awardAcceptance(id, final);
    }
    await this.notifyOwners(row, `Önerinizle ilgili karar verildi: ${suggestionCode(row.number)} ${row.title}`);
    return this.get(id);
  }

  async assignImplementer(id: string, dto: AssignImplementerDto): Promise<SuggestionDetail> {
    const row = await this.load(id);
    const committee = await this.sAccess.committeeContext();
    const can = this.sAccess.rights(row, committee);
    const ownerSelf = dto.implementerId === this.ctx.userId && row.selfImplementable && (row.submittedById === this.ctx.userId || row.members.some((m) => m.userId === this.ctx.userId));
    if (!can.manage && !ownerSelf) throw new ForbiddenException();
    if (row.status !== 'ACCEPTED' && row.status !== 'IN_IMPLEMENTATION') throw new BusinessException('INVALID_TRANSITION', 'Uygulayıcı yalnız kabul edilmiş önerilere atanır');
    const user = await this.prisma.db.user.findFirst({ where: { id: dto.implementerId, isActive: true } });
    if (!user) throw new BusinessException('INVALID_USER', 'Geçersiz kullanıcı');
    const data: Prisma.SuggestionUncheckedUpdateInput = { implementerId: dto.implementerId, targetDate: dto.targetDate ? new Date(dto.targetDate) : null };
    if (row.status === 'ACCEPTED') await this.transition(row, 'IN_IMPLEMENTATION', data, 'IMPLEMENTER_ASSIGNED', user.fullName);
    else {
      await this.prisma.db.suggestion.update({ where: { id }, data });
      await this.addEvent(id, 'IMPLEMENTER_CHANGED', null, null, user.fullName);
    }
    await this.notifications.notify({
      userIds: [dto.implementerId], type: 'GENERIC', title: `Öneri uygulaması size atandı: ${suggestionCode(row.number)} ${row.title}`,
      link: `/suggestions/${id}`,
    });
    return this.get(id);
  }

  async createAction(id: string, dto: SuggestionActionDto): Promise<ActionDetail> {
    const row = await this.load(id);
    const committee = await this.sAccess.committeeContext();
    if (!this.sAccess.rights(row, committee).implement) throw new ForbiddenException();
    const action = await this.actions.create({
      title: dto.title, description: dto.description, ownerId: dto.ownerId, dueDate: dto.dueDate, priority: dto.priority,
      orgUnitId: row.orgUnitId, sourceType: 'SUGGESTION', sourceId: id, sourceLabel: `${suggestionCode(row.number)} ${row.title}`,
    });
    if (row.status === 'ACCEPTED') {
      await this.transition(row, 'IN_IMPLEMENTATION', { implementerId: row.implementerId ?? dto.ownerId }, 'IMPLEMENTATION_STARTED');
    }
    return action;
  }

  async markImplemented(id: string, dto: ImplementedDto): Promise<SuggestionDetail> {
    const row = await this.load(id);
    const committee = await this.sAccess.committeeContext();
    if (row.status !== 'IN_IMPLEMENTATION') throw new BusinessException('INVALID_TRANSITION', 'Öneri uygulama aşamasında değil');
    if (!this.sAccess.rights(row, committee).implement) throw new ForbiddenException();
    const open = await this.prisma.db.action.count({ where: { sourceType: 'SUGGESTION', sourceId: id, deletedAt: null, status: { in: [...OPEN_ACTION] } } });
    if (open > 0) throw new BusinessException('OPEN_ACTIONS', `${open} açık aksiyon var; önce aksiyonları tamamlayın`, { open });
    await this.transition(row, 'IMPLEMENTED', { implementedAt: new Date(), implementationNote: dto.note ?? null }, 'IMPLEMENTED', dto.note);
    const settings = await this.settings.load();
    await this.points.award([row.submittedById, ...row.members.map((m) => m.userId)], 'IMPLEMENTATION', settings.pointRules.implementation, 'SUGGESTION', id);
    await this.notifyOwners(row, `Öneriniz uygulandı: ${suggestionCode(row.number)} ${row.title}`);
    return this.get(id);
  }

  async close(id: string): Promise<SuggestionDetail> {
    const row = await this.load(id);
    const committee = await this.sAccess.committeeContext();
    if (row.status !== 'IMPLEMENTED') throw new BusinessException('INVALID_TRANSITION', 'Yalnız uygulanmış öneri kapatılabilir');
    if (!this.sAccess.rights(row, committee).manage) throw new ForbiddenException();
    await this.transition(row, 'CLOSED', { closedAt: new Date() }, 'CLOSED');
    return this.get(id);
  }

  async setSuggestionOfMonth(id: string, value: boolean, month?: string): Promise<SuggestionDetail> {
    const row = await this.load(id);
    if (!this.access.has(PERMISSIONS.SUGGESTION_MANAGE) || !this.access.inScope(PERMISSIONS.SUGGESTION_MANAGE, row.orgUnit?.path)) throw new ForbiddenException();
    if (['REJECTED', 'WITHDRAWN'].includes(row.status)) throw new BusinessException('INVALID_STATE', 'Reddedilen/geri çekilen öneri seçilemez');
    const m = month ?? new Date().toISOString().slice(0, 7);
    await this.prisma.db.$transaction(async (tx) => {
      if (value) await tx.suggestion.updateMany({ where: { isSuggestionOfMonth: true, suggestionMonth: m, id: { not: id } }, data: { isSuggestionOfMonth: false, suggestionMonth: null } });
      await tx.suggestion.update({ where: { id }, data: { isSuggestionOfMonth: value, suggestionMonth: value ? m : null } });
    });
    await this.addEvent(id, value ? 'SUGGESTION_OF_MONTH' : 'SUGGESTION_OF_MONTH_REMOVED', null, null, m);
    if (value) await this.notifyOwners(row, `Ayın önerisi seçildiniz: ${suggestionCode(row.number)} ${row.title}`);
    return this.get(id);
  }

  /* ------------------------------ Yardımcılar ------------------------------ */

  private assertScores(criteria: Parameters<typeof validateScores>[0], scores: Record<string, number>) {
    const errors = validateScores(criteria, scores ?? {});
    if (errors.length) throw new BusinessException('INVALID_SCORES', 'Tüm kriterler geçerli aralıkta puanlanmalıdır', errors);
  }

  private async upsertEvaluation(suggestionId: string, stage: EvaluationStage, dto: EvaluateDto, totalScore: number, decision: string | null) {
    const evaluatorId = this.ctx.userId;
    const data = {
      scores: dto.scores as Prisma.InputJsonValue, totalScore, decision: decision as 'FORWARD' | null, comment: dto.comment ?? null,
    };
    await this.prisma.db.suggestionEvaluation.upsert({
      where: { suggestionId_stage_evaluatorId: { suggestionId, stage, evaluatorId } } as Prisma.SuggestionEvaluationWhereUniqueInput,
      create: { tenantId: this.ctx.tenantId, suggestionId, stage, evaluatorId, ...data },
      update: data,
    });
  }

  private async awardAcceptance(id: string, score: number | null) {
    const row = await this.prisma.db.suggestion.findUniqueOrThrow({ where: { id }, include: { members: true } });
    const settings = await this.settings.load();
    await this.points.award(
      [row.submittedById, ...row.members.map((m) => m.userId)], 'ACCEPTANCE', acceptancePoints(settings.pointRules, score), 'SUGGESTION', id,
    );
  }

  private async notifyCommittee(id: string, code: string, title: string) {
    const c = await this.settings.committee();
    const ids = c.teamId ? c.userIds : [];
    await this.notifications.notify({ userIds: ids, type: 'GENERIC', title: `Komite değerlendirmesi bekleyen öneri: ${code} ${title}`, link: `/suggestions/${id}`, dedupeKey: `sugg-committee:${id}` });
  }

  private async notifyOwners(row: { id: string; submittedById: string; members: { userId: string }[] }, title: string, body?: string) {
    await this.notifications.notify({ userIds: [row.submittedById, ...row.members.map((m) => m.userId)], type: 'GENERIC', title, body, link: `/suggestions/${row.id}` });
  }

  private async addEvent(suggestionId: string, type: string, fromStatus: string | null, toStatus: string | null, note?: string | null) {
    await this.prisma.db.suggestionEvent.create({
      data: { tenantId: this.ctx.tenantId, suggestionId, userId: this.ctx.optionalUser?.id ?? null, type, fromStatus, toStatus, note: note ?? null },
    });
  }

  /** Durum geçişi: saf kural koruması + olay kaydı. */
  private async transition(row: { id: string; status: SuggestionStatus }, to: SuggestionStatus, data: Prisma.SuggestionUncheckedUpdateInput, type: string, note?: string | null) {
    if (row.status !== to && !canTransition(row.status, to)) throw new BusinessException('INVALID_TRANSITION', `${row.status} → ${to} geçişi yapılamaz`);
    await this.prisma.db.$transaction([
      this.prisma.db.suggestion.update({ where: { id: row.id }, data: { ...data, status: to } }),
      this.prisma.db.suggestionEvent.create({
        data: { tenantId: this.ctx.tenantId, suggestionId: row.id, userId: this.ctx.optionalUser?.id ?? null, type, fromStatus: row.status, toStatus: to, note: note ?? null },
      }),
    ]);
    await this.audit.log('suggestion', row.id, `status.${to}`, { from: row.status, note });
  }

  private async validateCoSubmitters(ids: string[], submitterId: string): Promise<string[]> {
    const unique = [...new Set(ids)].filter((i) => i !== submitterId);
    if (!unique.length) return [];
    const found = await this.prisma.db.user.count({ where: { id: { in: unique }, isActive: true } });
    if (found !== unique.length) throw new BusinessException('INVALID_USER', 'Geçersiz ortak öneri sahibi');
    return unique;
  }

  /** Ayara göre ön değerlendiriciyi bulur (öneren kendisi ise bir üst yöneticiye / diğer yönteme düşer). */
  private async resolvePreEvaluator(mode: 'DIRECT_MANAGER' | 'ORG_UNIT_MANAGER', managerEmployeeId: string | null, orgUnitId: string | null, submitterId: string): Promise<string | null> {
    const direct = async () => {
      if (!managerEmployeeId) return null;
      const emp = await this.prisma.db.employee.findUnique({ where: { id: managerEmployeeId }, select: { user: { select: { id: true, isActive: true } } } });
      return emp?.user?.isActive ? emp.user.id : null;
    };
    const unit = async () => {
      if (!orgUnitId) return null;
      const u = await this.prisma.db.orgUnit.findUnique({ where: { id: orgUnitId }, select: { manager: { select: { user: { select: { id: true, isActive: true } } } } } });
      return u?.manager?.user?.isActive ? u.manager.user.id : null;
    };
    const order = mode === 'DIRECT_MANAGER' ? [direct, unit] : [unit, direct];
    for (const fn of order) {
      const id = await fn();
      if (id && id !== submitterId) return id;
    }
    return null;
  }

  private async assertVisible(id: string) {
    const visible = await this.sAccess.visibleWhere();
    const found = await this.prisma.db.suggestion.count({ where: { AND: [{ id }, visible] } });
    if (!found) throw new ForbiddenException();
  }

  private async load(id: string): Promise<DetailRow> {
    const row = await this.prisma.db.suggestion.findUnique({ where: { id }, include: detailInclude });
    if (!row) throw new NotFoundException();
    return row;
  }

  /* ------------------------------ Dönüştürücüler ------------------------------ */

  private awaitingMe(r: { status: SuggestionStatus; preEvaluatorId: string | null; submittedById: string; evaluations?: { stage: EvaluationStage }[] }, committee: CommitteeContext): EvaluationStage | null {
    const me = this.ctx.userId;
    if (r.submittedById === me) return null;
    if ((r.status === 'SUBMITTED' || r.status === 'PRE_EVALUATION') && r.preEvaluatorId === me) return 'PRE';
    if (r.status === 'COMMITTEE' && committee.eligible && !(r.evaluations ?? []).some((e) => e.stage === 'COMMITTEE')) return 'COMMITTEE';
    return null;
  }

  private toListItem(r: ListRow, committee: CommitteeContext): SuggestionListItem {
    return {
      id: r.id, number: r.number, code: suggestionCode(r.number), title: r.title, category: r.category, status: r.status,
      orgUnit: r.orgUnit ? { id: r.orgUnit.id, name: r.orgUnit.name } : null, submittedBy: r.submittedBy, coSubmitterCount: r._count.members,
      estimatedCost: num(r.estimatedCost), estimatedSaving: num(r.estimatedSaving), preScore: r.preScore, finalScore: r.finalScore,
      implementer: r.implementer, isSuggestionOfMonth: r.isSuggestionOfMonth, submittedAt: r.submittedAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null, awaitingMe: this.awaitingMe(r, committee),
    };
  }

  private toDetail(r: DetailRow, committee: CommitteeContext): SuggestionDetail {
    return {
      id: r.id, number: r.number, code: suggestionCode(r.number), title: r.title, category: r.category, status: r.status,
      orgUnit: r.orgUnit ? { id: r.orgUnit.id, name: r.orgUnit.name } : null, submittedBy: r.submittedBy,
      estimatedCost: num(r.estimatedCost), estimatedSaving: num(r.estimatedSaving), preScore: r.preScore, finalScore: r.finalScore,
      implementer: r.implementer, isSuggestionOfMonth: r.isSuggestionOfMonth, submittedAt: r.submittedAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
      currentState: r.currentState, proposedState: r.proposedState, expectedBenefit: r.expectedBenefit,
      coSubmitters: r.members.map((m) => m.user), selfImplementable: r.selfImplementable, fastTrack: r.fastTrack, preEvaluator: r.preEvaluator,
      decisionNote: r.decisionNote, rejectionReason: r.rejectionReason, revisionNote: r.revisionNote,
      targetDate: r.targetDate?.toISOString().slice(0, 10) ?? null, implementationNote: r.implementationNote, suggestionMonth: r.suggestionMonth,
      preEvaluatedAt: r.preEvaluatedAt?.toISOString() ?? null, implementedAt: r.implementedAt?.toISOString() ?? null,
      closedAt: r.closedAt?.toISOString() ?? null, withdrawnAt: r.withdrawnAt?.toISOString() ?? null,
      evaluations: r.evaluations.map((e) => ({
        id: e.id, stage: e.stage, evaluator: e.evaluator, scores: e.scores as Record<string, number>, totalScore: e.totalScore,
        decision: e.decision, comment: e.comment, createdAt: e.createdAt.toISOString(), updatedAt: e.updatedAt.toISOString(),
      })),
      events: r.events.map((e) => ({
        id: e.id, type: e.type, fromStatus: e.fromStatus as SuggestionStatus | null, toStatus: e.toStatus as SuggestionStatus | null,
        note: e.note, user: e.user, createdAt: e.createdAt.toISOString(),
      })),
      kaizenIds: r.kaizens.map((k) => ({ id: k.id, code: kaizenCode(k.number), status: k.status })),
      can: this.sAccess.rights(r, committee),
    };
  }

  /* ------------------------------ Pano & olaylar ------------------------------ */

  async dashboardWidget(): Promise<SuggestionsDashboardWidget> {
    const me = this.ctx.userId;
    const committee = await this.sAccess.committeeContext();
    const [mySubmitted, awaiting, myPoints, s] = await Promise.all([
      this.prisma.db.suggestion.count({ where: this.sAccess.mineWhere() }),
      this.prisma.db.suggestion.count({ where: this.sAccess.queueWhere(committee) }),
      this.points.total(me),
      this.settings.load(),
    ]);
    const tier = [...s.rewardTiers].sort((a, b) => b.minPoints - a.minPoints).find((t) => myPoints >= t.minPoints);
    return { mySubmitted, awaitingMyEvaluation: awaiting, myPoints, tier: tier?.name ?? null };
  }

  /** Tüm aksiyonlar tamamlandığında uygulayıcıya "UYGULANDI olarak işaretle" bildirimi. */
  private async onActionStatusChanged(e: ActionStatusChangedEvent) {
    if (e.sourceType !== 'SUGGESTION' || !e.sourceId) return;
    if (!['DONE', 'VERIFIED', 'CANCELLED'].includes(e.to)) return;
    const s = await this.prisma.db.suggestion.findUnique({ where: { id: e.sourceId } });
    if (!s || s.status !== 'IN_IMPLEMENTATION') return;
    const acts = await this.prisma.db.action.findMany({ where: { sourceType: 'SUGGESTION', sourceId: s.id, deletedAt: null, status: { not: 'CANCELLED' } }, select: { status: true } });
    if (!acts.length || !acts.every((a) => a.status === 'DONE' || a.status === 'VERIFIED')) return;
    await this.notifications.notify({
      userIds: [s.implementerId, s.preEvaluatorId].filter((x): x is string => !!x),
      type: 'GENERIC', title: `Tüm aksiyonlar tamamlandı, öneriyi "uygulandı" olarak işaretleyin: ${suggestionCode(s.number)} ${s.title}`,
      link: `/suggestions/${s.id}`, dedupeKey: `sugg-actions-done:${s.id}`,
    });
  }
}
