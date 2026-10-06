import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { suggestionCode } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import { config } from '../../config';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SuggestionAccessService } from './suggestion-access.service';
import { isoWeekKey } from './suggestion-rules';
import { SuggestionSettingsService } from './suggestion-settings.service';

/** Ön değerlendirmesi bu günden fazladır bekleyen öneriler için hatırlatma */
export const PRE_EVALUATION_REMINDER_DAYS = 5;

@Injectable()
export class SuggestionsReminderJob {
  private readonly logger = new Logger(SuggestionsReminderJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly notifications: NotificationsService,
    private readonly settings: SuggestionSettingsService,
    private readonly sAccess: SuggestionAccessService,
  ) {}

  @Cron('15 8 * * *', { timeZone: 'Europe/Istanbul' })
  async scheduled() {
    if (config.schedulerEnabled) await this.runAll();
  }

  async runAll() {
    const tenants = await this.prisma.raw.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    for (const t of tenants) {
      try {
        await this.ctx.runForTenant(t.id, () => this.runForCurrentTenant());
      } catch (err) {
        this.logger.error(`Suggestion reminders failed for tenant ${t.id}`, err as Error);
      }
    }
  }

  /**
   * - 5 günden uzun süredir ön değerlendirme bekleyen öneriler → değerlendirici (ISO hafta başına bir kez)
   * - Komite kuyruğu haftalık özeti → komite üyeleri (ISO hafta başına bir kez)
   */
  async runForCurrentTenant(today = new Date()) {
    const week = isoWeekKey(today);
    const cutoff = new Date(today.getTime() - PRE_EVALUATION_REMINDER_DAYS * 86_400_000);
    let preEvaluation = 0;
    let committee = 0;

    const waiting = await this.prisma.db.suggestion.findMany({
      where: { status: { in: ['SUBMITTED', 'PRE_EVALUATION'] }, submittedAt: { lt: cutoff } },
      select: { id: true, number: true, title: true, preEvaluatorId: true },
    });
    let fallback: string[] | null = null;
    for (const s of waiting) {
      let userIds = s.preEvaluatorId ? [s.preEvaluatorId] : null;
      if (!userIds) userIds = fallback ??= await this.sAccess.manageUserIds();
      preEvaluation += await this.notifications.notify({
        userIds, type: 'GENERIC', title: `Öneri ön değerlendirmesi bekliyor: ${suggestionCode(s.number)} ${s.title}`,
        body: `${PRE_EVALUATION_REMINDER_DAYS} günden uzun süredir değerlendirilmedi.`, link: `/suggestions/${s.id}`,
        dedupeKey: `sugg-preeval:${s.id}:${week}`,
      });
    }

    const queued = await this.prisma.db.suggestion.count({ where: { status: 'COMMITTEE' } });
    if (queued > 0) {
      const c = await this.settings.committee();
      committee = await this.notifications.notify({
        userIds: c.userIds, type: 'GENERIC', title: `Komite kuyruğunda ${queued} öneri bekliyor`,
        body: 'Haftalık komite özeti', link: '/suggestions?tab=evaluation', dedupeKey: `sugg-committee-digest:${week}`,
      });
    }
    return { preEvaluation, committee };
  }
}
