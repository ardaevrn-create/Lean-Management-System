import { Injectable } from '@nestjs/common';
import { computeKpiStatus, detectFrequency, evaluateFormula, parseFormula, periodDueDate, roundKpiValue, type KpiStatus } from '@lean/shared';
import { diffDays, startOfUtcDay } from '../../common/dates';
import { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../core/prisma/prisma.service';
import { kpiInclude, num, type KpiRow } from './kpi-core';

type StatusSource = Pick<KpiRow, 'direction' | 'warningTolerancePct'>;

/** Durum (renk) hesabı ve hesaplanan (formüllü) KPI değerlerinin yeniden üretimi. */
@Injectable()
export class KpiCalcService {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext) {}

  statusOf(k: StatusSource, value: number | null, target: number | null, targetMax: number | null): KpiStatus {
    return computeKpiStatus({ value, target, targetMax, direction: k.direction, tolerancePct: Number(k.warningTolerancePct) });
  }

  /** Son giriş tarihinden sonra mı girildi? */
  isLate(k: Pick<KpiRow, 'entryDueDays'>, period: string, enteredAt: Date = new Date()): boolean {
    return diffDays(enteredAt, periodDueDate(period, k.entryDueDays)) > 0;
  }

  /** Hedef veya yön/tolerans değişince kayıtlı durumları yeniden hesaplar. periods yoksa tüm değerler. */
  async recomputeStatuses(k: KpiRow, periods?: string[]): Promise<number> {
    const where = { kpiId: k.id, ...(periods ? { period: { in: periods } } : {}) };
    const [values, targets] = await Promise.all([this.prisma.db.kpiValue.findMany({ where }), this.prisma.db.kpiTarget.findMany({ where })]);
    const targetMap = new Map(targets.map((t) => [t.period, t]));
    let changed = 0;
    for (const v of values) {
      const t = targetMap.get(v.period);
      const status = this.statusOf(k, Number(v.value), num(t?.target), num(t?.targetMax));
      if (status !== v.status) {
        await this.prisma.db.kpiValue.update({ where: { id: v.id }, data: { status } });
        changed++;
      }
    }
    return changed;
  }

  /** Hesaplanan KPI'nın bir dönemini girdilerinden yeniden üretir; girdiler eksikse dokunmaz. */
  async computeCalculated(k: KpiRow, period: string, depth = 0): Promise<void> {
    if (!k.formula || !k.isActive || depth > 8) return;
    let ast;
    try {
      ast = parseFormula(k.formula);
    } catch {
      return;
    }
    const inputs = await this.prisma.db.kpiValue.findMany({
      where: { period, kpi: { code: { in: k.formulaRefs }, frequency: k.frequency } },
      include: { kpi: { select: { code: true } } },
    });
    const map = new Map(inputs.map((v) => [v.kpi.code, Number(v.value)]));
    const result = evaluateFormula(ast, (code) => map.get(code));
    if (result === null) return;
    const value = roundKpiValue(result, k.decimals);

    const [existing, target] = await Promise.all([
      this.prisma.db.kpiValue.findFirst({ where: { kpiId: k.id, period } }),
      this.prisma.db.kpiTarget.findFirst({ where: { kpiId: k.id, period } }),
    ]);
    const status = this.statusOf(k, value, num(target?.target), num(target?.targetMax));
    if (existing && Number(existing.value) === value && existing.status === status) return;

    const now = new Date();
    const data = { value, status, source: 'CALCULATED' as const, note: null, enteredAt: now, isLate: this.isLate(k, period, now) };
    const userId = this.ctx.optionalUser?.id ?? k.ownerId;
    if (existing) {
      await this.prisma.db.kpiValue.update({ where: { id: existing.id }, data: { ...data, enteredById: userId } });
    } else {
      await this.prisma.db.kpiValue.create({ data: { tenantId: this.ctx.tenantId, kpiId: k.id, period, enteredById: userId, ...data } });
    }
    await this.propagate(k.code, period, depth + 1);
  }

  /** Bir KPI'nın değeri değişince ona bağlı hesaplanan KPI'ları günceller. */
  async propagate(code: string, period: string, depth = 0): Promise<void> {
    if (depth > 8) return;
    const frequency = detectFrequency(period);
    const dependants = await this.prisma.db.kpiDefinition.findMany({
      where: { formulaRefs: { has: code }, isActive: true, ...(frequency ? { frequency } : {}) },
      include: kpiInclude,
    });
    for (const d of dependants) await this.computeCalculated(d, period, depth);
  }

  /** Formül yeni atandı/değişti: girdi değeri olan tüm dönemler için üretir. */
  async backfill(k: KpiRow): Promise<void> {
    if (!k.formula || !k.formulaRefs.length) return;
    const rows = await this.prisma.db.kpiValue.findMany({
      where: { kpi: { code: { in: k.formulaRefs }, frequency: k.frequency } },
      select: { period: true },
      distinct: ['period'],
    });
    for (const { period } of rows) await this.computeCalculated(k, period);
  }

  today(): Date {
    return startOfUtcDay();
  }
}
