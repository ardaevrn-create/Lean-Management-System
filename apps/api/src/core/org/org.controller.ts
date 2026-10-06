import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@lean/shared';
import { RequirePermissions } from '../../common/decorators';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, CreateOrgUnitDto, EmployeeQuery, SaveTeamDto, UpdateEmployeeDto, UpdateOrgUnitDto } from './org.dto';
import { OrgUnitsService } from './org-units.service';
import { TeamsService } from './teams.service';

@ApiTags('Organization')
@ApiBearerAuth()
@Controller('org-units')
export class OrgUnitsController {
  constructor(private readonly service: OrgUnitsService) {}

  /** Tüm kullanıcılar birim listesini görebilir (seçim kutuları için). */
  @Get()
  list() {
    return this.service.list();
  }

  @Get('tree')
  tree() {
    return this.service.tree();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  create(@Body() dto: CreateOrgUnitDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateOrgUnitDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}

@ApiTags('Organization')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ORG_VIEW, PERMISSIONS.EMPLOYEE_MANAGE)
  list(@Query() query: EmployeeQuery) {
    return this.service.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ORG_VIEW, PERMISSIONS.EMPLOYEE_MANAGE)
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  create(@Body() dto: CreateEmployeeDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.EMPLOYEE_MANAGE)
  remove(@Param('id') id: string) {
    return this.service.deactivate(id);
  }
}

@ApiTags('Organization')
@ApiBearerAuth()
@Controller('teams')
export class TeamsController {
  constructor(private readonly service: TeamsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  create(@Body() dto: SaveTeamDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  update(@Param('id') id: string, @Body() dto: SaveTeamDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.ORG_MANAGE)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
