import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AuditLogItem, type Paginated } from '@lean/shared';
import { IsOptional, IsString } from 'class-validator';
import { RequirePermissions } from '../../common/decorators';
import { PageQueryDto, pageArgs, paginated } from '../../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

class AuditLogQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() entity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() userId?: string;
}

@ApiTags('Audit Log')
@ApiBearerAuth()
@RequirePermissions(PERMISSIONS.AUDIT_LOG_VIEW)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: AuditLogQuery): Promise<Paginated<AuditLogItem>> {
    const where = { entity: query.entity, entityId: query.entityId, userId: query.userId };
    const [rows, total] = await Promise.all([
      this.prisma.db.auditLog.findMany({
        where,
        include: { user: { select: { id: true, fullName: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        ...pageArgs(query),
      }),
      this.prisma.db.auditLog.count({ where }),
    ]);
    return paginated(
      rows.map((r) => ({ id: r.id, entity: r.entity, entityId: r.entityId, action: r.action, diff: r.diff, user: r.user, createdAt: r.createdAt.toISOString() })),
      total,
      query,
    );
  }
}
