import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSIONS, type BowlingRow, type HoshinTreeNode } from '@lean/shared';
import type { Response } from 'express';
import { RequirePermissions } from '../../common/decorators';
import { ExcelService } from '../../core/excel/excel.service';
import { HoshinCatchballService } from './hoshin-catchball.service';
import { HoshinGoalsService } from './hoshin-goals.service';
import { HoshinReportsService } from './hoshin-reports.service';
import { HoshinXMatrixService } from './hoshin-xmatrix.service';
import { StrategyPlansService } from './strategy-plans.service';
import {
  BowlingQuery, CatchballDto, CountermeasureDto, CreateGoalDto, CreatePlanDto, DrilldownQuery, GoalListQuery, GoalStatusDto, ObjectiveDto,
  OffTargetQuery, PlanYearQuery, SetCorrelationsDto, SetMonthlyDto, SwotDto, UpdateGoalDto, UpdateObjectiveDto, UpdatePlanDto, UpdateSwotDto,
} from './strategy.dto';

const P = PERMISSIONS;
const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const LEVEL_TR: Record<string, string> = { BREAKTHROUGH: 'Atılım', ANNUAL: 'Yıllık', PRIORITY: 'Öncelik', DEPARTMENT: 'Birim', INDIVIDUAL: 'Bireysel' };
const STATUS_TR: Record<string, string> = {
  DRAFT: 'Taslak', PROPOSED: 'Önerildi', IN_CATCHBALL: 'Catchball', AGREED: 'Mutabık', ACTIVE: 'Aktif', COMPLETED: 'Tamamlandı', CANCELLED: 'İptal',
};
const COLOR_TR: Record<string, string> = { GREEN: 'Yeşil', YELLOW: 'Sarı', RED: 'Kırmızı', NO_DATA: 'Veri yok' };

@ApiTags('Strategy')
@ApiBearerAuth()
@Controller('strategy')
export class StrategyController {
  constructor(private readonly plans: StrategyPlansService) {}

  @Get('plans')
  @RequirePermissions(P.STRATEGY_VIEW)
  list() {
    return this.plans.list();
  }

  @Post('plans')
  @RequirePermissions(P.STRATEGY_MANAGE)
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Get('plans/:id')
  @RequirePermissions(P.STRATEGY_VIEW)
  get(@Param('id') id: string) {
    return this.plans.get(id);
  }

  @Patch('plans/:id')
  @RequirePermissions(P.STRATEGY_MANAGE)
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }

  @Delete('plans/:id')
  @HttpCode(204)
  @RequirePermissions(P.STRATEGY_MANAGE)
  async remove(@Param('id') id: string) {
    await this.plans.remove(id);
  }

  @Post('plans/:id/activate')
  @HttpCode(200)
  @RequirePermissions(P.STRATEGY_MANAGE)
  activate(@Param('id') id: string) {
    return this.plans.activate(id);
  }

  @Post('plans/:id/new-version')
  @RequirePermissions(P.STRATEGY_MANAGE)
  newVersion(@Param('id') id: string) {
    return this.plans.newVersion(id);
  }

  @Post('plans/:id/swot')
  @RequirePermissions(P.STRATEGY_MANAGE)
  addSwot(@Param('id') id: string, @Body() dto: SwotDto) {
    return this.plans.addSwot(id, dto);
  }

  @Patch('swot/:id')
  @RequirePermissions(P.STRATEGY_MANAGE)
  updateSwot(@Param('id') id: string, @Body() dto: UpdateSwotDto) {
    return this.plans.updateSwot(id, dto);
  }

  @Delete('swot/:id')
  @HttpCode(204)
  @RequirePermissions(P.STRATEGY_MANAGE)
  async removeSwot(@Param('id') id: string) {
    await this.plans.removeSwot(id);
  }

  @Post('plans/:id/objectives')
  @RequirePermissions(P.STRATEGY_MANAGE)
  addObjective(@Param('id') id: string, @Body() dto: ObjectiveDto) {
    return this.plans.addObjective(id, dto);
  }

  @Patch('objectives/:id')
  @RequirePermissions(P.STRATEGY_MANAGE)
  updateObjective(@Param('id') id: string, @Body() dto: UpdateObjectiveDto) {
    return this.plans.updateObjective(id, dto);
  }

  @Delete('objectives/:id')
  @HttpCode(204)
  @RequirePermissions(P.STRATEGY_MANAGE)
  async removeObjective(@Param('id') id: string) {
    await this.plans.removeObjective(id);
  }
}

@ApiTags('Hoshin')
@ApiBearerAuth()
@Controller('hoshin')
export class HoshinController {
  constructor(
    private readonly plans: StrategyPlansService,
    private readonly goals: HoshinGoalsService,
    private readonly catchball: HoshinCatchballService,
    private readonly xmatrix: HoshinXMatrixService,
    private readonly reports: HoshinReportsService,
    private readonly excel: ExcelService,
  ) {}

  /* Veri görünürlüğü servis katmanında uygulanır (hoshin.view kapsamı + hedef sahipliği). */

  @Get('plans')
  planList() {
    return this.plans.briefs();
  }

  @Get('plans/:id/tree')
  tree(@Param('id') id: string, @Query() q: PlanYearQuery) {
    return this.goals.tree(id, q.year);
  }

  @Get('plans/:id/tree/export')
  async treeExport(@Param('id') id: string, @Query() q: PlanYearQuery, @Res() res: Response) {
    const t = await this.goals.tree(id, q.year);
    const flat: (HoshinTreeNode & { depth: number })[] = [];
    const walk = (n: HoshinTreeNode, depth: number) => {
      flat.push({ ...n, depth });
      n.children.forEach((c) => walk(c, depth + 1));
    };
    t.nodes.forEach((n) => walk(n, 0));
    const buf = await this.excel.build('Hedef Ağacı', [
      { header: 'Kod', key: 'code', width: 10, value: (r) => r.code },
      { header: 'Hedef', key: 'title', width: 50, value: (r) => `${'  '.repeat(r.depth)}${r.title}` },
      { header: 'Seviye', key: 'level', value: (r) => LEVEL_TR[r.level] },
      { header: 'Yıl', key: 'year', width: 8, value: (r) => r.year },
      { header: 'Sahip', key: 'owner', value: (r) => r.owner?.fullName },
      { header: 'Birim', key: 'unit', value: (r) => r.orgUnit?.name },
      { header: 'KPI', key: 'kpi', value: (r) => r.kpi?.code },
      { header: 'Başlangıç', key: 'baseline', value: (r) => r.baseline },
      { header: 'Hedef', key: 'target', value: (r) => r.targetValue },
      { header: 'Ölçü birimi', key: 'u', value: (r) => r.unit },
      { header: 'Ağırlık', key: 'weight', value: (r) => r.weight },
      { header: 'Durum', key: 'status', value: (r) => STATUS_TR[r.status] },
      { header: 'Gerçekleşme %', key: 'ach', value: (r) => r.progress.achievement },
      { header: 'Renk', key: 'color', value: (r) => COLOR_TR[r.progress.status] },
    ], flat);
    this.excel.send(res, `hoshin-hedef-agaci-${t.year}.xlsx`, buf);
  }

  @Get('plans/:id/x-matrix')
  xMatrix(@Param('id') id: string, @Query() q: PlanYearQuery) {
    return this.xmatrix.get(id, q.year);
  }

  @Put('plans/:id/correlations')
  @RequirePermissions(P.HOSHIN_MANAGE)
  setCorrelations(@Param('id') id: string, @Body() dto: SetCorrelationsDto) {
    return this.xmatrix.set(id, dto);
  }

  @Get('plans/:id/drilldown')
  drilldown(@Param('id') id: string, @Query() q: DrilldownQuery) {
    return this.reports.drilldown(id, q.year, q.parentId);
  }

  @Get('plans/:id/review')
  review(@Param('id') id: string, @Query() q: PlanYearQuery) {
    return this.reports.review(id, q.year);
  }

  @Get('bowling')
  bowling(@Query() q: BowlingQuery) {
    return this.goals.bowling(q.planId, q.year, q);
  }

  @Get('bowling/export')
  async bowlingExport(@Query() q: BowlingQuery, @Res() res: Response) {
    const b = await this.goals.bowling(q.planId, q.year, q);
    const cols = [
      { header: 'Kod', key: 'code', width: 10, value: (r: BowlingRow) => r.goal.code },
      { header: 'Hedef', key: 'title', width: 44, value: (r: BowlingRow) => r.goal.title },
      { header: 'Sahip', key: 'owner', value: (r: BowlingRow) => r.goal.owner?.fullName },
      { header: 'Birim', key: 'unit', value: (r: BowlingRow) => r.goal.orgUnit?.name },
      { header: 'Hedef değer', key: 'target', value: (r: BowlingRow) => r.targetValue },
      ...MONTHS_TR.flatMap((m, i) => [
        { header: `${m} Plan`, key: `p${i}`, width: 10, value: (r: BowlingRow) => r.cells[i].plan },
        { header: `${m} Gerç.`, key: `a${i}`, width: 10, value: (r: BowlingRow) => r.cells[i].actual },
        { header: `${m} Renk`, key: `s${i}`, width: 9, value: (r: BowlingRow) => COLOR_TR[r.cells[i].status] },
      ]),
      { header: 'YTD Plan', key: 'yp', value: (r: BowlingRow) => r.ytd.plan },
      { header: 'YTD Gerç.', key: 'ya', value: (r: BowlingRow) => r.ytd.actual },
      { header: 'Gerçekleşme %', key: 'ach', value: (r: BowlingRow) => r.achievement },
    ];
    this.excel.send(res, `hoshin-bowling-${b.year}.xlsx`, await this.excel.build('Bowling', cols, b.rows));
  }

  @Get('catchball')
  myCatchball() {
    return this.catchball.myList();
  }

  @Get('goals')
  goalList(@Query() q: GoalListQuery) {
    return this.goals.list(q.planId, q.year, q.level, q.mine);
  }

  @Post('goals')
  createGoal(@Body() dto: CreateGoalDto) {
    return this.goals.create(dto);
  }

  @Get('goals/:id')
  goal(@Param('id') id: string, @Query() q: PlanYearQuery) {
    return this.goals.detail(id, q.year);
  }

  @Patch('goals/:id')
  updateGoal(@Param('id') id: string, @Body() dto: UpdateGoalDto) {
    return this.goals.update(id, dto);
  }

  @Delete('goals/:id')
  @HttpCode(204)
  async removeGoal(@Param('id') id: string) {
    await this.goals.remove(id);
  }

  @Post('goals/:id/catchball')
  addCatchball(@Param('id') id: string, @Body() dto: CatchballDto) {
    return this.catchball.addEntry(id, dto);
  }

  @Post('goals/:id/activate')
  @HttpCode(200)
  async activate(@Param('id') id: string) {
    await this.catchball.activate(id);
    return this.goals.detail(id);
  }

  @Post('goals/:id/status')
  @HttpCode(200)
  setStatus(@Param('id') id: string, @Body() dto: GoalStatusDto) {
    return this.goals.setStatus(id, dto);
  }

  @Put('goals/:id/monthly')
  setMonthly(@Param('id') id: string, @Body() dto: SetMonthlyDto) {
    return this.goals.setMonthly(id, dto);
  }

  @Get('goals/:id/off-target')
  offTarget(@Param('id') id: string, @Query() q: OffTargetQuery) {
    return this.goals.offTarget(id, q.period);
  }

  @Post('goals/:id/countermeasure')
  countermeasure(@Param('id') id: string, @Body() dto: CountermeasureDto) {
    return this.goals.countermeasure(id, dto);
  }
}
