import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type KaizenListItem, type SuggestionListItem } from '@lean/shared';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators';
import { ExcelService } from '../../core/excel/excel.service';
import { KaizenService } from './kaizen.service';
import { SuggestionPointsService } from './suggestion-points.service';
import { SuggestionSettingsService } from './suggestion-settings.service';
import { SuggestionStatsService } from './suggestion-stats.service';
import {
  AssignImplementerDto, ConvertToKaizenDto, CreateKaizenDto, CreateSuggestionDto, DecisionDto, EvaluateDto, FinanceApproveDto, GainDto,
  ImplementedDto, KaizenDecisionDto, KaizenQuery, PointsQuery, StatsQuery, SuggestionActionDto, SuggestionOfMonthDto, SuggestionQuery,
  UpdateGainDto, UpdateKaizenDto, UpdateSettingsDto, UpdateSuggestionDto,
} from './suggestions.dto';
import { SuggestionsService } from './suggestions.service';

const CREATE = PERMISSIONS.SUGGESTION_CREATE;
const MANAGE = PERMISSIONS.SUGGESTION_MANAGE;

const SUGGESTION_STATUS_TR: Record<string, string> = {
  SUBMITTED: 'Gönderildi', PRE_EVALUATION: 'Ön değerlendirme', COMMITTEE: 'Komite', ACCEPTED: 'Kabul edildi', REJECTED: 'Reddedildi',
  ON_HOLD: 'Beklemede', IN_IMPLEMENTATION: 'Uygulamada', IMPLEMENTED: 'Uygulandı', CLOSED: 'Kapandı', WITHDRAWN: 'Geri çekildi',
};
const CATEGORY_TR: Record<string, string> = {
  QUALITY: 'Kalite', SAFETY: 'İSG', COST: 'Maliyet', PRODUCTIVITY: 'Verimlilik', ENVIRONMENT: 'Çevre', ERGONOMICS: 'Ergonomi', CUSTOMER: 'Müşteri', OTHER: 'Diğer',
};
const KAIZEN_TYPE_TR: Record<string, string> = { QUICK: 'Hızlı Kaizen', EVENT: 'Kaizen Etkinliği', PROJECT: 'Kaizen Projesi' };
const KAIZEN_STATUS_TR: Record<string, string> = { DRAFT: 'Taslak', SUBMITTED: 'Onay bekliyor', APPROVED: 'Onaylandı', PUBLISHED: 'Yayında', REJECTED: 'Reddedildi' };

/** Kaizen uç noktaları: "suggestions/:id" yollarından önce eşleşmesi için ilk sırada kayıtlıdır. */
@ApiTags('Kaizen')
@ApiBearerAuth()
@Controller('suggestions/kaizen')
export class KaizenController {
  constructor(private readonly kaizen: KaizenService, private readonly excel: ExcelService) {}

  @Get()
  list(@Query() query: KaizenQuery) {
    return this.kaizen.list(query);
  }

  /** Kaizen kütüphanesi: yayınlanmış kaizenler, tüm kullanıcılara açık */
  @Get('library')
  library(@Query() query: KaizenQuery) {
    return this.kaizen.list({ ...query, view: 'library' });
  }

  @Get('export')
  async export(@Query() query: KaizenQuery, @Res() res: Response) {
    const rows = await this.kaizen.listAll(query);
    const buffer = await this.excel.build<KaizenListItem>('Kaizen', [
      { header: 'No', key: 'code', width: 12, value: (r) => r.code },
      { header: 'Başlık', key: 'title', width: 45, value: (r) => r.title },
      { header: 'Tür', key: 'type', width: 18, value: (r) => KAIZEN_TYPE_TR[r.type] },
      { header: 'Durum', key: 'status', width: 16, value: (r) => KAIZEN_STATUS_TR[r.status] },
      { header: 'Birim', key: 'orgUnit', width: 24, value: (r) => r.orgUnit?.name },
      { header: 'Lider', key: 'leader', width: 24, value: (r) => r.leader.fullName },
      { header: 'Ekip', key: 'members', value: (r) => r.memberCount },
      { header: 'Başlangıç', key: 'start', value: (r) => r.startDate },
      { header: 'Bitiş', key: 'end', value: (r) => r.endDate },
      { header: 'Yıllık kazanç (TL)', key: 'saving', width: 20, value: (r) => r.totalAnnualSaving },
      { header: 'Finans onaylı (TL)', key: 'approved', width: 20, value: (r) => r.approvedAnnualSaving },
    ], rows);
    this.excel.send(res, 'kaizen.xlsx', buffer);
  }

  @Post()
  @RequirePermissions(CREATE)
  create(@Body() dto: CreateKaizenDto) {
    return this.kaizen.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.kaizen.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateKaizenDto) {
    return this.kaizen.update(id, dto);
  }

  @Post(':id/submit')
  @HttpCode(200)
  submit(@Param('id') id: string) {
    return this.kaizen.submit(id);
  }

  @Post(':id/approve')
  @HttpCode(200)
  approve(@Param('id') id: string, @Body() dto: KaizenDecisionDto) {
    return this.kaizen.approve(id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id') id: string) {
    return this.kaizen.publish(id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@Param('id') id: string, @Body() dto: KaizenDecisionDto) {
    return this.kaizen.reject(id, dto);
  }

  @Post(':id/gains')
  addGain(@Param('id') id: string, @Body() dto: GainDto) {
    return this.kaizen.addGain(id, dto);
  }

  @Patch(':id/gains/:gainId')
  updateGain(@Param('id') id: string, @Param('gainId') gainId: string, @Body() dto: UpdateGainDto) {
    return this.kaizen.updateGain(id, gainId, dto);
  }

  @Delete(':id/gains/:gainId')
  removeGain(@Param('id') id: string, @Param('gainId') gainId: string) {
    return this.kaizen.removeGain(id, gainId);
  }

  @Post(':id/gains/:gainId/finance-approval')
  @HttpCode(200)
  @RequirePermissions(MANAGE)
  financeApprove(@Param('id') id: string, @Param('gainId') gainId: string, @Body() dto: FinanceApproveDto) {
    return this.kaizen.financeApprove(id, gainId, dto.approved);
  }

  @Get(':id/actions')
  actions(@Param('id') id: string) {
    return this.kaizen.listActions(id);
  }

  @Post(':id/actions')
  createAction(@Param('id') id: string, @Body() dto: SuggestionActionDto) {
    return this.kaizen.createAction(id, dto);
  }
}

@ApiTags('Suggestions')
@ApiBearerAuth()
@Controller('suggestions')
export class SuggestionsController {
  constructor(
    private readonly suggestions: SuggestionsService,
    private readonly kaizen: KaizenService,
    private readonly settings: SuggestionSettingsService,
    private readonly points: SuggestionPointsService,
    private readonly stats: SuggestionStatsService,
    private readonly excel: ExcelService,
  ) {}

  /* ---- Statik yollar (":id" yolundan önce) ---- */

  @Get()
  list(@Query() query: SuggestionQuery) {
    return this.suggestions.list(query);
  }

  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Put('settings')
  @RequirePermissions(MANAGE)
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settings.update(dto);
  }

  @Get('stats')
  getStats(@Query() query: StatsQuery) {
    return this.stats.stats(query);
  }

  @Get('points/me')
  myPoints() {
    return this.points.me();
  }

  @Get('points/leaderboard')
  leaderboard(@Query() query: PointsQuery) {
    return this.points.leaderboard(query);
  }

  @Get('export')
  async export(@Query() query: SuggestionQuery, @Res() res: Response) {
    const rows = await this.suggestions.listAll(query);
    const buffer = await this.excel.build<SuggestionListItem>('Öneriler', [
      { header: 'No', key: 'code', width: 12, value: (r) => r.code },
      { header: 'Başlık', key: 'title', width: 45, value: (r) => r.title },
      { header: 'Kategori', key: 'category', width: 14, value: (r) => CATEGORY_TR[r.category] },
      { header: 'Durum', key: 'status', width: 18, value: (r) => SUGGESTION_STATUS_TR[r.status] },
      { header: 'Öneri sahibi', key: 'by', width: 24, value: (r) => r.submittedBy.fullName },
      { header: 'Birim', key: 'orgUnit', width: 24, value: (r) => r.orgUnit?.name },
      { header: 'Gönderim', key: 'submittedAt', width: 14, value: (r) => r.submittedAt.slice(0, 10) },
      { header: 'Karar', key: 'decidedAt', width: 14, value: (r) => r.decidedAt?.slice(0, 10) },
      { header: 'Puan', key: 'score', value: (r) => r.finalScore ?? r.preScore },
      { header: 'Tahmini maliyet', key: 'cost', width: 16, value: (r) => r.estimatedCost },
      { header: 'Tahmini tasarruf', key: 'saving', width: 16, value: (r) => r.estimatedSaving },
      { header: 'Uygulayıcı', key: 'impl', width: 24, value: (r) => r.implementer?.fullName },
      { header: 'Ayın önerisi', key: 'som', value: (r) => (r.isSuggestionOfMonth ? 'Evet' : '') },
    ], rows);
    this.excel.send(res, 'oneriler.xlsx', buffer);
  }

  @Post()
  @RequirePermissions(CREATE)
  create(@Body() dto: CreateSuggestionDto) {
    return this.suggestions.create(dto);
  }

  /* ---- Tek öneri ---- */

  @Get(':id')
  get(@Param('id') id: string) {
    return this.suggestions.get(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSuggestionDto) {
    return this.suggestions.update(id, dto);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  withdraw(@Param('id') id: string) {
    return this.suggestions.withdraw(id);
  }

  @Post(':id/pre-evaluation')
  @HttpCode(200)
  preEvaluate(@Param('id') id: string, @Body() dto: EvaluateDto) {
    return this.suggestions.preEvaluate(id, dto);
  }

  @Post(':id/committee-evaluation')
  @HttpCode(200)
  committeeScore(@Param('id') id: string, @Body() dto: EvaluateDto) {
    return this.suggestions.committeeScore(id, dto);
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(@Param('id') id: string, @Body() dto: DecisionDto) {
    return this.suggestions.decide(id, dto);
  }

  @Post(':id/implementer')
  @HttpCode(200)
  assign(@Param('id') id: string, @Body() dto: AssignImplementerDto) {
    return this.suggestions.assignImplementer(id, dto);
  }

  @Get(':id/actions')
  actions(@Param('id') id: string) {
    return this.suggestions.listActions(id);
  }

  @Post(':id/actions')
  createAction(@Param('id') id: string, @Body() dto: SuggestionActionDto) {
    return this.suggestions.createAction(id, dto);
  }

  @Post(':id/implemented')
  @HttpCode(200)
  implemented(@Param('id') id: string, @Body() dto: ImplementedDto) {
    return this.suggestions.markImplemented(id, dto);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@Param('id') id: string) {
    return this.suggestions.close(id);
  }

  @Post(':id/suggestion-of-month')
  @HttpCode(200)
  @RequirePermissions(MANAGE)
  suggestionOfMonth(@Param('id') id: string, @Body() dto: SuggestionOfMonthDto) {
    return this.suggestions.setSuggestionOfMonth(id, dto.value, dto.month);
  }

  @Post(':id/kaizen')
  convertToKaizen(@Param('id') id: string, @Body() dto: ConvertToKaizenDto) {
    return this.kaizen.createFromSuggestion(id, dto);
  }
}
