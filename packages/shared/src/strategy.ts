// Stratejik Planlama (M2) + Hoshin Kanri (M3) sözleşmeleri ve saf iş kuralları (api + web ortak).
import type { ActionListItem, ISODate, OrgUnitRef, UserRef } from './contracts';
import { computeKpiStatus, aggregateValues } from './kpi-rules';
import type { KpiAggregation, KpiApprovalStatus, KpiDirection } from './kpi';
import { parsePeriod, periodEnd, periodStart } from './kpi-periods';

/* ------------------------------ Enum'lar ------------------------------ */

export const STRATEGY_PLAN_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type StrategyPlanStatus = (typeof STRATEGY_PLAN_STATUSES)[number];

export const SWOT_TYPES = ['STRENGTH', 'WEAKNESS', 'OPPORTUNITY', 'THREAT'] as const;
export type SwotType = (typeof SWOT_TYPES)[number];

export const STRATEGY_PERSPECTIVES = ['FINANCIAL', 'CUSTOMER', 'INTERNAL_PROCESS', 'LEARNING_GROWTH'] as const;
export type StrategyPerspective = (typeof STRATEGY_PERSPECTIVES)[number];

export const HOSHIN_LEVELS = ['BREAKTHROUGH', 'ANNUAL', 'PRIORITY', 'DEPARTMENT', 'INDIVIDUAL'] as const;
export type HoshinLevel = (typeof HOSHIN_LEVELS)[number];

export const HOSHIN_DIRECTIONS = ['HIGHER_BETTER', 'LOWER_BETTER'] as const;
export type HoshinDirection = (typeof HOSHIN_DIRECTIONS)[number];

export const HOSHIN_STATUSES = ['DRAFT', 'PROPOSED', 'IN_CATCHBALL', 'AGREED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type HoshinStatus = (typeof HOSHIN_STATUSES)[number];

export const CATCHBALL_TYPES = ['PROPOSAL', 'COMMENT', 'COUNTER_PROPOSAL', 'AGREEMENT', 'REJECTION'] as const;
export type CatchballType = (typeof CATCHBALL_TYPES)[number];

export const CATCHBALL_SIDES = ['PARENT', 'CHILD'] as const;
export type CatchballSide = (typeof CATCHBALL_SIDES)[number];

export const CORRELATION_TARGET_TYPES = ['GOAL', 'KPI', 'USER'] as const;
export type CorrelationTargetType = (typeof CORRELATION_TARGET_TYPES)[number];

export const CORRELATION_STRENGTHS = ['STRONG', 'MEDIUM', 'WEAK'] as const;
export type CorrelationStrength = (typeof CORRELATION_STRENGTHS)[number];

export const CORRELATION_ROLES = ['RESPONSIBLE', 'SUPPORT'] as const;
export type CorrelationRole = (typeof CORRELATION_ROLES)[number];

export const BOWLING_STATUSES = ['GREEN', 'YELLOW', 'RED', 'NO_DATA'] as const;
export type BowlingStatus = (typeof BOWLING_STATUSES)[number];

/** Aylık planı olmayan / KPI toleransı bulunmayan hedeflerde varsayılan sarı tolerans (%) */
export const DEFAULT_TOLERANCE_PCT = 5;
export const MAX_ACHIEVEMENT = 150;

/** Hata kodları (422) */
export const HOSHIN_ERROR_CODES = [
  'INVALID_PARENT_LEVEL', 'PARENT_REQUIRED', 'CODE_TAKEN', 'INVALID_YEAR', 'PLAN_NOT_DRAFT', 'KPI_LINKED', 'KPI_NOT_FOUND',
  'CATCHBALL_NOT_ALLOWED', 'CATCHBALL_CLOSED', 'CATCHBALL_NOT_STARTED', 'CATCHBALL_NO_PARENT', 'CATCHBALL_NO_OWNER',
  'INVALID_CORRELATION', 'INVALID_PERIOD', 'NOT_ACTIVATABLE', 'MESSAGE_REQUIRED',
] as const;

/* ------------------------------ Seviye / ağaç kuralları ------------------------------ */

/** Bir seviyenin üstünde bulunabilecek seviyeler. */
export function allowedParentLevels(level: HoshinLevel): HoshinLevel[] {
  switch (level) {
    case 'BREAKTHROUGH': return [];
    case 'ANNUAL': return ['BREAKTHROUGH'];
    case 'PRIORITY': return ['ANNUAL'];
    case 'DEPARTMENT': return ['PRIORITY', 'ANNUAL'];
    case 'INDIVIDUAL': return ['DEPARTMENT'];
  }
}

/** Üst hedefin altına eklenebilecek seviyeler (ilk eleman varsayılan). */
export function childLevelOptions(parentLevel: HoshinLevel | null): HoshinLevel[] {
  if (parentLevel === null) return ['BREAKTHROUGH', 'ANNUAL'];
  return HOSHIN_LEVELS.filter((l) => allowedParentLevels(l).includes(parentLevel)).sort((a, b) => {
    // varsayılan: hemen alttaki seviye
    return Math.abs(HOSHIN_LEVELS.indexOf(a) - HOSHIN_LEVELS.indexOf(parentLevel)) - Math.abs(HOSHIN_LEVELS.indexOf(b) - HOSHIN_LEVELS.indexOf(parentLevel));
  });
}

export type ParentCheck = { ok: true } | { ok: false; code: 'INVALID_PARENT_LEVEL' | 'PARENT_REQUIRED'; message: string };

/**
 * Seviye / üst hedef uyumu. BREAKTHROUGH üst hedefsiz olmalı; ANNUAL üst hedefsiz olabilir (atılım hedefine bağlı değilse);
 * PRIORITY, DEPARTMENT ve INDIVIDUAL için üst hedef zorunludur.
 */
export function validateGoalParent(level: HoshinLevel, parentLevel: HoshinLevel | null): ParentCheck {
  const allowed = allowedParentLevels(level);
  if (parentLevel === null) {
    if (level === 'BREAKTHROUGH' || level === 'ANNUAL') return { ok: true };
    return { ok: false, code: 'PARENT_REQUIRED', message: `${level} goals require a parent goal` };
  }
  if (!allowed.includes(parentLevel)) {
    return { ok: false, code: 'INVALID_PARENT_LEVEL', message: `A ${level} goal cannot be placed under a ${parentLevel} goal` };
  }
  return { ok: true };
}

const CODE_PREFIX: Record<HoshinLevel, string> = { BREAKTHROUGH: 'AH', ANNUAL: 'YH', PRIORITY: 'OP', DEPARTMENT: 'BH', INDIVIDUAL: 'KH' };

/** Plan içinde benzersiz bir sonraki otomatik kod: AH1, YH2, OP3, BH4, KH5... */
export function nextGoalCode(level: HoshinLevel, existingCodes: string[]): string {
  const prefix = CODE_PREFIX[level];
  let max = 0;
  for (const c of existingCodes) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

/** Plan yılı aralığında mı? */
export const isYearInPlan = (year: number, plan: { startYear: number; endYear: number }) => year >= plan.startYear && year <= plan.endYear;

/* ------------------------------ İlerleme / başarım ------------------------------ */

export interface AchievementInput {
  baseline: number | null | undefined;
  target: number | null | undefined;
  actual: number | null | undefined;
  direction: HoshinDirection;
}

const clampAchievement = (v: number) => Math.min(MAX_ACHIEVEMENT, Math.max(0, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Hedef gerçekleşme % = HIGHER_BETTER: (gerçekleşen − başlangıç) / (hedef − başlangıç);
 * LOWER_BETTER: (başlangıç − gerçekleşen) / (başlangıç − hedef). 0..150 aralığına sıkıştırılır.
 * Başlangıç yoksa 0 (HIGHER) kabul edilir; LOWER_BETTER'da başlangıç yoksa hedef/gerçekleşen oranı kullanılır.
 * Hedef ile başlangıç eşitse: hedef tutuyorsa 100, tutmuyorsa 0. Hedef veya gerçekleşen yoksa null.
 */
export function computeGoalAchievement(i: AchievementInput): number | null {
  const { baseline, target, actual, direction } = i;
  if (target === null || target === undefined || actual === null || actual === undefined) return null;
  if (!Number.isFinite(target) || !Number.isFinite(actual)) return null;
  const hasBaseline = baseline !== null && baseline !== undefined && Number.isFinite(baseline);
  if (direction === 'HIGHER_BETTER') {
    const base = hasBaseline ? (baseline as number) : 0;
    const den = target - base;
    if (Math.abs(den) < 1e-9) return actual >= target ? 100 : 0;
    return r1(clampAchievement(((actual - base) / den) * 100));
  }
  if (!hasBaseline) {
    if (actual <= 0) return target <= 0 ? 100 : MAX_ACHIEVEMENT;
    return r1(clampAchievement((target / actual) * 100));
  }
  const den = (baseline as number) - target;
  if (Math.abs(den) < 1e-9) return actual <= target ? 100 : 0;
  return r1(clampAchievement((((baseline as number) - actual) / den) * 100));
}

export interface PaceInput extends AchievementInput {
  aggregation: KpiAggregation;
  /** Veri bulunan ay sayısı (en son gerçekleşme ayı) */
  monthsElapsed: number;
  /** Gerçekleşmesi olan aylar için kümülatif plan */
  ytdPlan?: number | null;
  /** Uzun vadeli (atılım) hedefte hız ayarı yapılmaz */
  prorate?: boolean;
}

/**
 * Kümülatif (SUM) hedeflerde yıllık hedef/başlangıç, geçen aya göre orantılanır (hedef = YTD plan, yoksa yıllık*ay/12);
 * böylece "yıl ortasında toplam" doğru karşılaştırılır. Diğer toplulaştırmalarda doğrudan computeGoalAchievement.
 */
export function computePaceAchievement(i: PaceInput): number | null {
  if (i.aggregation !== 'SUM' || i.prorate === false) return computeGoalAchievement(i);
  const m = Math.min(12, Math.max(0, i.monthsElapsed));
  if (m === 0) return null;
  const target = i.ytdPlan !== null && i.ytdPlan !== undefined ? i.ytdPlan : i.target !== null && i.target !== undefined ? (i.target * m) / 12 : null;
  const baseline = i.baseline !== null && i.baseline !== undefined ? (i.baseline * m) / 12 : i.baseline;
  return computeGoalAchievement({ baseline, target, actual: i.actual, direction: i.direction });
}

/** Üst hedefin alt hedeflerden ağırlıklı ortalaması; ölçümü olmayan (null) alt hedefler dışarıda kalır. */
export function rollUpAchievement(children: { achievement: number | null; weight: number }[]): number | null {
  let sum = 0;
  let w = 0;
  for (const c of children) {
    if (c.achievement === null || c.achievement === undefined) continue;
    const weight = Number.isFinite(c.weight) && c.weight > 0 ? c.weight : 0;
    sum += c.achievement * weight;
    w += weight;
  }
  return w > 0 ? r1(sum / w) : null;
}

/** Gerçekleşme %'sinden renk: >=100 yeşil, >= 100 - tolerans sarı, altı kırmızı. */
export function statusFromAchievement(achievement: number | null | undefined, tolerancePct = DEFAULT_TOLERANCE_PCT): BowlingStatus {
  if (achievement === null || achievement === undefined) return 'NO_DATA';
  if (achievement >= 100) return 'GREEN';
  return achievement >= 100 - tolerancePct ? 'YELLOW' : 'RED';
}

/** Ortak KPI durum kuralı ile bowling hücresi rengi. */
export function bowlingStatus(i: {
  plan: number | null | undefined;
  actual: number | null | undefined;
  direction: KpiDirection;
  tolerancePct?: number;
  planMax?: number | null;
}): BowlingStatus {
  const s = computeKpiStatus({
    value: i.actual, target: i.plan, targetMax: i.planMax ?? null, direction: i.direction, tolerancePct: i.tolerancePct ?? DEFAULT_TOLERANCE_PCT,
  });
  return s === 'NO_TARGET' ? 'NO_DATA' : s;
}

const STATUS_RANK: Record<BowlingStatus, number> = { RED: 3, YELLOW: 2, GREEN: 1, NO_DATA: 0 };
export function worstStatus(statuses: BowlingStatus[]): BowlingStatus {
  return statuses.reduce<BowlingStatus>((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w), 'NO_DATA');
}

/** Dönem anahtarının hangi aya düştüğü (yıl dışındaysa 1 veya 12'ye sıkıştırılır); geçersizse null. */
export function monthOfPeriod(period: string, year: number): number | null {
  if (!parsePeriod(period)) return null;
  const end = periodEnd(period);
  const start = periodStart(period);
  if (end.getUTCFullYear() < year) return null;
  if (start.getUTCFullYear() > year) return null;
  if (end.getUTCFullYear() > year) return 12;
  return end.getUTCMonth() + 1;
}

export const monthPeriod = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

/** Aylık hücrelerden YTD (gerçekleşmesi olan aylar). */
export function ytdOf(
  cells: { plan: number | null; actual: number | null }[],
  aggregation: KpiAggregation,
): { plan: number | null; actual: number | null; months: number } {
  const withActual = cells.filter((c) => c.actual !== null);
  const actual = aggregateValues(withActual.map((c) => c.actual as number), aggregation);
  const plans = withActual.filter((c) => c.plan !== null).map((c) => c.plan as number);
  return { plan: plans.length ? aggregateValues(plans, aggregation) : null, actual, months: withActual.length };
}

/* ------------------------------ Catchball durum makinesi ------------------------------ */

export interface CatchballEntryLite {
  type: CatchballType;
  side: CatchballSide;
  proposedTarget: number | null;
}

export type CatchballResult =
  | { ok: true; status: HoshinStatus; agreed: boolean; agreedTarget: number | null }
  | { ok: false; code: 'CATCHBALL_NOT_ALLOWED' | 'CATCHBALL_CLOSED' | 'CATCHBALL_NOT_STARTED' | 'MESSAGE_REQUIRED'; message: string };

const isOffer = (e: CatchballEntryLite) => e.type === 'PROPOSAL' || e.type === 'COUNTER_PROPOSAL';

/**
 * Catchball akışı. Taraflar: PARENT (üst hedef sahibi / yönetici) ve CHILD (atanan sahip).
 *  DRAFT --PROPOSAL(PARENT)--> PROPOSED --COUNTER_PROPOSAL--> IN_CATCHBALL --(karşı taraf AGREEMENT)--> AGREED
 *  AGREEMENT yalnız en son öneri/karşı önerinin diğer taraftan gelmesi halinde geçerlidir; hedef o önerideki değere güncellenir.
 *  REJECTION: hedef DRAFT'a döner. COMMENT durumu değiştirmez. AGREED sonrası giriş kabul edilmez (ACTIVATE bekler).
 */
export function catchballTransition(
  status: HoshinStatus,
  history: CatchballEntryLite[],
  next: { type: CatchballType; side: CatchballSide; message?: string | null; proposedTarget?: number | null },
): CatchballResult {
  const fail = (code: Extract<CatchballResult, { ok: false }>['code'], message: string): CatchballResult => ({ ok: false, code, message });
  if (status !== 'DRAFT' && status !== 'PROPOSED' && status !== 'IN_CATCHBALL') return fail('CATCHBALL_CLOSED', 'Catchball is closed for this goal');
  if (status === 'DRAFT' && next.type !== 'PROPOSAL') return fail('CATCHBALL_NOT_STARTED', 'Catchball has not started; a proposal is required first');
  const hasMessage = !!next.message && next.message.trim().length > 0;
  const latestOffer = [...history].reverse().find(isOffer);

  switch (next.type) {
    case 'PROPOSAL':
      if (next.side !== 'PARENT') return fail('CATCHBALL_NOT_ALLOWED', 'Only the parent side can propose');
      return { ok: true, status: status === 'DRAFT' ? 'PROPOSED' : status, agreed: false, agreedTarget: null };
    case 'COMMENT':
      if (!hasMessage) return fail('MESSAGE_REQUIRED', 'A message is required');
      return { ok: true, status, agreed: false, agreedTarget: null };
    case 'COUNTER_PROPOSAL':
      if (latestOffer && latestOffer.side === next.side) return fail('CATCHBALL_NOT_ALLOWED', 'You cannot counter your own latest proposal');
      return { ok: true, status: 'IN_CATCHBALL', agreed: false, agreedTarget: null };
    case 'AGREEMENT':
      if (!latestOffer || latestOffer.side === next.side) return fail('CATCHBALL_NOT_ALLOWED', 'Agreement must answer the other side\'s latest proposal');
      return {
        ok: true, status: 'AGREED', agreed: true,
        // Hedefi belirtmeyen öneri/karşı öneri bir önceki hedefi taşır
        agreedTarget: [...history].reverse().find((e) => isOffer(e) && e.proposedTarget !== null)?.proposedTarget ?? null,
      };
    case 'REJECTION':
      if (!hasMessage) return fail('MESSAGE_REQUIRED', 'A reason is required');
      return { ok: true, status: 'DRAFT', agreed: false, agreedTarget: null };
  }
}

/* ------------------------------ X-Matrix ------------------------------ */

/**
 * Korelasyon uyumu (kaynak hedef seviyesi → hedef tipi):
 *  ANNUAL → GOAL(BREAKTHROUGH); PRIORITY → GOAL(ANNUAL) | KPI | USER; BREAKTHROUGH → KPI.
 */
export function isValidCorrelation(fromLevel: HoshinLevel, targetType: CorrelationTargetType, targetLevel?: HoshinLevel | null): boolean {
  if (targetType === 'GOAL') {
    return (fromLevel === 'ANNUAL' && targetLevel === 'BREAKTHROUGH') || (fromLevel === 'PRIORITY' && targetLevel === 'ANNUAL');
  }
  if (targetType === 'KPI') return fromLevel === 'PRIORITY' || fromLevel === 'BREAKTHROUGH';
  return fromLevel === 'PRIORITY';
}

/* ------------------------------ Yanıt sözleşmeleri ------------------------------ */

export interface StrategyPlanBrief {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  status: StrategyPlanStatus;
  version: number;
}

export interface SwotItemDto {
  id: string;
  planId: string;
  type: SwotType;
  text: string;
  impact: number;
  sortOrder: number;
}

export interface StrategicObjectiveDto {
  id: string;
  planId: string;
  code: string;
  title: string;
  description: string | null;
  perspective: StrategyPerspective | null;
  owner: UserRef | null;
  sortOrder: number;
  goalCount: number;
}

export interface StrategyPlanDetail extends StrategyPlanBrief {
  vision: string | null;
  mission: string | null;
  values: string[];
  previousVersionId: string | null;
  approvedBy: UserRef | null;
  approvedAt: ISODate | null;
  createdAt: ISODate;
  swot: SwotItemDto[];
  objectives: StrategicObjectiveDto[];
  goalCount: number;
  can: { manage: boolean };
}

export interface HoshinGoalBrief {
  id: string;
  planId: string;
  parentId: string | null;
  level: HoshinLevel;
  code: string;
  title: string;
  year: number | null;
  status: HoshinStatus;
  owner: UserRef | null;
  orgUnit: OrgUnitRef | null;
  unit: string;
  direction: HoshinDirection;
}

export interface BowlingCell {
  month: number;
  /** Hücrenin kaynağı olan dönem anahtarı (ör. 2026-05, 2026-Q1); yoksa null */
  period: string | null;
  plan: number | null;
  actual: number | null;
  status: BowlingStatus;
  comment: string | null;
}

export type GoalSource = 'KPI' | 'MANUAL' | 'ROLLUP' | 'NONE';

export interface BowlingYtd {
  plan: number | null;
  actual: number | null;
  status: BowlingStatus;
  months: number;
}

export interface GoalProgress {
  source: GoalSource;
  /** KPI bağlantısı veya elle aylık veri var mı */
  measured: boolean;
  /** Hedef gerçekleşme % (0..150) */
  achievement: number | null;
  status: BowlingStatus;
  ytd: BowlingYtd;
  /** Gerçekleşmesi olan en son ay (YYYY-MM) */
  lastMonth: string | null;
}

export interface HoshinKpiRef {
  id: string;
  code: string;
  name: string;
  unit: string;
  frequency: string;
}

export interface HoshinGoalRow extends HoshinGoalBrief {
  description: string | null;
  objective: { id: string; code: string; title: string } | null;
  kpi: HoshinKpiRef | null;
  baseline: number | null;
  targetValue: number | null;
  weight: number;
  aggregation: KpiAggregation;
  startDate: ISODate | null;
  endDate: ISODate | null;
  agreedAt: ISODate | null;
  progress: GoalProgress;
  childCount: number;
  can: { edit: boolean; addChild: boolean };
}

export interface HoshinTreeNode extends HoshinGoalRow {
  children: HoshinTreeNode[];
}

export interface HoshinTreeResponse {
  plan: StrategyPlanBrief;
  year: number;
  nodes: HoshinTreeNode[];
  can: { manage: boolean };
}

export interface CatchballEntryDto {
  id: string;
  goalId: string;
  type: CatchballType;
  side: CatchballSide;
  message: string;
  proposedTarget: number | null;
  user: UserRef;
  createdAt: ISODate;
}

export interface CatchballListItem {
  goal: HoshinGoalBrief & { targetValue: number | null; parentCode: string | null; parentTitle: string | null };
  mySide: CatchballSide;
  awaitingMe: boolean;
  lastEntry: CatchballEntryDto | null;
}

export interface BowlingRow {
  goal: HoshinGoalBrief;
  kpi: HoshinKpiRef | null;
  source: GoalSource;
  measured: boolean;
  baseline: number | null;
  targetValue: number | null;
  cells: BowlingCell[];
  ytd: BowlingYtd;
  achievement: number | null;
  status: BowlingStatus;
  /** Aylık gerçekleşmeyi elle girebilir mi (sahip / yönetici, KPI bağlı değilse) */
  canEditActuals: boolean;
  canEditPlan: boolean;
}

export interface BowlingResponse {
  plan: StrategyPlanBrief;
  year: number;
  rows: BowlingRow[];
}

export interface KpiDeviationRef {
  id: string;
  kpiId: string;
  period: string;
  explanation: string;
  rootCause: string | null;
  approvalStatus: KpiApprovalStatus;
}

/** Hedef altı ay: açıklama + karşı önlem aksiyonları */
export interface OffTargetDetail {
  goalId: string;
  year: number;
  month: number;
  period: string;
  source: GoalSource;
  status: BowlingStatus;
  plan: number | null;
  actual: number | null;
  comment: string | null;
  kpi: HoshinKpiRef | null;
  kpiDeviation: KpiDeviationRef | null;
  actions: ActionListItem[];
  canEdit: boolean;
}

export interface HoshinGoalDetail extends HoshinGoalRow {
  breadcrumb: { id: string; code: string; title: string; level: HoshinLevel }[];
  bowling: BowlingRow;
  children: (HoshinGoalRow)[];
  catchball: CatchballEntryDto[];
  actions: ActionListItem[];
  parent: (HoshinGoalBrief & { owner: UserRef | null }) | null;
  catchballState: { mySide: CatchballSide | null; awaitingMe: boolean; canPropose: boolean; canRespond: boolean; canActivate: boolean };
  can: HoshinGoalRow['can'] & { editActuals: boolean; editPlan: boolean; changeStatus: boolean };
}

export interface XMatrixItem {
  id: string;
  code: string;
  title: string;
  owner: UserRef | null;
  status: HoshinStatus;
}
export interface XMatrixKpi { id: string; code: string; name: string; unit: string }
export interface XMatrixCorrelation {
  fromGoalId: string;
  targetType: CorrelationTargetType;
  targetId: string;
  strength: CorrelationStrength;
  role: CorrelationRole | null;
}
export interface XMatrixResponse {
  plan: StrategyPlanBrief;
  year: number;
  /** Güney: atılım hedefleri */
  breakthroughs: XMatrixItem[];
  /** Batı: yıllık hedefler */
  annuals: XMatrixItem[];
  /** Kuzey: öncelikli iyileştirmeler */
  priorities: XMatrixItem[];
  /** Doğu: ölçümler (KPI) */
  kpis: XMatrixKpi[];
  /** Uzak doğu: sorumlular / kaynaklar */
  owners: UserRef[];
  correlations: XMatrixCorrelation[];
  can: { edit: boolean };
}

export interface DrilldownItem extends HoshinGoalBrief {
  progress: GoalProgress;
  childCount: number;
  targetValue: number | null;
  baseline: number | null;
}
export interface DrilldownOrgUnit {
  orgUnit: OrgUnitRef;
  goalCount: number;
  achievement: number | null;
  green: number;
  yellow: number;
  red: number;
  noData: number;
}
export interface DrilldownResponse {
  plan: StrategyPlanBrief;
  year: number;
  parent: HoshinGoalBrief | null;
  items: DrilldownItem[];
  orgUnits: DrilldownOrgUnit[];
}

export interface ReviewRow {
  goal: HoshinGoalBrief;
  parentCode: string | null;
  kpi: HoshinKpiRef | null;
  baseline: number | null;
  targetValue: number | null;
  ytdActual: number | null;
  ytdPlan: number | null;
  achievement: number | null;
  status: BowlingStatus;
  openActions: number;
  overdueActions: number;
  agreedAt: ISODate | null;
}
export interface ReviewResponse {
  plan: StrategyPlanBrief;
  year: number;
  generatedAt: ISODate;
  summary: { goals: number; green: number; yellow: number; red: number; noData: number; averageAchievement: number | null; openActions: number; overdueActions: number };
  rows: ReviewRow[];
}

/** Ana sayfa kartı: dashboard widgets.hoshin */
export interface HoshinDashboardWidget {
  myGoals: number;
  redGoals: number;
  catchballPending: number;
}
