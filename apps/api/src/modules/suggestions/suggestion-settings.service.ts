import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_CRITERIA, DEFAULT_POINT_RULES, DEFAULT_REWARD_TIERS, type EvaluationCriterion, type PointRules, type PreEvaluationMode,
  type RewardTier, type SuggestionSettingsDto,
} from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { AuditService } from '../../core/audit/audit.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { num, parseCriteria, parsePointRules, parseTiers } from './suggestion-rules';
import type { UpdateSettingsDto } from './suggestions.dto';

export interface LoadedSettings {
  criteria: EvaluationCriterion[];
  preEvaluation: PreEvaluationMode;
  committeeTeamId: string | null;
  autoAcceptMinScore: number | null;
  autoAcceptMaxCost: number | null;
  pointRules: PointRules;
  rewardTiers: RewardTier[];
}

/** Şirket başına tek satırlık öneri ayarları (kriterler, puan kuralları, komite). */
@Injectable()
export class SuggestionSettingsService {
  constructor(private readonly prisma: PrismaService, private readonly ctx: RequestContext, private readonly audit: AuditService) {}

  async load(): Promise<LoadedSettings> {
    const row = await this.prisma.db.suggestionSettings.findFirst();
    if (!row) {
      return {
        criteria: DEFAULT_CRITERIA, preEvaluation: 'DIRECT_MANAGER', committeeTeamId: null, autoAcceptMinScore: null, autoAcceptMaxCost: null,
        pointRules: DEFAULT_POINT_RULES, rewardTiers: DEFAULT_REWARD_TIERS,
      };
    }
    return {
      criteria: parseCriteria(row.criteria), preEvaluation: row.preEvaluation, committeeTeamId: row.committeeTeamId,
      autoAcceptMinScore: row.autoAcceptMinScore, autoAcceptMaxCost: num(row.autoAcceptMaxCost),
      pointRules: parsePointRules(row.pointRules), rewardTiers: parseTiers(row.rewardTiers),
    };
  }

  async get(): Promise<SuggestionSettingsDto> {
    const s = await this.load();
    const team = s.committeeTeamId ? await this.prisma.db.team.findUnique({ where: { id: s.committeeTeamId }, select: { name: true } }) : null;
    return { ...s, committeeTeamName: team?.name ?? null };
  }

  async update(dto: UpdateSettingsDto): Promise<SuggestionSettingsDto> {
    const keys = dto.criteria.map((c) => c.key);
    if (new Set(keys).size !== keys.length) throw new BusinessException('DUPLICATE_CRITERION', 'Kriter anahtarları benzersiz olmalıdır');
    if (!dto.criteria.length) throw new BusinessException('CRITERIA_REQUIRED', 'En az bir kriter gerekli');
    if (dto.committeeTeamId) {
      const team = await this.prisma.db.team.findUnique({ where: { id: dto.committeeTeamId } });
      if (!team || team.type !== 'COMMITTEE') throw new BusinessException('INVALID_TEAM', 'Komite için "Komite" türünde bir ekip seçin');
    }
    const data = {
      criteria: dto.criteria as unknown as Prisma.InputJsonValue,
      preEvaluation: dto.preEvaluation,
      committeeTeamId: dto.committeeTeamId ?? null,
      autoAcceptMinScore: dto.autoAcceptMinScore ?? null,
      autoAcceptMaxCost: dto.autoAcceptMaxCost ?? null,
      pointRules: dto.pointRules as unknown as Prisma.InputJsonValue,
      rewardTiers: [...dto.rewardTiers].sort((a, b) => a.minPoints - b.minPoints) as unknown as Prisma.InputJsonValue,
    };
    await this.prisma.db.suggestionSettings.upsert({
      where: { tenantId: this.ctx.tenantId },
      create: { tenantId: this.ctx.tenantId, ...data },
      update: data,
    });
    await this.audit.log('suggestion-settings', this.ctx.tenantId, 'updated', dto);
    return this.get();
  }

  /** Komite ekibi: üyelerin kullanıcı kimlikleri ve başkan(lar). */
  async committee(): Promise<{ teamId: string | null; userIds: string[]; chairIds: string[] }> {
    const { committeeTeamId } = await this.load();
    if (!committeeTeamId) return { teamId: null, userIds: [], chairIds: [] };
    const members = await this.prisma.db.teamMember.findMany({
      where: { teamId: committeeTeamId },
      select: { role: true, employee: { select: { user: { select: { id: true, isActive: true } } } } },
    });
    const active = members.filter((m) => m.employee.user?.isActive);
    return {
      teamId: committeeTeamId,
      userIds: active.map((m) => m.employee.user!.id),
      chairIds: active.filter((m) => m.role?.toUpperCase() === 'CHAIR').map((m) => m.employee.user!.id),
    };
  }
}
