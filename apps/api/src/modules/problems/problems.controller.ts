import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type ProblemListItem } from '@lean/shared';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators';
import { ExcelService } from '../../core/excel/excel.service';
import { problemCode } from './problem-rules';
import {
  CancelProblemDto, CreateCauseDto, CreateProblemActionDto, CreateProblemDto, CreateVerificationDto, CreateWhyChainDto, HorizontalDto,
  PhaseDto, ProblemQuery, SetTeamDto, SetWhyStepsDto, StatsQuery, UpdateCauseDto, UpdateProblemDto, UpdateWhyChainDto,
} from './problems.dto';
import { ProblemsService } from './problems.service';
import { ProblemsStatsService } from './problems-stats.service';

const PHASE_TR: Record<string, string> = {
  DEFINITION: 'Tanım', CONTAINMENT: 'Acil önlem', ROOT_CAUSE: 'Kök neden', ACTIONS: 'Aksiyonlar', VERIFICATION: 'Doğrulama', CLOSED: 'Kapandı', CANCELLED: 'İptal',
};
const SEVERITY_TR: Record<string, string> = { LOW: 'Düşük', MEDIUM: 'Orta', HIGH: 'Yüksek', CRITICAL: 'Kritik' };
const SOURCE_TR: Record<string, string> = {
  CUSTOMER_COMPLAINT: 'Müşteri şikayeti', INTERNAL_AUDIT: 'İç denetim', EXTERNAL_AUDIT: 'Dış denetim', PROCESS: 'Proses', SUPPLIER: 'Tedarikçi',
  KPI_DEVIATION: 'KPI sapması', AUDIT_FINDING: 'Denetim bulgusu', MEETING: 'Toplantı', SUGGESTION: 'Öneri', SAFETY: 'İş güvenliği', OTHER: 'Diğer',
};

@ApiTags('Problems')
@ApiBearerAuth()
@Controller('problems')
export class ProblemsController {
  constructor(private readonly problems: ProblemsService, private readonly stats: ProblemsStatsService, private readonly excel: ExcelService) {}

  /* ---- Statik yollar (":id" yolundan önce) ---- */

  @Get()
  list(@Query() query: ProblemQuery) {
    return this.problems.list(query);
  }

  @Get('stats')
  getStats(@Query() query: StatsQuery) {
    return this.stats.stats(query);
  }

  @Get('export')
  async export(@Query() query: ProblemQuery, @Res() res: Response) {
    const rows = await this.problems.listAll(query);
    const buffer = await this.excel.build<ProblemListItem>('Problemler', [
      { header: 'No', key: 'code', width: 12, value: (r) => problemCode(r.number) },
      { header: 'Başlık', key: 'title', width: 50, value: (r) => r.title },
      { header: 'Aşama', key: 'phase', value: (r) => PHASE_TR[r.phase] },
      { header: 'Şiddet', key: 'severity', value: (r) => SEVERITY_TR[r.severity] },
      { header: 'Kaynak', key: 'source', width: 20, value: (r) => SOURCE_TR[r.source] },
      { header: 'Birim', key: 'orgUnit', width: 24, value: (r) => r.orgUnit.name },
      { header: 'Sahip', key: 'owner', width: 24, value: (r) => r.owner.fullName },
      { header: 'Bildiren', key: 'reporter', width: 24, value: (r) => r.reportedBy.fullName },
      { header: 'Açılış', key: 'createdAt', value: (r) => r.createdAt.slice(0, 10) },
      { header: 'Hedef Kapanış', key: 'target', value: (r) => r.targetCloseDate },
      { header: 'Kapanış', key: 'closedAt', value: (r) => r.closedAt?.slice(0, 10) },
      { header: 'Gecikme (gün)', key: 'overdue', value: (r) => r.overdueDays || null },
      { header: 'Açık Aksiyon', key: 'openActions', value: (r) => r.openActionCount },
    ], rows);
    this.excel.send(res, 'problemler.xlsx', buffer);
  }

  /** Saha çalışanı dahil her çalışan problem bildirebilir. */
  @Post()
  @RequirePermissions(PERMISSIONS.PROBLEM_CREATE, PERMISSIONS.PROBLEM_MANAGE)
  create(@Body() dto: CreateProblemDto) {
    return this.problems.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.problems.get(id);
  }

  @Get(':id/report')
  report(@Param('id') id: string) {
    return this.problems.report(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProblemDto) {
    return this.problems.update(id, dto);
  }

  @Put(':id/team')
  setTeam(@Param('id') id: string, @Body() dto: SetTeamDto) {
    return this.problems.setTeam(id, dto);
  }

  /* ---- Balık kılçığı ---- */

  @Post(':id/causes')
  createCause(@Param('id') id: string, @Body() dto: CreateCauseDto) {
    return this.problems.createCause(id, dto);
  }

  @Patch(':id/causes/:causeId')
  updateCause(@Param('id') id: string, @Param('causeId') causeId: string, @Body() dto: UpdateCauseDto) {
    return this.problems.updateCause(id, causeId, dto);
  }

  @Delete(':id/causes/:causeId')
  deleteCause(@Param('id') id: string, @Param('causeId') causeId: string) {
    return this.problems.deleteCause(id, causeId);
  }

  /* ---- 5 Neden ---- */

  @Post(':id/why-chains')
  createWhyChain(@Param('id') id: string, @Body() dto: CreateWhyChainDto) {
    return this.problems.createWhyChain(id, dto);
  }

  @Patch(':id/why-chains/:chainId')
  updateWhyChain(@Param('id') id: string, @Param('chainId') chainId: string, @Body() dto: UpdateWhyChainDto) {
    return this.problems.updateWhyChain(id, chainId, dto);
  }

  @Put(':id/why-chains/:chainId/steps')
  setWhySteps(@Param('id') id: string, @Param('chainId') chainId: string, @Body() dto: SetWhyStepsDto) {
    return this.problems.setWhySteps(id, chainId, dto);
  }

  @Delete(':id/why-chains/:chainId')
  deleteWhyChain(@Param('id') id: string, @Param('chainId') chainId: string) {
    return this.problems.deleteWhyChain(id, chainId);
  }

  /* ---- Aksiyonlar / faz / doğrulama ---- */

  @Post(':id/actions')
  createAction(@Param('id') id: string, @Body() dto: CreateProblemActionDto) {
    return this.problems.createAction(id, dto);
  }

  @Post(':id/horizontal')
  createHorizontal(@Param('id') id: string, @Body() dto: HorizontalDto) {
    return this.problems.createHorizontal(id, dto);
  }

  @Post(':id/phase')
  changePhase(@Param('id') id: string, @Body() dto: PhaseDto) {
    return this.problems.changePhase(id, dto);
  }

  @Post(':id/verifications')
  addVerification(@Param('id') id: string, @Body() dto: CreateVerificationDto) {
    return this.problems.addVerification(id, dto);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Body() dto: CancelProblemDto) {
    return this.problems.cancel(id, dto);
  }
}
