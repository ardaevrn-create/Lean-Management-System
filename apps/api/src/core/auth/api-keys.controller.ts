import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ALL_PERMISSIONS, PERMISSIONS } from '@lean/shared';
import { ArrayNotEmpty, IsArray, IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { RequirePermissions } from '../../common/decorators';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { randomToken, sha256 } from './crypto';

class CreateApiKeyDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayNotEmpty() @IsIn(ALL_PERMISSIONS, { each: true }) permissions: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
}

/** Entegrasyonlar (Power BI, Power Automate, ERP script'leri) için API anahtarları. */
@ApiTags('API Keys')
@ApiBearerAuth()
@RequirePermissions(PERMISSIONS.API_KEY_MANAGE)
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext) {}

  @Get()
  async list() {
    const keys = await this.prisma.db.apiKey.findMany({ orderBy: { createdAt: 'desc' } });
    return keys.map(({ keyHash: _, ...k }) => k);
  }

  /** Anahtar yalnızca oluşturma yanıtında bir kez gösterilir. */
  @Post()
  async create(@Body() dto: CreateApiKeyDto) {
    const user = this.ctx.user;
    const notOwned = dto.permissions.filter((p) => !user.permissions.has(p));
    if (notOwned.length) throw new BusinessException('PERMISSION_NOT_OWNED', 'Sahip olmadığınız izinleri anahtara veremezsiniz', notOwned);
    const prefix = randomToken(6).replace(/[-_]/g, 'x');
    const key = `lk_${prefix}_${randomToken(24)}`;
    const created = await this.prisma.db.apiKey.create({
      data: {
        tenantId: this.ctx.tenantId,
        name: dto.name,
        prefix,
        keyHash: sha256(key),
        permissions: dto.permissions,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdById: user.id,
      },
    });
    return { id: created.id, name: created.name, prefix, key, permissions: created.permissions, expiresAt: created.expiresAt };
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(@Param('id') id: string) {
    await this.prisma.db.apiKey.updateMany({ where: { id }, data: { revokedAt: new Date() } });
  }
}
