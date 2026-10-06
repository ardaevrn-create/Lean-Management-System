import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  catchballTransition,
  type CatchballEntryDto, type CatchballListItem, type CatchballSide, type CatchballType, type HoshinGoalDetail,
} from '@lean/shared';
import { BusinessException } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import type { RequestUser } from '../../common/request-user';
import { AuditService } from '../../core/audit/audit.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { HoshinAccessService } from './hoshin-access.service';
import { goalInclude, num, toGoalBrief, toUserRef, userSel, type GoalRow } from './hoshin-core';

const entryInclude = { user: userSel } as const;

/** M3-05 Catchball: öneri → karşı öneri → mutabakat → aktivasyon. */
@Injectable()
export class HoshinCatchballService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly access: HoshinAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async thread(goalId: string): Promise<CatchballEntryDto[]> {
    const rows = await this.prisma.db.hoshinCatchballEntry.findMany({ where: { goalId }, include: entryInclude, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => this.toDto(r));
  }

  private toDto(r: {
    id: string; goalId: string; type: CatchballType; side: CatchballSide; message: string; proposedTarget: unknown;
    user: { id: string; fullName: string; username: string }; createdAt: Date;
  }): CatchballEntryDto {
    return {
      id: r.id, goalId: r.goalId, type: r.type, side: r.side, message: r.message, proposedTarget: num(r.proposedTarget as never),
      user: toUserRef(r.user)!, createdAt: r.createdAt.toISOString(),
    };
  }

  private async parentOf(g: GoalRow): Promise<GoalRow | null> {
    return g.parentId ? this.prisma.db.hoshinGoal.findUnique({ where: { id: g.parentId }, include: goalInclude }) : null;
  }

  /** Kullanıcının bu hedefteki olası tarafları. */
  private qualifiedSides(g: GoalRow, parent: GoalRow | null, user: RequestUser): CatchballSide[] {
    const sides: CatchballSide[] = [];
    if (parent?.ownerId === user.id || this.access.canManage(g, user)) sides.push('PARENT');
    if (g.ownerId === user.id) sides.push('CHILD');
    return sides;
  }

  /** Detay ekranı için catchball durumu (hedef + üst hedef harita üzerinden). */
  state(g: GoalRow, entries: CatchballEntryDto[], byId: Map<string, GoalRow>, user: RequestUser = this.ctx.user): HoshinGoalDetail['catchballState'] {
    const parent = g.parentId ? byId.get(g.parentId) ?? null : null;
    const sides = this.qualifiedSides(g, parent, user);
    const open = g.status === 'PROPOSED' || g.status === 'IN_CATCHBALL';
    const mySide = sides.length === 1 ? sides[0] : sides.includes('CHILD') && open && entries.at(-1)?.side === 'PARENT' ? 'CHILD' : sides[0] ?? null;
    const last = entries.at(-1);
    const parentSide = sides.includes('PARENT');
    return {
      mySide,
      awaitingMe: open && !!mySide && !!last && last.side !== mySide,
      canPropose: parentSide && !!g.parentId && !!g.ownerId && (g.status === 'DRAFT' || open),
      canRespond: open && sides.length > 0,
      canActivate: (g.status === 'AGREED' || g.status === 'DRAFT') && (parentSide || parent?.ownerId === user.id),
    };
  }

  async addEntry(goalId: string, input: { type: CatchballType; message?: string; proposedTarget?: number | null; side?: CatchballSide }): Promise<CatchballEntryDto[]> {
    const goal = await this.prisma.db.hoshinGoal.findUnique({ where: { id: goalId }, include: goalInclude });
    if (!goal) throw new NotFoundException('Goal not found');
    const parent = await this.parentOf(goal);
    const user = this.ctx.user;
    const qualified = this.qualifiedSides(goal, parent, user);
    if (!qualified.length) throw new ForbiddenException();

    const history = (await this.thread(goalId)).map((e) => ({ type: e.type, side: e.side, proposedTarget: e.proposedTarget }));
    let side: CatchballSide;
    if (input.side) {
      if (!qualified.includes(input.side)) throw new ForbiddenException();
      side = input.side;
    } else if (qualified.length === 1) {
      side = qualified[0];
    } else {
      side = input.type === 'PROPOSAL' ? 'PARENT' : history.at(-1)?.side === 'PARENT' ? 'CHILD' : 'PARENT';
    }

    if (input.type === 'PROPOSAL') {
      if (!goal.parentId) throw new BusinessException('CATCHBALL_NO_PARENT', 'Üst hedefi olmayan hedefte catchball yapılmaz');
      if (!goal.ownerId) throw new BusinessException('CATCHBALL_NO_OWNER', 'Catchball için hedef sahibi atanmalı');
    }
    const proposedTarget = input.type === 'PROPOSAL' ? input.proposedTarget ?? num(goal.targetValue) : input.proposedTarget ?? null;
    const result = catchballTransition(goal.status, history, { type: input.type, side, message: input.message, proposedTarget });
    if (!result.ok) throw new BusinessException(result.code, result.message);

    await this.prisma.db.$transaction(async (tx) => {
      await tx.hoshinCatchballEntry.create({
        data: { tenantId: this.ctx.tenantId, goalId, userId: user.id, side, type: input.type, message: input.message?.trim() ?? '', proposedTarget },
      });
      await tx.hoshinGoal.update({
        where: { id: goalId },
        data: {
          status: result.status,
          ...(result.agreed ? { agreedAt: new Date(), ...(result.agreedTarget !== null ? { targetValue: result.agreedTarget } : {}) } : {}),
        },
      });
    });
    await this.audit.log('hoshinGoal', goalId, `catchball.${input.type.toLowerCase()}`, { side, proposedTarget, status: result.status });

    const recipients = side === 'PARENT' ? [goal.ownerId] : [parent?.ownerId ?? goal.createdById];
    if (result.agreed) recipients.push(goal.ownerId, parent?.ownerId ?? goal.createdById);
    const label = `${goal.code} ${goal.title}`;
    const titles: Record<CatchballType, string> = {
      PROPOSAL: `Hedef önerisi: ${label}`, COMMENT: `Catchball yorumu: ${label}`, COUNTER_PROPOSAL: `Karşı öneri: ${label}`,
      AGREEMENT: result.agreed ? `Hedefte mutabakat sağlandı: ${label}` : `Onay: ${label}`, REJECTION: `Hedef reddedildi: ${label}`,
    };
    await this.notifications.notify({
      userIds: recipients.filter((x): x is string => !!x), type: 'GENERIC', title: titles[input.type],
      body: input.message?.trim() || (proposedTarget !== null ? `Önerilen hedef: ${proposedTarget}` : undefined), link: `/hoshin/goals/${goalId}`,
    });
    return this.thread(goalId);
  }

  /** Mutabık kalınan (AGREED) hedefi ya da catchball gerektirmeyen taslağı aktif yapar. */
  async activate(goalId: string): Promise<void> {
    const goal = await this.prisma.db.hoshinGoal.findUnique({ where: { id: goalId }, include: goalInclude });
    if (!goal) throw new NotFoundException('Goal not found');
    const parent = await this.parentOf(goal);
    const user = this.ctx.user;
    if (!(parent?.ownerId === user.id || this.access.canManage(goal, user))) throw new ForbiddenException();
    const ok = goal.status === 'AGREED' || (goal.status === 'DRAFT' && (!parent || !goal.ownerId || goal.ownerId === parent.ownerId || this.access.canManage(goal, user)));
    if (!ok) throw new BusinessException('NOT_ACTIVATABLE', 'Hedef aktifleştirilemez: önce catchball mutabakatı sağlanmalı');
    await this.prisma.db.hoshinGoal.update({ where: { id: goalId }, data: { status: 'ACTIVE' } });
    await this.audit.log('hoshinGoal', goalId, 'activate', { from: goal.status });
    await this.notifications.notify({
      userIds: [goal.ownerId].filter((x): x is string => !!x), type: 'GENERIC', title: `Hedef aktifleştirildi: ${goal.code} ${goal.title}`, link: `/hoshin/goals/${goalId}`,
    });
  }

  /** Catchball'a dahil olduğum (sahip / üst hedef sahibi) PROPOSED / IN_CATCHBALL hedefler. */
  async myList(user: RequestUser = this.ctx.user): Promise<CatchballListItem[]> {
    const goals = await this.prisma.db.hoshinGoal.findMany({
      where: { status: { in: ['PROPOSED', 'IN_CATCHBALL'] }, OR: [{ ownerId: user.id }, { parent: { ownerId: user.id } }] },
      include: { ...goalInclude, parent: { select: { code: true, title: true, ownerId: true } }, catchball: { include: entryInclude, orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
    });
    return goals.map((g) => {
      const mySide: CatchballSide = g.ownerId === user.id && g.parent?.ownerId !== user.id ? 'CHILD' : 'PARENT';
      const last = g.catchball[0] ? this.toDto(g.catchball[0]) : null;
      return {
        goal: { ...toGoalBrief(g), targetValue: num(g.targetValue), parentCode: g.parent?.code ?? null, parentTitle: g.parent?.title ?? null },
        mySide,
        awaitingMe: !!last && last.side !== mySide,
        lastEntry: last,
      };
    });
  }

  async pendingCount(user: RequestUser): Promise<number> {
    return (await this.myList(user)).filter((i) => i.awaitingMe).length;
  }
}
