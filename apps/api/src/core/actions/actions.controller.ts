import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ActionListItem } from '@lean/shared';
import type { Response } from 'express';
import { ExcelService } from '../excel/excel.service';
import { ActionQuery, ChangeStatusDto, CommentDto, CreateActionDto, DecideDto, DueDateRequestDto, UpdateActionDto } from './actions.dto';
import { ActionsService } from './actions.service';

const STATUS_TR: Record<string, string> = { OPEN: 'Açık', IN_PROGRESS: 'Devam ediyor', DONE: 'Tamamlandı', VERIFIED: 'Doğrulandı', CANCELLED: 'İptal' };

@ApiTags('Actions')
@ApiBearerAuth()
@Controller('actions')
export class ActionsController {
  constructor(private readonly actions: ActionsService, private readonly excel: ExcelService) {}

  @Get()
  list(@Query() query: ActionQuery) {
    return this.actions.list(query);
  }

  @Get('stats')
  stats(@Query() query: ActionQuery) {
    return this.actions.stats(query);
  }

  @Get('export')
  async export(@Query() query: ActionQuery, @Res() res: Response) {
    const rows = await this.actions.listAll(query);
    const buffer = await this.excel.build<ActionListItem>('Aksiyonlar', [
      { header: 'No', key: 'code', width: 12, value: (r) => r.code },
      { header: 'Başlık', key: 'title', width: 50, value: (r) => r.title },
      { header: 'Durum', key: 'status', value: (r) => STATUS_TR[r.status] },
      { header: 'Öncelik', key: 'priority', value: (r) => r.priority },
      { header: 'Sorumlu', key: 'owner', width: 24, value: (r) => r.owner.fullName },
      { header: 'Birim', key: 'orgUnit', width: 24, value: (r) => r.orgUnit?.name },
      { header: 'Kaynak', key: 'source', value: (r) => r.sourceType },
      { header: 'Kaynak Açıklama', key: 'sourceLabel', width: 30, value: (r) => r.sourceLabel },
      { header: 'Termin', key: 'dueDate', value: (r) => r.dueDate },
      { header: 'İlerleme %', key: 'progress', value: (r) => r.progress },
      { header: 'Gecikme (gün)', key: 'overdueDays', value: (r) => r.overdueDays || null },
    ], rows);
    this.excel.send(res, 'aksiyonlar.xlsx', buffer);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.actions.get(id);
  }

  @Post()
  create(@Body() dto: CreateActionDto) {
    return this.actions.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateActionDto) {
    return this.actions.update(id, dto);
  }

  @Post(':id/status')
  status(@Param('id') id: string, @Body() dto: ChangeStatusDto) {
    return this.actions.changeStatus(id, dto.status, dto.note);
  }

  @Post(':id/comments')
  comment(@Param('id') id: string, @Body() dto: CommentDto) {
    return this.actions.addComment(id, dto.body);
  }

  @Post(':id/due-date-requests')
  requestDueDate(@Param('id') id: string, @Body() dto: DueDateRequestDto) {
    return this.actions.requestDueDate(id, dto.newDueDate, dto.reason);
  }

  @Post('due-date-requests/:requestId/decide')
  decide(@Param('requestId') requestId: string, @Body() dto: DecideDto) {
    return this.actions.decideDueDate(requestId, dto.approve, dto.note);
  }
}
