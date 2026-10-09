import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { prevPeriod, currentPeriod, periodLabel } from '@lean/shared';
import { startOfUtcDay } from '../../common/dates';
import { RequestContext } from '../../common/request-context';
import { config } from '../../config';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';

/** Her ayın 3'ü 08:00: elle takip edilen hedeflerde geçen ayın gerçekleşmesi girilmemişse sahiplerine hatırlatma. */
@Injectable()
export class HoshinReminderJob {
  private readonly logger = new Logger(HoshinReminderJob.name);

  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext, private readonly notifications: NotificationsService) {}

  @Cron('0 8 3 * *', { timeZone: 'Europe/Istanbul' })
  async scheduled() {
    if (config.schedulerEnabled) await this.runAll();
  }

  async runAll() {
    const tenants = await this.prisma.raw.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    for (const t of tenants) {
      try {
        await this.ctx.runForTenant(t.id, () => this.runForCurrentTenant());
      } catch (err) {
        this.logger.error(`Hoshin reminders failed for tenant ${t.id}`, err as Error);
      }
    }
  }

  /** Bildirim gönderilen hedef sayısı. */
  async runForCurrentTenant(today = startOfUtcDay()): Promise<number> {
    const period = prevPeriod(currentPeriod('MONTHLY', today));
    const year = Number(period.slice(0, 4));
    const goals = await this.prisma.db.hoshinGoal.findMany({
      where: {
        status: 'ACTIVE', kpiId: null, ownerId: { not: null }, plan: { status: 'ACTIVE' }, OR: [{ year }, { level: 'BREAKTHROUGH' }],
        monthly: { some: { period: { startsWith: `${year}-` } } },
      },
      include: { monthly: { where: { period: { startsWith: `${year}-` } } } },
    });
    let sent = 0;
    for (const g of goals) {
      if (g.monthly.some((m) => m.period === period && m.actual !== null)) continue;
      sent += await this.notifications.notify({
        userIds: [g.ownerId!], type: 'GENERIC', title: `Hoshin gerçekleşmesi eksik: ${g.code} ${g.title} (${periodLabel(period)})`,
        body: 'Geçen ayın gerçekleşme değerini girin', link: `/hoshin/goals/${g.id}`, dedupeKey: `hoshin-missing:${g.id}:${period}`,
      });
    }
    return sent;
  }
}
