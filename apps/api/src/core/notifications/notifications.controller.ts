import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import type { NotificationItem, Paginated } from '@lean/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PageQueryDto, pageArgs, paginated } from '../../common/pagination';
import { RequestContext } from '../../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

class NotificationQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() unread?: boolean;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext) {}

  @Get()
  async list(@Query() query: NotificationQuery): Promise<Paginated<NotificationItem>> {
    const where = { userId: this.ctx.userId, ...(query.unread ? { readAt: null } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.db.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(query) }),
      this.prisma.db.notification.count({ where }),
    ]);
    return paginated(
      rows.map((n) => ({
        id: n.id, type: n.type as NotificationItem['type'], title: n.title, body: n.body, link: n.link,
        readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString(),
      })),
      total,
      query,
    );
  }

  @Get('unread-count')
  async unreadCount() {
    return { count: await this.prisma.db.notification.count({ where: { userId: this.ctx.userId, readAt: null } }) };
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll() {
    await this.prisma.db.notification.updateMany({ where: { userId: this.ctx.userId, readAt: null }, data: { readAt: new Date() } });
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@Param('id') id: string) {
    await this.prisma.db.notification.updateMany({ where: { id, userId: this.ctx.userId }, data: { readAt: new Date() } });
  }
}
