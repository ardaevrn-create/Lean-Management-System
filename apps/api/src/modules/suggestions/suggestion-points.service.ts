import { Injectable } from '@nestjs/common';
import { nextTier, tierFor, type LeaderboardEntry, type MyPointsDto } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SuggestionSettingsService } from './suggestion-settings.service';
import type { PointsQuery } from './suggestions.dto';

/** Puan defteri: olay başına idempotent puan verme, kişisel puan ve puan tablosu. */
@Injectable()
export class SuggestionPointsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly settings: SuggestionSettingsService,
  ) {}

  /** Aynı (kullanıcı, kaynak, neden) için ikinci kez puan yazılmaz. Yeni yazılan kayıt sayısını döndürür. */
  async award(userIds: string[], reason: string, points: number, sourceType: 'SUGGESTION' | 'KAIZEN', sourceId: string): Promise<number> {
    if (points <= 0 || !userIds.length) return 0;
    const tenantId = this.ctx.tenantId;
    const res = await this.prisma.db.pointsLedger.createMany({
      data: [...new Set(userIds)].map((userId) => ({ tenantId, userId, points, reason, sourceType, sourceId })),
      skipDuplicates: true,
    });
    return res.count;
  }

  async total(userId: string): Promise<number> {
    const agg = await this.prisma.db.pointsLedger.aggregate({ where: { userId }, _sum: { points: true } });
    return agg._sum.points ?? 0;
  }

  async me(): Promise<MyPointsDto> {
    const userId = this.ctx.userId;
    const [s, history, submitted, accepted, implemented] = await Promise.all([
      this.settings.load(),
      this.prisma.db.pointsLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.db.suggestion.count({ where: { OR: [{ submittedById: userId }, { members: { some: { userId } } }] } }),
      this.prisma.db.suggestion.count({
        where: { status: { in: ['ACCEPTED', 'IN_IMPLEMENTATION', 'IMPLEMENTED', 'CLOSED'] }, OR: [{ submittedById: userId }, { members: { some: { userId } } }] },
      }),
      this.prisma.db.suggestion.count({
        where: { status: { in: ['IMPLEMENTED', 'CLOSED'] }, OR: [{ submittedById: userId }, { members: { some: { userId } } }] },
      }),
    ]);
    const total = await this.total(userId);
    return {
      total, tier: tierFor(s.rewardTiers, total), next: nextTier(s.rewardTiers, total), submitted, accepted, implemented,
      history: history.map((h) => ({ id: h.id, points: h.points, reason: h.reason, sourceType: h.sourceType, sourceId: h.sourceId, createdAt: h.createdAt.toISOString() })),
    };
  }

  async leaderboard(query: PointsQuery): Promise<LeaderboardEntry[]> {
    const s = await this.settings.load();
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (query.from) createdAt.gte = new Date(query.from);
    if (query.to) createdAt.lte = new Date(query.to);
    const grouped = await this.prisma.db.pointsLedger.groupBy({
      by: ['userId'], where: Object.keys(createdAt).length ? { createdAt } : {}, _sum: { points: true },
      orderBy: { _sum: { points: 'desc' } }, take: query.limit ?? 50,
    });
    if (!grouped.length) return [];
    const ids = grouped.map((g) => g.userId);
    const [users, counts] = await Promise.all([
      this.prisma.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, employee: { select: { orgUnit: { select: { name: true } } } } } }),
      this.prisma.db.suggestion.groupBy({ by: ['submittedById'], where: { submittedById: { in: ids } }, _count: true }),
    ]);
    const byId = new Map(users.map((u) => [u.id, u]));
    const countBy = new Map(counts.map((c) => [c.submittedById, c._count]));
    return grouped.map((g, i) => {
      const points = g._sum.points ?? 0;
      return {
        rank: i + 1, userId: g.userId, fullName: byId.get(g.userId)?.fullName ?? '—', orgUnitName: byId.get(g.userId)?.employee?.orgUnit?.name ?? null,
        points, tier: tierFor(s.rewardTiers, points), suggestions: countBy.get(g.userId) ?? 0,
      };
    });
  }
}
