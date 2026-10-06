import type { ActionStatus } from '@lean/shared';
import { startOfUtcDay, diffDays } from '../../common/dates';

export type TransitionRight = 'changeStatus' | 'verify' | 'edit';

/** İzin verilen durum geçişleri ve gereken yetki. */
export const TRANSITIONS: Record<ActionStatus, Partial<Record<ActionStatus, TransitionRight>>> = {
  OPEN: { IN_PROGRESS: 'changeStatus', DONE: 'changeStatus', CANCELLED: 'edit' },
  IN_PROGRESS: { DONE: 'changeStatus', OPEN: 'changeStatus', CANCELLED: 'edit' },
  DONE: { VERIFIED: 'verify', IN_PROGRESS: 'verify' },
  VERIFIED: {},
  CANCELLED: { OPEN: 'edit' },
};

export const ACTIVE_STATUSES: ActionStatus[] = ['OPEN', 'IN_PROGRESS'];

export function overdueInfo(status: ActionStatus, dueDate: Date, today = startOfUtcDay()) {
  const isOverdue = ACTIVE_STATUSES.includes(status) && dueDate < today;
  return { isOverdue, overdueDays: isOverdue ? diffDays(today, dueDate) : 0 };
}

export const actionCode = (n: number) => `AKS-${String(n).padStart(5, '0')}`;
