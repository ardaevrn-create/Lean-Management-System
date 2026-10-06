import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type TenantInfo } from '@lean/shared';
import type { Tenant } from '@prisma/client';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PlatformAdminOnly, RequirePermissions } from '../../common/decorators';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

const toInfo = (t: Tenant): TenantInfo => ({
  id: t.id, code: t.code, name: t.name, status: t.status, locale: t.locale, timezone: t.timezone,
  logoUrl: t.logoUrl, primaryColor: t.primaryColor,
});

class UpdateTenantDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['tr', 'en']) locale?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) primaryColor?: string;
}

class CreateTenantDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() adminUsername: string;
  @ApiProperty() @IsString() @MinLength(8) adminPassword: string;
  @ApiProperty() @IsString() adminFullName: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() adminEmail?: string;
}

@ApiTags('Tenant')
@ApiBearerAuth()
@Controller()
export class TenantsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly provisioning: TenantProvisioningService,
    private readonly audit: AuditService,
  ) {}

  @Get('tenant')
  async current() {
    return toInfo(await this.prisma.raw.tenant.findUniqueOrThrow({ where: { id: this.ctx.tenantId } }));
  }

  @Patch('tenant')
  @RequirePermissions(PERMISSIONS.TENANT_SETTINGS)
  async update(@Body() dto: UpdateTenantDto) {
    const before = await this.prisma.raw.tenant.findUniqueOrThrow({ where: { id: this.ctx.tenantId } });
    const updated = await this.prisma.raw.tenant.update({ where: { id: before.id }, data: dto });
    await this.audit.log('tenant', before.id, 'updated', AuditService.diff(before, dto));
    return toInfo(updated);
  }

  @Get('platform/tenants')
  @PlatformAdminOnly()
  async list() {
    return (await this.prisma.raw.tenant.findMany({ orderBy: { createdAt: 'desc' } })).map(toInfo);
  }

  @Post('platform/tenants')
  @PlatformAdminOnly()
  async create(@Body() dto: CreateTenantDto) {
    const { tenant } = await this.provisioning.provision(dto);
    return toInfo(tenant);
  }
}
