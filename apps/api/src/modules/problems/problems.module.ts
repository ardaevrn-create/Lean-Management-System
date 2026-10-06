import { Module } from '@nestjs/common';
import { ProblemAccessService } from './problem-access.service';
import { ProblemsController } from './problems.controller';
import { ProblemsReminderJob } from './problems-reminder.job';
import { ProblemsService } from './problems.service';
import { ProblemsStatsService } from './problems-stats.service';

/** M5 — Problem çözme / DÖF. Aksiyonlar çekirdek ActionsService üzerinden (kaynak: PROBLEM) açılır. */
@Module({
  controllers: [ProblemsController],
  providers: [ProblemAccessService, ProblemsService, ProblemsStatsService, ProblemsReminderJob],
  exports: [ProblemsService, ProblemsReminderJob],
})
export class ProblemsModule {}
