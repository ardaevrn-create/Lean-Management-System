import { ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MAX_SERIES_MEETINGS, PERMISSIONS,
  type ActionDetail, type ActionListItem, type MeetingAgendaItemDto, type MeetingCarriedAction, type MeetingDecisionItem, type MeetingDetail,
  type MeetingListItem, type MeetingParticipantRole, type MeetingsDashboardWidget, type Paginated,
} from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { pageArgs, paginated, parseSort } from '../../common/pagination';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../../core/auth/access.service';
import { AuditService } from '../../core/audit/audit.service';
import { ActionsService } from '../../core/actions/actions.service';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService, type TenantTx } from '../../core/prisma/prisma.service';
import { SequenceService } from '../../core/prisma/sequence.service';
import { MeetingAccessService } from './meeting-access.service';
import {
  attendanceRate, buildIcs, formatDateTimeTr, formatDateTr, generateOccurrences, meetingCode, zonedDayRange,
} from './meeting-rules';
import type {
  AgendaItemInputDto, CreateDecisionDto, CreateMeetingActionDto, CreateMeetingDto, CreateSeriesDto, MeetingQuery, ParticipantInputDto,
  SetAttendanceDto, UpdateAgendaItemDto, UpdateDecisionDto, UpdateMeetingDto,
} from './meetings.dto';

const userRef = { select: { id: true, fullName: true, username: true } } as const;
const typeRef = { select: { id: true, name: true, code: true, category: true, tier: true, facilitatorId: true } } as const;

const listInclude = {
  type: typeRef,
  organizer: userRef,
  orgUnit: { select: { id: true, name: true, code: true, path: true } },
  _count: { select: { participants: true } },
} satisfies Prisma.MeetingInclude;

const detailInclude = {
  type: { select: { ...typeRef.select, facilitator: userRef } },
  organizer: userRef,
  createdBy: userRef,
  orgUnit: { select: { id: true, name: true, code: true, path: true } },
  participants: { include: { user: userRef } },
  agendaItems: { include: { presenter: userRef }, orderBy: { sortOrder: 'asc' } },
  decisions: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.MeetingInclude;

type ListRow = Prisma.MeetingGetPayload<{ include: typeof listInclude }> & { participants?: { id: string }[] };
type DetailRow = Prisma.MeetingGetPayload<{ include: typeof detailInclude }>;

const ROLE_ORDER: Record<MeetingParticipantRole, number> = { ORGANIZER: 0, PARTICIPANT: 1, OPTIONAL: 2, GUEST: 3 };
const ACTIVE_ACTION = ['OPEN', 'IN_PROGRESS'] as const;

interface ResolvedBase {
  typeId: string | null;
  title: string;
  location: string | null;
  onlineUrl: string | null;
  organizerId: string;
  orgUnitId: string | null;
  durationMin: number;
  guests: string[];
  participants: { userId: string; role: MeetingParticipantRole }[];
  agenda: { title: string; description: string | null; durationMin: number | null }[];
}

@Injectable()
export class MeetingsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly access: AccessService,
    private readonly meetingAccess: MeetingAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly sequences: SequenceService,
    private readonly actions: ActionsService,
    private readonly dashboard: DashboardService,
  ) {}

  onModuleInit() {
    this.dashboard.registerWidget('meetings', () => this.dashboardWidget());
  }

  /* ------------------------------ Sorgular ------------------------------ */

  async list(query: MeetingQuery): Promise<Paginated<MeetingListItem>> {
    const where = await this.buildWhere(query);
    const orderBy = parseSort(query.sort, ['startAt', 'createdAt', 'number', 'title', 'status'] as const, { startAt: 'desc' });
    const [rows, total] = await Promise.all([
      this.prisma.db.meeting.findMany({ where, include: this.listIncludeForMe(), orderBy, ...pageArgs(query) }),
      this.prisma.db.meeting.count({ where }),
    ]);
    return paginated(await this.toListItems(rows), total, query);
  }

  async listAll(query: MeetingQuery): Promise<MeetingListItem[]> {
    const where = await this.buildWhere(query);
    const rows = await this.prisma.db.meeting.findMany({ where, include: this.listIncludeForMe(), orderBy: { startAt: 'desc' }, take: 10_000 });
    return this.toListItems(rows);
  }

  async get(id: string): Promise<MeetingDetail> {
    const row = await this.load(id);
    if (!this.meetingAccess.rights(row).view) throw new ForbiddenException();
    return this.toDetail(row);
  }

  async listActions(id: string): Promise<ActionListItem[]> {
    const row = await this.loadViewable(id);
    return this.actions.listBySource('MEETING', row.id);
  }

  /**
   * Önceki toplantılardan devreden aksiyonlar (M4-06): aynı tipteki (tipsizse aynı serideki) önceki toplantılarda açılmış;
   * hâlâ açık / doğrulama bekleyen ya da önceki toplantıdan bu yana kapanmış aksiyonlar.
   */
  async carriedActions(id: string): Promise<MeetingCarriedAction[]> {
    const meeting = await this.loadViewable(id);
    const lineage: Prisma.MeetingWhereInput | null = meeting.typeId ? { typeId: meeting.typeId } : meeting.seriesId ? { seriesId: meeting.seriesId } : null;
    if (!lineage) return [];

    const earlier = await this.prisma.db.meeting.findMany({
      where: { AND: [lineage, { deletedAt: null, status: { not: 'CANCELLED' }, startAt: { lt: meeting.startAt }, id: { not: meeting.id } }] },
      select: { id: true, number: true, title: true, startAt: true },
      orderBy: { startAt: 'desc' },
    });
    if (!earlier.length) return [];
    const previous = earlier[0];
    const byId = new Map(earlier.map((m) => [m.id, m]));

    const closedSince = await this.prisma.db.action.findMany({
      where: {
        sourceType: 'MEETING', sourceId: { in: earlier.map((m) => m.id) }, deletedAt: null,
        status: { in: ['VERIFIED', 'CANCELLED'] }, updatedAt: { gte: previous.startAt },
      },
      select: { id: true },
    });
    const closedIds = new Set(closedSince.map((a) => a.id));

    const all = await this.actions.listBySource('MEETING', earlier.map((m) => m.id));
    return all
      .filter((a) => ['OPEN', 'IN_PROGRESS', 'DONE'].includes(a.status) || closedIds.has(a.id))
      .map((a) => {
        const m = byId.get(a.sourceId!)!;
        return {
          ...a,
          meeting: { id: m.id, code: meetingCode(m.number), title: m.title, startAt: m.startAt.toISOString() },
          closedSinceLast: !['OPEN', 'IN_PROGRESS', 'DONE'].includes(a.status),
        };
      })
      .sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue) || a.dueDate.localeCompare(b.dueDate));
  }

  async ics(id: string): Promise<{ fileName: string; content: string }> {
    const row = await this.loadViewable(id);
    const tz = await this.meetingAccess.timezone();
    const people = await this.prisma.db.user.findMany({
      where: { id: { in: [row.organizerId, ...row.participants.map((p) => p.userId)] } },
      select: { id: true, fullName: true, email: true },
    });
    const byId = new Map(people.map((p) => [p.id, p]));
    const organizer = byId.get(row.organizerId);
    const lines = [
      `${meetingCode(row.number)}${row.type ? ` — ${row.type.name}` : ''}`,
      ...(row.onlineUrl ? [`Online: ${row.onlineUrl}`] : []),
      ...row.agendaItems.map((a, i) => `${i + 1}. ${a.title}`),
    ];
    const content = buildIcs({
      uid: row.id,
      title: row.title,
      startAt: row.startAt,
      endAt: row.endAt,
      location: row.location ?? row.onlineUrl,
      description: `${lines.join('\n')}\n(${formatDateTimeTr(row.startAt, tz)})`,
      url: row.onlineUrl,
      organizer: organizer ? { name: organizer.fullName, email: organizer.email } : null,
      attendees: row.participants.map((p) => byId.get(p.userId)).filter((u): u is NonNullable<typeof u> => !!u).map((u) => ({ name: u.fullName, email: u.email })),
      cancelled: row.status === 'CANCELLED',
    });
    return { fileName: `${meetingCode(row.number)}.ics`, content };
  }

  /* ------------------------------ Oluşturma ------------------------------ */

  async create(dto: CreateMeetingDto): Promise<MeetingDetail> {
    const base = await this.resolveBase(dto);
    const startAt = new Date(dto.startAt);
    const endAt = dto.endAt ? new Date(dto.endAt) : new Date(startAt.getTime() + base.durationMin * 60_000);
    if (!(endAt > startAt)) throw new BusinessException('INVALID_TIME', 'Bitiş zamanı başlangıçtan sonra olmalı');

    const id = await this.prisma.db.$transaction((tx) => this.insertMeeting(tx, base, startAt, endAt, null));
    await this.audit.log('meeting', id, 'created', dto);
    const row = await this.load(id);
    await this.notifyInvited(row, row.participants.map((p) => p.userId));
    return this.toDetail(row);
  }

  async createSeries(dto: CreateSeriesDto): Promise<{ seriesId: string; count: number; meetings: MeetingListItem[] }> {
    const tz = await this.meetingAccess.timezone();
    const base = await this.resolveBase(dto);
    const starts = generateOccurrences(
      { firstDate: dto.firstDate, untilDate: dto.untilDate, time: dto.time, frequency: dto.frequency, weekdays: dto.weekdays, skipWeekends: dto.skipWeekends, timeZone: tz },
      MAX_SERIES_MEETINGS,
    );
    if (!starts.length) throw new BusinessException('SERIES_EMPTY', 'Seçilen aralıkta toplantı oluşmuyor');
    if (starts.length > MAX_SERIES_MEETINGS) {
      throw new BusinessException('SERIES_TOO_LARGE', `Bir seride en fazla ${MAX_SERIES_MEETINGS} toplantı oluşturulabilir`, { max: MAX_SERIES_MEETINGS });
    }
    const seriesId = `ser_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    const ids = await this.prisma.db.$transaction(
      async (tx) => {
        const out: string[] = [];
        for (const startAt of starts) {
          out.push(await this.insertMeeting(tx, base, startAt, new Date(startAt.getTime() + base.durationMin * 60_000), seriesId));
        }
        return out;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    await this.audit.log('meeting', ids[0], 'seriesCreated', { seriesId, count: ids.length, ...dto });

    const first = await this.load(ids[0]);
    await this.notifications.notify({
      userIds: base.participants.map((p) => p.userId),
      type: 'MEETING_INVITED',
      title: `Toplantı serisi: ${base.title}`,
      body: `${ids.length} toplantı planlandı. İlk toplantı: ${formatDateTimeTr(first.startAt, tz)}`,
      link: `/meetings/${first.id}`,
      dedupeKey: `series-invite:${seriesId}`,
    });
    const rows = await this.prisma.db.meeting.findMany({ where: { seriesId }, include: this.listIncludeForMe(), orderBy: { startAt: 'asc' } });
    return { seriesId, count: ids.length, meetings: await this.toListItems(rows) };
  }

  async listSeries(seriesId: string): Promise<MeetingListItem[]> {
    const rows = await this.prisma.db.meeting.findMany({
      where: { AND: [{ seriesId, deletedAt: null }, this.meetingAccess.visibleWhere()] },
      include: this.listIncludeForMe(),
      orderBy: { startAt: 'asc' },
    });
    return this.toListItems(rows);
  }

  /** Serideki, henüz yapılmamış gelecek toplantıları iptal eder. */
  async cancelSeries(seriesId: string, reason?: string): Promise<{ cancelled: number }> {
    const now = new Date();
    const rows = await this.prisma.db.meeting.findMany({
      where: { seriesId, deletedAt: null, status: 'PLANNED', startAt: { gte: now } },
      include: detailInclude,
    });
    if (!rows.length) return { cancelled: 0 };
    const allowed = rows.filter((r) => this.meetingAccess.rights(r).run);
    if (!allowed.length) throw new ForbiddenException();

    const why = reason?.trim() || 'Seri iptal edildi';
    await this.prisma.db.meeting.updateMany({ where: { id: { in: allowed.map((r) => r.id) } }, data: { status: 'CANCELLED', cancelledReason: why } });
    await this.audit.log('meeting', allowed[0].id, 'seriesCancelled', { seriesId, count: allowed.length, reason: why });
    const tz = await this.meetingAccess.timezone();
    const participants = new Set(allowed.flatMap((r) => r.participants.map((p) => p.userId)));
    await this.notifications.notify({
      userIds: [...participants],
      type: 'GENERIC',
      title: `Toplantı serisi iptal edildi: ${allowed[0].title}`,
      body: `${allowed.length} toplantı iptal edildi (${formatDateTr(allowed[0].startAt, tz)} sonrası). ${why}`,
      link: `/meetings/${allowed[0].id}`,
      dedupeKey: `series-cancel:${seriesId}:${now.getTime()}`,
    });
    return { cancelled: allowed.length };
  }

  /* ------------------------------ Düzenleme ------------------------------ */

  async update(id: string, dto: UpdateMeetingDto): Promise<MeetingDetail> {
    const row = await this.load(id);
    this.assertEditable(row);
    const tenantId = this.ctx.tenantId;
    const data: Prisma.MeetingUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.location !== undefined) data.location = dto.location;
    if (dto.onlineUrl !== undefined) data.onlineUrl = dto.onlineUrl;
    if (dto.summary !== undefined) data.summary = dto.summary;
    if (dto.guests !== undefined) data.guests = dto.guests.map((g) => g.trim()).filter(Boolean);

    let timeChanged = false;
    if (dto.startAt || dto.endAt) {
      const startAt = dto.startAt ? new Date(dto.startAt) : row.startAt;
      let endAt = dto.endAt ? new Date(dto.endAt) : row.endAt;
      if (dto.startAt && !dto.endAt) endAt = new Date(startAt.getTime() + (row.endAt.getTime() - row.startAt.getTime()));
      if (!(endAt > startAt)) throw new BusinessException('INVALID_TIME', 'Bitiş zamanı başlangıçtan sonra olmalı');
      timeChanged = startAt.getTime() !== row.startAt.getTime() || endAt.getTime() !== row.endAt.getTime();
      data.startAt = startAt;
      data.endAt = endAt;
    }
    if (dto.orgUnitId !== undefined) {
      await this.assertOrgUnitScope(dto.orgUnitId);
      data.orgUnitId = dto.orgUnitId;
    }
    let newOrganizer: string | null = null;
    if (dto.organizerId && dto.organizerId !== row.organizerId) {
      await this.assertUsers([dto.organizerId]);
      data.organizerId = dto.organizerId;
      newOrganizer = dto.organizerId;
    }

    await this.prisma.db.$transaction(async (tx) => {
      await tx.meeting.update({ where: { id }, data });
      if (newOrganizer) {
        await tx.meetingParticipant.updateMany({ where: { meetingId: id, role: 'ORGANIZER' }, data: { role: 'PARTICIPANT' } });
        await tx.meetingParticipant.upsert({
          where: { meetingId_userId: { meetingId: id, userId: newOrganizer } },
          create: { tenantId, meetingId: id, userId: newOrganizer, role: 'ORGANIZER' },
          update: { role: 'ORGANIZER' },
        });
      }
    });
    await this.audit.log('meeting', id, 'updated', dto);

    if (timeChanged) {
      const tz = await this.meetingAccess.timezone();
      await this.notifications.notify({
        userIds: row.participants.map((p) => p.userId),
        type: 'GENERIC',
        title: `Toplantı zamanı değişti: ${row.title}`,
        body: `Yeni zaman: ${formatDateTimeTr(data.startAt as Date, tz)}`,
        link: `/meetings/${id}`,
        dedupeKey: `meeting-moved:${id}:${(data.startAt as Date).getTime()}`,
      });
    }
    return this.toDetail(await this.load(id));
  }

  async start(id: string): Promise<MeetingDetail> {
    const row = await this.load(id);
    this.assertRun(row);
    if (row.status !== 'PLANNED') throw new BusinessException('INVALID_STATE', 'Yalnız planlanmış toplantı başlatılabilir');
    await this.prisma.db.meeting.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
    await this.audit.log('meeting', id, 'started');
    return this.toDetail(await this.load(id));
  }

  async complete(id: string): Promise<MeetingDetail> {
    const row = await this.load(id);
    this.assertRun(row);
    if (row.status === 'COMPLETED') throw new BusinessException('MEETING_LOCKED', 'Toplantı zaten tamamlandı');
    if (row.status === 'CANCELLED') throw new BusinessException('INVALID_STATE', 'İptal edilmiş toplantı tamamlanamaz');
    const unknown = row.participants.filter((p) => p.attendance === 'UNKNOWN');
    if (unknown.length) {
      throw new BusinessException('ATTENDANCE_REQUIRED', 'Toplantıyı tamamlamak için tüm katılımcıların katılım durumu girilmelidir', {
        missing: unknown.map((p) => ({ userId: p.userId, fullName: p.user.fullName })),
      });
    }
    const now = new Date();
    await this.prisma.db.meeting.update({ where: { id }, data: { status: 'COMPLETED', completedAt: now } });
    await this.audit.log('meeting', id, 'completed');
    // Tutanak dağıtımı: katılımcılara bildirim (+ e-posta)
    await this.notifications.notify({
      userIds: row.participants.map((p) => p.userId),
      type: 'GENERIC',
      title: `Toplantı tutanağı hazır: ${meetingCode(row.number)} ${row.title}`,
      body: `Tutanağı görüntülemek veya PDF olarak kaydetmek için bağlantıyı açın.`,
      link: `/meetings/${id}/print`,
      dedupeKey: `meeting-minutes:${id}:${now.getTime()}`,
    });
    return this.toDetail(await this.load(id));
  }

  async cancel(id: string, reason: string): Promise<MeetingDetail> {
    const row = await this.load(id);
    this.assertRun(row);
    if (!['PLANNED', 'IN_PROGRESS'].includes(row.status)) {
      throw new BusinessException('INVALID_STATE', 'Yalnız planlanmış veya devam eden toplantı iptal edilebilir');
    }
    await this.prisma.db.meeting.update({ where: { id }, data: { status: 'CANCELLED', cancelledReason: reason } });
    await this.audit.log('meeting', id, 'cancelled', { reason });
    await this.notifications.notify({
      userIds: row.participants.map((p) => p.userId),
      type: 'GENERIC',
      title: `Toplantı iptal edildi: ${meetingCode(row.number)} ${row.title}`,
      body: reason,
      link: `/meetings/${id}`,
      dedupeKey: `meeting-cancel:${id}`,
    });
    return this.toDetail(await this.load(id));
  }

  /** Tamamlanmış toplantıyı yeniden açar (yalnız meeting.manage); denetim izine yazılır. */
  async reopen(id: string): Promise<MeetingDetail> {
    const row = await this.load(id);
    const r = this.meetingAccess.rights(row);
    if (!r.view) throw new ForbiddenException();
    if (!r.manage) throw new ForbiddenException('meeting.manage required to reopen');
    if (row.status !== 'COMPLETED') throw new BusinessException('INVALID_STATE', 'Yalnız tamamlanmış toplantı yeniden açılabilir');
    await this.prisma.db.meeting.update({ where: { id }, data: { status: 'IN_PROGRESS', completedAt: null } });
    await this.audit.log('meeting', id, 'reopened', { previousCompletedAt: row.completedAt });
    return this.toDetail(await this.load(id));
  }

  async setParticipants(id: string, input: ParticipantInputDto[]): Promise<MeetingDetail> {
    const row = await this.load(id);
    this.assertEditable(row);
    await this.assertUsers(input.map((p) => p.userId));
    const tenantId = this.ctx.tenantId;
    const wanted = new Map<string, MeetingParticipantRole>();
    for (const p of input) wanted.set(p.userId, p.userId === row.organizerId ? 'ORGANIZER' : p.role === 'ORGANIZER' ? 'PARTICIPANT' : (p.role ?? 'PARTICIPANT'));
    wanted.set(row.organizerId, 'ORGANIZER');

    const existing = new Map(row.participants.map((p) => [p.userId, p]));
    const added = [...wanted.keys()].filter((u) => !existing.has(u));
    const removed = [...existing.keys()].filter((u) => !wanted.has(u));

    await this.prisma.db.$transaction(async (tx) => {
      if (removed.length) await tx.meetingParticipant.deleteMany({ where: { meetingId: id, userId: { in: removed } } });
      for (const [userId, role] of wanted) {
        const cur = existing.get(userId);
        if (!cur) await tx.meetingParticipant.create({ data: { tenantId, meetingId: id, userId, role } });
        else if (cur.role !== role) await tx.meetingParticipant.update({ where: { id: cur.id }, data: { role } });
      }
    });
    await this.audit.log('meeting', id, 'participantsChanged', { added, removed });
    await this.notifyInvited(row, added);
    return this.toDetail(await this.load(id));
  }

  async setAttendance(id: string, dto: SetAttendanceDto): Promise<MeetingDetail> {
    const row = await this.load(id);
    this.assertEditable(row);
    const known = new Set(row.participants.map((p) => p.userId));
    const unknown = dto.items.filter((i) => !known.has(i.userId));
    if (unknown.length) throw new BusinessException('NOT_A_PARTICIPANT', 'Katılımcı olmayan kullanıcı için katılım girilemez', { userIds: unknown.map((u) => u.userId) });
    await this.prisma.db.$transaction(
      dto.items.map((i) => this.prisma.db.meetingParticipant.updateMany({ where: { meetingId: id, userId: i.userId }, data: { attendance: i.attendance } })),
    );
    await this.audit.log('meeting', id, 'attendanceChanged', dto.items);
    return this.toDetail(await this.load(id));
  }

  async setAgenda(id: string, items: AgendaItemInputDto[]): Promise<MeetingAgendaItemDto[]> {
    const row = await this.load(id);
    this.assertEditable(row);
    await this.assertUsers(items.map((i) => i.presenterId));
    const tenantId = this.ctx.tenantId;
    const existing = new Map(row.agendaItems.map((a) => [a.id, a]));
    const keep = new Set(items.filter((i) => i.id && existing.has(i.id)).map((i) => i.id!));
    const removed = row.agendaItems.filter((a) => !keep.has(a.id)).map((a) => a.id);

    await this.prisma.db.$transaction(async (tx) => {
      if (removed.length) await tx.meetingAgendaItem.deleteMany({ where: { meetingId: id, id: { in: removed } } });
      for (const [index, item] of items.entries()) {
        const fields = { sortOrder: index, title: item.title, description: item.description ?? null, presenterId: item.presenterId ?? null, durationMin: item.durationMin ?? null };
        if (item.id && existing.has(item.id)) await tx.meetingAgendaItem.update({ where: { id: item.id }, data: fields });
        else await tx.meetingAgendaItem.create({ data: { tenantId, meetingId: id, ...fields } });
      }
    });
    await this.audit.log('meeting', id, 'agendaChanged', { count: items.length });
    return (await this.load(id)).agendaItems.map((a) => this.toAgendaItem(a));
  }

  async updateAgendaItem(id: string, itemId: string, dto: UpdateAgendaItemDto): Promise<MeetingAgendaItemDto> {
    const row = await this.load(id);
    this.assertEditable(row);
    if (!row.agendaItems.some((a) => a.id === itemId)) throw new NotFoundException('Agenda item not found');
    const data: Prisma.MeetingAgendaItemUncheckedUpdateInput = {};
    if (dto.discussion !== undefined) data.discussion = dto.discussion;
    if (dto.isCompleted !== undefined) data.isCompleted = dto.isCompleted;
    const updated = await this.prisma.db.meetingAgendaItem.update({ where: { id: itemId }, data, include: { presenter: userRef } });
    return this.toAgendaItem(updated);
  }

  async addDecision(id: string, dto: CreateDecisionDto): Promise<MeetingDecisionItem> {
    const row = await this.load(id);
    this.assertEditable(row);
    this.assertAgendaItem(row, dto.agendaItemId);
    const last = row.decisions.reduce((max, d) => Math.max(max, d.sortOrder), -1);
    const created = await this.prisma.db.meetingDecision.create({
      data: { tenantId: this.ctx.tenantId, meetingId: id, text: dto.text, agendaItemId: dto.agendaItemId ?? null, sortOrder: last + 1 },
    });
    await this.audit.log('meeting', id, 'decisionAdded', { text: dto.text });
    return this.toDecision(created);
  }

  async updateDecision(id: string, decisionId: string, dto: UpdateDecisionDto): Promise<MeetingDecisionItem> {
    const row = await this.load(id);
    this.assertEditable(row);
    if (!row.decisions.some((d) => d.id === decisionId)) throw new NotFoundException('Decision not found');
    if (dto.agendaItemId !== undefined) this.assertAgendaItem(row, dto.agendaItemId);
    const data: Prisma.MeetingDecisionUncheckedUpdateInput = {};
    if (dto.text !== undefined) data.text = dto.text;
    if (dto.agendaItemId !== undefined) data.agendaItemId = dto.agendaItemId;
    const updated = await this.prisma.db.meetingDecision.update({ where: { id: decisionId }, data });
    await this.audit.log('meeting', id, 'decisionUpdated', { decisionId, ...dto });
    return this.toDecision(updated);
  }

  async deleteDecision(id: string, decisionId: string): Promise<void> {
    const row = await this.load(id);
    this.assertEditable(row);
    if (!row.decisions.some((d) => d.id === decisionId)) throw new NotFoundException('Decision not found');
    await this.prisma.db.meetingDecision.delete({ where: { id: decisionId } });
    await this.audit.log('meeting', id, 'decisionDeleted', { decisionId });
  }

  /** Toplantıdan aksiyon açar: kaynak = MEETING, sourceId = toplantı id. */
  async createAction(id: string, dto: CreateMeetingActionDto): Promise<ActionDetail> {
    const row = await this.load(id);
    this.assertEditable(row);
    const tz = await this.meetingAccess.timezone();
    return this.actions.create({
      ...dto,
      orgUnitId: dto.orgUnitId ?? row.orgUnitId,
      sourceType: 'MEETING',
      sourceId: row.id,
      sourceLabel: `${meetingCode(row.number)} ${row.title} (${formatDateTr(row.startAt, tz)})`.slice(0, 300),
    });
  }

  /* ------------------------------ Pano kartı ------------------------------ */

  async dashboardWidget(): Promise<MeetingsDashboardWidget> {
    const userId = this.ctx.userId;
    const tz = await this.meetingAccess.timezone();
    const now = new Date();
    const mine: Prisma.MeetingWhereInput = { deletedAt: null, OR: [{ organizerId: userId }, { participants: { some: { userId } } }] };
    const day = zonedDayRange(now, tz);
    const [upcoming, todayCount, minutesPending] = await Promise.all([
      this.prisma.db.meeting.findMany({
        where: { ...mine, status: { in: ['PLANNED', 'IN_PROGRESS'] }, endAt: { gte: now } },
        orderBy: { startAt: 'asc' },
        take: 5,
        select: { id: true, number: true, title: true, startAt: true, location: true },
      }),
      this.prisma.db.meeting.count({ where: { ...mine, status: { not: 'CANCELLED' }, startAt: { gte: day.start, lt: day.end } } }),
      this.prisma.db.meeting.count({ where: { deletedAt: null, organizerId: userId, status: { in: ['PLANNED', 'IN_PROGRESS'] }, endAt: { lt: now } } }),
    ]);
    return {
      upcoming: upcoming.map((m) => ({ id: m.id, code: meetingCode(m.number), title: m.title, startAt: m.startAt.toISOString(), location: m.location })),
      todayCount,
      minutesPending,
    };
  }

  /* ------------------------------ Yardımcılar ------------------------------ */

  private listIncludeForMe() {
    return { ...listInclude, participants: { where: { userId: this.ctx.userId }, select: { id: true } } } satisfies Prisma.MeetingInclude;
  }

  private async buildWhere(query: MeetingQuery): Promise<Prisma.MeetingWhereInput> {
    const and: Prisma.MeetingWhereInput[] = [{ deletedAt: null }];
    if (query.view === 'all') and.push(this.meetingAccess.visibleWhere());
    else and.push(this.meetingAccess.mineWhere());

    if (query.typeId) and.push({ typeId: query.typeId });
    if (query.status) and.push({ status: query.status });
    if (query.when === 'upcoming') and.push({ endAt: { gte: new Date() }, status: { in: ['PLANNED', 'IN_PROGRESS'] } });
    if (query.when === 'past') and.push({ OR: [{ endAt: { lt: new Date() } }, { status: { in: ['COMPLETED', 'CANCELLED'] } }] });
    if (query.from) and.push({ startAt: { gte: new Date(query.from) } });
    if (query.to) and.push({ startAt: { lte: new Date(query.to) } });
    if (query.orgUnitId) {
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: query.orgUnitId } });
      and.push({ orgUnit: { path: { startsWith: unit?.path ?? '__none__' } } });
    }
    if (query.q) {
      const q = query.q.trim();
      const num = Number(q.replace(/^TOP-0*/i, ''));
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { location: { contains: q, mode: 'insensitive' } },
          ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : []),
        ],
      });
    }
    return { AND: and };
  }

  private async load(id: string): Promise<DetailRow> {
    const row = await this.prisma.db.meeting.findFirst({ where: { id, deletedAt: null }, include: detailInclude });
    if (!row) throw new NotFoundException('Meeting not found');
    return row;
  }

  private async loadViewable(id: string): Promise<DetailRow> {
    const row = await this.load(id);
    if (!this.meetingAccess.rights(row).view) throw new ForbiddenException();
    return row;
  }

  /** Düzenleme (tutanak, gündem, katılım...) hakkı ve kilit kontrolü. */
  private assertEditable(row: DetailRow) {
    this.assertRun(row);
    if (row.status === 'COMPLETED' || row.status === 'CANCELLED') {
      throw new BusinessException('MEETING_LOCKED', row.status === 'COMPLETED' ? 'Tamamlanmış toplantı kilitlidir' : 'İptal edilmiş toplantı değiştirilemez');
    }
  }

  private assertRun(row: DetailRow) {
    const r = this.meetingAccess.rights(row);
    if (!r.view) throw new ForbiddenException();
    if (!r.run) throw new ForbiddenException();
  }

  private assertAgendaItem(row: DetailRow, agendaItemId: string | null | undefined) {
    if (agendaItemId && !row.agendaItems.some((a) => a.id === agendaItemId)) {
      throw new BusinessException('INVALID_AGENDA_ITEM', 'Gündem maddesi bu toplantıya ait değil');
    }
  }

  private async assertUsers(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return;
    const count = await this.prisma.db.user.count({ where: { id: { in: unique }, isActive: true } });
    if (count !== unique.length) throw new BusinessException('INVALID_USER', 'Kullanıcı bulunamadı ya da pasif');
  }

  private async assertOrgUnitScope(orgUnitId: string | null | undefined) {
    if (!orgUnitId) {
      if (this.access.scopePaths(PERMISSIONS.MEETING_MANAGE) !== null) throw new ForbiddenException('Birim seçilmelidir');
      return;
    }
    const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: orgUnitId } });
    if (!unit) throw new BusinessException('INVALID_ORG_UNIT', 'Birim bulunamadı');
    if (!this.access.inScope(PERMISSIONS.MEETING_MANAGE, unit.path)) throw new ForbiddenException();
  }

  /** Tip şablonu + istek alanlarından toplantı taslağı üretir (tek toplantı ve seri için ortak). */
  private async resolveBase(input: Pick<CreateMeetingDto, 'typeId' | 'title' | 'durationMin' | 'location' | 'onlineUrl' | 'organizerId' | 'orgUnitId' | 'participantIds' | 'guests'>): Promise<ResolvedBase> {
    const type = input.typeId
      ? await this.prisma.db.meetingType.findFirst({ where: { id: input.typeId }, include: { members: true, orgUnit: { select: { id: true } } } })
      : null;
    if (input.typeId && !type) throw new BusinessException('INVALID_TYPE', 'Toplantı tipi bulunamadı');
    if (type && !type.isActive) throw new BusinessException('TYPE_INACTIVE', 'Toplantı tipi pasif');

    const title = input.title?.trim() || type?.name;
    if (!title) throw new BusinessException('TITLE_REQUIRED', 'Toplantı başlığı veya tipi zorunludur');

    const organizerId = input.organizerId ?? this.ctx.userId;
    await this.assertUsers([organizerId]);

    let orgUnitId = input.orgUnitId ?? type?.orgUnitId ?? null;
    if (!orgUnitId) {
      const org = await this.prisma.db.user.findUnique({ where: { id: organizerId }, select: { employee: { select: { orgUnitId: true } } } });
      orgUnitId = org?.employee?.orgUnitId ?? null;
    }
    await this.assertOrgUnitScope(orgUnitId);

    const participants = new Map<string, MeetingParticipantRole>();
    if (input.participantIds) {
      for (const uid of input.participantIds) participants.set(uid, 'PARTICIPANT');
    } else if (type) {
      for (const m of type.members) participants.set(m.userId, m.role === 'ORGANIZER' ? 'PARTICIPANT' : m.role);
    }
    if (type?.facilitatorId && !participants.has(type.facilitatorId)) participants.set(type.facilitatorId, 'PARTICIPANT');
    participants.set(organizerId, 'ORGANIZER');
    await this.assertUsers([...participants.keys()]);

    const template = (Array.isArray(type?.agendaTemplate) ? type!.agendaTemplate : []) as { title: string; durationMin?: number; description?: string }[];
    return {
      typeId: type?.id ?? null,
      title,
      location: input.location ?? type?.defaultLocation ?? null,
      onlineUrl: input.onlineUrl ?? null,
      organizerId,
      orgUnitId,
      durationMin: input.durationMin ?? type?.defaultDurationMin ?? 60,
      guests: (input.guests ?? []).map((g) => g.trim()).filter(Boolean),
      participants: [...participants].map(([userId, role]) => ({ userId, role })),
      agenda: template.map((a) => ({ title: a.title, description: a.description ?? null, durationMin: a.durationMin ?? null })),
    };
  }

  private async insertMeeting(tx: TenantTx, base: ResolvedBase, startAt: Date, endAt: Date, seriesId: string | null): Promise<string> {
    const tenantId = this.ctx.tenantId;
    const number = await this.sequences.next('meeting', tx);
    const meeting = await tx.meeting.create({
      data: {
        tenantId, number, typeId: base.typeId, title: base.title, startAt, endAt, location: base.location, onlineUrl: base.onlineUrl,
        organizerId: base.organizerId, orgUnitId: base.orgUnitId, seriesId, guests: base.guests, createdById: this.ctx.userId,
        participants: { create: base.participants.map((p) => ({ tenantId, userId: p.userId, role: p.role })) },
        agendaItems: { create: base.agenda.map((a, i) => ({ tenantId, sortOrder: i, title: a.title, description: a.description, durationMin: a.durationMin })) },
      },
      select: { id: true },
    });
    return meeting.id;
  }

  private async notifyInvited(row: DetailRow, userIds: string[]) {
    if (!userIds.length) return;
    const tz = await this.meetingAccess.timezone();
    await this.notifications.notify({
      userIds,
      type: 'MEETING_INVITED',
      title: `Toplantı daveti: ${row.title}`,
      body: `${formatDateTimeTr(row.startAt, tz)}${row.location ? ` — ${row.location}` : ''}`,
      link: `/meetings/${row.id}`,
      dedupeKey: `meeting-invite:${row.id}`,
    });
  }

  private async openActionCounts(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const groups = await this.prisma.db.action.groupBy({
      by: ['sourceId'],
      where: { sourceType: 'MEETING', sourceId: { in: ids }, deletedAt: null, status: { in: [...ACTIVE_ACTION] } },
      _count: true,
    });
    return new Map(groups.map((g) => [g.sourceId!, g._count]));
  }

  private async toListItems(rows: ListRow[]): Promise<MeetingListItem[]> {
    const counts = await this.openActionCounts(rows.map((r) => r.id));
    return rows.map((r) => this.toListItem(r, counts.get(r.id) ?? 0));
  }

  private toListItem(r: ListRow, openActionCount: number): MeetingListItem {
    return {
      id: r.id,
      number: r.number,
      code: meetingCode(r.number),
      title: r.title,
      type: r.type ? { id: r.type.id, name: r.type.name, code: r.type.code, category: r.type.category, tier: r.type.tier } : null,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
      location: r.location,
      onlineUrl: r.onlineUrl,
      status: r.status,
      organizer: r.organizer,
      orgUnit: r.orgUnit ? { id: r.orgUnit.id, name: r.orgUnit.name, code: r.orgUnit.code } : null,
      seriesId: r.seriesId,
      participantCount: r._count.participants,
      openActionCount,
      isParticipant: r.organizerId === this.ctx.userId || (r.participants?.length ?? 0) > 0,
    };
  }

  private toAgendaItem(a: DetailRow['agendaItems'][number]): MeetingAgendaItemDto {
    return {
      id: a.id, sortOrder: a.sortOrder, title: a.title, description: a.description, presenter: a.presenter,
      durationMin: a.durationMin, discussion: a.discussion, isCompleted: a.isCompleted,
    };
  }

  private toDecision(d: { id: string; agendaItemId: string | null; text: string; sortOrder: number; createdAt: Date }): MeetingDecisionItem {
    return { id: d.id, agendaItemId: d.agendaItemId, text: d.text, sortOrder: d.sortOrder, createdAt: d.createdAt.toISOString() };
  }

  private async toDetail(r: DetailRow): Promise<MeetingDetail> {
    const rights = this.meetingAccess.rights(r);
    const locked = r.status === 'COMPLETED' || r.status === 'CANCELLED';
    const actionCounts = await this.prisma.db.action.groupBy({
      by: ['status'], where: { sourceType: 'MEETING', sourceId: r.id, deletedAt: null }, _count: true,
    });
    const actionCount = actionCounts.reduce((s, g) => s + g._count, 0);
    const openActionCount = actionCounts.filter((g) => ACTIVE_ACTION.includes(g.status as 'OPEN')).reduce((s, g) => s + g._count, 0);
    const participants = [...r.participants]
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.user.fullName.localeCompare(b.user.fullName, 'tr'))
      .map((p) => ({ userId: p.userId, user: p.user, role: p.role, attendance: p.attendance }));
    return {
      ...this.toListItem({ ...r, _count: { participants: r.participants.length }, participants: r.participants.filter((p) => p.userId === this.ctx.userId) }, openActionCount),
      summary: r.summary,
      guests: r.guests,
      completedAt: r.completedAt?.toISOString() ?? null,
      cancelledReason: r.cancelledReason,
      createdBy: r.createdBy,
      participants,
      agenda: r.agendaItems.map((a) => this.toAgendaItem(a)),
      decisions: r.decisions.map((d) => this.toDecision(d)),
      actionCount,
      facilitator: r.type?.facilitator ?? null,
      attendanceRate: attendanceRate(r.participants),
      locked,
      can: {
        edit: rights.run && !locked,
        run: rights.run && !locked,
        manage: rights.manage,
      },
    };
  }
}
