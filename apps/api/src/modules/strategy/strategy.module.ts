import { Module, OnModuleInit } from '@nestjs/common';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { KpiModule } from '../kpi/kpi.module';
import { HoshinAccessService } from './hoshin-access.service';
import { HoshinCatchballService } from './hoshin-catchball.service';
import { HoshinGoalsService } from './hoshin-goals.service';
import { HoshinMetricsService } from './hoshin-metrics.service';
import { HoshinReminderJob } from './hoshin-reminder.job';
import { HoshinReportsService } from './hoshin-reports.service';
import { HoshinXMatrixService } from './hoshin-xmatrix.service';
import { HoshinController, StrategyController } from './strategy.controller';
import { StrategyPlansService } from './strategy-plans.service';

/** M2 Stratejik Planlama + M3 Hoshin Kanri. KPI modülünün hedef/değer verisi doğrudan okunur (bowling = KPI hedefi vs değeri). */
@Module({
  imports: [KpiModule],
  controllers: [StrategyController, HoshinController],
  providers: [
    HoshinAccessService, HoshinMetricsService, StrategyPlansService, HoshinCatchballService, HoshinGoalsService, HoshinXMatrixService,
    HoshinReportsService, HoshinReminderJob,
  ],
  exports: [StrategyPlansService, HoshinGoalsService, HoshinReminderJob],
})
export class StrategyModule implements OnModuleInit {
  constructor(private readonly dashboard: DashboardService, private readonly reports: HoshinReportsService) {}

  onModuleInit() {
    this.dashboard.registerWidget('hoshin', (user) => this.reports.widget(user));
  }
}
