import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { startOfUtcDay } from '../../common/dates';
import { RequestContext } from '../../common/request-context';
import { config } from '../../config';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { problemCode } from './problem-rules';

/** Haftanın pazartesi günü (UTC), tekrarlayan hatırlatmaların haftalık tekilleştirilmesi için. */
function weekKey(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - day * 86_400_000).toISOString().slice(0, 10);
}

@Injectable()
export class ProblemsReminderJob {
  private readonly logger = new Logger(ProblemsReminderJob.name);

  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext, private readonly notifications: NotificationsService) {}

  @Cron('45 7 * * *', { timeZone: 'Europe/Istanbul' })
  async scheduled() {
    if (config.schedulerEnabled) await this.runAll();
  }

  async runAll() {
    const tenants = await this.prisma.raw.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    for (const t of tenants) {
      try {
        await this.ctx.runForTenant(t.id, () => this.runForCurrentTenant());
      } catch (err) {
        this.logger.error(`Problem reminders failed for tenant ${t.id}`, err as Error);
      }
    }
  }

  /** Hedef kapanış tarihi geçen problemler ve doğrulama tarihi gelen problemler için sahibine bildirim (tekilleştirilmiş). */
  async runForCurrentTenant(now = new Date()) {
    const today = startOfUtcDay(now);
    const open = { deletedAt: null, phase: { notIn: ['CLOSED' as const, 'CANCELLED' as const] } };

    const late = await this.prisma.db.problem.findMany({
      where: { ...open, targetCloseDate: { lt: today } },
      select: { id: true, number: true, title: true, ownerId: true, targetCloseDate: true },
    });
    for (const p of late) {
      await this.notifications.notify({
        userIds: [p.ownerId], type: 'GENERIC',
        title: `Problem kapanış tarihi geçti: ${problemCode(p.number)} ${p.title}`,
        body: `Hedef kapanış: ${p.targetCloseDate!.toISOString().slice(0, 10)}`,
        link: `/problems/${p.id}`,
        dedupeKey: `problem-overdue:${p.id}:${weekKey(today)}`,
      });
    }

    const verifDue = await this.prisma.db.problem.findMany({
      where: { ...open, phase: { in: ['ACTIONS', 'VERIFICATION'] }, verificationDate: { lte: today } },
      select: { id: true, number: true, title: true, ownerId: true, verificationDate: true },
    });
    for (const p of verifDue) {
      await this.notifications.notify({
        userIds: [p.ownerId], type: 'GENERIC',
        title: `Etkinlik doğrulama zamanı geldi: ${problemCode(p.number)} ${p.title}`,
        body: `Planlanan doğrulama tarihi: ${p.verificationDate!.toISOString().slice(0, 10)}`,
        link: `/problems/${p.id}`,
        dedupeKey: `problem-verification-due:${p.id}:${p.verificationDate!.toISOString().slice(0, 10)}`,
      });
    }
    return { overdue: late.length, verificationDue: verifDue.length };
  }
}
