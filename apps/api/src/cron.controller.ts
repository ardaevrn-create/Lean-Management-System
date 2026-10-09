import { Controller, Get, Headers, Logger, UnauthorizedException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from './common/decorators';
import { config } from './config';
import { ActionsReminderJob } from './core/actions/actions-reminder.job';
import { AuditsReminderJob } from './modules/audits/audits-reminder.job';
import { KpiReminderJob } from './modules/kpi/kpi-reminder.job';
import { MeetingsReminderJob } from './modules/meetings/meetings-reminder.job';
import { ProblemsReminderJob } from './modules/problems/problems-reminder.job';
import { HoshinReminderJob } from './modules/strategy/hoshin-reminder.job';
import { SuggestionsReminderJob } from './modules/suggestions/suggestions-reminder.job';

interface Job { runAll(): Promise<unknown> }

/**
 * Sunucusuz ortamda (Vercel) uygulama içi zamanlayıcı güvenilir çalışmaz; hatırlatma işleri
 * Vercel Cron tarafından günde bir kez bu uç nokta üzerinden tetiklenir.
 */
@ApiExcludeController()
@Controller('internal/cron')
export class CronController {
  private readonly logger = new Logger(CronController.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  @Public()
  @Get('daily')
  async daily(@Headers('authorization') authorization?: string) {
    if (!config.cronSecret || authorization !== `Bearer ${config.cronSecret}`) throw new UnauthorizedException();
    const jobs: (new (...args: never[]) => Job)[] = [
      ActionsReminderJob, KpiReminderJob, MeetingsReminderJob, ProblemsReminderJob, AuditsReminderJob, SuggestionsReminderJob,
    ];
    // Hoshin hatırlatması ayda bir (ayın 3'ü)
    if (new Date().getUTCDate() === 3) jobs.push(HoshinReminderJob);

    const results: Record<string, string> = {};
    for (const type of jobs) {
      try {
        await this.moduleRef.get(type, { strict: false }).runAll();
        results[type.name] = 'ok';
      } catch (err) {
        this.logger.error(`${type.name} failed`, err as Error);
        results[type.name] = 'error';
      }
    }
    return results;
  }
}
