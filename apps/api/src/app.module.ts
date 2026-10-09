import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsModule } from 'nestjs-cls';
import { Public } from './common/decorators';
import { CronController } from './cron.controller';
import { ActionsModule } from './core/actions/actions.module';
import { AuthModule } from './core/auth/auth.module';
import { DashboardModule } from './core/dashboard/dashboard.module';
import { OrgModule } from './core/org/org.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { SharedServicesModule } from './core/shared-services.module';
import { TenantsModule } from './core/tenants/tenants.module';
import { UsersModule } from './core/users/users.module';
import { MeetingsModule } from './modules/meetings/meetings.module';
import { KpiModule } from './modules/kpi/kpi.module';
import { ProblemsModule } from './modules/problems/problems.module';
import { StrategyModule } from './modules/strategy/strategy.module';
import { AuditsModule } from './modules/audits/audits.module';
import { SuggestionsModule } from './modules/suggestions/suggestions.module';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  health() {
    return { status: 'ok' };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    SharedServicesModule,
    TenantsModule,
    UsersModule,
    OrgModule,
    ActionsModule,
    DashboardModule,
    MeetingsModule,
    // İş modülleri
    KpiModule,
    ProblemsModule,
    StrategyModule,
    AuditsModule,
    SuggestionsModule,
  ],
  controllers: [HealthController, CronController],
})
export class AppModule {}
