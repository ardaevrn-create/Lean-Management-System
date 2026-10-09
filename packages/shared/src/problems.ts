// Problem çözme / DÖF modülü sözleşmeleri (M5)
import type { ActionListItem, CreateActionRequest } from './contracts';

export const PROBLEM_SOURCES = [
  'CUSTOMER_COMPLAINT', 'INTERNAL_AUDIT', 'EXTERNAL_AUDIT', 'PROCESS', 'SUPPLIER', 'KPI_DEVIATION',
  'AUDIT_FINDING', 'MEETING', 'SUGGESTION', 'SAFETY', 'OTHER',
] as const;
export type ProblemSource = (typeof PROBLEM_SOURCES)[number];

export const PROBLEM_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type ProblemSeverity = (typeof PROBLEM_SEVERITIES)[number];

export const PROBLEM_METHODS = ['BASIC', 'EIGHT_D', 'A3'] as const;
export type ProblemMethod = (typeof PROBLEM_METHODS)[number];

/** Akış sırası; CANCELLED akış dışıdır. */
export const PROBLEM_PHASES = ['DEFINITION', 'CONTAINMENT', 'ROOT_CAUSE', 'ACTIONS', 'VERIFICATION', 'CLOSED', 'CANCELLED'] as const;
export type ProblemPhase = (typeof PROBLEM_PHASES)[number];
export const PROBLEM_FLOW_PHASES: ProblemPhase[] = ['DEFINITION', 'CONTAINMENT', 'ROOT_CAUSE', 'ACTIONS', 'VERIFICATION', 'CLOSED'];

/** 6M balık kılçığı kategorileri */
export const PROBLEM_CAUSE_CATEGORIES = ['MAN', 'MACHINE', 'METHOD', 'MATERIAL', 'MEASUREMENT', 'ENVIRONMENT'] as const;
export type ProblemCauseCategory = (typeof PROBLEM_CAUSE_CATEGORIES)[number];

export const PROBLEM_ACTION_KINDS = ['CONTAINMENT', 'CORRECTIVE', 'PREVENTIVE', 'HORIZONTAL'] as const;
export type ProblemActionKind = (typeof PROBLEM_ACTION_KINDS)[number];

export const PROBLEM_VERIFICATION_RESULTS = ['EFFECTIVE', 'NOT_EFFECTIVE'] as const;
export type ProblemVerificationResult = (typeof PROBLEM_VERIFICATION_RESULTS)[number];

/** Bir 5 Neden zincirinin tamamlanması için gereken en az "neden" adımı sayısı. */
export const MIN_WHY_STEPS = 3;

/** Faz geçişi engel kodları (422 code) */
export const PROBLEM_GATE_CODES = [
  'DEFINITION_INCOMPLETE', 'CONTAINMENT_REQUIRED', 'FISHBONE_REQUIRED', 'FIVE_WHY_REQUIRED',
  'ROOT_CAUSE_UNADDRESSED', 'ACTIONS_OPEN', 'CORRECTIVE_REQUIRED', 'VERIFICATION_REQUIRED',
] as const;
export type ProblemGateCode = (typeof PROBLEM_GATE_CODES)[number];

type ISODate = string;
interface UserRef { id: string; fullName: string; username: string }
interface OrgUnitRef { id: string; name: string; code: string | null }

export interface ProblemListItem {
  id: string; number: number; code: string; title: string;
  source: ProblemSource; severity: ProblemSeverity; method: ProblemMethod; phase: ProblemPhase;
  orgUnit: OrgUnitRef; owner: UserRef; reportedBy: UserRef;
  targetCloseDate: ISODate | null; closedAt: ISODate | null; createdAt: ISODate;
  overdue: boolean; overdueDays: number;
  openActionCount: number;
}

export interface ProblemMemberItem { userId: string; user: UserRef; role: string | null }

export interface ProblemCauseItem {
  id: string; category: ProblemCauseCategory; text: string; parentId: string | null;
  isCandidate: boolean; sortOrder: number;
}

export interface ProblemWhyStepItem { id?: string; order: number; question: string | null; answer: string }

export interface ProblemWhyChainItem {
  id: string; causeId: string; causeText: string; causeCategory: ProblemCauseCategory;
  rootCause: string | null; confirmed: boolean; steps: ProblemWhyStepItem[];
  complete: boolean; actionCount: number;
}

export interface ProblemActionItem {
  kind: ProblemActionKind; rootCauseChainId: string | null; action: ActionListItem;
}

export interface ProblemVerificationItem {
  id: string; plannedDate: ISODate | null; result: ProblemVerificationResult; note: string | null;
  verifiedBy: UserRef; verifiedAt: ISODate;
}

export interface ProblemHistoryItem {
  id: string; fromPhase: ProblemPhase | null; toPhase: ProblemPhase; user: UserRef; note: string | null; createdAt: ISODate;
}

export interface ProblemGate {
  /** Bir sonraki akış fazı (CLOSED / CANCELLED için null) */
  nextPhase: ProblemPhase | null;
  canAdvance: boolean;
  missing: ProblemGateCode[];
}

export interface ProblemDetail extends Omit<ProblemListItem, 'openActionCount'> {
  description: string | null;
  sourceId: string | null; sourceLabel: string | null;
  what: string | null; whereText: string | null; occurredAt: ISODate | null; who: string | null; how: string | null;
  howMuch: string | null; isNot: string | null;
  customerName: string | null; customerRef: string | null; costImpact: number | null;
  containment: string | null; containmentNotNeeded: boolean; containmentSkipReason: string | null;
  verificationDate: ISODate | null; cancelReason: string | null;
  members: ProblemMemberItem[];
  causes: ProblemCauseItem[];
  whyChains: ProblemWhyChainItem[];
  actions: ProblemActionItem[];
  verifications: ProblemVerificationItem[];
  history: ProblemHistoryItem[];
  gate: ProblemGate;
  can: { edit: boolean; advance: boolean; back: boolean; close: boolean; cancel: boolean; manage: boolean };
}

export interface CreateProblemRequest {
  title: string; description?: string; orgUnitId?: string; severity?: ProblemSeverity;
  source?: ProblemSource; sourceId?: string; sourceLabel?: string;
}

export interface UpdateProblemRequest {
  title?: string; description?: string | null; severity?: ProblemSeverity; method?: ProblemMethod; source?: ProblemSource;
  orgUnitId?: string; ownerId?: string;
  what?: string | null; whereText?: string | null; occurredAt?: ISODate | null; who?: string | null; how?: string | null;
  howMuch?: string | null; isNot?: string | null;
  customerName?: string | null; customerRef?: string | null; costImpact?: number | null;
  containment?: string | null; containmentNotNeeded?: boolean; containmentSkipReason?: string | null;
  targetCloseDate?: ISODate | null; verificationDate?: ISODate | null;
}

export interface CauseRequest {
  category?: ProblemCauseCategory; text?: string; parentId?: string | null; isCandidate?: boolean; sortOrder?: number;
}

export interface WhyChainRequest {
  rootCause?: string | null; confirmed?: boolean;
}

export interface CreateProblemActionRequest extends Omit<CreateActionRequest, 'sourceType' | 'sourceId' | 'sourceLabel'> {
  kind: ProblemActionKind; rootCauseChainId?: string;
}

export interface ProblemStats {
  total: number; open: number; overdue: number; awaitingVerification: number;
  avgDaysToClose: number | null;
  byPhase: { phase: ProblemPhase; count: number }[];
  bySeverity: { severity: ProblemSeverity; count: number }[];
  bySource: { source: ProblemSource; count: number }[];
  /** 6M Pareto: yalnızca tamamlanmış 5 Neden zinciri olan aday nedenler */
  pareto: ParetoPoint[];
}
export interface ParetoPoint { category: ProblemCauseCategory; count: number; cumulativePercent: number }

/** 8D / DÖF yazdırılabilir raporu (D1 takım, D2 tanım, D3 acil önlem, D4 kök neden, D5-D6 aksiyonlar, D7 yatay yaygınlaştırma, D8 kapanış) */
export interface ProblemReport {
  problem: ProblemDetail;
  generatedAt: ISODate;
  company: string;
  team: { user: UserRef; role: string | null }[];
}

export interface ProblemsDashboardWidget { myOpen: number; overdue: number; awaitingVerification: number }
