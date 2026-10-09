import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type MeetingListItem } from '@lean/shared';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators';
import { ExcelService } from '../../core/excel/excel.service';
import { formatDateTimeTr } from './meeting-rules';
import { MeetingAccessService } from './meeting-access.service';
import { MeetingTypesService } from './meeting-types.service';
import {
  CancelMeetingDto, CreateDecisionDto, CreateMeetingActionDto, CreateMeetingDto, CreateMeetingTypeDto, CreateSeriesDto, FromTemplateDto,
  MeetingQuery, MeetingTypeQuery, RangeQuery, SeriesActionDto, SetAgendaDto, SetAttendanceDto, SetParticipantsDto, UpdateAgendaItemDto,
  UpdateDecisionDto, UpdateMeetingDto, UpdateMeetingTypeDto,
} from './meetings.dto';
import { MeetingsService } from './meetings.service';
import { MeetingsStatsService } from './meetings-stats.service';

const MANAGE = PERMISSIONS.MEETING_MANAGE;

@ApiTags('Meeting types')
@ApiBearerAuth()
@Controller('meetings/types')
export class MeetingTypesController {
  constructor(private readonly types: MeetingTypesService) {}

  @Get()
  list(@Query() query: MeetingTypeQuery) {
    return this.types.list(query.includeInactive);
  }

  @Get('templates')
  templates() {
    return this.types.listTemplates();
  }

  @Post('templates/:key')
  @RequirePermissions(MANAGE)
  fromTemplate(@Param('key') key: string, @Body() dto: FromTemplateDto) {
    return this.types.createFromTemplate(key, dto);
  }

  @Post()
  @RequirePermissions(MANAGE)
  create(@Body() dto: CreateMeetingTypeDto) {
    return this.types.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.types.get(id);
  }

  @Patch(':id')
  @RequirePermissions(MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateMeetingTypeDto) {
    return this.types.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(MANAGE)
  deactivate(@Param('id') id: string) {
    return this.types.deactivate(id);
  }
}

const STATUS_TR: Record<string, string> = { PLANNED: 'Planlandı', IN_PROGRESS: 'Devam ediyor', COMPLETED: 'Tamamlandı', CANCELLED: 'İptal' };

@ApiTags('Meetings')
@ApiBearerAuth()
@Controller('meetings')
export class MeetingsController {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly stats: MeetingsStatsService,
    private readonly excel: ExcelService,
    private readonly meetingAccess: MeetingAccessService,
  ) {}

  /* ---- Statik yollar (":id" yolundan önce tanımlanmalı) ---- */

  @Get()
  list(@Query() query: MeetingQuery) {
    return this.meetings.list(query);
  }

  @Get('stats')
  getStats(@Query() query: RangeQuery) {
    return this.stats.stats(query);
  }

  @Get('calendar')
  calendar(@Query() query: RangeQuery) {
    return this.stats.calendar(query);
  }

  @Get('export')
  async export(@Query() query: MeetingQuery, @Res() res: Response) {
    const rows = await this.meetings.listAll(query);
    const tz = await this.meetingAccess.timezone();
    const buffer = await this.excel.build<MeetingListItem>('Toplantılar', [
      { header: 'No', key: 'code', width: 12, value: (r) => r.code },
      { header: 'Başlık', key: 'title', width: 45, value: (r) => r.title },
      { header: 'Tip', key: 'type', width: 28, value: (r) => r.type?.name },
      { header: 'Başlangıç', key: 'startAt', width: 18, value: (r) => formatDateTimeTr(new Date(r.startAt), tz) },
      { header: 'Bitiş', key: 'endAt', width: 18, value: (r) => formatDateTimeTr(new Date(r.endAt), tz) },
      { header: 'Yer', key: 'location', width: 24, value: (r) => r.location },
      { header: 'Organizatör', key: 'organizer', width: 24, value: (r) => r.organizer.fullName },
      { header: 'Birim', key: 'orgUnit', width: 24, value: (r) => r.orgUnit?.name },
      { header: 'Durum', key: 'status', value: (r) => STATUS_TR[r.status] },
      { header: 'Katılımcı', key: 'participants', value: (r) => r.participantCount },
      { header: 'Açık Aksiyon', key: 'openActions', value: (r) => r.openActionCount },
    ], rows);
    this.excel.send(res, 'toplantilar.xlsx', buffer);
  }

  @Post('series')
  @RequirePermissions(MANAGE)
  createSeries(@Body() dto: CreateSeriesDto) {
    return this.meetings.createSeries(dto);
  }

  @Get('series/:seriesId')
  listSeries(@Param('seriesId') seriesId: string) {
    return this.meetings.listSeries(seriesId);
  }

  @Patch('series/:seriesId')
  cancelSeries(@Param('seriesId') seriesId: string, @Body() dto: SeriesActionDto) {
    return this.meetings.cancelSeries(seriesId, dto.reason);
  }

  @Post()
  @RequirePermissions(MANAGE)
  create(@Body() dto: CreateMeetingDto) {
    return this.meetings.create(dto);
  }

  /* ---- Tek toplantı ---- */

  @Get(':id')
  get(@Param('id') id: string) {
    return this.meetings.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMeetingDto) {
    return this.meetings.update(id, dto);
  }

  @Post(':id/start')
  @HttpCode(200)
  start(@Param('id') id: string) {
    return this.meetings.start(id);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@Param('id') id: string) {
    return this.meetings.complete(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() dto: CancelMeetingDto) {
    return this.meetings.cancel(id, dto.reason);
  }

  @Post(':id/reopen')
  @HttpCode(200)
  reopen(@Param('id') id: string) {
    return this.meetings.reopen(id);
  }

  @Put(':id/participants')
  setParticipants(@Param('id') id: string, @Body() dto: SetParticipantsDto) {
    return this.meetings.setParticipants(id, dto.participants);
  }

  @Patch(':id/attendance')
  setAttendance(@Param('id') id: string, @Body() dto: SetAttendanceDto) {
    return this.meetings.setAttendance(id, dto);
  }

  @Put(':id/agenda')
  setAgenda(@Param('id') id: string, @Body() dto: SetAgendaDto) {
    return this.meetings.setAgenda(id, dto.items);
  }

  @Patch(':id/agenda/:itemId')
  updateAgendaItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateAgendaItemDto) {
    return this.meetings.updateAgendaItem(id, itemId, dto);
  }

  @Post(':id/decisions')
  addDecision(@Param('id') id: string, @Body() dto: CreateDecisionDto) {
    return this.meetings.addDecision(id, dto);
  }

  @Patch(':id/decisions/:decisionId')
  updateDecision(@Param('id') id: string, @Param('decisionId') decisionId: string, @Body() dto: UpdateDecisionDto) {
    return this.meetings.updateDecision(id, decisionId, dto);
  }

  @Delete(':id/decisions/:decisionId')
  @HttpCode(204)
  deleteDecision(@Param('id') id: string, @Param('decisionId') decisionId: string) {
    return this.meetings.deleteDecision(id, decisionId);
  }

  @Post(':id/actions')
  createAction(@Param('id') id: string, @Body() dto: CreateMeetingActionDto) {
    return this.meetings.createAction(id, dto);
  }

  @Get(':id/actions')
  actions(@Param('id') id: string) {
    return this.meetings.listActions(id);
  }

  @Get(':id/carried-actions')
  carried(@Param('id') id: string) {
    return this.meetings.carriedActions(id);
  }

  @Get(':id/ics')
  async ics(@Param('id') id: string, @Res() res: Response) {
    const { fileName, content } = await this.meetings.ics(id);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(content);
  }
}
