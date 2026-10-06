import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { periodLabel } from '@lean/shared';
import { diffDays, startOfUtcDay } from '../../common/dates';
import { RequestContext } from '../../common/request-context';
import { config } from '../../config';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { KpiDefinitionsService } from './kpi-definitions.service';
import { expectedPeriods, type KpiRow } from './kpi-core';
import { KpiSnapshotService } from './kpi-snapshot.service';

/** Gecikmenin bu kadar gününden sonra birim yöneticisine eskalasyon yapılır. */
export const KPI_ESCALATION_DAYS = 3;

/** Eksik veri girişi ve sapma açıklaması hatırlatmaları (M8-07). */
@Injectable()
export class KpiReminderJob {
  private readonly logger = new Logger(KpiReminderJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly notifications: NotificationsService,
    private readonly snapshots: KpiSnapshotService,
    private readonly defs: KpiDefinitionsService,
  ) {}

  @Cron('30 7 * * *', { timeZone: 'Europe/Istanbul' })
  async scheduled() {
    if (config.schedulerEnabled) await this.runAll();
  }

  async runAll() {
    const tenants = await this.prisma.raw.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    for (const t of tenants) {
      try {
        await this.ctx.runForTenant(t.id, () => this.runForCurrentTenant());
      } catch (err) {
        this.logger.error(`KPI reminders failed for tenant ${t.id}`, err as Error);
      }
    }
  }

  async runForCurrentTenant(today = startOfUtcDay()) {
    const kpis = await this.defs.loadMany({ isActive: true }, 5000);
    const cells = await this.snapshots.cells(kpis, (k) => expectedPeriods(k, today), today);
    const managerUsers = await this.managerUsers(kpis);

    for (const k of kpis) {
      for (const c of cells.get(k.id) ?? []) {
        const label = `${k.code} — ${k.name} (${periodLabel(c.period)})`;
        if (c.entryState === 'MISSING' && !k.formula) {
          const late = diffDays(today, c.dueDate);
          await this.notifications.notify({
            userIds: [k.dataEntryUserId ?? k.ownerId],
            type: 'KPI_VALUE_MISSING',
            title: `Eksik KPI verisi: ${label}`,
            body: `Son giriş tarihi ${c.dueDate.toISOString().slice(0, 10)} — ${late} gün gecikti`,
            link: '/kpi?tab=entry',
            dedupeKey: `kpi-missing:${k.id}:${c.period}`,
          });
          const manager = managerUsers.get(k.orgUnit.managerEmployeeId ?? '') ?? managerUsers.get(k.owner.employee?.managerId ?? '');
          if (late >= KPI_ESCALATION_DAYS && manager && manager !== (k.dataEntryUserId ?? k.ownerId)) {
            await this.notifications.notify({
              userIds: [manager],
              type: 'KPI_VALUE_MISSING',
              title: `Eskalasyon — eksik KPI verisi: ${label}`,
              body: `${late} gündür girilmedi (sorumlu: ${(k.dataEntryUser ?? k.owner).fullName})`,
              link: '/kpi?tab=missing',
              dedupeKey: `kpi-missing-esc:${k.id}:${c.period}`,
            });
          }
        } else if (c.entryState === 'DEVIATION_REQUIRED') {
          await this.notifications.notify({
            userIds: [k.ownerId],
            type: 'KPI_DEVIATION_REQUIRED',
            title: `Sapma açıklaması gerekli: ${label}`,
            body: c.status === 'RED' ? 'Hedef altı: açıklama ve en az bir karşı önlem aksiyonu girin' : 'Hedefe yakın sapma: açıklama girin',
            link: '/kpi?tab=deviations',
            dedupeKey: `kpi-deviation:${k.id}:${c.period}:${c.deviation?.decidedAt ?? ''}`,
          });
        }
      }
    }
  }

  /** employeeId → aktif kullanıcı id */
  private async managerUsers(kpis: KpiRow[]): Promise<Map<string, string>> {
    const ids = [...new Set(kpis.flatMap((k) => [k.orgUnit.managerEmployeeId, k.owner.employee?.managerId]).filter((x): x is string => !!x))];
    if (!ids.length) return new Map();
    const users = await this.prisma.db.user.findMany({ where: { employeeId: { in: ids }, isActive: true }, select: { id: true, employeeId: true } });
    return new Map(users.map((u) => [u.employeeId!, u.id]));
  }
}
