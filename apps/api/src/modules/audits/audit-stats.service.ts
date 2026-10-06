import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { auditCode, type AuditMissedItem, type AuditStats } from '@lean/shared';
import { startOfUtcDay } from '../../common/dates';
import { PrismaService } from '../../core/prisma/prisma.service';
import { AuditAccessService } from './audit-access.service';
import { daysBetween } from './audit-rules';
import { buildAreaStats, complianceCounts, rankAreas, sectionAverages, tagStats } from './audit-stats';
import type { StatsQuery } from './audits.dto';

/** Denetim raporları (M6-07, M6-08, M6-12): skor trendi, sıralama, radar verisi, geciken denetimler, etiket istatistikleri. */
@Injectable()
export class AuditStatsService {
  constructor(private readonly prisma: PrismaService, private readonly access: AuditAccessService) {}

  async stats(query: StatsQuery): Promise<AuditStats> {
    const today = startOfUtcDay();
    const from = query.from ? startOfUtcDay(new Date(query.from)) : null;
    const to = query.to ? startOfUtcDay(new Date(query.to)) : null;

    const areaAnd: Prisma.AuditAreaWhereInput[] = [this.access.visibleAreaWhere()];
    if (query.areaId) areaAnd.push({ id: query.areaId });
    if (query.orgUnitId) {
      const unit = await this.prisma.db.orgUnit.findUnique({ where: { id: query.orgUnitId }, select: { path: true } });
      areaAnd.push({ orgUnit: { path: { startsWith: unit?.path ?? '__none__' } } });
    }
    const areaWhere: Prisma.AuditAreaWhereInput = { AND: areaAnd };
    const areas = await this.prisma.db.auditArea.findMany({
      where: { ...areaWhere, isActive: true },
      select: { id: true, code: true, name: true, orgUnit: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
    const areaIds = areas.map((a) => a.id);
    const typeFilter: Prisma.AuditWhereInput = query.templateType ? { template: { type: query.templateType } } : {};
    const dueRange: Prisma.AuditWhereInput = from || to ? { dueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

    // Skor verisi: tamamlanmış denetimler (tamamlanma tarihine göre aralık)
    const completed = await this.prisma.db.audit.findMany({
      where: {
        areaId: { in: areaIds }, status: 'COMPLETED', scorePct: { not: null }, ...typeFilter,
        ...(from || to ? { completedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date((to as Date).getTime() + 86_400_000) } : {}) } } : {}),
      },
      select: { id: true, areaId: true, completedAt: true, scorePct: true, sectionScores: true },
    });
    const statAudits = completed.map((c) => ({
      id: c.id, areaId: c.areaId, completedAt: c.completedAt!, scorePct: c.scorePct!,
      sectionScores: (Array.isArray(c.sectionScores) ? c.sectionScores : []) as { title: string; scorePct: number | null }[],
    }));
    const areaStats = buildAreaStats(areas, statAudits);
    const { best, worst } = rankAreas(areaStats);

    // Uyum: termin aralığındaki tüm denetimler
    const planned = await this.prisma.db.audit.findMany({
      where: { areaId: { in: areaIds }, ...typeFilter, ...dueRange },
      select: {
        id: true, number: true, status: true, dueDate: true, area: { select: { name: true } }, auditor: { select: { fullName: true } },
        answers: { select: { isFinding: true, actionId: true } },
      },
    });
    const missed: AuditMissedItem[] = planned
      .filter((a) => (a.status === 'PLANNED' || a.status === 'IN_PROGRESS') && a.dueDate < today)
      .map((a) => ({
        auditId: a.id, code: auditCode(a.number), areaName: a.area.name, auditorName: a.auditor.fullName,
        dueDate: a.dueDate.toISOString().slice(0, 10), daysOverdue: daysBetween(today, a.dueDate), status: a.status,
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 100);

    // Bulgular ve aksiyonlar
    const findings = planned.flatMap((a) => a.answers.filter((x) => x.isFinding));
    const auditIds = planned.map((a) => a.id);
    const [openActions, overdueActions] = auditIds.length
      ? await Promise.all([
          this.prisma.db.action.count({ where: { sourceType: 'AUDIT_FINDING', sourceId: { in: auditIds }, deletedAt: null, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
          this.prisma.db.action.count({ where: { sourceType: 'AUDIT_FINDING', sourceId: { in: auditIds }, deletedAt: null, status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { lt: today } } }),
        ])
      : [0, 0];

    // Etiketler
    const tags = await this.prisma.db.abnormalityTag.findMany({
      where: {
        AND: [
          this.access.visibleTagWhere(), { areaId: { in: areaIds } },
          ...(from || to ? [{ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date((to as Date).getTime() + 86_400_000) } : {}) } }] : []),
        ],
      },
      select: { color: true, category: true, status: true, dueDate: true, createdAt: true, closedAt: true },
    });

    return {
      areas: areaStats, best, worst,
      sectionAverages: sectionAverages(statAudits),
      compliance: complianceCounts(planned, today),
      missed,
      findings: {
        total: findings.length, withoutAction: findings.filter((f) => !f.actionId).length, openActions, overdueActions,
      },
      tags: tagStats(tags, today),
    };
  }
}
