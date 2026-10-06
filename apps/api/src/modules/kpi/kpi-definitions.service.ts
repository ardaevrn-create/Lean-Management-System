import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  comparePeriods, currentPeriod, findFormulaCycle, FormulaError, formulaRefs, isValidPeriod, lastEndedPeriod, normalizeKpiCode,
  parseFormula, periodsOfYear, type KpiDefinitionDetail, type KpiListItem, type KpiTargetItem, type Paginated,
} from '@lean/shared';
import { startOfUtcDay } from '../../common/dates';
import { BusinessException } from '../../common/errors';
import { pageArgs, paginated, parseSort } from '../../common/pagination';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { KpiAccessService } from './kpi-access.service';
import { KpiCalcService } from './kpi-calc.service';
import { expectedPeriods, kpiInclude, num, toBrief, type KpiRow, type PeriodCell } from './kpi-core';
import { KpiSnapshotService } from './kpi-snapshot.service';
import type { CreateKpiDto, KpiListQuery, SetTargetsDto, UpdateKpiDto } from './kpi.dto';

@Injectable()
export class KpiDefinitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly access: KpiAccessService,
    private readonly snapshots: KpiSnapshotService,
    private readonly calc: KpiCalcService,
  ) {}

  /* ------------------------------ Sorgular ------------------------------ */

  async list(query: KpiListQuery): Promise<Paginated<KpiListItem>> {
    const where = await this.buildWhere(query);
    const orderBy = parseSort(query.sort, ['code', 'name', 'createdAt'] as const, { code: 'asc' });
    const [rows, total] = await Promise.all([
      this.prisma.db.kpiDefinition.findMany({ where, include: kpiInclude, orderBy, ...pageArgs(query) }),
      this.prisma.db.kpiDefinition.count({ where }),
    ]);
    return paginated(await this.toListItems(rows), total, query);
  }

  async get(id: string): Promise<KpiDefinitionDetail> {
    const row = await this.access.loadVisible(id);
    return this.toDetail(row);
  }

  async buildWhere(query: Pick<KpiListQuery, 'q' | 'orgUnitId' | 'category' | 'frequency' | 'ownerId' | 'mine' | 'isActive'>): Promise<Prisma.KpiDefinitionWhereInput> {
    const user = this.ctx.user;
    const and: Prisma.KpiDefinitionWhereInput[] = [this.access.visibleWhere()];
    and.push({ isActive: query.isActive ?? true });
    if (query.mine) and.push({ OR: [{ ownerId: user.id }, { dataEntryUserId: user.id }] });
    if (query.category) and.push({ category: query.category });
    if (query.frequency) and.push({ frequency: query.frequency });
    if (query.ownerId) and.push({ ownerId: query.ownerId });
    if (query.orgUnitId) and.push({ orgUnit: await this.subtreeFilter(query.orgUnitId) });
    if (query.q?.trim()) {
      const q = query.q.trim();
      and.push({ OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] });
    }
    return { AND: and };
  }

  /** Birim ve alt birimleri için orgUnit filtresi. */
  async subtreeFilter(orgUnitId: string): Promise<Prisma.OrgUnitWhereInput> {
    const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: orgUnitId } });
    return { path: { startsWith: unit?.path ?? '__none__' } };
  }

  /** Liste satırları: son durum özeti (son 12 dönem) toplu hesaplanır. */
  async toListItems(rows: KpiRow[], today: Date = startOfUtcDay()): Promise<KpiListItem[]> {
    const cells = await this.snapshots.cells(rows, (k) => expectedPeriods(k, today), today);
    return rows.map((k) => this.toListItem(k, cells.get(k.id) ?? [], today));
  }

  toListItem(k: KpiRow, cells: PeriodCell[], today: Date): KpiListItem {
    const duePeriod = lastEndedPeriod(k.frequency, today);
    const dueCell = cells.find((c) => c.period === duePeriod);
    const lastValued = [...cells].reverse().find((c) => c.value !== null) ?? null;
    return {
      ...toBrief(k),
      description: k.description,
      startPeriod: k.startPeriod,
      duePeriod,
      entryState: dueCell?.entryState ?? 'NOT_DUE',
      lastPeriod: lastValued?.period ?? null,
      lastValue: lastValued?.value ?? null,
      lastTarget: lastValued?.target ?? null,
      lastTargetMax: lastValued?.targetMax ?? null,
      lastStatus: lastValued?.status ?? null,
      missingCount: k.formula ? 0 : cells.filter((c) => c.entryState === 'MISSING').length,
      deviationRequiredCount: cells.filter((c) => c.entryState === 'DEVIATION_REQUIRED').length,
    };
  }

  private async toDetail(k: KpiRow): Promise<KpiDefinitionDetail> {
    const today = startOfUtcDay();
    const [item] = await this.toListItems([k], today);
    const valueCount = await this.prisma.db.kpiValue.count({ where: { kpiId: k.id } });
    return {
      ...item,
      createdAt: k.createdAt.toISOString(),
      formulaRefs: k.formulaRefs,
      hasValues: valueCount > 0,
      can: { manage: this.access.canManage(k), enter: !k.formula && k.isActive && this.access.canEnter(k) },
    };
  }

  /* ------------------------------ Komutlar ------------------------------ */

  async create(dto: CreateKpiDto): Promise<KpiDefinitionDetail> {
    const code = normalizeKpiCode(dto.code);
    if (await this.prisma.db.kpiDefinition.findFirst({ where: { code }, select: { id: true } })) {
      throw new BusinessException('CODE_TAKEN', `Bu KPI kodu kullanılıyor: ${code}`);
    }
    const orgUnit = await this.assertOrgUnit(dto.orgUnitId);
    this.assertManage(orgUnit.path);
    await this.assertUsers([dto.ownerId, dto.dataEntryUserId]);
    const frequency = dto.frequency;
    this.assertStartPeriod(dto.startPeriod, frequency);
    const refs = await this.validateFormula(code, frequency, dto.formula ?? null);

    const created = await this.prisma.db.kpiDefinition.create({
      data: {
        tenantId: this.ctx.tenantId,
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        category: dto.category ?? 'OTHER',
        unit: dto.unit ?? '',
        decimals: dto.decimals ?? 2,
        direction: dto.direction ?? 'HIGHER_BETTER',
        frequency,
        aggregation: dto.aggregation ?? 'AVERAGE',
        warningTolerancePct: dto.warningTolerancePct ?? 5,
        entryDueDays: dto.entryDueDays ?? 5,
        orgUnitId: dto.orgUnitId,
        ownerId: dto.ownerId,
        dataEntryUserId: dto.dataEntryUserId ?? null,
        formula: dto.formula?.trim() || null,
        formulaRefs: refs,
        startPeriod: dto.startPeriod || null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.log('kpi', created.id, 'created', { ...dto, code });
    const row = await this.access.load(created.id);
    if (row.formula) await this.calc.backfill(row);
    return this.toDetail(row);
  }

  async update(id: string, dto: UpdateKpiDto): Promise<KpiDefinitionDetail> {
    const row = await this.access.load(id);
    if (!this.access.canManage(row)) throw new ForbiddenException();
    const data: Prisma.KpiDefinitionUncheckedUpdateInput = {};

    if (dto.orgUnitId && dto.orgUnitId !== row.orgUnitId) {
      this.assertManage((await this.assertOrgUnit(dto.orgUnitId)).path);
      data.orgUnitId = dto.orgUnitId;
    }
    if (dto.ownerId && dto.ownerId !== row.ownerId) {
      await this.assertUsers([dto.ownerId]);
      data.ownerId = dto.ownerId;
    }
    if (dto.dataEntryUserId !== undefined && dto.dataEntryUserId !== row.dataEntryUserId) {
      await this.assertUsers([dto.dataEntryUserId]);
      data.dataEntryUserId = dto.dataEntryUserId;
    }

    const frequency = dto.frequency ?? row.frequency;
    if (frequency !== row.frequency) {
      const [values, targets, dependants] = await Promise.all([
        this.prisma.db.kpiValue.count({ where: { kpiId: id } }),
        this.prisma.db.kpiTarget.count({ where: { kpiId: id } }),
        this.prisma.db.kpiDefinition.count({ where: { formulaRefs: { has: row.code } } }),
      ]);
      if (values || targets || dependants) {
        throw new BusinessException('FREQUENCY_LOCKED', 'Değer, hedef veya bağlı formül varken periyot değiştirilemez');
      }
      data.frequency = frequency;
    }
    if (dto.startPeriod !== undefined) {
      this.assertStartPeriod(dto.startPeriod, frequency);
      data.startPeriod = dto.startPeriod || null;
    } else if (frequency !== row.frequency) data.startPeriod = null;

    let formulaChanged = false;
    if (dto.formula !== undefined || frequency !== row.frequency) {
      const formula = dto.formula !== undefined ? dto.formula?.trim() || null : row.formula;
      if (formula !== row.formula || frequency !== row.frequency) {
        if (formula && (await this.prisma.db.kpiValue.count({ where: { kpiId: id, source: { not: 'CALCULATED' } } }))) {
          throw new BusinessException('INVALID_FORMULA', 'Manuel değeri olan KPI hesaplanan KPI yapılamaz');
        }
        data.formulaRefs = await this.validateFormula(row.code, frequency, formula);
        data.formula = formula;
        formulaChanged = formula !== row.formula;
      }
    }
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.decimals !== undefined) data.decimals = dto.decimals;
    if (dto.direction !== undefined) data.direction = dto.direction;
    if (dto.aggregation !== undefined) data.aggregation = dto.aggregation;
    if (dto.warningTolerancePct !== undefined) data.warningTolerancePct = dto.warningTolerancePct;
    if (dto.entryDueDays !== undefined) data.entryDueDays = dto.entryDueDays;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    await this.prisma.db.kpiDefinition.update({ where: { id }, data });
    await this.audit.log('kpi', id, 'updated', dto);

    const updated = await this.access.load(id);
    const statusAffecting = dto.direction !== undefined || dto.warningTolerancePct !== undefined;
    if (statusAffecting) await this.calc.recomputeStatuses(updated);
    if (updated.formula && (formulaChanged || statusAffecting)) await this.calc.backfill(updated);
    return this.toDetail(updated);
  }

  /** Silme = pasife alma (geçmiş veriler korunur). */
  async deactivate(id: string): Promise<void> {
    const row = await this.access.load(id);
    if (!this.access.canManage(row)) throw new ForbiddenException();
    await this.prisma.db.kpiDefinition.update({ where: { id }, data: { isActive: false } });
    await this.audit.log('kpi', id, 'deactivated');
  }

  /* ------------------------------ Hedefler ------------------------------ */

  async getTargets(id: string, from?: string, to?: string): Promise<KpiTargetItem[]> {
    const row = await this.access.loadVisible(id);
    const today = startOfUtcDay();
    const year = Number(currentPeriod('YEARLY', today));
    const defaults = periodsOfYear(row.frequency, year);
    const lo = from ?? defaults[0];
    const hi = to ?? defaults[defaults.length - 1];
    for (const p of [lo, hi]) if (!isValidPeriod(p, row.frequency)) throw new BusinessException('INVALID_PERIOD', `Geçersiz dönem: ${p}`);
    const targets = await this.prisma.db.kpiTarget.findMany({ where: { kpiId: id, period: { gte: lo, lte: hi } }, orderBy: { period: 'asc' } });
    return targets.map((t) => ({ period: t.period, target: num(t.target), targetMax: num(t.targetMax) }));
  }

  async setTargets(id: string, dto: SetTargetsDto): Promise<KpiTargetItem[]> {
    const row = await this.access.load(id);
    if (!this.access.canManage(row)) throw new ForbiddenException();
    const periods = new Set<string>();
    for (const t of dto.targets) {
      if (!isValidPeriod(t.period, row.frequency)) throw new BusinessException('INVALID_PERIOD', `Geçersiz dönem (${row.frequency}): ${t.period}`);
      if (row.direction === 'RANGE' && t.target !== null && t.targetMax !== null && t.targetMax !== undefined && t.targetMax < t.target) {
        throw new BusinessException('INVALID_TARGET', `Aralık üst sınırı alt sınırdan küçük olamaz (${t.period})`);
      }
      periods.add(t.period);
    }
    const tenantId = this.ctx.tenantId;
    await this.prisma.db.$transaction(async (tx) => {
      for (const t of dto.targets) {
        if (t.target === null || t.target === undefined) {
          await tx.kpiTarget.deleteMany({ where: { kpiId: id, period: t.period } });
          continue;
        }
        const targetMax = row.direction === 'RANGE' ? (t.targetMax ?? null) : null;
        const existing = await tx.kpiTarget.findFirst({ where: { kpiId: id, period: t.period } });
        if (existing) await tx.kpiTarget.update({ where: { id: existing.id }, data: { target: t.target, targetMax } });
        else await tx.kpiTarget.create({ data: { tenantId, kpiId: id, period: t.period, target: t.target, targetMax } });
      }
    });
    await this.audit.log('kpi', id, 'targetsSet', { count: dto.targets.length, from: [...periods].sort()[0], to: [...periods].sort().pop() });

    await this.calc.recomputeStatuses(row, [...periods]);
    for (const period of periods) await this.calc.propagate(row.code, period);
    const sorted = [...periods].sort(comparePeriods);
    return this.getTargets(id, sorted[0], sorted[sorted.length - 1]);
  }

  /* ------------------------------ Doğrulamalar ------------------------------ */

  private assertManage(orgUnitPath: string) {
    if (!this.access.canManage({ orgUnit: { path: orgUnitPath } } as Pick<KpiRow, 'orgUnit'>)) throw new ForbiddenException();
  }

  private async assertOrgUnit(id: string) {
    const unit = await this.prisma.db.orgUnit.findUnique({ where: { id } });
    if (!unit || !unit.isActive) throw new BusinessException('INVALID_ORG_UNIT', 'Birim bulunamadı ya da pasif');
    return unit;
  }

  private async assertUsers(ids: (string | null | undefined)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return;
    const count = await this.prisma.db.user.count({ where: { id: { in: unique }, isActive: true } });
    if (count !== unique.length) throw new BusinessException('INVALID_USER', 'Sorumlu ya da veri giriş kullanıcısı bulunamadı ya da pasif');
  }

  private assertStartPeriod(start: string | null | undefined, frequency: KpiRow['frequency']) {
    if (start && !isValidPeriod(start, frequency)) {
      throw new BusinessException('INVALID_PERIOD', `Başlangıç dönemi ${frequency} periyoduna uygun olmalı (ör. ${currentPeriod(frequency)})`);
    }
  }

  /** Formülü doğrular: sözdizimi, referansların varlığı, aynı periyot, kendine referans ve döngü yok. Referans kodlarını döndürür. */
  async validateFormula(code: string, frequency: KpiRow['frequency'], formula: string | null): Promise<string[]> {
    if (!formula?.trim()) return [];
    let refs: string[];
    try {
      refs = formulaRefs(parseFormula(formula));
    } catch (err) {
      throw new BusinessException('INVALID_FORMULA', (err as FormulaError).message);
    }
    if (!refs.length) throw new BusinessException('INVALID_FORMULA', 'Formül en az bir KPI referansı ({KOD}) içermeli');
    if (refs.includes(code)) throw new BusinessException('INVALID_FORMULA', 'Formül kendine referans veremez');
    const found = await this.prisma.db.kpiDefinition.findMany({ where: { code: { in: refs } }, select: { code: true, frequency: true } });
    const missing = refs.filter((r) => !found.some((f) => f.code === r));
    if (missing.length) throw new BusinessException('INVALID_FORMULA', `Formülde bulunamayan KPI kodları: ${missing.join(', ')}`);
    const wrong = found.filter((f) => f.frequency !== frequency).map((f) => f.code);
    if (wrong.length) throw new BusinessException('INVALID_FORMULA', `Formüldeki KPI'lar aynı periyotta olmalı: ${wrong.join(', ')}`);

    const all = await this.prisma.db.kpiDefinition.findMany({ select: { code: true, formulaRefs: true } });
    const deps = new Map(all.map((k) => [k.code, k.formulaRefs]));
    deps.set(code, refs);
    const cycle = findFormulaCycle(deps, code);
    if (cycle) throw new BusinessException('INVALID_FORMULA', `Formül döngüsü: ${cycle.join(' → ')}`);
    return refs;
  }

  /** Rapor servisleri için KPI satırlarını yükler. */
  async loadMany(where: Prisma.KpiDefinitionWhereInput, take = 2000): Promise<KpiRow[]> {
    return this.prisma.db.kpiDefinition.findMany({ where, include: kpiInclude, orderBy: [{ orgUnitId: 'asc' }, { code: 'asc' }], take });
  }
}
