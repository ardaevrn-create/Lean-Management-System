import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Query, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiProperty, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AttachmentItem } from '@lean/shared';
import { IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { config } from '../../config';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';

class AttachmentTargetDto {
  @ApiProperty({ example: 'action' }) @IsString() @MaxLength(50) entityType: string;
  @ApiProperty() @IsString() @MaxLength(50) entityId: string;
}

const BLOCKED_EXT = /\.(exe|bat|cmd|sh|js|msi|dll|com|scr|ps1|html?)$/i;

/** Her varlığa (aksiyon, denetim, kaizen...) eklenebilen dosyalar. */
@ApiTags('Attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: config.maxUploadBytes } }))
  async upload(@UploadedFile() file: Express.Multer.File, @Body() dto: AttachmentTargetDto): Promise<AttachmentItem> {
    if (!file) throw new BadRequestException('file is required');
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    if (BLOCKED_EXT.test(fileName)) throw new BadRequestException('File type not allowed');
    const tenantId = this.ctx.tenantId;
    const now = new Date();
    const key = `${tenantId}/${now.getUTCFullYear()}/${now.getUTCMonth() + 1}/${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await this.storage.put(key, file.buffer);
    const created = await this.prisma.db.attachment.create({
      data: {
        tenantId, entityType: dto.entityType, entityId: dto.entityId, fileName,
        mimeType: file.mimetype, size: file.size, storageKey: key, uploadedById: this.ctx.userId,
      },
      include: { uploadedBy: { select: { id: true, fullName: true, username: true } } },
    });
    await this.audit.log(dto.entityType, dto.entityId, 'attachment.added', { fileName });
    return this.toItem(created);
  }

  @Get()
  async list(@Query() dto: AttachmentTargetDto): Promise<AttachmentItem[]> {
    const rows = await this.prisma.db.attachment.findMany({
      where: { entityType: dto.entityType, entityId: dto.entityId },
      include: { uploadedBy: { select: { id: true, fullName: true, username: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toItem(r));
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const att = await this.prisma.db.attachment.findUniqueOrThrow({ where: { id } });
    const data = await this.storage.get(att.storageKey);
    res.setHeader('Content-Type', att.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(att.fileName)}`);
    res.send(data);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    const att = await this.prisma.db.attachment.findUniqueOrThrow({ where: { id } });
    const user = this.ctx.user;
    if (att.uploadedById !== user.id && !user.permissions.has(PERMISSIONS.TENANT_SETTINGS)) throw new ForbiddenException();
    await this.prisma.db.attachment.delete({ where: { id } });
    await this.storage.remove(att.storageKey);
    await this.audit.log(att.entityType, att.entityId, 'attachment.removed', { fileName: att.fileName });
  }

  private toItem(r: { id: string; fileName: string; mimeType: string; size: number; createdAt: Date; uploadedBy: AttachmentItem['uploadedBy'] }): AttachmentItem {
    return { id: r.id, fileName: r.fileName, mimeType: r.mimeType, size: r.size, uploadedBy: r.uploadedBy, createdAt: r.createdAt.toISOString() };
  }
}
