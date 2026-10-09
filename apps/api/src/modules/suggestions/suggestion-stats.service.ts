import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS, SUGGESTION_CATEGORIES, type SuggestionStats } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../../core/auth/access.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SuggestionAccessService } from './suggestion-access.service';
import { ACCEPTED_LIKE, IMPLEMENTED_LIKE, avgDays, monthKey, num, participationPct, pct, perEmployee } from './suggestion-rules';
import type { StatsQuery } from './suggestions.dto';

/** Öneri & kaizen istatistikleri (M7-08). */
@Injectable()
export class SuggestionStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly access: AccessService,
    private readonly sAccess: SuggestionAccessService,
  ) {}

  async stats(query: StatsQuery): Promise<SuggestionStats> {
    const canManage = this.access.has(PERMISSIONS.SUGGESTION_MANAGE);
    if (!canManage && !this.access.has(PERMISSIONS.SUGGESTION_EVALUATE)) throw new ForbiddenException();
    const scope: Prisma.SuggestionWhereInput = (canManage ? this.sAccess.manageWhere() : {}) ?? { id: '__none__' };

    const and: Prisma.SuggestionWhereInput[] = [scope];
    let unitPath: string | null = null;
    if (query.orgUnitId) {
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: query.orgUnitId } });
      unitPath = unit?.path ?? '__none__';
      and.push({ orgUnit: { path: { startsWith: unitPath } } });
    }
    if (query.from) and.push({ submittedAt: { gte: new Date(query.from) } });
    if (query.to) and.push({ submittedAt: { lte: new Date(query.to) } });
    const where: Prisma.SuggestionWhereInput = { AND: and };

    const rows = await this.prisma.db.suggestion.findMany({
      where, take: 20_000,
      select: {
        id: true, status: true, category: true, submittedById: true, submittedAt: true, decidedAt: true, implementedAt: true,
        submittedBy: { select: { fullName: true, employee: { select: { orgUnitId: true } } } },
      },
    });

    const employees = await this.prisma.db.employee.findMany({
      where: { isActive: true, ...(unitPath ? { orgUnit: { path: { startsWith: unitPath } } } : {}) },
      select: { orgUnitId: true },
    });
    const activeEmployees = employees.length;
    const distinct = new Set(rows.map((r) => r.submittedById)).size;

    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const acceptedN = rows.filter((r) => (ACCEPTED_LIKE as readonly string[]).includes(r.status)).length;
    const rejectedN = byStatus.REJECTED ?? 0;
    const implementedN = rows.filter((r) => (IMPLEMENTED_LIKE as readonly string[]).includes(r.status)).length;

    const byCategory = SUGGESTION_CATEGORIES.map((category) => ({ category, count: rows.filter((r) => r.category === category).length })).filter((c) => c.count > 0);

    const months = new Map<string, { submitted: number; accepted: number }>();
    for (const r of rows) {
      const m = monthKey(r.submittedAt);
      const e = months.get(m) ?? { submitted: 0, accepted: 0 };
      e.submitted++;
      if ((ACCEPTED_LIKE as readonly string[]).includes(r.status)) e.accepted++;
      months.set(m, e);
    }
    const monthlyTrend = [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));

    // Birim bazlı: öneri sahibinin kendi birimi
    const units = await this.prisma.db.orgUnit.findMany({ select: { id: true, name: true } });
    const unitName = new Map(units.map((u) => [u.id, u.name]));
    const empByUnit = new Map<string | null, number>();
    for (const e of employees) empByUnit.set(e.orgUnitId, (empByUnit.get(e.orgUnitId) ?? 0) + 1);
    const sugByUnit = new Map<string | null, { count: number; people: Set<string> }>();
    for (const r of rows) {
      const u = r.submittedBy.employee?.orgUnitId ?? null;
      const e = sugByUnit.get(u) ?? { count: 0, people: new Set<string>() };
      e.count++;
      e.people.add(r.submittedById);
      sugByUnit.set(u, e);
    }
    const unitIds = new Set<string | null>([...empByUnit.keys(), ...sugByUnit.keys()]);
    const byOrgUnit = [...unitIds].map((orgUnitId) => {
      const emp = empByUnit.get(orgUnitId) ?? 0;
      const s = sugByUnit.get(orgUnitId);
      return {
        orgUnitId, name: orgUnitId ? (unitName.get(orgUnitId) ?? '—') : '—', count: s?.count ?? 0, employees: emp,
        perEmployee: perEmployee(s?.count ?? 0, emp), participationPct: participationPct(s?.people.size ?? 0, emp),
      };
    }).filter((u) => u.count > 0 || u.employees > 0).sort((a, b) => b.count - a.count || b.employees - a.employees);

    const contrib = new Map<string, { fullName: string; count: number; accepted: number }>();
    for (const r of rows) {
      const c = contrib.get(r.submittedById) ?? { fullName: r.submittedBy.fullName, count: 0, accepted: 0 };
      c.count++;
      if ((ACCEPTED_LIKE as readonly string[]).includes(r.status)) c.accepted++;
      contrib.set(r.submittedById, c);
    }
    const topContributors = [...contrib.entries()].map(([userId, c]) => ({ userId, ...c })).sort((a, b) => b.count - a.count || b.accepted - a.accepted).slice(0, 10);

    const kaizen = await this.kaizenStats(query, unitPath);

    return {
      total: rows.length, byStatus,
      acceptanceRate: pct(acceptedN, acceptedN + rejectedN),
      implementationRate: pct(implementedN, acceptedN),
      avgDaysToDecision: avgDays(rows.map((r) => ({ from: r.submittedAt, to: r.decidedAt }))),
      avgDaysToImplementation: avgDays(rows.map((r) => ({ from: r.decidedAt, to: r.implementedAt }))),
      activeEmployees, perEmployee: perEmployee(rows.length, activeEmployees), participationPct: participationPct(distinct, activeEmployees),
      byCategory, monthlyTrend, byOrgUnit, topContributors, kaizen,
    };
  }

  private async kaizenStats(query: StatsQuery, unitPath: string | null): Promise<SuggestionStats['kaizen']> {
    const canManage = this.access.has(PERMISSIONS.SUGGESTION_MANAGE);
    const paths = canManage ? this.access.scopePaths(PERMISSIONS.SUGGESTION_MANAGE) : null;
    const and: Prisma.KaizenWhereInput[] = [{ status: { in: ['APPROVED', 'PUBLISHED'] } }];
    if (paths && paths.length) and.push({ orgUnit: { OR: paths.map((p) => ({ path: { startsWith: p } })) } });
    if (unitPath) and.push({ orgUnit: { path: { startsWith: unitPath } } });
    if (query.from) and.push({ createdAt: { gte: new Date(query.from) } });
    if (query.to) and.push({ createdAt: { lte: new Date(query.to) } });
    const rows = await this.prisma.db.kaizen.findMany({
      where: { AND: and }, take: 20_000,
      select: { type: true, orgUnitId: true, orgUnit: { select: { name: true } }, gains: { select: { type: true, annualSaving: true, financeApproved: true } } },
    });
    const sum = (g: (typeof rows)[number]['gains'], approvedOnly: boolean) =>
      g.filter((x) => x.type === 'TANGIBLE' && (!approvedOnly || x.financeApproved)).reduce((s, x) => s + (num(x.annualSaving) ?? 0), 0);
    const byType: Record<string, number> = {};
    const units = new Map<string | null, { name: string; count: number; annualSaving: number }>();
    for (const r of rows) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
      const u = units.get(r.orgUnitId) ?? { name: r.orgUnit?.name ?? '—', count: 0, annualSaving: 0 };
      u.count++;
      u.annualSaving += sum(r.gains, false);
      units.set(r.orgUnitId, u);
    }
    return {
      total: rows.length, byType,
      totalAnnualSaving: rows.reduce((s, r) => s + sum(r.gains, false), 0),
      approvedAnnualSaving: rows.reduce((s, r) => s + sum(r.gains, true), 0),
      byOrgUnit: [...units.entries()].map(([orgUnitId, v]) => ({ orgUnitId, ...v })).sort((a, b) => b.annualSaving - a.annualSaving),
    };
  }
}
