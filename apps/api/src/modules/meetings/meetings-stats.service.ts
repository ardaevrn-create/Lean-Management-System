import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MeetingCalendarItem, MeetingStats, MeetingTypeStats } from '@lean/shared';
import { startOfUtcDay } from '../../common/dates';
import { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MeetingAccessService } from './meeting-access.service';
import { meetingCode, pooledAttendanceRate } from './meeting-rules';
import type { RangeQuery } from './meetings.dto';

const ACTIVE = ['OPEN', 'IN_PROGRESS'] as const;

@Injectable()
export class MeetingsStatsService {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext, private readonly meetingAccess: MeetingAccessService) {}

  private async rangeWhere(query: RangeQuery): Promise<Prisma.MeetingWhereInput> {
    const and: Prisma.MeetingWhereInput[] = [{ deletedAt: null }, this.meetingAccess.visibleWhere()];
    if (query.typeId) and.push({ typeId: query.typeId });
    if (query.from) and.push({ startAt: { gte: new Date(query.from) } });
    if (query.to) and.push({ startAt: { lte: new Date(query.to) } });
    if (query.orgUnitId) {
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: query.orgUnitId } });
      and.push({ orgUnit: { path: { startsWith: unit?.path ?? '__none__' } } });
    }
    return { AND: and };
  }

  /** Takvim görünümü için hafif liste. */
  async calendar(query: RangeQuery): Promise<MeetingCalendarItem[]> {
    const where = await this.rangeWhere(query);
    const userId = this.ctx.userId;
    const rows = await this.prisma.db.meeting.findMany({
      where,
      orderBy: { startAt: 'asc' },
      take: 1000,
      select: {
        id: true, number: true, title: true, startAt: true, endAt: true, status: true, typeId: true, location: true, organizerId: true,
        type: { select: { name: true } }, organizer: { select: { fullName: true } },
        participants: { where: { userId }, select: { id: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id, code: meetingCode(r.number), title: r.title, startAt: r.startAt.toISOString(), endAt: r.endAt.toISOString(),
      status: r.status, typeId: r.typeId, typeName: r.type?.name ?? null, location: r.location, organizerName: r.organizer.fullName,
      isParticipant: r.organizerId === userId || r.participants.length > 0,
    }));
  }

  /** Toplantı etkinlik metrikleri (M4-09). */
  async stats(query: RangeQuery): Promise<MeetingStats> {
    const where = await this.rangeWhere(query);
    const meetings = await this.prisma.db.meeting.findMany({
      where,
      take: 5000,
      select: { id: true, typeId: true, status: true, type: { select: { name: true } }, participants: { select: { attendance: true } } },
    });
    const ids = meetings.map((m) => m.id);
    const actions = ids.length
      ? await this.prisma.db.action.findMany({
          where: { sourceType: 'MEETING', sourceId: { in: ids }, deletedAt: null },
          select: { sourceId: true, status: true, dueDate: true, completedAt: true },
        })
      : [];
    const today = startOfUtcDay();

    const summarizeActions = (list: typeof actions) => {
      const closed = list.filter((a) => (a.status === 'DONE' || a.status === 'VERIFIED') && a.completedAt);
      const onTime = closed.filter((a) => startOfUtcDay(a.completedAt!) <= a.dueDate).length;
      return {
        opened: list.length,
        closed: closed.length,
        onTimeRate: closed.length ? Math.round((onTime / closed.length) * 1000) / 10 : null,
        overdue: list.filter((a) => (ACTIVE as readonly string[]).includes(a.status) && a.dueDate < today).length,
      };
    };
    const buildGroup = (list: typeof meetings) => ({
      held: list.filter((m) => m.status === 'COMPLETED').length,
      planned: list.filter((m) => m.status === 'PLANNED' || m.status === 'IN_PROGRESS').length,
      cancelled: list.filter((m) => m.status === 'CANCELLED').length,
      // Yalnız tamamlanmış toplantılarda katılım oranı anlamlıdır
      attendanceRate: pooledAttendanceRate(list.filter((m) => m.status === 'COMPLETED').map((m) => m.participants)),
    });

    const total = buildGroup(meetings);
    const totalActions = summarizeActions(actions);

    const groups = new Map<string, { typeId: string | null; name: string; meetings: typeof meetings }>();
    for (const m of meetings) {
      const key = m.typeId ?? '__none__';
      const g = groups.get(key) ?? { typeId: m.typeId, name: m.type?.name ?? '', meetings: [] };
      g.meetings.push(m);
      groups.set(key, g);
    }
    const byType: MeetingTypeStats[] = [...groups.values()]
      .map((g) => {
        const gIds = new Set(g.meetings.map((m) => m.id));
        const a = summarizeActions(actions.filter((x) => x.sourceId && gIds.has(x.sourceId)));
        const b = buildGroup(g.meetings);
        return {
          typeId: g.typeId, typeName: g.name, ...b,
          actionsOpened: a.opened, actionsClosedOnTimeRate: a.onTimeRate, overdueActions: a.overdue,
        };
      })
      .sort((x, y) => y.held + y.planned - (x.held + x.planned));

    return {
      ...total,
      total: meetings.length,
      actionsOpened: totalActions.opened,
      actionsClosed: totalActions.closed,
      actionsClosedOnTimeRate: totalActions.onTimeRate,
      overdueActions: totalActions.overdue,
      byType,
    };
  }

}
