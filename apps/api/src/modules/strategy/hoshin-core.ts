import { Prisma } from '@prisma/client';
import type { HoshinGoalBrief, HoshinKpiRef, UserRef } from '@lean/shared';

export const userSel = { select: { id: true, fullName: true, username: true } } as const;

export const goalInclude = {
  owner: userSel,
  orgUnit: { select: { id: true, name: true, code: true, path: true } },
  kpi: {
    select: {
      id: true, code: true, name: true, unit: true, frequency: true, aggregation: true, direction: true, warningTolerancePct: true, decimals: true,
      orgUnit: { select: { path: true } },
    },
  },
  objective: { select: { id: true, code: true, title: true } },
} satisfies Prisma.HoshinGoalInclude;

export type GoalRow = Prisma.HoshinGoalGetPayload<{ include: typeof goalInclude }>;

export const num = (d: Prisma.Decimal | null | undefined): number | null => (d === null || d === undefined ? null : Number(d));
export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function toUserRef(u: { id: string; fullName: string; username: string } | null | undefined): UserRef | null {
  return u ? { id: u.id, fullName: u.fullName, username: u.username } : null;
}

export function toKpiRef(k: GoalRow['kpi']): HoshinKpiRef | null {
  return k ? { id: k.id, code: k.code, name: k.name, unit: k.unit, frequency: k.frequency } : null;
}

export function toGoalBrief(g: GoalRow): HoshinGoalBrief {
  return {
    id: g.id, planId: g.planId, parentId: g.parentId, level: g.level, code: g.code, title: g.title, year: g.year, status: g.status,
    owner: toUserRef(g.owner), orgUnit: g.orgUnit ? { id: g.orgUnit.id, name: g.orgUnit.name, code: g.orgUnit.code } : null,
    unit: g.unit, direction: g.direction,
  };
}

export const OPEN_ACTION_STATUSES = ['OPEN', 'IN_PROGRESS'];
export const manualLabel = (g: Pick<GoalRow, 'code' | 'title'>, period: string) => `${g.code} ${g.title} – ${period}`;
