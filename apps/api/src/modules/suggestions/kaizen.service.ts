import { ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  kaizenCode, PERMISSIONS, suggestionCode, type ActionDetail, type ActionListItem, type KaizenDetail, type KaizenGainDto, type KaizenListItem,
  type KaizenRights, type Paginated,
} from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { pageArgs, paginated, parseSort } from '../../common/pagination';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../../core/auth/access.service';
import { ActionsService } from '../../core/actions/actions.service';
import { AuditService } from '../../core/audit/audit.service';
import { ActionEvents, DomainEvents, type ActionStatusChangedEvent } from '../../core/events/domain-events';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SequenceService } from '../../core/prisma/sequence.service';
import { SuggestionAccessService } from './suggestion-access.service';
import { SuggestionPointsService } from './suggestion-points.service';
import { num } from './suggestion-rules';
import { SuggestionSettingsService } from './suggestion-settings.service';
import type {
  ConvertToKaizenDto, CreateKaizenDto, GainDto, KaizenDecisionDto, KaizenQuery, SuggestionActionDto, UpdateGainDto, UpdateKaizenDto,
} from './suggestions.dto';

const userRef = { select: { id: true, fullName: true, username: true } } as const;

const listInclude = {
  leader: userRef,
  orgUnit: { select: { id: true, name: true, path: true } },
  gains: { select: { type: true, annualSaving: true, financeApproved: true } },
  _count: { select: { members: true } },
} satisfies Prisma.KaizenInclude;

const detailInclude = {
  leader: userRef,
  approvedBy: userRef,
  orgUnit: { select: { id: true, name: true, path: true } },
  members: { include: { user: userRef } },
  gains: { include: { financeApprovedBy: userRef }, orderBy: { createdAt: 'asc' } },
  suggestion: { select: { id: true, number: true, title: true } },
} satisfies Prisma.KaizenInclude;

type ListRow = Prisma.KaizenGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.KaizenGetPayload<{ include: typeof detailInclude }>;

const sumSaving = (gains: { type: string; annualSaving: unknown; financeApproved: boolean }[], approvedOnly: boolean) =>
  gains.filter((g) => g.type === 'TANGIBLE' && (!approvedOnly || g.financeApproved)).reduce((s, g) => s + (num(g.annualSaving as { toString(): string } | null) ?? 0), 0);

@Injectable()
export class KaizenService implements OnModuleInit {
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
    private readonly events: DomainEvents,
  ) {}

  onModuleInit() {
    this.events.on<ActionStatusChangedEvent>(ActionEvents.StatusChanged, (e) => this.onActionStatusChanged(e));
  }

  /* ------------------------------ Erişim ------------------------------ */

  private manageIn(path: string | null | undefined) {
    return this.access.has(PERMISSIONS.SUGGESTION_MANAGE) && this.access.inScope(PERMISSIONS.SUGGESTION_MANAGE, path);
  }

  private async myEmployeeId(): Promise<string | null> {
    return this.ctx.user.employeeId ?? (await this.prisma.db.employee.findFirst({ where: { user: { id: this.ctx.userId } }, select: { id: true } }))?.id ?? null;
  }

  private rights(row: { status: string; leaderId: string; createdById: string; members: { userId: string }[]; orgUnit?: { path: string } | null }, isLeaderManager: boolean): KaizenRights {
    const me = this.ctx.userId;
    const manage = this.manageIn(row.orgUnit?.path);
    const isTeam = row.leaderId === me || row.createdById === me || row.members.some((m) => m.userId === me);
    const editable = row.status === 'DRAFT' || row.status === 'REJECTED';
    return {
      edit: (isTeam && editable) || manage,
      submit: isTeam && editable,
      approve: row.status === 'SUBMITTED' && (manage || isLeaderManager) && row.leaderId !== me,
      financeApprove: manage,
      createAction: isTeam || manage,
    };
  }

  private async leaderManagerFlag(leaderId: string): Promise<boolean> {
    const myEmp = await this.myEmployeeId();
    if (!myEmp) return false;
    const leader = await this.prisma.db.employee.findFirst({ where: { user: { id: leaderId } }, select: { managerId: true } });
    return leader?.managerId === myEmp;
  }

  private async visibleWhere(): Promise<Prisma.KaizenWhereInput> {
    const me = this.ctx.userId;
    const myEmp = await this.myEmployeeId();
    const or: Prisma.KaizenWhereInput[] = [
      { status: 'PUBLISHED' }, { leaderId: me }, { createdById: me }, { members: { some: { userId: me } } },
    ];
    if (myEmp) or.push({ leader: { employee: { managerId: myEmp } } });
    const paths = this.access.has(PERMISSIONS.SUGGESTION_MANAGE) ? this.access.scopePaths(PERMISSIONS.SUGGESTION_MANAGE) : [];
    if (paths === null) return {};
    if (paths?.length) or.push({ orgUnit: { OR: paths.map((p) => ({ path: { startsWith: p } })) } });
    return { OR: or };
  }

  /* ------------------------------ Sorgular ------------------------------ */

  private async buildWhere(query: KaizenQuery): Promise<Prisma.KaizenWhereInput> {
    const me = this.ctx.userId;
    const and: Prisma.KaizenWhereInput[] = [];
    if (query.view === 'library') and.push({ status: 'PUBLISHED' });
    else if (query.view === 'all') {
      and.push(await this.visibleWhere());
    } else if (query.view === 'approval') {
      const myEmp = await this.myEmployeeId();
      const or: Prisma.KaizenWhereInput[] = [];
      if (myEmp) or.push({ leader: { employee: { managerId: myEmp } } });
      const paths = this.access.has(PERMISSIONS.SUGGESTION_MANAGE) ? this.access.scopePaths(PERMISSIONS.SUGGESTION_MANAGE) : [];
      if (paths === null) or.push({});
      else if (paths?.length) or.push({ orgUnit: { OR: paths.map((p) => ({ path: { startsWith: p } })) } });
      and.push({ status: 'SUBMITTED', leaderId: { not: me }, OR: or.length ? or : [{ id: '__none__' }] });
    } else {
      and.push({ OR: [{ leaderId: me }, { createdById: me }, { members: { some: { userId: me } } }] });
    }
    if (query.view === 'all' && !this.access.has(PERMISSIONS.SUGGESTION_MANAGE)) and.push({ status: 'PUBLISHED' });
    if (query.type) and.push({ type: query.type });
    if (query.status) and.push({ status: query.status });
    if (query.orgUnitId) {
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: query.orgUnitId } });
      and.push({ orgUnit: { path: { startsWith: unit?.path ?? '__none__' } } });
    }
    if (query.q) {
      const q = query.q;
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } }, { problem: { contains: q, mode: 'insensitive' } },
          { rootCause: { contains: q, mode: 'insensitive' } }, { afterDescription: { contains: q, mode: 'insensitive' } },
          { standardization: { contains: q, mode: 'insensitive' } }, { horizontalDeployment: { contains: q, mode: 'insensitive' } },
          { orgUnit: { name: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }
    return { AND: and };
  }

  async list(query: KaizenQuery): Promise<Paginated<KaizenListItem>> {
    const where = await this.buildWhere(query);
    const orderBy = parseSort(query.sort, ['createdAt', 'number', 'title', 'status', 'publishedAt'] as const, query.view === 'library' ? { publishedAt: 'desc' } : { createdAt: 'desc' });
    const [rows, total] = await Promise.all([
      this.prisma.db.kaizen.findMany({ where, include: listInclude, orderBy, ...pageArgs(query) }),
      this.prisma.db.kaizen.count({ where }),
    ]);
    return paginated(rows.map((r) => this.toListItem(r)), total, query);
  }

  async listAll(query: KaizenQuery): Promise<KaizenListItem[]> {
    const where = await this.buildWhere(query);
    const rows = await this.prisma.db.kaizen.findMany({ where, include: listInclude, orderBy: { number: 'desc' }, take: 10_000 });
    return rows.map((r) => this.toListItem(r));
  }

  async get(id: string): Promise<KaizenDetail> {
    const row = await this.load(id);
    const visible = await this.prisma.db.kaizen.count({ where: { AND: [{ id }, await this.visibleWhere()] } });
    if (!visible) throw new ForbiddenException();
    return this.toDetail(row, await this.leaderManagerFlag(row.leaderId));
  }

  async listActions(id: string): Promise<ActionListItem[]> {
    await this.get(id);
    return this.actions.listBySource('KAIZEN', id);
  }

  /* ------------------------------ Komutlar ------------------------------ */

  async create(dto: CreateKaizenDto): Promise<KaizenDetail> {
    const tenantId = this.ctx.tenantId;
    const me = this.ctx.userId;
    const leaderId = dto.leaderId ?? me;
    const memberIds = await this.validateUsers([leaderId, ...(dto.memberIds ?? [])]);
    if (dto.suggestionId && !(await this.prisma.db.suggestion.findUnique({ where: { id: dto.suggestionId } }))) throw new BusinessException('INVALID_SUGGESTION', 'Geçersiz öneri');
    const myEmp = await this.prisma.db.employee.findFirst({ where: { user: { id: me } }, select: { orgUnitId: true } });
    this.assertDates(dto.startDate, dto.endDate);
    const created = await this.prisma.db.$transaction(async (tx) => {
      const number = await this.sequences.next('kaizen', tx);
      return tx.kaizen.create({
        data: {
          tenantId, number, type: dto.type, title: dto.title, problem: dto.problem, rootCause: dto.rootCause ?? null,
          beforeDescription: dto.beforeDescription, afterDescription: dto.afterDescription, orgUnitId: dto.orgUnitId ?? myEmp?.orgUnitId ?? null,
          leaderId, startDate: dto.startDate ? new Date(dto.startDate) : null, endDate: dto.endDate ? new Date(dto.endDate) : null,
          suggestionId: dto.suggestionId ?? null, standardization: dto.standardization ?? null, horizontalDeployment: dto.horizontalDeployment ?? null,
          createdById: me,
          members: { create: memberIds.filter((u) => u !== leaderId).map((userId) => ({ tenantId, userId })) },
          gains: { create: (dto.gains ?? []).map((g) => this.gainData(tenantId, g)) },
        },
      });
    });
    await this.audit.log('kaizen', created.id, 'created', dto);
    return this.get(created.id);
  }

  /** Kabul edilmiş öneriden kaizen taslağı üretir (önceden doldurulmuş). */
  async createFromSuggestion(suggestionId: string, dto: ConvertToKaizenDto): Promise<KaizenDetail> {
    const s = await this.prisma.db.suggestion.findUnique({ where: { id: suggestionId }, include: { members: true, orgUnit: { select: { path: true } }, kaizens: { select: { id: true, status: true } } } });
    if (!s) throw new NotFoundException();
    const committee = await this.sAccess.committeeContext();
    if (!this.sAccess.rights(s, committee).createKaizen) throw new ForbiddenException();
    if (s.kaizens.some((k) => k.status !== 'REJECTED')) throw new BusinessException('ALREADY_CONVERTED', 'Bu öneri için zaten bir kaizen var');
    const me = this.ctx.userId;
    const leaderId = s.implementerId ?? me;
    const memberIds = [s.submittedById, ...s.members.map((m) => m.userId)].filter((u) => u !== leaderId);
    const saving = num(s.estimatedSaving);
    return this.create({
      type: dto.type ?? 'QUICK', title: s.title, problem: s.currentState, beforeDescription: s.currentState, afterDescription: s.proposedState,
      orgUnitId: s.orgUnitId, leaderId, memberIds, suggestionId: s.id,
      gains: saving ? [{ type: 'TANGIBLE', metric: 'COST_TL', description: s.expectedBenefit.slice(0, 480), annualSaving: saving }] : [],
    } as CreateKaizenDto);
  }

  async update(id: string, dto: UpdateKaizenDto): Promise<KaizenDetail> {
    const row = await this.load(id);
    if (!this.rights(row, false).edit) throw new ForbiddenException();
    const tenantId = this.ctx.tenantId;
    const { memberIds, leaderId, ...fields } = dto;
    const members = memberIds ? await this.validateUsers(memberIds) : null;
    if (leaderId) await this.validateUsers([leaderId]);
    this.assertDates(dto.startDate ?? row.startDate?.toISOString(), dto.endDate ?? row.endDate?.toISOString());
    const data: Prisma.KaizenUncheckedUpdateInput = {
      ...fields,
      startDate: dto.startDate === undefined ? undefined : dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate === undefined ? undefined : dto.endDate ? new Date(dto.endDate) : null,
      leaderId,
    };
    await this.prisma.db.$transaction(async (tx) => {
      await tx.kaizen.update({ where: { id }, data });
      if (members) {
        const lead = leaderId ?? row.leaderId;
        await tx.kaizenMember.deleteMany({ where: { kaizenId: id } });
        await tx.kaizenMember.createMany({ data: members.filter((u) => u !== lead).map((userId) => ({ tenantId, kaizenId: id, userId })) });
      }
    });
    await this.audit.log('kaizen', id, 'updated', dto);
    return this.get(id);
  }

  async submit(id: string): Promise<KaizenDetail> {
    const row = await this.load(id);
    if (!this.rights(row, false).submit) throw new ForbiddenException();
    if (!['DRAFT', 'REJECTED'].includes(row.status)) throw new BusinessException('INVALID_TRANSITION', 'Yalnız taslak/reddedilmiş kaizen gönderilebilir');
    await this.prisma.db.kaizen.update({ where: { id }, data: { status: 'SUBMITTED', rejectionReason: null } });
    await this.audit.log('kaizen', id, 'submitted');
    const leaderEmp = await this.prisma.db.employee.findFirst({ where: { user: { id: row.leaderId } }, select: { manager: { select: { user: { select: { id: true } } } } } });
    const approvers = [leaderEmp?.manager?.user?.id, ...(await this.sAccess.manageUserIds())].filter((x): x is string => !!x);
    await this.notifications.notify({
      userIds: approvers, type: 'GENERIC', title: `Kaizen onayınızı bekliyor: ${kaizenCode(row.number)} ${row.title}`, link: `/suggestions/kaizen/${id}`,
    });
    return this.get(id);
  }

  async approve(id: string, dto: KaizenDecisionDto): Promise<KaizenDetail> {
    const row = await this.load(id);
    const can = this.rights(row, await this.leaderManagerFlag(row.leaderId));
    if (!can.approve) throw new ForbiddenException();
    const now = new Date();
    await this.prisma.db.kaizen.update({
      where: { id },
      data: { status: dto.publish ? 'PUBLISHED' : 'APPROVED', approvedById: this.ctx.userId, approvedAt: now, publishedAt: dto.publish ? now : null },
    });
    await this.audit.log('kaizen', id, dto.publish ? 'approved+published' : 'approved');
    if (dto.publish) await this.awardPublish(row);
    await this.notifications.notify({ userIds: [row.leaderId], type: 'GENERIC', title: `Kaizen onaylandı: ${kaizenCode(row.number)} ${row.title}`, link: `/suggestions/kaizen/${id}` });
    return this.get(id);
  }

  async publish(id: string): Promise<KaizenDetail> {
    const row = await this.load(id);
    const can = this.rights(row, await this.leaderManagerFlag(row.leaderId));
    if (row.status !== 'APPROVED') throw new BusinessException('INVALID_TRANSITION', 'Yalnız onaylanmış kaizen yayınlanabilir');
    if (!(can.financeApprove || (await this.leaderManagerFlag(row.leaderId)) || row.approvedById === this.ctx.userId)) throw new ForbiddenException();
    await this.prisma.db.kaizen.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    await this.audit.log('kaizen', id, 'published');
    await this.awardPublish(row);
    return this.get(id);
  }

  async reject(id: string, dto: KaizenDecisionDto): Promise<KaizenDetail> {
    const row = await this.load(id);
    const can = this.rights(row, await this.leaderManagerFlag(row.leaderId));
    if (!can.approve) throw new ForbiddenException();
    const reason = dto.reason?.trim();
    if (!reason) throw new BusinessException('REASON_REQUIRED', 'Ret gerekçesi zorunludur');
    await this.prisma.db.kaizen.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: reason } });
    await this.audit.log('kaizen', id, 'rejected', { reason });
    await this.notifications.notify({ userIds: [row.leaderId], type: 'GENERIC', title: `Kaizen reddedildi: ${kaizenCode(row.number)} ${row.title}`, body: reason, link: `/suggestions/kaizen/${id}` });
    return this.get(id);
  }

  private async awardPublish(row: DetailRow) {
    const s = await this.settings.load();
    await this.points.award([row.leaderId, ...row.members.map((m) => m.userId)], 'KAIZEN_PUBLISHED', s.pointRules.kaizenPublished, 'KAIZEN', row.id);
  }

  /* ------------------------------ Kazançlar ------------------------------ */

  private gainData(tenantId: string, g: GainDto) {
    return {
      tenantId, type: g.type, metric: g.metric ?? 'OTHER', description: g.description, beforeValue: g.beforeValue ?? null, afterValue: g.afterValue ?? null,
      annualSaving: g.type === 'TANGIBLE' ? (g.annualSaving ?? null) : null,
    };
  }

  async addGain(id: string, dto: GainDto): Promise<KaizenDetail> {
    const row = await this.load(id);
    if (!this.rights(row, false).edit) throw new ForbiddenException();
    await this.prisma.db.kaizenGain.create({ data: { ...this.gainData(this.ctx.tenantId, dto), kaizenId: id } });
    return this.get(id);
  }

  async updateGain(id: string, gainId: string, dto: UpdateGainDto): Promise<KaizenDetail> {
    const row = await this.load(id);
    if (!this.rights(row, false).edit) throw new ForbiddenException();
    const gain = row.gains.find((g) => g.id === gainId);
    if (!gain) throw new NotFoundException();
    const type = dto.type ?? gain.type;
    // Değerler değişirse finans onayı düşer
    await this.prisma.db.kaizenGain.update({
      where: { id: gainId },
      data: {
        ...dto, type, annualSaving: type === 'TANGIBLE' ? dto.annualSaving : null,
        financeApproved: false, financeApprovedById: null, financeApprovedAt: null,
      },
    });
    return this.get(id);
  }

  async removeGain(id: string, gainId: string): Promise<KaizenDetail> {
    const row = await this.load(id);
    if (!this.rights(row, false).edit) throw new ForbiddenException();
    if (!row.gains.some((g) => g.id === gainId)) throw new NotFoundException();
    await this.prisma.db.kaizenGain.delete({ where: { id: gainId } });
    return this.get(id);
  }

  /** Finans doğrulaması (M7-06): suggestion.manage */
  async financeApprove(id: string, gainId: string, approved: boolean): Promise<KaizenDetail> {
    const row = await this.load(id);
    if (!this.rights(row, false).financeApprove) throw new ForbiddenException();
    const gain = row.gains.find((g) => g.id === gainId);
    if (!gain) throw new NotFoundException();
    if (approved && (gain.type !== 'TANGIBLE' || gain.annualSaving === null)) throw new BusinessException('NOT_TANGIBLE', 'Yalnız tutarı girilmiş somut kazanç onaylanabilir');
    await this.prisma.db.kaizenGain.update({
      where: { id: gainId },
      data: approved
        ? { financeApproved: true, financeApprovedById: this.ctx.userId, financeApprovedAt: new Date() }
        : { financeApproved: false, financeApprovedById: null, financeApprovedAt: null },
    });
    await this.audit.log('kaizen', id, approved ? 'gain.financeApproved' : 'gain.financeRevoked', { gainId });
    return this.get(id);
  }

  async createAction(id: string, dto: SuggestionActionDto): Promise<ActionDetail> {
    const row = await this.load(id);
    if (!this.rights(row, false).createAction) throw new ForbiddenException();
    return this.actions.create({
      title: dto.title, description: dto.description, ownerId: dto.ownerId, dueDate: dto.dueDate, priority: dto.priority, orgUnitId: row.orgUnit?.id ?? null,
      sourceType: 'KAIZEN', sourceId: id, sourceLabel: `${kaizenCode(row.number)} ${row.title}`,
    });
  }

  /* ------------------------------ Yardımcılar ------------------------------ */

  private assertDates(start?: string | null, end?: string | null) {
    if (start && end && new Date(end) < new Date(start)) throw new BusinessException('INVALID_DATES', 'Bitiş tarihi başlangıçtan önce olamaz');
  }

  private async validateUsers(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    const found = await this.prisma.db.user.count({ where: { id: { in: unique }, isActive: true } });
    if (found !== unique.length) throw new BusinessException('INVALID_USER', 'Geçersiz kullanıcı');
    return unique;
  }

  private async load(id: string): Promise<DetailRow> {
    const row = await this.prisma.db.kaizen.findUnique({ where: { id }, include: detailInclude });
    if (!row) throw new NotFoundException();
    return row;
  }

  private toListItem(r: ListRow): KaizenListItem {
    return {
      id: r.id, number: r.number, code: kaizenCode(r.number), type: r.type, title: r.title, status: r.status,
      orgUnit: r.orgUnit ? { id: r.orgUnit.id, name: r.orgUnit.name } : null, leader: r.leader,
      startDate: r.startDate?.toISOString().slice(0, 10) ?? null, endDate: r.endDate?.toISOString().slice(0, 10) ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null, suggestionId: r.suggestionId,
      totalAnnualSaving: sumSaving(r.gains, false), approvedAnnualSaving: sumSaving(r.gains, true), memberCount: r._count.members,
    };
  }

  private toDetail(r: DetailRow, isLeaderManager: boolean): KaizenDetail {
    const gains: KaizenGainDto[] = r.gains.map((g) => ({
      id: g.id, type: g.type, metric: g.metric, description: g.description, beforeValue: num(g.beforeValue), afterValue: num(g.afterValue),
      annualSaving: num(g.annualSaving), financeApproved: g.financeApproved, financeApprovedBy: g.financeApprovedBy,
      financeApprovedAt: g.financeApprovedAt?.toISOString() ?? null,
    }));
    return {
      id: r.id, number: r.number, code: kaizenCode(r.number), type: r.type, title: r.title, status: r.status,
      orgUnit: r.orgUnit ? { id: r.orgUnit.id, name: r.orgUnit.name } : null, leader: r.leader,
      startDate: r.startDate?.toISOString().slice(0, 10) ?? null, endDate: r.endDate?.toISOString().slice(0, 10) ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null, suggestionId: r.suggestionId,
      totalAnnualSaving: sumSaving(r.gains, false), approvedAnnualSaving: sumSaving(r.gains, true), memberCount: r.members.length,
      problem: r.problem, rootCause: r.rootCause, beforeDescription: r.beforeDescription, afterDescription: r.afterDescription,
      members: r.members.map((m) => m.user), gains, standardization: r.standardization, horizontalDeployment: r.horizontalDeployment,
      approvedBy: r.approvedBy, approvedAt: r.approvedAt?.toISOString() ?? null, rejectionReason: r.rejectionReason,
      suggestion: r.suggestion ? { id: r.suggestion.id, code: suggestionCode(r.suggestion.number), title: r.suggestion.title } : null,
      createdAt: r.createdAt.toISOString(),
      can: this.rights(r, isLeaderManager),
    };
  }

  private async onActionStatusChanged(e: ActionStatusChangedEvent) {
    if (e.sourceType !== 'KAIZEN' || !e.sourceId || !['DONE', 'VERIFIED'].includes(e.to)) return;
    const k = await this.prisma.db.kaizen.findUnique({ where: { id: e.sourceId } });
    if (!k) return;
    const acts = await this.prisma.db.action.findMany({ where: { sourceType: 'KAIZEN', sourceId: k.id, deletedAt: null, status: { not: 'CANCELLED' } }, select: { status: true } });
    if (!acts.length || !acts.every((a) => a.status === 'DONE' || a.status === 'VERIFIED')) return;
    await this.notifications.notify({
      userIds: [k.leaderId], type: 'GENERIC', title: `Kaizen aksiyonlarının tamamı bitti: ${kaizenCode(k.number)} ${k.title}`,
      link: `/suggestions/kaizen/${k.id}`, dedupeKey: `kaizen-actions-done:${k.id}`,
    });
  }
}
