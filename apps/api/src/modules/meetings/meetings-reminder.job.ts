import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RequestContext } from '../../common/request-context';
import { config } from '../../config';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MeetingAccessService } from './meeting-access.service';
import { formatDateTimeTr, meetingCode, zonedDayRange, zonedDateString } from './meeting-rules';

@Injectable()
export class MeetingsReminderJob {
  private readonly logger = new Logger(MeetingsReminderJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly notifications: NotificationsService,
    private readonly meetingAccess: MeetingAccessService,
  ) {}

  @Cron('15 7 * * *', { timeZone: 'Europe/Istanbul' })
  async scheduled() {
    if (config.schedulerEnabled) await this.runAll();
  }

  async runAll() {
    const tenants = await this.prisma.raw.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    for (const t of tenants) {
      try {
        await this.ctx.runForTenant(t.id, () => this.runForCurrentTenant());
      } catch (err) {
        this.logger.error(`Meeting reminders failed for tenant ${t.id}`, err as Error);
      }
    }
  }

  /** Bugünkü toplantı hatırlatmaları ve dün biten ama tutanağı kapanmamış toplantı uyarıları. */
  async runForCurrentTenant(now = new Date()) {
    const tz = await this.meetingAccess.timezone();
    const today = zonedDayRange(now, tz);
    const stamp = zonedDateString(now, tz);

    const todays = await this.prisma.db.meeting.findMany({
      where: { deletedAt: null, status: 'PLANNED', startAt: { gte: today.start, lt: today.end } },
      select: { id: true, number: true, title: true, startAt: true, location: true, participants: { select: { userId: true } } },
    });
    for (const m of todays) {
      await this.notifications.notify({
        userIds: m.participants.map((p) => p.userId),
        type: 'GENERIC',
        title: `Bugün toplantı: ${m.title}`,
        body: `${formatDateTimeTr(m.startAt, tz)}${m.location ? ` — ${m.location}` : ''}`,
        link: `/meetings/${m.id}`,
        dedupeKey: `meeting-today:${m.id}`,
      });
    }

    const yesterdayStart = new Date(today.start.getTime() - 24 * 3600_000);
    const stale = await this.prisma.db.meeting.findMany({
      where: { deletedAt: null, status: { in: ['PLANNED', 'IN_PROGRESS'] }, endAt: { gte: yesterdayStart, lt: today.start } },
      select: { id: true, number: true, title: true, organizerId: true },
    });
    for (const m of stale) {
      await this.notifications.notify({
        userIds: [m.organizerId],
        type: 'GENERIC',
        title: `Toplantı tutanağı tamamlanmadı: ${meetingCode(m.number)} ${m.title}`,
        body: 'Katılımı girip toplantıyı tamamlayın veya iptal edin.',
        link: `/meetings/${m.id}`,
        dedupeKey: `meeting-minutes-pending:${m.id}:${stamp}`,
      });
    }
    return { today: todays.length, pendingMinutes: stale.length };
  }
}
