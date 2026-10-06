import { Module } from '@nestjs/common';
import { AuditAccessService } from './audit-access.service';
import { AuditMastersService } from './audit-masters.service';
import { AuditPlansService } from './audit-plans.service';
import { AuditStatsService } from './audit-stats.service';
import { AuditTagsService } from './audit-tags.service';
import { AuditTemplatesService } from './audit-templates.service';
import { AuditMastersController, AuditPlansController, AuditsController, AuditTagsController, AuditTemplatesController } from './audits.controller';
import { AuditsReminderJob } from './audits-reminder.job';
import { AuditsService } from './audits.service';

/** M6 — 5S & TPM denetimleri. Bulgu aksiyonları çekirdek ActionsService üzerinden (kaynak: AUDIT_FINDING) açılır. */
@Module({
  // Sıra önemli: statik "audits/..." yolları ":id" yollarından önce eşleşmeli
  controllers: [AuditTemplatesController, AuditPlansController, AuditTagsController, AuditMastersController, AuditsController],
  providers: [
    AuditAccessService, AuditTemplatesService, AuditMastersService, AuditsService, AuditPlansService, AuditTagsService, AuditStatsService,
    AuditsReminderJob,
  ],
  exports: [AuditsService, AuditTemplatesService, AuditMastersService, AuditPlansService, AuditTagsService, AuditsReminderJob],
})
export class AuditsModule {}
