import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { addDays, diffDays, startOfUtcDay } from '../../common/dates';
import { RequestContext } from '../../common/request-context';
import { config } from '../../config';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { actionCode } from './action-rules';

/** Eskalasyon: bu kadar gün gecikmede sahibinin yöneticisine bildirim gider. */
export const ESCALATION_DAYS = 3;
/** Gecikmiş aksiyon hatırlatmaları bu günlerde tekrarlanır. */
const OVERDUE_REMINDER_DAYS = new Set([1, 3, 7, 14, 30]);

@Injectable()
export class ActionsReminderJob {
  private readonly logger = new Logger(ActionsReminderJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('0 7 * * *', { timeZone: 'Europe/Istanbul' })
  async scheduled() {
    if (config.schedulerEnabled) await this.runAll();
  }

  async runAll() {
    const tenants = await this.prisma.raw.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    for (const t of tenants) {
      try {
        await this.ctx.runForTenant(t.id, () => this.runForCurrentTenant());
      } catch (err) {
        this.logger.error(`Action reminders failed for tenant ${t.id}`, err as Error);
      }
    }
  }

  async runForCurrentTenant(today = startOfUtcDay()) {
    const stamp = today.toISOString().slice(0, 10);
    const actions = await this.prisma.db.action.findMany({
      where: { deletedAt: null, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { lte: addDays(today, 2) } },
      select: {
        id: true, number: true, title: true, dueDate: true, ownerId: true,
        owner: { select: { fullName: true, employee: { select: { manager: { select: { user: { select: { id: true, isActive: true } } } } } } } },
      },
    });

    for (const a of actions) {
      const label = `${actionCode(a.number)} ${a.title}`;
      const link = `/actions/${a.id}`;
      const late = diffDays(today, a.dueDate);
      if (late <= 0) {
        await this.notifications.notify({
          userIds: [a.ownerId], type: 'ACTION_DUE_SOON', title: `Termin yaklaşıyor: ${label}`,
          body: `Termin: ${a.dueDate.toISOString().slice(0, 10)}`, link, dedupeKey: `due-soon:${a.id}:${a.dueDate.toISOString().slice(0, 10)}`,
        });
        continue;
      }
      if (OVERDUE_REMINDER_DAYS.has(late)) {
        await this.notifications.notify({
          userIds: [a.ownerId], type: 'ACTION_OVERDUE', title: `Geciken aksiyon (${late} gün): ${label}`,
          link, dedupeKey: `overdue:${a.id}:${stamp}`,
        });
      }
      const manager = a.owner.employee?.manager?.user;
      if (late >= ESCALATION_DAYS && manager?.isActive) {
        await this.notifications.notify({
          userIds: [manager.id], type: 'ACTION_OVERDUE',
          title: `Eskalasyon: ${a.owner.fullName} — ${label} (${late} gün gecikti)`,
          link, dedupeKey: `escalation:${a.id}:${a.dueDate.toISOString().slice(0, 10)}`,
        });
      }
    }
  }
}
