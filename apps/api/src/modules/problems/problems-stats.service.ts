import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PROBLEM_PHASES, PROBLEM_SEVERITIES, PROBLEM_SOURCES, type ProblemStats } from '@lean/shared';
import { diffDays, startOfUtcDay } from '../../common/dates';
import { PrismaService } from '../../core/prisma/prisma.service';
import { ProblemAccessService } from './problem-access.service';
import { buildPareto, isWhyChainComplete } from './problem-rules';
import type { StatsQuery } from './problems.dto';

const OPEN: Prisma.ProblemWhereInput = { phase: { notIn: ['CLOSED', 'CANCELLED'] } };

@Injectable()
export class ProblemsStatsService {
  constructor(private readonly prisma: PrismaService, private readonly access: ProblemAccessService) {}

  async stats(query: StatsQuery): Promise<ProblemStats> {
    const and: Prisma.ProblemWhereInput[] = [{ deletedAt: null }, query.view === 'mine' ? this.access.mineWhere() : this.access.visibleWhere()];
    if (query.orgUnitId) {
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: query.orgUnitId }, select: { path: true } });
      and.push({ orgUnit: { path: { startsWith: unit?.path ?? '__none__' } } });
    }
    const where: Prisma.ProblemWhereInput = { AND: and };
    const today = startOfUtcDay();

    const [byPhase, bySeverity, bySource, overdue, closed, causes] = await Promise.all([
      this.prisma.db.problem.groupBy({ by: ['phase'], where, _count: true }),
      this.prisma.db.problem.groupBy({ by: ['severity'], where: { AND: [where, OPEN] }, _count: true }),
      this.prisma.db.problem.groupBy({ by: ['source'], where: { AND: [where, { phase: { not: 'CANCELLED' } }] }, _count: true }),
      this.prisma.db.problem.count({ where: { AND: [where, OPEN, { targetCloseDate: { lt: today } }] } }),
      this.prisma.db.problem.findMany({ where: { AND: [where, { phase: 'CLOSED', closedAt: { not: null } }] }, select: { createdAt: true, closedAt: true } }),
      this.prisma.db.problemCause.findMany({
        where: { isCandidate: true, problem: { AND: [where, { phase: { not: 'CANCELLED' } }] }, chain: { isNot: null } },
        select: { category: true, chain: { select: { rootCause: true, steps: { select: { answer: true } } } } },
      }),
    ]);
    const phaseCount = (p: string) => byPhase.find((b) => b.phase === p)?._count ?? 0;
    const total = byPhase.filter((b) => b.phase !== 'CANCELLED').reduce((s, b) => s + b._count, 0);
    const open = PROBLEM_PHASES.filter((p) => p !== 'CLOSED' && p !== 'CANCELLED').reduce((s, p) => s + phaseCount(p), 0);
    const avgDays = closed.length ? closed.reduce((s, c) => s + diffDays(c.closedAt!, c.createdAt), 0) / closed.length : null;

    return {
      total, open, overdue, awaitingVerification: phaseCount('VERIFICATION'),
      avgDaysToClose: avgDays === null ? null : Math.round(avgDays * 10) / 10,
      byPhase: PROBLEM_PHASES.map((phase) => ({ phase, count: phaseCount(phase) })),
      bySeverity: PROBLEM_SEVERITIES.map((severity) => ({ severity, count: bySeverity.find((b) => b.severity === severity)?._count ?? 0 })),
      bySource: PROBLEM_SOURCES.map((source) => ({ source, count: bySource.find((b) => b.source === source)?._count ?? 0 })).filter((s) => s.count > 0),
      pareto: buildPareto(causes.filter((c) => c.chain && isWhyChainComplete(c.chain)).map((c) => c.category)),
    };
  }
}
