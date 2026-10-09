import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { EmployeesService } from './employees.service';
import { EmployeesController, OrgUnitsController, TeamsController } from './org.controller';
import { EmployeesImporter, OrgUnitsImporter } from './org.importers';
import { OrgUnitsService } from './org-units.service';
import { TeamsService } from './teams.service';

@Module({
  imports: [UsersModule],
  controllers: [OrgUnitsController, EmployeesController, TeamsController],
  providers: [OrgUnitsService, EmployeesService, TeamsService, OrgUnitsImporter, EmployeesImporter],
  exports: [OrgUnitsService, EmployeesService],
})
export class OrgModule {}
