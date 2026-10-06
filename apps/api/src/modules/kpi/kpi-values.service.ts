import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  addPeriods, aggregateValues, comparePeriods, computeKpiStatus, currentPeriod, deviationRequirements, detectFrequency, firstPeriodOfYear,
  isValidPeriod, lastEndedPeriod, lastPeriodEndingOnOrBefore, normalizeKpiCode, periodEnd, periodYear,
  periodsBetween, previousYearPeriod, roundKpiValue,
  type BulkKpiValueResultItem, type BulkKpiValuesResult, type KpiAggregate, type KpiEntryGroup, type KpiEntryItem, type KpiEntryResponse,
  type KpiFrequency, type KpiRevisionItem, type KpiSeries, type KpiSeriesPoint, type KpiValueResult, type KpiValueSource,
} from '@lean/shared';
import { startOfUtcDay } from '../../common/dates';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { ActionsService } from '../../core/actions/actions.service';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { KpiAccessService } from './kpi-access.service';
import { KpiCalcService } from './kpi-calc.service';
import { expectedPeriods, isCalculated, iso, kpiInclude, num, toBrief, toUserRef, userRef, type KpiRow, type PeriodCell } from './kpi-core';
import { KpiSnapshotService } from './kpi-snapshot.service';
import type { BulkValuesDto, EntryQuery, SetValueDto } from './kpi.dto';

export interface SetValueInput {
  period: string;
  value: number;
  note?: string | null;
  reason?: string | null;
  source?: KpiValueSource;
  /** Seed / geçmiş veri aktarımı için giriş zamanı */
  enteredAt?: Date;
}

const MAX_SERIES = 400;

@Injectable()
export class KpiValuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly access: KpiAccessService,
    private readonly snapshots: KpiSnapshotService,
    private readonly calc: KpiCalcService,
    private readonly actions: ActionsService,
  ) {}

  /* ------------------------------ Değer girişi ------------------------------ */

  async setValue(dto: SetValueDto): Promise<KpiValueResult> {
    const kpi = await this.access.load(dto.kpiId);
    return this.setValueFor(kpi, { period: dto.period, value: dto.value, note: dto.note, reason: dto.reason, source: 'MANUAL' });
  }

  /** Değer yazar (yeni ya da revizyon). Yetki kontrolü, durum hesabı, revizyon kaydı, bağımlı KPI güncellemesi. */
  async setValueFor(kpi: KpiRow, input: SetValueInput): Promise<KpiValueResult> {
    if (!this.access.canEnter(kpi)) throw new ForbiddenException();
    if (isCalculated(kpi)) throw new BusinessException('CALCULATED_KPI', 'Hesaplanan KPI için manuel değer girilemez');
    if (!kpi.isActive) throw new BusinessException('KPI_INACTIVE', 'Pasif KPI için değer girilemez');
    if (!isValidPeriod(input.period, kpi.frequency)) {
      throw new BusinessException('INVALID_PERIOD', `Dönem ${kpi.frequency} periyoduna uygun olmalı (ör. ${currentPeriod(kpi.frequency)}): ${input.period}`);
    }
    if (comparePeriods(input.period, currentPeriod(kpi.frequency)) > 0) {
      throw new BusinessException('FUTURE_PERIOD', 'Gelecek dönem için değer girilemez');
    }
    if (!Number.isFinite(input.value)) throw new BusinessException('INVALID_VALUE', 'Geçersiz değer');
    const value = roundKpiValue(input.value, Math.max(kpi.decimals, 4));
    const note = input.note?.trim() || null;
    const source = input.source ?? 'MANUAL';
    const enteredAt = input.enteredAt ?? new Date();

    const [existing, target] = await Promise.all([
      this.prisma.db.kpiValue.findFirst({ where: { kpiId: kpi.id, period: input.period } }),
      this.prisma.db.kpiTarget.findFirst({ where: { kpiId: kpi.id, period: input.period } }),
    ]);
    const changed = !!existing && Number(existing.value) !== value;
    const reason = input.reason?.trim();
    if (changed && !reason) throw new BusinessException('REASON_REQUIRED', 'Mevcut değeri değiştirmek için gerekçe zorunludur');

    const status = this.calc.statusOf(kpi, value, num(target?.target), num(target?.targetMax));
    const userId = this.ctx.userId;
    const tenantId = this.ctx.tenantId;
    let valueId: string;

    if (existing) {
      await this.prisma.db.$transaction(async (tx) => {
        if (changed) {
          await tx.kpiValueRevision.create({
            data: { tenantId, valueId: existing.id, oldValue: existing.value, newValue: value, changedById: userId, reason: reason! },
          });
        }
        await tx.kpiValue.update({
          where: { id: existing.id },
          data: { value, status, note: note ?? (changed ? null : existing.note), ...(changed || existing.source === 'CALCULATED' ? { source, enteredById: userId, enteredAt } : {}) },
        });
      });
      valueId = existing.id;
    } else {
      const created = await this.prisma.db.kpiValue.create({
        data: { tenantId, kpiId: kpi.id, period: input.period, value, status, source, note, enteredById: userId, enteredAt, isLate: this.calc.isLate(kpi, input.period, enteredAt) },
      });
      valueId = created.id;
    }
    await this.audit.log('kpiValue', valueId, existing ? (changed ? 'revised' : 'noteUpdated') : 'created', {
      kpi: kpi.code, period: input.period, value, previous: existing ? Number(existing.value) : undefined, reason, source,
    });
    await this.calc.propagate(kpi.code, input.period);

    const cell = await this.snapshots.cell(kpi, input.period);
    const req = deviationRequirements(status);
    return {
      kpiId: kpi.id,
      period: input.period,
      value,
      status,
      entryState: cell.entryState,
      isLate: cell.isLate,
      revised: changed,
      requiresExplanation: req.explanation,
      requiresAction: req.actions,
    };
  }

  /** Entegrasyonlar için toplu giriş; satır bazlı sonuç döner (kısmi başarı). */
  async bulk(dto: BulkValuesDto): Promise<BulkKpiValuesResult> {
    const results: BulkKpiValueResultItem[] = [];
    const cache = new Map<string, KpiRow | null>();
    const load = async (item: BulkValuesDto['items'][number]) => {
      const key = item.kpiId ? `id:${item.kpiId}` : `code:${normalizeKpiCode(item.kpiCode ?? '')}`;
      if (!cache.has(key)) {
        const row = item.kpiId
          ? await this.prisma.db.kpiDefinition.findUnique({ where: { id: item.kpiId }, include: kpiInclude })
          : item.kpiCode ? await this.access.loadByCode(item.kpiCode) : null;
        cache.set(key, row);
      }
      return cache.get(key) ?? null;
    };

    for (const [index, item] of dto.items.entries()) {
      const base = { index, kpiCode: item.kpiCode ? normalizeKpiCode(item.kpiCode) : null, period: item.period };
      try {
        const kpi = await load(item);
        if (!kpi) {
          results.push({ ...base, ok: false, code: 'KPI_NOT_FOUND', error: 'KPI bulunamadı' });
          continue;
        }
        const r = await this.setValueFor(kpi, {
          period: item.period, value: item.value, note: item.note, source: 'API', reason: dto.reason ?? 'API ile güncelleme',
        });
        results.push({ ...base, kpiCode: kpi.code, ok: true, status: r.status, entryState: r.entryState });
      } catch (err) {
        const body = (err as { getResponse?: () => unknown }).getResponse?.() as { code?: string; message?: string } | undefined;
        results.push({ ...base, ok: false, code: body?.code ?? (err instanceof ForbiddenException ? 'FORBIDDEN' : 'ERROR'), error: body?.message ?? (err as Error).message });
      }
    }
    const succeeded = results.filter((r) => r.ok).length;
    return { total: results.length, succeeded, failed: results.length - succeeded, results };
  }

  /* ------------------------------ Revizyonlar ------------------------------ */

  async revisions(kpiId: string, period?: string): Promise<KpiRevisionItem[]> {
    await this.access.loadVisible(kpiId);
    const rows = await this.prisma.db.kpiValueRevision.findMany({
      where: { value: { kpiId, ...(period ? { period } : {}) } },
      include: { changedBy: userRef, value: { select: { period: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((r) => ({
      id: r.id,
      period: r.value.period,
      oldValue: num(r.oldValue),
      newValue: Number(r.newValue),
      reason: r.reason,
      changedBy: toUserRef(r.changedBy),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /* ------------------------------ Seri (trend / tablo) ------------------------------ */

  async series(kpiId: string, from?: string, to?: string): Promise<KpiSeries> {
    const kpi = await this.access.loadVisible(kpiId);
    const today = startOfUtcDay();
    const current = currentPeriod(kpi.frequency, today);
    const hi = to ?? current;
    const lo = from ?? addPeriods(hi, -11);
    for (const p of [lo, hi]) if (!isValidPeriod(p, kpi.frequency)) throw new BusinessException('INVALID_PERIOD', `Geçersiz dönem (${kpi.frequency}): ${p}`);
    const periods = comparePeriods(lo, hi) <= 0 ? periodsBetween(kpi.frequency, lo, hi) : [];
    if (periods.length > MAX_SERIES) throw new BusinessException('RANGE_TOO_LARGE', `En fazla ${MAX_SERIES} dönem sorgulanabilir`);

    const year = periodYear(hi);
    const ytdPeriods = periodsBetween(kpi.frequency, firstPeriodOfYear(kpi.frequency, year), hi);
    const prevYearOf = (p: string) => previousYearPeriod(p);
    const all = [...new Set([...periods, ...ytdPeriods])];
    const prevPeriods = [...new Set(all.map(prevYearOf))];

    const [cells, prevCells] = await Promise.all([
      this.snapshots.cells([kpi], () => all, today),
      this.snapshots.cells([kpi], () => prevPeriods, today),
    ]);
    const cellMap = new Map(cells.get(kpi.id)!.map((c) => [c.period, c]));
    const prevMap = new Map(prevCells.get(kpi.id)!.map((c) => [c.period, c]));

    const points: KpiSeriesPoint[] = periods.map((p) => {
      const c = cellMap.get(p)!;
      return {
        period: p,
        periodStart: iso(c.periodStart)!,
        periodEnd: iso(c.periodEnd)!,
        dueDate: iso(c.dueDate)!,
        target: c.target,
        targetMax: c.targetMax,
        value: c.value,
        status: c.status,
        entryState: p < this.firstExpected(kpi) && c.value === null ? null : c.entryState,
        source: c.source,
        note: c.note,
        isLate: c.isLate,
        enteredBy: c.enteredBy,
        enteredAt: iso(c.enteredAt),
        deviation: c.deviation,
        actionCount: c.actionCount,
        previousYearValue: prevMap.get(prevYearOf(p))?.value ?? null,
      };
    });

    const valued = ytdPeriods.filter((p) => cellMap.get(p)?.value !== null && cellMap.get(p)?.value !== undefined);
    const aggregate = (cs: (PeriodCell | undefined)[]): KpiAggregate => {
      const present = cs.filter((c): c is PeriodCell => !!c && c.value !== null);
      const value = aggregateValues(present.map((c) => c.value!), kpi.aggregation);
      const targeted = present.filter((c) => c.target !== null);
      const target = aggregateValues(targeted.map((c) => c.target!), kpi.aggregation);
      const targetMax = aggregateValues(targeted.filter((c) => c.targetMax !== null).map((c) => c.targetMax!), kpi.aggregation);
      return {
        periods: present.length,
        value,
        target,
        status: computeKpiStatus({ value, target, targetMax, direction: kpi.direction, tolerancePct: Number(kpi.warningTolerancePct) }),
      };
    };
    const deviationIds = points.map((p) => p.deviation?.id).filter((x): x is string => !!x);
    const actions = deviationIds.length ? await this.actions.listBySource('KPI_DEVIATION', deviationIds) : [];
    return {
      kpi: toBrief(kpi),
      actions,
      from: lo,
      to: hi,
      points,
      year,
      ytd: aggregate(valued.map((p) => cellMap.get(p))),
      previousYearYtd: aggregate(valued.map((p) => prevMap.get(prevYearOf(p)))),
    };
  }

  private firstExpected(kpi: KpiRow): string {
    return kpi.startPeriod && isValidPeriod(kpi.startPeriod, kpi.frequency) ? kpi.startPeriod : currentPeriod(kpi.frequency, kpi.createdAt);
  }

  /* ------------------------------ Veri giriş çalışma listesi ------------------------------ */

  /** Referans (dönem/tarih anahtarı) → KPI sıklığında girilecek dönem. Verilmezse son tamamlanan dönem. */
  resolveEntryPeriod(frequency: KpiFrequency, ref: string | undefined, today: Date): string {
    const current = currentPeriod(frequency, today);
    if (!ref) return lastEndedPeriod(frequency, today);
    const refFreq = detectFrequency(ref);
    if (!refFreq) throw new BusinessException('INVALID_PERIOD', `Geçersiz dönem: ${ref}`);
    const p = refFreq === frequency ? ref : lastPeriodEndingOnOrBefore(frequency, periodEnd(ref));
    return comparePeriods(p, current) > 0 ? current : p;
  }

  async entry(query: EntryQuery): Promise<KpiEntryResponse> {
    const today = startOfUtcDay();
    const where = this.access.and(
      this.access.enterableWhere(),
      { isActive: true },
      ...(query.frequency ? [{ frequency: query.frequency }] : []),
    );
    const kpis = await this.prisma.db.kpiDefinition.findMany({ where, include: kpiInclude, orderBy: [{ frequency: 'asc' }, { code: 'asc' }], take: 500 });
    const periodOf = new Map<string, string>();
    for (const k of kpis) periodOf.set(k.id, this.resolveEntryPeriod(k.frequency, query.period, today));
    const cells = await this.snapshots.cells(kpis, (k) => [...expectedPeriods(k, today), periodOf.get(k.id)!], today);

    const order: KpiFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];
    const groups = new Map<KpiFrequency, KpiEntryGroup>();
    for (const k of kpis) {
      const period = periodOf.get(k.id)!;
      const all = cells.get(k.id)!;
      const cell = all.find((c) => c.period === period)!;
      const item: KpiEntryItem = {
        kpi: toBrief(k),
        period,
        periodStart: iso(cell.periodStart)!,
        dueDate: iso(cell.dueDate)!,
        target: cell.target,
        targetMax: cell.targetMax,
        value: cell.value,
        status: cell.status,
        source: cell.source,
        note: cell.note,
        isLate: cell.isLate,
        isCalculated: isCalculated(k),
        canEnter: !isCalculated(k) && this.access.canEnter(k),
        entryState: cell.entryState,
        deviation: cell.deviation,
        actionCount: cell.actionCount,
        missingPeriods: isCalculated(k) ? [] : all.filter((c) => c.entryState === 'MISSING' && c.period !== period).map((c) => c.period),
      };
      const g = groups.get(k.frequency) ?? { frequency: k.frequency, period, dueDate: item.dueDate, items: [] };
      g.items.push(item);
      groups.set(k.frequency, g);
    }
    return { groups: order.filter((f) => groups.has(f)).map((f) => groups.get(f)!) };
  }
}
