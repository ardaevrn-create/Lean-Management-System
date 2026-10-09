import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  KPI_FREQUENCIES, PERMISSIONS, currentPeriod, detectFrequency, lastPeriodEndingOnOrBefore, periodEnd, periodLabel,
  periodStart, recentPeriods,
  type KpiBoardItem, type KpiBoardPoint, type KpiBoardResponse, type KpiComplianceResponse, type KpiComplianceRow, type KpiDashboardWidget,
  type KpiFeedRow, type KpiMissingItem, type KpiMissingResponse, type KpiSummary,
} from '@lean/shared';
import { diffDays, startOfUtcDay } from '../../common/dates';
import { BusinessException } from '../../common/errors';
import type { RequestUser } from '../../common/request-user';
import { AccessService } from '../../core/auth/access.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { KpiAccessService } from './kpi-access.service';
import { KpiDefinitionsService } from './kpi-definitions.service';
import { expectedPeriods, isoDay, responsibleOf, toBrief, type KpiRow, type PeriodCell } from './kpi-core';
import { KpiSnapshotService } from './kpi-snapshot.service';
import type { BoardQuery, DateRangeQuery } from './kpi.dto';

const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);
const MAX_KPIS = 2000;

/** Eksik veri, uyum, özet, pano, besleme ve ana sayfa kartı. */
@Injectable()
export class KpiReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KpiAccessService,
    private readonly coreAccess: AccessService,
    private readonly snapshots: KpiSnapshotService,
    private readonly defs: KpiDefinitionsService,
  ) {}

  /** Rapor kapsamı: görünür + aktif + (isteğe bağlı) birim alt ağacı. */
  private async scope(orgUnitId?: string, extra: Prisma.KpiDefinitionWhereInput[] = []): Promise<KpiRow[]> {
    const and: Prisma.KpiDefinitionWhereInput[] = [this.access.visibleWhere(), { isActive: true }, ...extra];
    if (orgUnitId) and.push({ orgUnit: await this.defs.subtreeFilter(orgUnitId) });
    return this.defs.loadMany({ AND: and }, MAX_KPIS);
  }

  private inRange(dueDate: Date, q: Pick<DateRangeQuery, 'from' | 'to'>) {
    const t = dueDate.getTime();
    if (q.from && t < new Date(q.from).getTime()) return false;
    if (q.to && t > new Date(q.to).getTime()) return false;
    return true;
  }

  /* ------------------------------ Eksik veri ------------------------------ */

  async missing(q: DateRangeQuery, today: Date = startOfUtcDay()): Promise<KpiMissingResponse> {
    // Hesaplanan KPI'lar girdilerinden üretildiği için eksik veri raporuna girmez
    const kpis = await this.scope(q.orgUnitId, [{ formula: null }]);
    const cells = await this.snapshots.cells(kpis, (k) => expectedPeriods(k, today), today);
    const items: KpiMissingItem[] = [];
    for (const k of kpis) {
      for (const c of cells.get(k.id) ?? []) {
        if (c.entryState !== 'MISSING' || !this.inRange(c.dueDate, q)) continue;
        items.push({
          kpi: toBrief(k),
          period: c.period,
          dueDate: c.dueDate.toISOString(),
          daysLate: diffDays(today, c.dueDate),
          responsible: responsibleOf(k),
          orgUnit: { id: k.orgUnit.id, name: k.orgUnit.name, code: k.orgUnit.code },
        });
      }
    }
    items.sort((a, b) => b.daysLate - a.daysLate || a.kpi.code.localeCompare(b.kpi.code));
    return { total: items.length, items };
  }

  /* ------------------------------ Uyum ------------------------------ */

  async compliance(q: DateRangeQuery, today: Date = startOfUtcDay()): Promise<KpiComplianceResponse> {
    const kpis = await this.scope(q.orgUnitId, [{ formula: null }]);
    const cells = await this.snapshots.cells(kpis, (k) => expectedPeriods(k, today), today);

    const blank = (): Pick<KpiComplianceRow, 'expected' | 'onTime' | 'late' | 'missing'> => ({ expected: 0, onTime: 0, late: 0, missing: 0 });
    const finish = (r: Pick<KpiComplianceRow, 'expected' | 'onTime' | 'late' | 'missing'>) => ({
      ...r,
      complianceRate: rate(r.onTime, r.expected),
      completionRate: rate(r.onTime + r.late, r.expected),
    });
    const add = (r: ReturnType<typeof blank>, c: PeriodCell) => {
      r.expected++;
      if (c.value === null) r.missing++;
      else if (c.isLate) r.late++;
      else r.onTime++;
    };

    const overall = blank();
    const units = new Map<string, { orgUnit: KpiComplianceRow['orgUnit']; acc: ReturnType<typeof blank> }>();
    const people = new Map<string, { user: KpiComplianceRow['user']; acc: ReturnType<typeof blank> }>();
    for (const k of kpis) {
      for (const c of cells.get(k.id) ?? []) {
        // Beklenen: son giriş tarihi geçmiş dönemler
        if (diffDays(today, c.dueDate) <= 0 || !this.inRange(c.dueDate, q)) continue;
        add(overall, c);
        const u = units.get(k.orgUnit.id) ?? { orgUnit: { id: k.orgUnit.id, name: k.orgUnit.name, code: k.orgUnit.code }, acc: blank() };
        add(u.acc, c);
        units.set(k.orgUnit.id, u);
        const resp = responsibleOf(k);
        const p = people.get(resp.id) ?? { user: resp, acc: blank() };
        add(p.acc, c);
        people.set(resp.id, p);
      }
    }
    const sorted = <T extends { complianceRate: number | null; expected: number }>(rows: T[]) =>
      rows.sort((a, b) => (a.complianceRate ?? 101) - (b.complianceRate ?? 101) || b.expected - a.expected);
    return {
      overall: { orgUnit: null, user: null, ...finish(overall) },
      byOrgUnit: sorted([...units.values()].map((u) => ({ orgUnit: u.orgUnit, user: null, ...finish(u.acc) }))),
      byPerson: sorted([...people.values()].map((p) => ({ orgUnit: null, user: p.user, ...finish(p.acc) }))),
    };
  }

  /* ------------------------------ Özet ------------------------------ */

  async summary(today: Date = startOfUtcDay()): Promise<KpiSummary> {
    const kpis = await this.scope();
    const cells = await this.snapshots.cells(kpis, (k) => expectedPeriods(k, today), today);
    let missing = 0, deviationRequired = 0, pendingApproval = 0, expected = 0, onTime = 0;
    for (const k of kpis) {
      for (const c of cells.get(k.id) ?? []) {
        if (c.entryState === 'MISSING' && !k.formula) missing++;
        if (c.entryState === 'DEVIATION_REQUIRED') deviationRequired++;
        if (c.entryState === 'PENDING_APPROVAL') pendingApproval++;
        if (!k.formula && diffDays(today, c.dueDate) > 0) {
          expected++;
          if (c.value !== null && !c.isLate) onTime++;
        }
      }
    }
    return { missing, deviationRequired, pendingApproval, kpiCount: kpis.length, complianceRate: rate(onTime, expected) };
  }

  /* ------------------------------ Pano ------------------------------ */

  async board(q: BoardQuery, today: Date = startOfUtcDay()): Promise<KpiBoardResponse> {
    const includeSub = q.includeSub ?? true;
    let orgUnit: KpiBoardResponse['orgUnit'] = null;
    const extra: Prisma.KpiDefinitionWhereInput[] = [];
    if (q.orgUnitId) {
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: q.orgUnitId } });
      if (!unit) throw new BusinessException('INVALID_ORG_UNIT', 'Birim bulunamadı');
      orgUnit = { id: unit.id, name: unit.name, code: unit.code };
      extra.push(includeSub ? { orgUnit: { path: { startsWith: unit.path } } } : { orgUnitId: unit.id });
    }
    let refDate: Date | null = null;
    if (q.period) {
      if (!detectFrequency(q.period)) throw new BusinessException('INVALID_PERIOD', `Geçersiz dönem: ${q.period}`);
      refDate = periodEnd(q.period);
    }
    const kpis = await this.scope(undefined, extra);
    const endFor = (k: KpiRow) => (refDate ? lastPeriodEndingOnOrBefore(k.frequency, refDate) : currentPeriod(k.frequency, today));
    const cells = await this.snapshots.cells(kpis, (k) => recentPeriods(endFor(k), 7), today);

    const items: KpiBoardItem[] = kpis.map((k) => {
      const all = cells.get(k.id) ?? [];
      const last = all[all.length - 1];
      // Referans verilmediyse güncel dönemde değer yoksa son tamamlanan dönem esas alınır
      const end = refDate || (last && last.value !== null) ? all.length : all.length - 1;
      const window = all.slice(Math.max(0, end - 6), end);
      const point = (c: PeriodCell): KpiBoardPoint => ({ period: c.period, label: periodLabel(c.period), value: c.value, target: c.target, status: c.status });
      const current = window[window.length - 1];
      return { kpi: toBrief(k), current: current ? point(current) : null, entryState: current?.entryState ?? null, spark: window.map(point) };
    });
    const summary = { green: 0, yellow: 0, red: 0, noData: 0, total: items.length };
    for (const i of items) {
      const s = i.current?.value === null || !i.current ? null : i.current.status;
      if (s === 'GREEN') summary.green++;
      else if (s === 'YELLOW') summary.yellow++;
      else if (s === 'RED') summary.red++;
      else summary.noData++;
    }
    return { orgUnit, summary, items };
  }

  /* ------------------------------ Power BI / Excel besleme ------------------------------ */

  async feed(q: DateRangeQuery, today: Date = startOfUtcDay()): Promise<KpiFeedRow[]> {
    const to = q.to ? new Date(q.to) : today;
    const from = q.from ? new Date(q.from) : new Date(Date.UTC(today.getUTCFullYear() - 1, 0, 1));
    const kpis = await this.scope(q.orgUnitId);
    if (!kpis.length) return [];
    const kpiMap = new Map(kpis.map((k) => [k.id, k]));
    const rows: KpiFeedRow[] = [];

    for (const frequency of KPI_FREQUENCIES) {
      const ids = kpis.filter((k) => k.frequency === frequency).map((k) => k.id);
      if (!ids.length) continue;
      const where = { kpiId: { in: ids }, period: { gte: currentPeriod(frequency, from), lte: currentPeriod(frequency, to) } };
      const [values, targets, deviations] = await Promise.all([
        this.prisma.db.kpiValue.findMany({ where }),
        this.prisma.db.kpiTarget.findMany({ where }),
        this.prisma.db.kpiDeviation.findMany({ where, select: { kpiId: true, period: true, explanation: true } }),
      ]);
      const keys = new Map<string, { kpiId: string; period: string }>();
      for (const x of [...values, ...targets]) keys.set(`${x.kpiId}|${x.period}`, { kpiId: x.kpiId, period: x.period });
      const vMap = new Map(values.map((v) => [`${v.kpiId}|${v.period}`, v]));
      const tMap = new Map(targets.map((t) => [`${t.kpiId}|${t.period}`, t]));
      const dMap = new Map(deviations.map((d) => [`${d.kpiId}|${d.period}`, d.explanation]));
      for (const [key, { kpiId, period }] of keys) {
        const k = kpiMap.get(kpiId)!;
        const v = vMap.get(key);
        const t = tMap.get(key);
        rows.push({
          kpiCode: k.code,
          kpiName: k.name,
          category: k.category,
          unit: k.unit,
          direction: k.direction,
          frequency: k.frequency,
          orgUnitCode: k.orgUnit.code,
          orgUnitName: k.orgUnit.name,
          ownerName: k.owner.fullName,
          period,
          periodStart: isoDay(periodStart(period)),
          target: t ? Number(t.target) : null,
          targetMax: t?.targetMax ? Number(t.targetMax) : null,
          value: v ? Number(v.value) : null,
          status: v?.status ?? null,
          deviationExplanation: dMap.get(key) ?? null,
        });
      }
    }
    rows.sort((a, b) => a.kpiCode.localeCompare(b.kpiCode) || a.period.localeCompare(b.period));
    return rows.slice(0, 50_000);
  }

  /* ------------------------------ Ana sayfa kartı ------------------------------ */

  async widget(user: RequestUser, today: Date = startOfUtcDay()): Promise<KpiDashboardWidget | undefined> {
    const hasApprove = this.coreAccess.has(PERMISSIONS.KPI_DEVIATION_APPROVE, user);
    const mine = await this.defs.loadMany({ isActive: true, OR: [{ ownerId: user.id }, { dataEntryUserId: user.id }] }, 300);
    const approvable = await this.approvableKpis(user, hasApprove);
    if (!mine.length && !hasApprove && !approvable.length && !this.coreAccess.has(PERMISSIONS.KPI_VIEW, user)) return undefined;

    const myCells = await this.snapshots.cells(mine, (k) => expectedPeriods(k, today), today);
    let toEnter = 0, missing = 0, deviationsRequired = 0;
    for (const k of mine) {
      for (const c of myCells.get(k.id) ?? []) {
        const responsible = k.dataEntryUserId === user.id || (!k.dataEntryUserId && k.ownerId === user.id);
        if (!k.formula && responsible && c.value === null && diffDays(today, c.periodEnd) > 0) {
          if (c.entryState === 'MISSING') missing++;
          else toEnter++;
        }
        if (k.ownerId === user.id && c.entryState === 'DEVIATION_REQUIRED') deviationsRequired++;
      }
    }
    const widget: KpiDashboardWidget = { toEnter, missing, deviationsRequired };
    if (hasApprove || approvable.length) {
      const cells = await this.snapshots.cells(approvable, (k) => expectedPeriods(k, today), today);
      widget.pendingApprovals = approvable.reduce(
        (n, k) => n + (cells.get(k.id) ?? []).filter((c) => c.entryState === 'PENDING_APPROVAL').length,
        0,
      );
    }
    return widget;
  }

  /** Kullanıcının sapma onaylayabileceği KPI'lar (izin kapsamı ya da sahibinin yöneticisi olduğu). */
  private async approvableKpis(user: RequestUser, hasApprove: boolean): Promise<KpiRow[]> {
    const or: Prisma.KpiDefinitionWhereInput[] = [];
    if (hasApprove) {
      const filter = this.coreAccess.orgUnitFilter(PERMISSIONS.KPI_DEVIATION_APPROVE, user);
      if (filter === null) or.push({});
      else if (filter.OR.length) or.push({ orgUnit: filter });
    }
    if (user.employeeId) or.push({ owner: { employee: { managerId: user.employeeId } } });
    if (!or.length) return [];
    return this.defs.loadMany({ isActive: true, OR: or }, 500);
  }
}
