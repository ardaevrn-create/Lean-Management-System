import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, periodLabel, type KpiComplianceRow, type KpiMissingItem } from '@lean/shared';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators';
import { ExcelService } from '../../core/excel/excel.service';
import { KpiDefinitionsService } from './kpi-definitions.service';
import { KpiDeviationsService } from './kpi-deviations.service';
import { KpiReportsService } from './kpi-reports.service';
import { KpiValuesService } from './kpi-values.service';
import {
  BoardQuery, BulkValuesDto, ComplianceExportQuery, CreateKpiDto, DateRangeQuery, DecideDeviationDto, DeviationActionDto,
  DeviationByPeriodQuery, DeviationListQuery, EntryQuery, FeedQuery, KpiListQuery, PeriodRangeQuery, RevisionQuery, SaveDeviationDto,
  SetTargetsDto, SetValueDto, UpdateKpiDto,
} from './kpi.dto';

const P = PERMISSIONS;
const CATEGORY_TR: Record<string, string> = {
  QUALITY: 'Kalite', PRODUCTIVITY: 'Verimlilik', COST: 'Maliyet', DELIVERY: 'Teslimat', SAFETY: 'Güvenlik', PEOPLE: 'İnsan', ENVIRONMENT: 'Çevre', OTHER: 'Diğer',
};

@ApiTags('KPI')
@ApiBearerAuth()
@Controller('kpi')
export class KpiController {
  constructor(
    private readonly defs: KpiDefinitionsService,
    private readonly values: KpiValuesService,
    private readonly reports: KpiReportsService,
    private readonly deviations: KpiDeviationsService,
    private readonly excel: ExcelService,
  ) {}

  /* ------------------------------ Tanımlar ------------------------------ */

  @Get('definitions')
  list(@Query() query: KpiListQuery) {
    return this.defs.list(query);
  }

  @Get('definitions/:id')
  get(@Param('id') id: string) {
    return this.defs.get(id);
  }

  @Post('definitions')
  @RequirePermissions(P.KPI_MANAGE)
  create(@Body() dto: CreateKpiDto) {
    return this.defs.create(dto);
  }

  @Patch('definitions/:id')
  @RequirePermissions(P.KPI_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdateKpiDto) {
    return this.defs.update(id, dto);
  }

  @Delete('definitions/:id')
  @HttpCode(204)
  @RequirePermissions(P.KPI_MANAGE)
  async remove(@Param('id') id: string) {
    await this.defs.deactivate(id);
  }

  /* ------------------------------ Hedefler ------------------------------ */

  @Get('definitions/:id/targets')
  targets(@Param('id') id: string, @Query() q: PeriodRangeQuery) {
    return this.defs.getTargets(id, q.from, q.to);
  }

  @Put('definitions/:id/targets')
  @RequirePermissions(P.KPI_MANAGE)
  setTargets(@Param('id') id: string, @Body() dto: SetTargetsDto) {
    return this.defs.setTargets(id, dto);
  }

  /* ------------------------------ Değerler ------------------------------ */

  @Get('definitions/:id/series')
  series(@Param('id') id: string, @Query() q: PeriodRangeQuery) {
    return this.values.series(id, q.from, q.to);
  }

  @Get('definitions/:id/revisions')
  revisions(@Param('id') id: string, @Query() q: RevisionQuery) {
    return this.values.revisions(id, q.period);
  }

  @Put('values')
  setValue(@Body() dto: SetValueDto) {
    return this.values.setValue(dto);
  }

  @Post('values/bulk')
  @RequirePermissions(P.KPI_VALUE_ENTER)
  bulk(@Body() dto: BulkValuesDto) {
    return this.values.bulk(dto);
  }

  @Get('entry')
  entry(@Query() q: EntryQuery) {
    return this.values.entry(q);
  }

  /* ------------------------------ Eksik veri & uyum ------------------------------ */

  @Get('summary')
  summary() {
    return this.reports.summary();
  }

  @Get('missing')
  missing(@Query() q: DateRangeQuery) {
    return this.reports.missing(q);
  }

  @Get('missing/export')
  async missingExport(@Query() q: DateRangeQuery, @Res() res: Response) {
    const { items } = await this.reports.missing(q);
    const buffer = await this.excel.build<KpiMissingItem>('Eksik Veriler', [
      { header: 'KPI Kodu', key: 'code', width: 16, value: (r) => r.kpi.code },
      { header: 'KPI Adı', key: 'name', width: 40, value: (r) => r.kpi.name },
      { header: 'Birim', key: 'orgUnit', width: 26, value: (r) => r.orgUnit.name },
      { header: 'Periyot', key: 'frequency', value: (r) => r.kpi.frequency },
      { header: 'Dönem', key: 'period', value: (r) => periodLabel(r.period) },
      { header: 'Son Giriş Tarihi', key: 'dueDate', value: (r) => new Date(r.dueDate) },
      { header: 'Gecikme (gün)', key: 'daysLate', value: (r) => r.daysLate },
      { header: 'Sorumlu', key: 'responsible', width: 26, value: (r) => r.responsible.fullName },
    ], items);
    this.excel.send(res, 'kpi-eksik-veriler.xlsx', buffer);
  }

  @Get('compliance')
  compliance(@Query() q: DateRangeQuery) {
    return this.reports.compliance(q);
  }

  @Get('compliance/export')
  async complianceExport(@Query() q: ComplianceExportQuery, @Res() res: Response) {
    const r = await this.reports.compliance(q);
    const person = q.by === 'person';
    const buffer = await this.excel.build<KpiComplianceRow>(person ? 'Kişi Bazlı Uyum' : 'Birim Bazlı Uyum', [
      { header: person ? 'Sorumlu' : 'Birim', key: 'who', width: 32, value: (x) => (person ? x.user?.fullName : x.orgUnit?.name) },
      { header: 'Beklenen Giriş', key: 'expected', value: (x) => x.expected },
      { header: 'Zamanında', key: 'onTime', value: (x) => x.onTime },
      { header: 'Geç', key: 'late', value: (x) => x.late },
      { header: 'Eksik', key: 'missing', value: (x) => x.missing },
      { header: 'Uyum %', key: 'complianceRate', value: (x) => x.complianceRate },
      { header: 'Tamamlanma %', key: 'completionRate', value: (x) => x.completionRate },
    ], person ? r.byPerson : r.byOrgUnit);
    this.excel.send(res, person ? 'kpi-uyum-kisi.xlsx' : 'kpi-uyum-birim.xlsx', buffer);
  }

  /* ------------------------------ Sapmalar ------------------------------ */

  @Get('deviations')
  deviationList(@Query() q: DeviationListQuery) {
    return this.deviations.list(q);
  }

  @Get('deviations/detail')
  deviationByPeriod(@Query() q: DeviationByPeriodQuery) {
    return this.deviations.detail(q.kpiId, q.period);
  }

  @Put('deviations')
  saveDeviation(@Body() dto: SaveDeviationDto) {
    return this.deviations.save(dto);
  }

  @Get('deviations/:id')
  deviation(@Param('id') id: string) {
    return this.deviations.getById(id);
  }

  @Post('deviations/:id/actions')
  addDeviationAction(@Param('id') id: string, @Body() dto: DeviationActionDto) {
    return this.deviations.createAction(id, dto);
  }

  @Post('deviations/:id/decide')
  decide(@Param('id') id: string, @Body() dto: DecideDeviationDto) {
    return this.deviations.decide(id, dto.approve, dto.note);
  }

  /* ------------------------------ Pano & besleme ------------------------------ */

  @Get('board')
  board(@Query() q: BoardQuery) {
    return this.reports.board(q);
  }

  @Get('feed')
  feed(@Query() q: FeedQuery) {
    return this.reports.feed(q);
  }

  @Get('feed/export')
  async feedExport(@Query() q: FeedQuery, @Res() res: Response) {
    const rows = await this.reports.feed(q);
    const buffer = await this.excel.build('KPI Verileri', [
      { header: 'KPI Kodu', key: 'kpiCode', width: 16, value: (r: (typeof rows)[number]) => r.kpiCode },
      { header: 'KPI Adı', key: 'kpiName', width: 36, value: (r) => r.kpiName },
      { header: 'Kategori', key: 'category', value: (r) => CATEGORY_TR[r.category] },
      { header: 'Birim', key: 'unit', width: 10, value: (r) => r.unit },
      { header: 'Periyot', key: 'frequency', value: (r) => r.frequency },
      { header: 'Org. Birim', key: 'orgUnitName', width: 26, value: (r) => r.orgUnitName },
      { header: 'Sahip', key: 'ownerName', width: 24, value: (r) => r.ownerName },
      { header: 'Dönem', key: 'period', value: (r) => r.period },
      { header: 'Dönem Başı', key: 'periodStart', value: (r) => r.periodStart },
      { header: 'Hedef', key: 'target', value: (r) => r.target },
      { header: 'Hedef Üst', key: 'targetMax', value: (r) => r.targetMax },
      { header: 'Gerçekleşen', key: 'value', value: (r) => r.value },
      { header: 'Durum', key: 'status', value: (r) => r.status },
      { header: 'Sapma Açıklaması', key: 'deviationExplanation', width: 40, value: (r) => r.deviationExplanation },
    ], rows);
    this.excel.send(res, 'kpi-verileri.xlsx', buffer);
  }
}
