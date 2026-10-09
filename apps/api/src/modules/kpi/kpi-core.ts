import { Prisma } from '@prisma/client';
import {
  currentPeriod, isValidPeriod, periodDueDate, recentPeriods,
  type KpiBrief, type KpiDeviationSummary, type KpiEntryState, type KpiStatus, type KpiValueSource, type UserRef,
} from '@lean/shared';

export const userRef = { select: { id: true, fullName: true, username: true } } as const;

export const kpiInclude = {
  orgUnit: { select: { id: true, name: true, code: true, path: true, managerEmployeeId: true } },
  owner: { select: { id: true, fullName: true, username: true, employee: { select: { managerId: true } } } },
  dataEntryUser: userRef,
} satisfies Prisma.KpiDefinitionInclude;

export type KpiRow = Prisma.KpiDefinitionGetPayload<{ include: typeof kpiInclude }>;

/** Bir dönemin hesaplanmış görünümü (hedef + değer + sapma + giriş durumu). */
export interface PeriodCell {
  kpiId: string;
  period: string;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  target: number | null;
  targetMax: number | null;
  valueId: string | null;
  value: number | null;
  status: KpiStatus | null;
  source: KpiValueSource | null;
  note: string | null;
  isLate: boolean;
  enteredAt: Date | null;
  enteredBy: UserRef | null;
  deviation: KpiDeviationSummary | null;
  actionCount: number;
  entryState: KpiEntryState;
}

export const num = (d: Prisma.Decimal | null | undefined): number | null => (d === null || d === undefined ? null : Number(d));
export const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

export const isCalculated = (k: { formula: string | null }) => !!k.formula;

export function toUserRef(u: { id: string; fullName: string; username: string }): UserRef {
  return { id: u.id, fullName: u.fullName, username: u.username };
}

export function toBrief(k: KpiRow): KpiBrief {
  return {
    id: k.id,
    code: k.code,
    name: k.name,
    unit: k.unit,
    decimals: k.decimals,
    category: k.category,
    direction: k.direction,
    frequency: k.frequency,
    aggregation: k.aggregation,
    warningTolerancePct: Number(k.warningTolerancePct),
    entryDueDays: k.entryDueDays,
    orgUnit: { id: k.orgUnit.id, name: k.orgUnit.name, code: k.orgUnit.code },
    owner: toUserRef(k.owner),
    dataEntryUser: k.dataEntryUser ? toUserRef(k.dataEntryUser) : null,
    formula: k.formula,
    isActive: k.isActive,
  };
}

/** Veri girişinden sorumlu kişi: veri giriş kullanıcısı, yoksa KPI sahibi. */
export function responsibleOf(k: KpiRow): UserRef {
  return toUserRef(k.dataEntryUser ?? k.owner);
}

/** Beklenen ilk dönem: startPeriod, yoksa KPI'nın oluşturulduğu dönem. */
export function effectiveStart(k: Pick<KpiRow, 'startPeriod' | 'frequency' | 'createdAt'>): string {
  return k.startPeriod && isValidPeriod(k.startPeriod, k.frequency) ? k.startPeriod : currentPeriod(k.frequency, k.createdAt);
}

export const LOOKBACK_PERIODS = 12;

/**
 * Veri beklenen dönemler: bugünün dönemi dahil son `lookback` tamamlanmış dönem (başlangıçtan önceki dönemler hariç).
 * Eskiden yeniye sıralı.
 */
export function expectedPeriods(k: Pick<KpiRow, 'startPeriod' | 'frequency' | 'createdAt'>, today: Date, lookback = LOOKBACK_PERIODS): string[] {
  const current = currentPeriod(k.frequency, today);
  const start = effectiveStart(k);
  return recentPeriods(current, lookback + 1).filter((p) => p >= start);
}

export function dueDateOf(k: Pick<KpiRow, 'entryDueDays'>, period: string): Date {
  return periodDueDate(period, k.entryDueDays);
}
