import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PERMISSIONS, SUGGESTION_PRE_DECISION, type SuggestionRights, type SuggestionStatus } from '@lean/shared';
import { RequestContext } from '../../common/request-context';
import { AccessService } from '../../core/auth/access.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { SuggestionSettingsService } from './suggestion-settings.service';

export interface CommitteeContext {
  /** Komite puanlayabilir (suggestion.manage veya komite üyesi + suggestion.evaluate) */
  eligible: boolean;
  /** Komite kararını kaydedebilir (başkan / yoksa uygun üye) — manage ayrıca kontrol edilir */
  canDecide: boolean;
}

export interface RightsSubject {
  status: SuggestionStatus;
  submittedById: string;
  preEvaluatorId: string | null;
  implementerId: string | null;
  selfImplementable: boolean;
  members: { userId: string }[];
  orgUnit?: { path: string } | null;
}

/** Öneri görünürlüğü ve hakları. */
@Injectable()
export class SuggestionAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly access: AccessService,
    private readonly settings: SuggestionSettingsService,
  ) {}

  async committeeContext(): Promise<CommitteeContext> {
    const me = this.ctx.userId;
    const c = await this.settings.committee();
    const hasEval = this.access.has(PERMISSIONS.SUGGESTION_EVALUATE);
    const manage = this.access.has(PERMISSIONS.SUGGESTION_MANAGE);
    const isMember = c.userIds.includes(me);
    const eligible = manage || (hasEval && (c.teamId === null || isMember));
    const canDecide = c.chairIds.length ? c.chairIds.includes(me) : hasEval && (c.teamId === null || isMember);
    return { eligible, canDecide };
  }

  /** suggestion.manage kapsamındaki öneriler */
  manageWhere(): Prisma.SuggestionWhereInput | null {
    if (!this.access.has(PERMISSIONS.SUGGESTION_MANAGE)) return null;
    const paths = this.access.scopePaths(PERMISSIONS.SUGGESTION_MANAGE);
    if (paths === null) return {};
    if (!paths.length) return null;
    return { orgUnit: { OR: paths.map((p) => ({ path: { startsWith: p } })) } };
  }

  mineWhere(userId = this.ctx.userId): Prisma.SuggestionWhereInput {
    return { OR: [{ submittedById: userId }, { members: { some: { userId } } }] };
  }

  /** Değerlendirme kuyruğu (ön değerlendirme + komite) */
  queueWhere(committee: CommitteeContext, stage?: 'PRE' | 'COMMITTEE'): Prisma.SuggestionWhereInput {
    const me = this.ctx.userId;
    const notMine: Prisma.SuggestionWhereInput = { submittedById: { not: me }, members: { none: { userId: me } } };
    const or: Prisma.SuggestionWhereInput[] = [];
    if (!stage || stage === 'PRE') {
      or.push({ preEvaluatorId: me, status: { in: ['SUBMITTED', 'PRE_EVALUATION'] } });
      const manage = this.manageWhere();
      if (manage) or.push({ AND: [manage, { preEvaluatorId: null, status: { in: ['SUBMITTED', 'PRE_EVALUATION'] } }] });
    }
    if ((!stage || stage === 'COMMITTEE') && committee.eligible) or.push({ status: { in: ['COMMITTEE', 'ON_HOLD'] } });
    return { AND: [notMine, { OR: or.length ? or : [{ id: '__none__' }] }] };
  }

  /** Bir önerinin görülebilir olması: kendi / ortak / ön değerlendirici / uygulayıcı / komite / yönetici */
  async visibleWhere(): Promise<Prisma.SuggestionWhereInput> {
    const me = this.ctx.userId;
    const committee = await this.committeeContext();
    const or: Prisma.SuggestionWhereInput[] = [
      this.mineWhere(), { preEvaluatorId: me }, { implementerId: me },
    ];
    if (committee.eligible) or.push({ status: { in: ['COMMITTEE', 'ON_HOLD', 'ACCEPTED', 'REJECTED', 'IN_IMPLEMENTATION', 'IMPLEMENTED', 'CLOSED'] } });
    const manage = this.manageWhere();
    if (manage) or.push(manage);
    if (manage && Object.keys(manage).length === 0) return {};
    return { OR: or };
  }

  /** Bir öneri üzerindeki kullanıcı hakları. */
  rights(row: RightsSubject, committee: CommitteeContext): SuggestionRights {
    const me = this.ctx.userId;
    const path = row.orgUnit?.path ?? null;
    const manage = this.access.has(PERMISSIONS.SUGGESTION_MANAGE) && this.access.inScope(PERMISSIONS.SUGGESTION_MANAGE, path);
    const isSubmitter = row.submittedById === me;
    const isOwner = isSubmitter || row.members.some((m) => m.userId === me);
    const isPre = row.preEvaluatorId === me;
    const isImplementer = row.implementerId === me;
    const preStage = row.status === 'SUBMITTED' || row.status === 'PRE_EVALUATION';
    const committeeStage = row.status === 'COMMITTEE' || row.status === 'ON_HOLD';
    const decider = manage || committee.canDecide;
    const live = ['ACCEPTED', 'IN_IMPLEMENTATION', 'IMPLEMENTED', 'CLOSED'].includes(row.status);
    return {
      edit: isSubmitter && preStage,
      withdraw: isSubmitter && SUGGESTION_PRE_DECISION.includes(row.status),
      preEvaluate: preStage && !isOwner && (isPre || manage),
      committeeScore: committeeStage && !isOwner && committee.eligible,
      decide: committeeStage && !isOwner && decider,
      manage: manage || isPre || (live && committee.canDecide),
      implement: ['ACCEPTED', 'IN_IMPLEMENTATION'].includes(row.status) && (isImplementer || manage || isPre || committee.canDecide),
      createKaizen: live && (isOwner || isImplementer || manage || isPre || committee.canDecide),
    };
  }

  /** suggestion.manage izni olan kullanıcıların kimlikleri (bildirimler için) */
  async manageUserIds(): Promise<string[]> {
    const rows = await this.prisma.db.userRole.findMany({
      where: { role: { permissions: { has: PERMISSIONS.SUGGESTION_MANAGE } }, user: { isActive: true } },
      select: { userId: true },
    });
    return [...new Set(rows.map((r) => r.userId))];
  }
}
