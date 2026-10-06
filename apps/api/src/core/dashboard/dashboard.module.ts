import { Controller, Get, Global, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('me')
  me() {
    return this.dashboard.me();
  }
}

@Global()
@Module({ controllers: [DashboardController], providers: [DashboardService], exports: [DashboardService] })
export class DashboardModule {}
