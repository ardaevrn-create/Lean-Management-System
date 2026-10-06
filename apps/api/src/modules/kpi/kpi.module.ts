import { Module, OnModuleInit } from '@nestjs/common';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { KpiAccessService } from './kpi-access.service';
import { KpiCalcService } from './kpi-calc.service';
import { KpiController } from './kpi.controller';
import { KpiDefinitionsService } from './kpi-definitions.service';
import { KpiDeviationsService } from './kpi-deviations.service';
import { KpiDefinitionsImporter, KpiTargetsImporter, KpiValuesImporter } from './kpi.importers';
import { KpiReminderJob } from './kpi-reminder.job';
import { KpiReportsService } from './kpi-reports.service';
import { KpiSnapshotService } from './kpi-snapshot.service';
import { KpiValuesService } from './kpi-values.service';

@Module({
  controllers: [KpiController],
  providers: [
    KpiAccessService, KpiSnapshotService, KpiCalcService, KpiDefinitionsService, KpiValuesService, KpiDeviationsService, KpiReportsService,
    KpiReminderJob, KpiDefinitionsImporter, KpiTargetsImporter, KpiValuesImporter,
  ],
  exports: [KpiDefinitionsService, KpiValuesService, KpiDeviationsService, KpiReportsService, KpiReminderJob],
})
export class KpiModule implements OnModuleInit {
  constructor(private readonly dashboard: DashboardService, private readonly reports: KpiReportsService) {}

  onModuleInit() {
    this.dashboard.registerWidget('kpi', (user) => this.reports.widget(user));
  }
}
