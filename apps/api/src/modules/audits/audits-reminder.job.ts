import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { auditCode, tagCode } from '@lean/shared';
import { addDays, startOfUtcDay } from '../../common/dates';
import { RequestContext } from '../../common/request-context';
import { config } from '../../config';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { daysBetween } from './audit-rules';

/** Günlük 07:00 (Europe/Istanbul): yaklaşan / geciken denetim ve etiket hatırlatmaları (mükerrer göndermez). */
@Injectable()
export class AuditsReminderJob {
  private readonly logger = new Logger(AuditsReminderJob.name);

  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext, private readonly notifications: NotificationsService) {}

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
        this.logger.error(`Audit reminders failed for tenant ${t.id}`, err as Error);
      }
    }
  }

  async runForCurrentTenant(now = new Date()) {
    const today = startOfUtcDay(now);
    const open = { status: { in: ['PLANNED' as const, 'IN_PROGRESS' as const] } };
    const include = {
      area: { select: { name: true, orgUnit: { select: { name: true, manager: { select: { user: { select: { id: true } } } } } } } },
    };

    // 2 gün kala
    const soon = await this.prisma.db.audit.findMany({ where: { ...open, dueDate: addDays(today, 2) }, include });
    for (const a of soon) {
      await this.notifications.notify({
        userIds: [a.auditorId], type: 'GENERIC', title: `Denetim yaklaşıyor: ${auditCode(a.number)} ${a.area.name}`,
        body: `Termin: ${a.dueDate.toISOString().slice(0, 10)}`, link: `/audits/${a.id}`, dedupeKey: `audit-due:${a.id}`,
      });
    }

    // Geciken denetimler: denetçi hemen, birim yöneticisi 3 gün sonra
    const overdue = await this.prisma.db.audit.findMany({ where: { ...open, dueDate: { lt: today } }, include });
    let managerNotified = 0;
    for (const a of overdue) {
      const days = daysBetween(today, a.dueDate);
      await this.notifications.notify({
        userIds: [a.auditorId], type: 'GENERIC', title: `Geciken denetim: ${auditCode(a.number)} ${a.area.name}`,
        body: `${days} gün gecikti`, link: `/audits/${a.id}`, dedupeKey: `audit-overdue:${a.id}`,
      });
      const managerId = a.area.orgUnit.manager?.user?.id;
      if (days >= 3 && managerId) {
        managerNotified += await this.notifications.notify({
          userIds: [managerId], type: 'GENERIC', title: `Geciken denetim (${days} gün): ${auditCode(a.number)} ${a.area.name}`,
          body: `${a.area.orgUnit.name} biriminde planlanan denetim yapılmadı`, link: `/audits/${a.id}`, dedupeKey: `audit-overdue-mgr:${a.id}`,
        });
      }
    }

    // Geciken etiketler
    const tags = await this.prisma.db.abnormalityTag.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { lt: today }, assignedToId: { not: null } },
      include: { area: { select: { name: true } } },
    });
    for (const t of tags) {
      await this.notifications.notify({
        userIds: [t.assignedToId!], type: 'GENERIC', title: `Geciken etiket: ${tagCode(t.number)} ${t.area.name}`,
        body: t.description.slice(0, 200), link: '/audits?tab=tags', dedupeKey: `tag-overdue:${t.id}`,
      });
    }
    return { dueSoon: soon.length, overdue: overdue.length, managerNotified, overdueTags: tags.length };
  }
}
