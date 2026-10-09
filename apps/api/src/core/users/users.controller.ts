import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '@lean/shared';
import { RequirePermissions } from '../../common/decorators';
import { RolesService } from './roles.service';
import { BulkFromEmployeesDto, CreateUserDto, LookupQuery, SaveRoleDto, SetRolesDto, UpdateUserDto, UserQuery } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Kişi seçici: tüm oturum açmış kullanıcılar kullanabilir. */
  @Get('lookup')
  lookup(@Query() query: LookupQuery) {
    return this.users.lookup(query.q);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  list(@Query() query: UserQuery) {
    return this.users.list(query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Post('bulk-from-employees')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  bulk(@Body() dto: BulkFromEmployeesDto) {
    return this.users.createForEmployees(dto.employeeIds);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Post(':id/reset-password')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  resetPassword(@Param('id') id: string) {
    return this.users.resetPassword(id);
  }

  @Put(':id/roles')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  setRoles(@Param('id') id: string, @Body() dto: SetRolesDto) {
    return this.users.setRoles(id, dto.assignments);
  }
}

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE, PERMISSIONS.USER_MANAGE)
  list() {
    return this.roles.list();
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  permissions() {
    return this.roles.permissions();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  create(@Body() dto: SaveRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  update(@Param('id') id: string, @Body() dto: SaveRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  remove(@Param('id') id: string) {
    return this.roles.remove(id);
  }
}
