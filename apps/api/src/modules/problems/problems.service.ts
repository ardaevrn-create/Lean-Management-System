import { ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type ActionListItem, type Paginated, type ProblemActionKind, type ProblemDetail, type ProblemGate, type ProblemListItem,
  type ProblemPhase, type ProblemReport, type ProblemsDashboardWidget, type ProblemVerificationResult,
} from '@lean/shared';
import { diffDays, startOfUtcDay, toDateOnlyString } from '../../common/dates';
import { BusinessException } from '../../common/errors';
import { pageArgs, paginated, parseSort } from '../../common/pagination';
import { RequestContext } from '../../common/request-context';
import { ActionsService } from '../../core/actions/actions.service';
import { AuditService } from '../../core/audit/audit.service';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { ActionEvents, DomainEvents, type ActionStatusChangedEvent } from '../../core/events/domain-events';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SequenceService } from '../../core/prisma/sequence.service';
import { ProblemAccessService } from './problem-access.service';
import { evaluateGate, isOpenPhase, isWhyChainComplete, nextPhase, previousPhase, problemCode, type GateInput } from './problem-rules';
import type {
  CancelProblemDto, CreateCauseDto, CreateProblemActionDto, CreateProblemDto, CreateVerificationDto, CreateWhyChainDto, HorizontalDto,
  PhaseDto, ProblemQuery, SetTeamDto, SetWhyStepsDto, UpdateCauseDto, UpdateProblemDto, UpdateWhyChainDto,
} from './problems.dto';

const userRef = { select: { id: true, fullName: true, username: true } } as const;

const listInclude = {
  orgUnit: { select: { id: true, name: true, code: true, path: true } },
  owner: userRef,
  reportedBy: userRef,
  members: { select: { userId: true } },
} satisfies Prisma.ProblemInclude;

const detailInclude = {
  orgUnit: { select: { id: true, name: true, code: true, path: true } },
  owner: userRef,
  reportedBy: userRef,
  members: { include: { user: userRef } },
  causes: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  whyChains: { include: { steps: { orderBy: { order: 'asc' } }, cause: { select: { text: true, category: true } } }, orderBy: { createdAt: 'asc' } },
  actionLinks: { orderBy: { createdAt: 'asc' } },
  verifications: { include: { verifiedBy: userRef }, orderBy: { verifiedAt: 'asc' } },
  history: { include: { user: userRef }, orderBy: { createdAt: 'desc' } },
} satisfies Prisma.ProblemInclude;

type ListRow = Prisma.ProblemGetPayload<{ include: typeof listInclude }>;
type DetailRow = Prisma.ProblemGetPayload<{ include: typeof detailInclude }>;

const PHASE_TR: Record<ProblemPhase, string> = {
  DEFINITION: 'Tanım', CONTAINMENT: 'Acil önlem', ROOT_CAUSE: 'Kök neden', ACTIONS: 'Aksiyonlar',
  VERIFICATION: 'Doğrulama', CLOSED: 'Kapandı', CANCELLED: 'İptal',
};

const GATE_MESSAGE: Record<string, string> = {
  DEFINITION_INCOMPLETE: 'Problem tanımında Ne / Nerede / Ne zaman alanları doldurulmalıdır',
  CONTAINMENT_REQUIRED: 'Acil önlem metni veya aksiyonu girilmeli ya da gerekçesiyle "acil önlem gerekmiyor" işaretlenmelidir',
  FISHBONE_REQUIRED: 'Balık kılçığında en az 2 farklı kategoride neden ve en az 1 aday neden bulunmalıdır',
  FIVE_WHY_REQUIRED: 'En az bir aday neden için tamamlanmış 5 Neden analizi (en az 3 neden + kök neden) gerekir',
  ROOT_CAUSE_UNADDRESSED: 'Tamamlanmış her kök neden için en az bir düzeltici aksiyon bağlanmalıdır',
  CORRECTIVE_REQUIRED: 'En az bir düzeltici aksiyon gereklidir',
  ACTIONS_OPEN: 'Tüm düzeltici aksiyonlar tamamlanmalı (veya iptal edilmeli)',
  VERIFICATION_REQUIRED: 'Son etkinlik doğrulaması "Etkin" olmalıdır',
};

const ACTIVE_ACTION = ['OPEN', 'IN_PROGRESS'] as const;

@Injectable()
export class ProblemsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly access: ProblemAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly sequences: SequenceService,
    private readonly actions: ActionsService,
    private readonly dashboard: DashboardService,
    private readonly events: DomainEvents,
  ) {}

  onModuleInit() {
    this.dashboard.registerWidget('problems', () => this.dashboardWidget());
    this.events.on<ActionStatusChangedEvent>(ActionEvents.StatusChanged, (e) => this.onActionStatusChanged(e));
  }

  /* ------------------------------ Sorgular ------------------------------ */

  async list(query: ProblemQuery): Promise<Paginated<ProblemListItem>> {
    const where = await this.buildWhere(query);
    const orderBy = parseSort(query.sort, ['createdAt', 'number', 'targetCloseDate', 'title', 'phase'] as const, { createdAt: 'desc' });
    const [rows, total] = await Promise.all([
      this.prisma.db.problem.findMany({ where, include: listInclude, orderBy, ...pageArgs(query) }),
      this.prisma.db.problem.count({ where }),
    ]);
    return paginated(await this.toListItems(rows), total, query);
  }

  async listAll(query: ProblemQuery): Promise<ProblemListItem[]> {
    const where = await this.buildWhere(query);
    const rows = await this.prisma.db.problem.findMany({ where, include: listInclude, orderBy: { createdAt: 'desc' }, take: 10_000 });
    return this.toListItems(rows);
  }

  async get(id: string): Promise<ProblemDetail> {
    const row = await this.load(id);
    if (!this.access.rights(row).view) throw new ForbiddenException();
    return this.toDetail(row);
  }

  async report(id: string): Promise<ProblemReport> {
    const problem = await this.get(id);
    const tenant = await this.prisma.raw.tenant.findUnique({ where: { id: this.ctx.tenantId }, select: { name: true } });
    return {
      problem,
      generatedAt: new Date().toISOString(),
      company: tenant?.name ?? '',
      team: [{ user: problem.owner, role: 'LEADER' }, ...problem.members.map((m) => ({ user: m.user, role: m.role }))],
    };
  }

  /* ------------------------------ Komutlar ------------------------------ */

  async create(dto: CreateProblemDto): Promise<ProblemDetail> {
    const tenantId = this.ctx.tenantId;
    const userId = this.ctx.userId;
    let orgUnitId = dto.orgUnitId ?? null;
    if (!orgUnitId) {
      const me = await this.prisma.db.user.findUnique({ where: { id: userId }, select: { employee: { select: { orgUnitId: true } } } });
      orgUnitId = me?.employee?.orgUnitId ?? null;
      if (!orgUnitId) throw new BusinessException('ORG_UNIT_REQUIRED', 'Problemin bildirildiği alan/birim seçilmelidir');
    }
    const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: orgUnitId }, select: { id: true } });
    if (!unit) throw new BusinessException('INVALID_ORG_UNIT', 'Birim bulunamadı');
    const ownerId = await this.defaultOwner(orgUnitId, userId);

    const created = await this.prisma.db.$transaction(async (tx) => {
      const number = await this.sequences.next('problem', tx);
      return tx.problem.create({
        data: {
          tenantId, number, title: dto.title.trim(), description: dto.description?.trim() || null,
          source: dto.source ?? 'OTHER', sourceId: dto.sourceId ?? null, sourceLabel: dto.sourceLabel ?? null,
          orgUnitId, severity: dto.severity ?? 'MEDIUM', ownerId, reportedById: userId,
          history: { create: { tenantId, userId, fromPhase: null, toPhase: 'DEFINITION', note: 'Problem bildirildi' } },
        },
      });
    });
    await this.audit.log('problem', created.id, 'created', dto);
    await this.notifications.notify({
      userIds: [ownerId],
      type: 'GENERIC',
      title: `Yeni problem bildirimi: ${problemCode(created.number)} ${created.title}`,
      body: dto.description,
      link: `/problems/${created.id}`,
    });
    return this.toDetail(await this.load(created.id));
  }

  async update(id: string, dto: UpdateProblemDto): Promise<ProblemDetail> {
    const row = await this.loadEditable(id);
    const rights = this.access.rights(row);
    if (dto.ownerId !== undefined && dto.ownerId !== row.ownerId) {
      if (!rights.close) throw new ForbiddenException();
      await this.assertActiveUsers([dto.ownerId]);
    }
    if (dto.orgUnitId !== undefined && dto.orgUnitId !== row.orgUnitId) {
      if (!rights.close) throw new ForbiddenException();
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: dto.orgUnitId }, select: { id: true } });
      if (!unit) throw new BusinessException('INVALID_ORG_UNIT', 'Birim bulunamadı');
    }
    const data: Prisma.ProblemUncheckedUpdateInput = {};
    const plain = [
      'title', 'description', 'severity', 'method', 'source', 'orgUnitId', 'ownerId', 'what', 'whereText', 'who', 'how', 'howMuch', 'isNot',
      'customerName', 'customerRef', 'containment', 'containmentNotNeeded', 'containmentSkipReason',
    ] as const;
    for (const key of plain) if (dto[key] !== undefined) (data as Record<string, unknown>)[key] = dto[key];
    if (dto.occurredAt !== undefined) data.occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : null;
    if (dto.targetCloseDate !== undefined) data.targetCloseDate = dto.targetCloseDate ? startOfUtcDay(new Date(dto.targetCloseDate)) : null;
    if (dto.verificationDate !== undefined) data.verificationDate = dto.verificationDate ? startOfUtcDay(new Date(dto.verificationDate)) : null;
    if (dto.costImpact !== undefined) data.costImpact = dto.costImpact === null ? null : new Prisma.Decimal(dto.costImpact);

    await this.prisma.db.problem.update({ where: { id }, data });
    await this.audit.log('problem', id, 'updated', dto);
    if (dto.ownerId && dto.ownerId !== row.ownerId) {
      await this.notifications.notify({
        userIds: [dto.ownerId], type: 'GENERIC', title: `Problem size atandı: ${problemCode(row.number)} ${row.title}`, link: `/problems/${id}`,
      });
    }
    return this.toDetail(await this.load(id));
  }

  async setTeam(id: string, dto: SetTeamDto): Promise<ProblemDetail> {
    const row = await this.loadEditable(id);
    const members = [...new Map(dto.members.filter((m) => m.userId !== row.ownerId).map((m) => [m.userId, m])).values()];
    await this.assertActiveUsers(members.map((m) => m.userId));
    const before = new Set(row.members.map((m) => m.userId));
    await this.prisma.db.$transaction([
      this.prisma.db.problemMember.deleteMany({ where: { problemId: id } }),
      this.prisma.db.problemMember.createMany({
        data: members.map((m) => ({ tenantId: this.ctx.tenantId, problemId: id, userId: m.userId, role: m.role ?? null })),
      }),
    ]);
    await this.audit.log('problem', id, 'teamChanged', { members });
    await this.notifications.notify({
      userIds: members.map((m) => m.userId).filter((u) => !before.has(u)),
      type: 'GENERIC', title: `Problem ekibine eklendiniz: ${problemCode(row.number)} ${row.title}`, link: `/problems/${id}`,
    });
    return this.toDetail(await this.load(id));
  }

  /* ---- Balık kılçığı ---- */

  async createCause(id: string, dto: CreateCauseDto): Promise<ProblemDetail> {
    const row = await this.loadEditable(id);
    let category = dto.category;
    if (dto.parentId) {
      const parent = row.causes.find((c) => c.id === dto.parentId);
      if (!parent) throw new BusinessException('INVALID_PARENT', 'Üst neden bulunamadı');
      category = parent.category;
    }
    const siblings = row.causes.filter((c) => c.category === category && (c.parentId ?? null) === (dto.parentId ?? null));
    await this.prisma.db.problemCause.create({
      data: {
        tenantId: this.ctx.tenantId, problemId: id, category, text: dto.text.trim(), parentId: dto.parentId ?? null,
        isCandidate: dto.isCandidate ?? false, sortOrder: siblings.reduce((m, c) => Math.max(m, c.sortOrder + 1), 0),
      },
    });
    await this.audit.log('problem', id, 'cause.added', { category, text: dto.text });
    return this.toDetail(await this.load(id));
  }

  async updateCause(id: string, causeId: string, dto: UpdateCauseDto): Promise<ProblemDetail> {
    const row = await this.loadEditable(id);
    const cause = row.causes.find((c) => c.id === causeId);
    if (!cause) throw new NotFoundException('Cause not found');
    const data: Prisma.ProblemCauseUncheckedUpdateInput = {};
    if (dto.text !== undefined) data.text = dto.text.trim();
    if (dto.isCandidate !== undefined) data.isCandidate = dto.isCandidate;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.category !== undefined && !cause.parentId) data.category = dto.category;
    await this.prisma.db.$transaction(async (tx) => {
      await tx.problemCause.update({ where: { id: causeId }, data });
      if (dto.category !== undefined && !cause.parentId && dto.category !== cause.category) {
        await tx.problemCause.updateMany({ where: { problemId: id, parentId: causeId }, data: { category: dto.category } });
      }
      // Adaylıktan çıkarılan nedenin 5 Neden zinciri silinir (bağlı aksiyonların kök neden bağı kalkar)
      if (dto.isCandidate === false) await tx.problemWhyChain.deleteMany({ where: { causeId } });
    });
    await this.audit.log('problem', id, 'cause.updated', { causeId, ...dto });
    return this.toDetail(await this.load(id));
  }

  async deleteCause(id: string, causeId: string): Promise<ProblemDetail> {
    const row = await this.loadEditable(id);
    if (!row.causes.some((c) => c.id === causeId)) throw new NotFoundException('Cause not found');
    await this.prisma.db.problemCause.delete({ where: { id: causeId } });
    await this.audit.log('problem', id, 'cause.removed', { causeId });
    return this.toDetail(await this.load(id));
  }

  /* ---- 5 Neden ---- */

  async createWhyChain(id: string, dto: CreateWhyChainDto): Promise<ProblemDetail> {
    const row = await this.loadEditable(id);
    const cause = row.causes.find((c) => c.id === dto.causeId);
    if (!cause) throw new NotFoundException('Cause not found');
    if (!cause.isCandidate) throw new BusinessException('NOT_CANDIDATE', '5 Neden analizi yalnızca aday nedenler için yapılır');
    if (!row.whyChains.some((c) => c.causeId === cause.id)) {
      await this.prisma.db.problemWhyChain.create({ data: { tenantId: this.ctx.tenantId, problemId: id, causeId: cause.id } });
    }
    return this.toDetail(await this.load(id));
  }

  async updateWhyChain(id: string, chainId: string, dto: UpdateWhyChainDto): Promise<ProblemDetail> {
    const row = await this.loadEditable(id);
    this.chainOf(row, chainId);
    await this.prisma.db.problemWhyChain.update({
      where: { id: chainId },
      data: { rootCause: dto.rootCause === undefined ? undefined : dto.rootCause?.trim() || null, confirmed: dto.confirmed },
    });
    await this.audit.log('problem', id, 'whyChain.updated', { chainId, ...dto });
    return this.toDetail(await this.load(id));
  }

  async setWhySteps(id: string, chainId: string, dto: SetWhyStepsDto): Promise<ProblemDetail> {
    const row = await this.loadEditable(id);
    this.chainOf(row, chainId);
    const tenantId = this.ctx.tenantId;
    await this.prisma.db.$transaction([
      this.prisma.db.problemWhyStep.deleteMany({ where: { chainId } }),
      this.prisma.db.problemWhyStep.createMany({
        data: dto.steps.map((s, i) => ({ tenantId, chainId, order: i + 1, question: s.question?.trim() || null, answer: s.answer.trim() })),
      }),
      this.prisma.db.problemWhyChain.update({ where: { id: chainId }, data: { updatedAt: new Date() } }),
    ]);
    await this.audit.log('problem', id, 'whyChain.stepsSet', { chainId, count: dto.steps.length });
    return this.toDetail(await this.load(id));
  }

  async deleteWhyChain(id: string, chainId: string): Promise<ProblemDetail> {
    const row = await this.loadEditable(id);
    this.chainOf(row, chainId);
    await this.prisma.db.problemWhyChain.delete({ where: { id: chainId } });
    await this.audit.log('problem', id, 'whyChain.removed', { chainId });
    return this.toDetail(await this.load(id));
  }

  /* ---- Aksiyonlar ---- */

  async createAction(id: string, dto: CreateProblemActionDto): Promise<ProblemDetail> {
    const row = await this.loadEditable(id);
    await this.addAction(row, dto.kind, dto.rootCauseChainId ?? null, {
      title: dto.title, description: dto.description, ownerId: dto.ownerId, dueDate: dto.dueDate, startDate: dto.startDate,
      priority: dto.priority, supporterIds: dto.supporterIds,
      orgUnitId: dto.kind === 'HORIZONTAL' ? dto.orgUnitId ?? row.orgUnitId : row.orgUnitId,
    });
    return this.toDetail(await this.load(id));
  }

  /** Yatay yaygınlaştırma: seçilen her birim için bir HORIZONTAL aksiyon açar (sorumlu: birim yöneticisi, yoksa verilen sorumlu). */
  async createHorizontal(id: string, dto: HorizontalDto): Promise<ProblemDetail> {
    const row = await this.loadEditable(id);
    const unitIds = [...new Set(dto.orgUnitIds)];
    if (!unitIds.length) throw new BusinessException('INVALID_ORG_UNIT', 'En az bir birim seçilmelidir');
    const units = await this.prisma.db.orgUnit.findMany({ where: { id: { in: unitIds } }, select: { id: true, name: true, managerEmployeeId: true } });
    if (units.length !== unitIds.length) throw new BusinessException('INVALID_ORG_UNIT', 'Birim bulunamadı');
    for (const unit of units) {
      const manager = unit.managerEmployeeId
        ? await this.prisma.db.user.findFirst({ where: { employeeId: unit.managerEmployeeId, isActive: true }, select: { id: true } })
        : null;
      await this.addAction(row, 'HORIZONTAL', dto.rootCauseChainId ?? null, {
        title: dto.title, description: dto.description, ownerId: manager?.id ?? dto.ownerId, dueDate: dto.dueDate,
        priority: dto.priority, orgUnitId: unit.id,
      });
    }
    return this.toDetail(await this.load(id));
  }

  private async addAction(
    row: DetailRow, kind: ProblemActionKind, chainId: string | null,
    input: { title: string; description?: string; ownerId: string; dueDate: string; startDate?: string; priority?: CreateProblemActionDto['priority']; supporterIds?: string[]; orgUnitId: string },
  ) {
    if (chainId && !row.whyChains.some((c) => c.id === chainId)) throw new BusinessException('INVALID_CHAIN', '5 Neden zinciri bulunamadı');
    const action = await this.actions.create({
      ...input, sourceType: 'PROBLEM', sourceId: row.id, sourceLabel: `${problemCode(row.number)} ${row.title}`.slice(0, 300),
    });
    await this.prisma.db.problemAction.create({
      data: { tenantId: this.ctx.tenantId, problemId: row.id, actionId: action.id, kind, rootCauseChainId: chainId },
    });
    await this.audit.log('problem', row.id, 'action.added', { actionId: action.id, kind });
    return action;
  }

  /* ---- Faz geçişi / doğrulama / iptal ---- */

  async changePhase(id: string, dto: PhaseDto): Promise<ProblemDetail> {
    const row = await this.load(id);
    const rights = this.access.rights(row);
    if (!rights.view) throw new ForbiddenException();
    if (row.phase === 'CANCELLED') throw new BusinessException('PROBLEM_LOCKED', 'İptal edilen problem değiştirilemez');
    const from = row.phase;
    const to = dto.to;

    if (to === nextPhase(from)) {
      if (!(to === 'CLOSED' ? rights.close : rights.edit)) throw new ForbiddenException();
      const gate = await this.gateFor(row);
      if (!gate.canAdvance) {
        throw new BusinessException(gate.missing[0], GATE_MESSAGE[gate.missing[0]], { missing: gate.missing });
      }
    } else if (to === previousPhase(from) || (from === 'CLOSED' && to === 'VERIFICATION')) {
      if (!rights.close) throw new ForbiddenException();
    } else {
      throw new BusinessException('INVALID_TRANSITION', `${from} → ${to} geçişi yapılamaz`);
    }

    await this.moveTo(row, to, dto.note ?? null);
    return this.toDetail(await this.load(id));
  }

  async addVerification(id: string, dto: CreateVerificationDto): Promise<ProblemDetail> {
    const row = await this.loadEditable(id);
    if (row.phase !== 'VERIFICATION') throw new BusinessException('INVALID_PHASE', 'Etkinlik doğrulaması yalnızca Doğrulama aşamasında girilir');
    const tenantId = this.ctx.tenantId;
    await this.prisma.db.problemVerification.create({
      data: {
        tenantId, problemId: id, result: dto.result, note: dto.note?.trim() || null, verifiedById: this.ctx.userId,
        plannedDate: dto.plannedDate ? startOfUtcDay(new Date(dto.plannedDate)) : row.verificationDate,
      },
    });
    await this.audit.log('problem', id, 'verification.added', dto);
    const code = `${problemCode(row.number)} ${row.title}`;
    if (dto.result === 'NOT_EFFECTIVE') {
      await this.moveTo(row, 'ROOT_CAUSE', `Etkinlik doğrulaması başarısız${dto.note ? `: ${dto.note}` : ''}`, true);
    } else {
      await this.notifications.notify({
        userIds: [row.ownerId], type: 'GENERIC', title: `Doğrulama etkin: ${code}`, body: 'Problem kapatılabilir.', link: `/problems/${id}`,
      });
    }
    return this.toDetail(await this.load(id));
  }

  async cancel(id: string, dto: CancelProblemDto): Promise<ProblemDetail> {
    const row = await this.load(id);
    const rights = this.access.rights(row);
    if (!rights.view) throw new ForbiddenException();
    if (!rights.close) throw new ForbiddenException();
    if (!isOpenPhase(row.phase)) throw new BusinessException('PROBLEM_LOCKED', 'Kapanmış veya iptal edilmiş problem iptal edilemez');
    await this.prisma.db.problem.update({ where: { id }, data: { cancelReason: dto.reason.trim() } });
    await this.moveTo(row, 'CANCELLED', dto.reason.trim());
    return this.toDetail(await this.load(id));
  }

  /** Fazı değiştirir; geçmiş, denetim izi ve bildirim yazar. */
  private async moveTo(row: DetailRow, to: ProblemPhase, note: string | null, system = false) {
    const from = row.phase;
    const data: Prisma.ProblemUncheckedUpdateInput = { phase: to };
    if (to === 'CLOSED') data.closedAt = new Date();
    if (from === 'CLOSED') data.closedAt = null;
    await this.prisma.db.$transaction([
      this.prisma.db.problem.update({ where: { id: row.id }, data }),
      this.prisma.db.problemHistory.create({
        data: { tenantId: this.ctx.tenantId, problemId: row.id, fromPhase: from, toPhase: to, userId: this.ctx.userId, note },
      }),
    ]);
    await this.audit.log('problem', row.id, 'phaseChanged', { from, to, note, automatic: system || undefined });
    await this.notifications.notify({
      userIds: [row.ownerId, ...row.members.map((m) => m.userId), row.reportedById],
      type: 'GENERIC',
      title: `${problemCode(row.number)} ${row.title}: ${PHASE_TR[from]} → ${PHASE_TR[to]}`,
      body: note ?? undefined,
      link: `/problems/${row.id}`,
    });
  }

  /* ------------------------------ Olaylar / pano ------------------------------ */

  /** Problem aksiyonu değişince: tüm düzeltici aksiyonlar bittiyse sahibine "Doğrulamaya hazır" bildirimi. */
  private async onActionStatusChanged(e: ActionStatusChangedEvent) {
    if (e.sourceType !== 'PROBLEM' || !e.sourceId) return;
    const row = await this.prisma.db.problem.findFirst({ where: { id: e.sourceId, deletedAt: null }, include: detailInclude });
    if (!row || row.phase !== 'ACTIONS') return;
    const gate = await this.gateFor(row);
    if (!gate.canAdvance) return;
    await this.notifications.notify({
      userIds: [row.ownerId],
      type: 'GENERIC',
      title: `Doğrulamaya hazır: ${problemCode(row.number)} ${row.title}`,
      body: 'Tüm düzeltici aksiyonlar tamamlandı.',
      link: `/problems/${row.id}`,
      dedupeKey: `problem-verification-ready:${row.id}:${e.actionId}:${e.to}`,
    });
  }

  async dashboardWidget(): Promise<ProblemsDashboardWidget> {
    const where: Prisma.ProblemWhereInput = { AND: [{ deletedAt: null, phase: { notIn: ['CLOSED', 'CANCELLED'] } }, this.access.workingOnWhere()] };
    const today = startOfUtcDay();
    const [myOpen, overdue, awaitingVerification] = await Promise.all([
      this.prisma.db.problem.count({ where }),
      this.prisma.db.problem.count({ where: { AND: [where, { targetCloseDate: { lt: today } }] } }),
      this.prisma.db.problem.count({ where: { AND: [where, { phase: 'VERIFICATION' }] } }),
    ]);
    return { myOpen, overdue, awaitingVerification };
  }

  /* ------------------------------ Yardımcılar ------------------------------ */

  private async buildWhere(query: ProblemQuery): Promise<Prisma.ProblemWhereInput> {
    const and: Prisma.ProblemWhereInput[] = [{ deletedAt: null }];
    and.push(query.view === 'all' ? this.access.visibleWhere() : this.access.mineWhere());
    if (query.phase?.length) and.push({ phase: { in: query.phase } });
    if (query.source) and.push({ source: query.source });
    if (query.severity) and.push({ severity: query.severity });
    if (query.open) and.push({ phase: { notIn: ['CLOSED', 'CANCELLED'] } });
    if (query.overdue) and.push({ phase: { notIn: ['CLOSED', 'CANCELLED'] }, targetCloseDate: { lt: startOfUtcDay() } });
    if (query.orgUnitId) {
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: query.orgUnitId }, select: { path: true } });
      and.push({ orgUnit: { path: { startsWith: unit?.path ?? '__none__' } } });
    }
    const q = query.q?.trim();
    if (q) {
      const num = /^(prb-?)?(\d+)$/i.exec(q);
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          ...(num ? [{ number: Number(num[2]) }] : []),
        ],
      });
    }
    return { AND: and };
  }

  private async load(id: string): Promise<DetailRow> {
    const row = await this.prisma.db.problem.findFirst({ where: { id, deletedAt: null }, include: detailInclude });
    if (!row) throw new NotFoundException('Problem not found');
    return row;
  }

  /** Düzenleme hakkı olan, açık (kapanmamış/iptal edilmemiş) problem. */
  private async loadEditable(id: string): Promise<DetailRow> {
    const row = await this.load(id);
    const rights = this.access.rights(row);
    if (!rights.view) throw new ForbiddenException();
    if (!rights.edit) throw new ForbiddenException();
    if (!isOpenPhase(row.phase)) throw new BusinessException('PROBLEM_LOCKED', 'Kapanmış veya iptal edilmiş problem düzenlenemez');
    return row;
  }

  private chainOf(row: DetailRow, chainId: string) {
    const chain = row.whyChains.find((c) => c.id === chainId);
    if (!chain) throw new NotFoundException('Why chain not found');
    return chain;
  }

  private async assertActiveUsers(ids: string[]) {
    const unique = [...new Set(ids)];
    const count = await this.prisma.db.user.count({ where: { id: { in: unique }, isActive: true } });
    if (count !== unique.length) throw new BusinessException('INVALID_USER', 'Kullanıcı bulunamadı ya da pasif');
  }

  /** Yeni bildirimin sahibi: birim yöneticisi, yoksa bildirenin yöneticisi, yoksa bildiren. */
  private async defaultOwner(orgUnitId: string, reporterId: string): Promise<string> {
    const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: orgUnitId }, select: { managerEmployeeId: true } });
    const activeUserOf = async (employeeId: string | null | undefined) => {
      if (!employeeId) return null;
      const u = await this.prisma.db.user.findFirst({ where: { employeeId, isActive: true }, select: { id: true } });
      return u?.id ?? null;
    };
    const unitManager = await activeUserOf(unit?.managerEmployeeId);
    if (unitManager) return unitManager;
    const reporter = await this.prisma.db.user.findUnique({ where: { id: reporterId }, select: { employee: { select: { managerId: true } } } });
    return (await activeUserOf(reporter?.employee?.managerId)) ?? reporterId;
  }

  /** Faz geçiş kontrol listesi. */
  private async gateFor(row: DetailRow, actionItems?: ActionListItem[]): Promise<ProblemGate> {
    const items = actionItems ?? (await this.actions.listBySource('PROBLEM', row.id));
    const status = new Map(items.map((a) => [a.id, a.status]));
    const links = row.actionLinks.filter((l) => status.has(l.actionId));
    const live = (kind: ProblemActionKind) => links.filter((l) => l.kind === kind);
    const correctives = live('CORRECTIVE');
    const latest = row.verifications.length ? row.verifications[row.verifications.length - 1] : null;
    const input: GateInput = {
      phase: row.phase,
      what: row.what, whereText: row.whereText, occurredAt: row.occurredAt,
      containment: row.containment, containmentNotNeeded: row.containmentNotNeeded, containmentSkipReason: row.containmentSkipReason,
      containmentActionCount: live('CONTAINMENT').filter((l) => status.get(l.actionId) !== 'CANCELLED').length,
      causes: row.causes.map((c) => ({ id: c.id, category: c.category, isCandidate: c.isCandidate })),
      chains: row.whyChains.map((c) => ({
        causeId: c.causeId,
        complete: isWhyChainComplete(c),
        correctiveCount: correctives.filter((l) => l.rootCauseChainId === c.id && status.get(l.actionId) !== 'CANCELLED').length,
      })),
      correctiveStatuses: correctives.map((l) => status.get(l.actionId) as string),
      latestVerification: (latest?.result as ProblemVerificationResult | undefined) ?? null,
    };
    const g = evaluateGate(input);
    return { nextPhase: g.nextPhase, canAdvance: g.canAdvance, missing: g.missing };
  }

  private async toListItems(rows: ListRow[]): Promise<ProblemListItem[]> {
    const open = rows.length
      ? await this.prisma.db.action.groupBy({
          by: ['sourceId'], where: { sourceType: 'PROBLEM', sourceId: { in: rows.map((r) => r.id) }, deletedAt: null, status: { in: [...ACTIVE_ACTION] } }, _count: true,
        })
      : [];
    const openBy = new Map(open.map((o) => [o.sourceId, o._count]));
    return rows.map((r) => this.toListItem(r, openBy.get(r.id) ?? 0));
  }

  private overdueInfo(phase: ProblemPhase, target: Date | null) {
    const today = startOfUtcDay();
    const overdue = isOpenPhase(phase) && !!target && target < today;
    return { overdue, overdueDays: overdue ? diffDays(today, target!) : 0 };
  }

  private toListItem(r: ListRow, openActionCount: number): ProblemListItem {
    return {
      id: r.id, number: r.number, code: problemCode(r.number), title: r.title,
      source: r.source, severity: r.severity, method: r.method, phase: r.phase,
      orgUnit: { id: r.orgUnit.id, name: r.orgUnit.name, code: r.orgUnit.code },
      owner: r.owner, reportedBy: r.reportedBy,
      targetCloseDate: toDateOnlyString(r.targetCloseDate), closedAt: r.closedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(),
      ...this.overdueInfo(r.phase, r.targetCloseDate),
      openActionCount,
    };
  }

  private async toDetail(r: DetailRow): Promise<ProblemDetail> {
    const actionItems = await this.actions.listBySource('PROBLEM', r.id);
    const byId = new Map(actionItems.map((a) => [a.id, a]));
    const rights = this.access.rights(r);
    const gate = await this.gateFor(r, actionItems);
    const open = isOpenPhase(r.phase);
    const correctives = r.actionLinks.filter((l) => l.kind === 'CORRECTIVE');
    const chains = r.whyChains.map((c) => ({
      id: c.id, causeId: c.causeId, causeText: c.cause.text, causeCategory: c.cause.category,
      rootCause: c.rootCause, confirmed: c.confirmed,
      steps: c.steps.map((s) => ({ id: s.id, order: s.order, question: s.question, answer: s.answer })),
      complete: isWhyChainComplete(c),
      actionCount: correctives.filter((l) => l.rootCauseChainId === c.id && byId.get(l.actionId)?.status !== 'CANCELLED' && byId.has(l.actionId)).length,
    }));
    return {
      id: r.id, number: r.number, code: problemCode(r.number), title: r.title, description: r.description,
      source: r.source, sourceId: r.sourceId, sourceLabel: r.sourceLabel, severity: r.severity, method: r.method, phase: r.phase,
      orgUnit: { id: r.orgUnit.id, name: r.orgUnit.name, code: r.orgUnit.code },
      owner: r.owner, reportedBy: r.reportedBy,
      what: r.what, whereText: r.whereText, occurredAt: r.occurredAt?.toISOString() ?? null, who: r.who, how: r.how, howMuch: r.howMuch, isNot: r.isNot,
      customerName: r.customerName, customerRef: r.customerRef, costImpact: r.costImpact === null ? null : Number(r.costImpact),
      containment: r.containment, containmentNotNeeded: r.containmentNotNeeded, containmentSkipReason: r.containmentSkipReason,
      targetCloseDate: toDateOnlyString(r.targetCloseDate), verificationDate: toDateOnlyString(r.verificationDate),
      closedAt: r.closedAt?.toISOString() ?? null, cancelReason: r.cancelReason, createdAt: r.createdAt.toISOString(),
      ...this.overdueInfo(r.phase, r.targetCloseDate),
      members: r.members.map((m) => ({ userId: m.userId, user: m.user, role: m.role })),
      causes: r.causes.map((c) => ({ id: c.id, category: c.category, text: c.text, parentId: c.parentId, isCandidate: c.isCandidate, sortOrder: c.sortOrder })),
      whyChains: chains,
      actions: r.actionLinks
        .filter((l) => byId.has(l.actionId))
        .map((l) => ({ kind: l.kind, rootCauseChainId: l.rootCauseChainId, action: byId.get(l.actionId)! })),
      verifications: r.verifications.map((v) => ({
        id: v.id, plannedDate: toDateOnlyString(v.plannedDate), result: v.result, note: v.note, verifiedBy: v.verifiedBy, verifiedAt: v.verifiedAt.toISOString(),
      })),
      history: r.history.map((h) => ({
        id: h.id, fromPhase: h.fromPhase, toPhase: h.toPhase, user: h.user, note: h.note, createdAt: h.createdAt.toISOString(),
      })),
      gate,
      can: {
        edit: rights.edit && open,
        advance: open && (gate.nextPhase === 'CLOSED' ? rights.close : rights.edit),
        back: rights.close && r.phase !== 'CANCELLED' && (previousPhase(r.phase) !== null || r.phase === 'CLOSED'),
        close: rights.close && open,
        cancel: rights.close && open,
        manage: rights.manage,
      },
    };
  }
}
