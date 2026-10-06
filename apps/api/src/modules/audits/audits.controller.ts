import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type AbnormalityTagItem, type AuditListItem } from '@lean/shared';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators';
import { ExcelService } from '../../core/excel/excel.service';
import { AuditMastersService } from './audit-masters.service';
import { AuditPlansService } from './audit-plans.service';
import { AuditStatsService } from './audit-stats.service';
import { AuditTagsService } from './audit-tags.service';
import { AuditTemplatesService } from './audit-templates.service';
import {
  AreaQuery, AuditQuery, BuiltinTemplateDto, CancelAuditDto, CloseTagDto, CreateAreaDto, CreateAuditDto, CreateEquipmentDto,
  CreateFindingActionDto, CreatePlanDto, CreateTagDto, CreateTemplateDto, EquipmentQuery, GenerateQuery, StatsQuery, TagQuery, TemplateQuery,
  UpdateAnswerDto, UpdateAreaDto, UpdateAuditDto, UpdateEquipmentDto, UpdatePlanDto, UpdateTagDto, UpdateTemplateDto,
} from './audits.dto';
import { AuditsService } from './audits.service';

const MANAGE = PERMISSIONS.AUDIT_MANAGE;
const PERFORM = PERMISSIONS.AUDIT_PERFORM;

@ApiTags('Audit templates')
@ApiBearerAuth()
@Controller('audits/templates')
export class AuditTemplatesController {
  constructor(private readonly templates: AuditTemplatesService) {}

  @Get()
  list(@Query() query: TemplateQuery) {
    return this.templates.list(query);
  }

  @Get('builtin')
  builtin() {
    return this.templates.builtinCatalog();
  }

  @Post('builtin/:key')
  @RequirePermissions(MANAGE)
  fromBuiltin(@Param('key') key: string, @Body() dto: BuiltinTemplateDto) {
    return this.templates.createBuiltin(key, dto);
  }

  @Post()
  @RequirePermissions(MANAGE)
  create(@Body() dto: CreateTemplateDto) {
    return this.templates.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Patch(':id')
  @RequirePermissions(MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(MANAGE)
  deactivate(@Param('id') id: string) {
    return this.templates.deactivate(id);
  }
}

@ApiTags('Audit areas & equipment')
@ApiBearerAuth()
@Controller('audits')
export class AuditMastersController {
  constructor(private readonly masters: AuditMastersService) {}

  @Get('areas')
  areas(@Query() query: AreaQuery) {
    return this.masters.listAreas(query);
  }

  @Post('areas')
  @RequirePermissions(MANAGE)
  createArea(@Body() dto: CreateAreaDto) {
    return this.masters.createArea(dto);
  }

  @Patch('areas/:id')
  @RequirePermissions(MANAGE)
  updateArea(@Param('id') id: string, @Body() dto: UpdateAreaDto) {
    return this.masters.updateArea(id, dto);
  }

  @Delete('areas/:id')
  @RequirePermissions(MANAGE)
  deactivateArea(@Param('id') id: string) {
    return this.masters.deactivateArea(id);
  }

  @Get('equipment')
  equipment(@Query() query: EquipmentQuery) {
    return this.masters.listEquipment(query);
  }

  @Post('equipment')
  @RequirePermissions(MANAGE)
  createEquipment(@Body() dto: CreateEquipmentDto) {
    return this.masters.createEquipment(dto);
  }

  @Patch('equipment/:id')
  @RequirePermissions(MANAGE)
  updateEquipment(@Param('id') id: string, @Body() dto: UpdateEquipmentDto) {
    return this.masters.updateEquipment(id, dto);
  }

  @Delete('equipment/:id')
  @RequirePermissions(MANAGE)
  deactivateEquipment(@Param('id') id: string) {
    return this.masters.deactivateEquipment(id);
  }
}

@ApiTags('Audit plans')
@ApiBearerAuth()
@Controller('audits/plans')
export class AuditPlansController {
  constructor(private readonly plans: AuditPlansService) {}

  @Get()
  list() {
    return this.plans.list();
  }

  @Post()
  @RequirePermissions(MANAGE)
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.plans.get(id);
  }

  @Patch(':id')
  @RequirePermissions(MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(MANAGE)
  deactivate(@Param('id') id: string) {
    return this.plans.deactivate(id);
  }

  @Post(':id/generate')
  @HttpCode(200)
  @RequirePermissions(MANAGE)
  generate(@Param('id') id: string, @Query() query: GenerateQuery) {
    return this.plans.generate(id, query.until);
  }
}

const TAG_STATUS_TR: Record<string, string> = { OPEN: 'Açık', IN_PROGRESS: 'İşlemde', CLOSED: 'Kapalı', CANCELLED: 'İptal' };
const TAG_COLOR_TR: Record<string, string> = { RED: 'Kırmızı (bakım)', BLUE: 'Mavi (operatör)' };
const TAG_CATEGORY_TR: Record<string, string> = {
  LEAK: 'Kaçak', LOOSENESS: 'Gevşeklik', CONTAMINATION: 'Kirlilik', DAMAGE: 'Hasar', SAFETY: 'Güvenlik', MISSING_PART: 'Eksik parça', OTHER: 'Diğer',
};

@ApiTags('TPM tags')
@ApiBearerAuth()
@Controller('audits/tags')
export class AuditTagsController {
  constructor(private readonly tags: AuditTagsService, private readonly excel: ExcelService) {}

  @Get()
  list(@Query() query: TagQuery) {
    return this.tags.list(query);
  }

  @Get('export')
  async export(@Query() query: TagQuery, @Res() res: Response) {
    const rows = await this.tags.listAll(query);
    const buffer = await this.excel.build<AbnormalityTagItem>('Etiketler', [
      { header: 'No', key: 'code', width: 12, value: (r) => r.code },
      { header: 'Renk', key: 'color', width: 18, value: (r) => TAG_COLOR_TR[r.color] },
      { header: 'Kategori', key: 'category', width: 16, value: (r) => TAG_CATEGORY_TR[r.category] },
      { header: 'Alan', key: 'area', width: 30, value: (r) => r.area.name },
      { header: 'Ekipman', key: 'equipment', width: 24, value: (r) => r.equipment?.name },
      { header: 'Açıklama', key: 'description', width: 50, value: (r) => r.description },
      { header: 'Açan', key: 'openedBy', width: 22, value: (r) => r.openedBy.fullName },
      { header: 'Atanan', key: 'assignedTo', width: 22, value: (r) => r.assignedTo?.fullName },
      { header: 'Termin', key: 'dueDate', width: 12, value: (r) => r.dueDate },
      { header: 'Durum', key: 'status', width: 12, value: (r) => TAG_STATUS_TR[r.status] },
      { header: 'Açılış', key: 'createdAt', width: 18, value: (r) => r.createdAt.slice(0, 10) },
      { header: 'Kapanış', key: 'closedAt', width: 18, value: (r) => r.closedAt?.slice(0, 10) },
      { header: 'Kapanış notu', key: 'closeNote', width: 40, value: (r) => r.closeNote },
    ], rows);
    this.excel.send(res, 'etiketler.xlsx', buffer);
  }

  /** Herkes etiket açabilir. */
  @Post()
  create(@Body() dto: CreateTagDto) {
    return this.tags.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tags.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.tags.update(id, dto);
  }

  @Post(':id/start')
  @HttpCode(200)
  start(@Param('id') id: string) {
    return this.tags.start(id);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@Param('id') id: string, @Body() dto: CloseTagDto) {
    return this.tags.close(id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.tags.cancel(id);
  }
}

const STATUS_TR: Record<string, string> = { PLANNED: 'Planlandı', IN_PROGRESS: 'Devam ediyor', COMPLETED: 'Tamamlandı', CANCELLED: 'İptal' };

@ApiTags('Audits')
@ApiBearerAuth()
@Controller('audits')
export class AuditsController {
  constructor(
    private readonly audits: AuditsService,
    private readonly stats: AuditStatsService,
    private readonly excel: ExcelService,
  ) {}

  /* ---- Statik yollar (":id" yolundan önce tanımlanmalı) ---- */

  @Get()
  list(@Query() query: AuditQuery) {
    return this.audits.list(query);
  }

  @Get('stats')
  getStats(@Query() query: StatsQuery) {
    return this.stats.stats(query);
  }

  @Get('export')
  async export(@Query() query: AuditQuery, @Res() res: Response) {
    const rows = await this.audits.listAll(query);
    const buffer = await this.excel.build<AuditListItem>('Denetimler', [
      { header: 'No', key: 'code', width: 12, value: (r) => r.code },
      { header: 'Şablon', key: 'template', width: 34, value: (r) => r.template.name },
      { header: 'Alan', key: 'area', width: 30, value: (r) => r.area.name },
      { header: 'Birim', key: 'orgUnit', width: 24, value: (r) => r.area.orgUnit?.name },
      { header: 'Ekipman', key: 'equipment', width: 22, value: (r) => r.equipment?.name },
      { header: 'Denetçi', key: 'auditor', width: 22, value: (r) => r.auditor.fullName },
      { header: 'Termin', key: 'dueDate', width: 12, value: (r) => r.dueDate },
      { header: 'Durum', key: 'status', width: 14, value: (r) => STATUS_TR[r.status] },
      { header: 'Skor (%)', key: 'score', width: 10, value: (r) => r.scorePct },
      { header: 'Bulgu', key: 'findings', width: 8, value: (r) => r.findingCount },
      { header: 'Gecikme (gün)', key: 'overdue', width: 14, value: (r) => r.daysOverdue || null },
      { header: 'Tamamlanma', key: 'completedAt', width: 18, value: (r) => r.completedAt?.slice(0, 10) },
    ], rows);
    this.excel.send(res, 'denetimler.xlsx', buffer);
  }

  @Post()
  @RequirePermissions(PERFORM, MANAGE)
  create(@Body() dto: CreateAuditDto) {
    return this.audits.create(dto);
  }

  /* ---- Tek denetim ---- */

  @Get(':id')
  get(@Param('id') id: string) {
    return this.audits.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAuditDto) {
    return this.audits.update(id, dto);
  }

  @Post(':id/start')
  @HttpCode(200)
  start(@Param('id') id: string) {
    return this.audits.start(id);
  }

  @Patch(':id/answers/:answerId')
  updateAnswer(@Param('id') id: string, @Param('answerId') answerId: string, @Body() dto: UpdateAnswerDto) {
    return this.audits.updateAnswer(id, answerId, dto);
  }

  @Post(':id/answers/:answerId/action')
  createAction(@Param('id') id: string, @Param('answerId') answerId: string, @Body() dto: CreateFindingActionDto) {
    return this.audits.createFindingAction(id, answerId, dto);
  }

  @Get(':id/actions')
  actions(@Param('id') id: string) {
    return this.audits.listActions(id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@Param('id') id: string) {
    return this.audits.complete(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() dto: CancelAuditDto) {
    return this.audits.cancel(id, dto.reason);
  }
}
