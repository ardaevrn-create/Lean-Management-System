/** M7 — Öneri Sistemi & Kaizen: sabitler, tipler ve saf iş kuralları (API ve web ortak). */
import type { Paginated } from './types';

export const SUGGESTION_CATEGORIES = ['QUALITY', 'SAFETY', 'COST', 'PRODUCTIVITY', 'ENVIRONMENT', 'ERGONOMICS', 'CUSTOMER', 'OTHER'] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

export const SUGGESTION_STATUSES = [
  'SUBMITTED', 'PRE_EVALUATION', 'COMMITTEE', 'ACCEPTED', 'REJECTED', 'ON_HOLD', 'IN_IMPLEMENTATION', 'IMPLEMENTED', 'CLOSED', 'WITHDRAWN',
] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

/** Ana akış (stepper) sırası */
export const SUGGESTION_FLOW: SuggestionStatus[] = ['SUBMITTED', 'PRE_EVALUATION', 'COMMITTEE', 'ACCEPTED', 'IN_IMPLEMENTATION', 'IMPLEMENTED', 'CLOSED'];

export const PRE_EVALUATION_MODES = ['DIRECT_MANAGER', 'ORG_UNIT_MANAGER'] as const;
export type PreEvaluationMode = (typeof PRE_EVALUATION_MODES)[number];

export const EVALUATION_STAGES = ['PRE', 'COMMITTEE'] as const;
export type EvaluationStage = (typeof EVALUATION_STAGES)[number];

export const EVALUATION_DECISIONS = ['FORWARD', 'ACCEPT', 'REJECT', 'HOLD', 'REVISE'] as const;
export type EvaluationDecision = (typeof EVALUATION_DECISIONS)[number];

export const KAIZEN_TYPES = ['QUICK', 'EVENT', 'PROJECT'] as const;
export type KaizenType = (typeof KAIZEN_TYPES)[number];
export const KAIZEN_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PUBLISHED', 'REJECTED'] as const;
export type KaizenStatus = (typeof KAIZEN_STATUSES)[number];
export const KAIZEN_GAIN_TYPES = ['TANGIBLE', 'INTANGIBLE'] as const;
export type KaizenGainType = (typeof KAIZEN_GAIN_TYPES)[number];
export const KAIZEN_GAIN_METRICS = ['COST_TL', 'TIME_MIN', 'SCRAP', 'AREA_M2', 'DISTANCE_M', 'ENERGY_KWH', 'SAFETY', 'QUALITY', 'OTHER'] as const;
export type KaizenGainMetric = (typeof KAIZEN_GAIN_METRICS)[number];

/** Ek dosyalar için entityType değerleri */
export const SUGGESTION_ATTACHMENT_TYPE = 'SUGGESTION';
export const KAIZEN_BEFORE_TYPE = 'KAIZEN_BEFORE';
export const KAIZEN_AFTER_TYPE = 'KAIZEN_AFTER';

export const suggestionCode = (n: number) => `ONR-${String(n).padStart(5, '0')}`;
export const kaizenCode = (n: number) => `KZN-${String(n).padStart(5, '0')}`;

/* ------------------------------ Ayarlar ------------------------------ */

export interface EvaluationCriterion {
  key: string;
  label: string;
  /** Ağırlık (yüzde; toplam 100 olmak zorunda değil, normalize edilir) */
  weight: number;
  /** En yüksek puan (ör. 5) */
  max: number;
}

export interface AcceptanceBand {
  minScore: number;
  points: number;
}

export interface PointRules {
  submission: number;
  acceptanceBands: AcceptanceBand[];
  implementation: number;
  kaizenPublished: number;
}

export interface RewardTier {
  name: string;
  minPoints: number;
}

export interface SuggestionSettingsDto {
  criteria: EvaluationCriterion[];
  preEvaluation: PreEvaluationMode;
  committeeTeamId: string | null;
  committeeTeamName: string | null;
  autoAcceptMinScore: number | null;
  autoAcceptMaxCost: number | null;
  pointRules: PointRules;
  rewardTiers: RewardTier[];
}

export const DEFAULT_CRITERIA: EvaluationCriterion[] = [
  { key: 'benefit', label: 'Fayda / etki', weight: 30, max: 5 },
  { key: 'feasibility', label: 'Uygulanabilirlik', weight: 20, max: 5 },
  { key: 'costEffectiveness', label: 'Maliyet etkinliği', weight: 20, max: 5 },
  { key: 'creativity', label: 'Yaratıcılık', weight: 15, max: 5 },
  { key: 'scope', label: 'Kapsam / yaygınlaştırılabilirlik', weight: 15, max: 5 },
];

export const DEFAULT_POINT_RULES: PointRules = {
  submission: 5,
  acceptanceBands: [
    { minScore: 80, points: 50 },
    { minScore: 60, points: 30 },
    { minScore: 0, points: 15 },
  ],
  implementation: 20,
  kaizenPublished: 30,
};

export const DEFAULT_REWARD_TIERS: RewardTier[] = [
  { name: 'Bronz', minPoints: 50 },
  { name: 'Gümüş', minPoints: 150 },
  { name: 'Altın', minPoints: 300 },
];

/* ------------------------------ Saf kurallar ------------------------------ */

/** Puanların kriter üst sınırları içinde ve eksiksiz olduğunu doğrular; hata mesajlarını döndürür. */
export function validateScores(criteria: EvaluationCriterion[], scores: Record<string, number>): string[] {
  const errors: string[] = [];
  for (const c of criteria) {
    const v = scores[c.key];
    if (typeof v !== 'number' || Number.isNaN(v)) errors.push(`${c.key}: missing`);
    else if (v < 0 || v > c.max) errors.push(`${c.key}: 0..${c.max}`);
  }
  return errors;
}

/**
 * Ağırlıklı toplam puan (0–100). Her kriter puan/max oranıyla ağırlığına göre katkı verir;
 * ağırlıklar normalize edilir (toplamları 100 olmak zorunda değildir). Eksik puan 0 sayılır.
 */
export function weightedScore(criteria: EvaluationCriterion[], scores: Record<string, number>): number {
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  if (totalWeight <= 0) return 0;
  const sum = criteria.reduce((s, c) => {
    const raw = Number(scores[c.key] ?? 0);
    const v = c.max > 0 ? Math.min(Math.max(raw, 0), c.max) / c.max : 0;
    return s + v * c.weight;
  }, 0);
  return Math.round((sum / totalWeight) * 1000) / 10;
}

export function averageScore(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

/** Kabul puanı: en yüksek eşiği aşan banttaki puan. */
export function acceptancePoints(rules: PointRules, score: number | null): number {
  const bands = [...rules.acceptanceBands].sort((a, b) => b.minScore - a.minScore);
  const s = score ?? 0;
  return bands.find((b) => s >= b.minScore)?.points ?? 0;
}

/** Toplam puana göre en yüksek ödül kademesi (yoksa null). */
export function tierFor(tiers: RewardTier[], points: number): RewardTier | null {
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints);
  return sorted.find((t) => points >= t.minPoints) ?? null;
}

/** Bir sonraki kademe ve kalan puan. */
export function nextTier(tiers: RewardTier[], points: number): { tier: RewardTier; remaining: number } | null {
  const sorted = [...tiers].sort((a, b) => a.minPoints - b.minPoints);
  const next = sorted.find((t) => t.minPoints > points);
  return next ? { tier: next, remaining: next.minPoints - points } : null;
}

/** Hızlı onay (komitesiz kabul) koşulu: eşik tanımlı, puan yeterli ve maliyet sınırı içinde. */
export function canFastTrack(
  settings: { autoAcceptMinScore: number | null; autoAcceptMaxCost: number | null },
  preScore: number | null,
  estimatedCost: number | null,
): boolean {
  if (settings.autoAcceptMinScore === null || preScore === null) return false;
  if (preScore < settings.autoAcceptMinScore) return false;
  if (settings.autoAcceptMaxCost !== null && (estimatedCost ?? 0) > settings.autoAcceptMaxCost) return false;
  return true;
}

/** İzin verilen durum geçişleri (saf). */
export const SUGGESTION_TRANSITIONS: Record<SuggestionStatus, SuggestionStatus[]> = {
  SUBMITTED: ['PRE_EVALUATION', 'COMMITTEE', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  PRE_EVALUATION: ['COMMITTEE', 'ACCEPTED', 'REJECTED', 'SUBMITTED', 'WITHDRAWN'],
  COMMITTEE: ['ACCEPTED', 'REJECTED', 'ON_HOLD', 'WITHDRAWN'],
  ON_HOLD: ['COMMITTEE', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: ['IN_IMPLEMENTATION'],
  IN_IMPLEMENTATION: ['IMPLEMENTED'],
  IMPLEMENTED: ['CLOSED'],
  REJECTED: [],
  CLOSED: [],
  WITHDRAWN: [],
};

export function canTransition(from: SuggestionStatus, to: SuggestionStatus): boolean {
  return SUGGESTION_TRANSITIONS[from].includes(to);
}

/** Karar öncesi (gönderen geri çekebilir / düzenleyebilir) durumlar */
export const SUGGESTION_PRE_DECISION: SuggestionStatus[] = ['SUBMITTED', 'PRE_EVALUATION', 'COMMITTEE', 'ON_HOLD'];

/* ------------------------------ Yanıt tipleri ------------------------------ */

export interface SuggestionUserRef {
  id: string;
  fullName: string;
  username?: string;
}

export interface SuggestionListItem {
  id: string;
  number: number;
  code: string;
  title: string;
  category: SuggestionCategory;
  status: SuggestionStatus;
  orgUnit: { id: string; name: string } | null;
  submittedBy: SuggestionUserRef;
  coSubmitterCount: number;
  estimatedCost: number | null;
  estimatedSaving: number | null;
  preScore: number | null;
  finalScore: number | null;
  implementer: SuggestionUserRef | null;
  isSuggestionOfMonth: boolean;
  submittedAt: string;
  decidedAt: string | null;
  /** Bu kullanıcının bekleyen bir değerlendirme görevi var mı */
  awaitingMe: EvaluationStage | null;
}

export interface SuggestionEvaluationDto {
  id: string;
  stage: EvaluationStage;
  evaluator: SuggestionUserRef;
  scores: Record<string, number>;
  totalScore: number;
  decision: EvaluationDecision | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SuggestionEventDto {
  id: string;
  type: string;
  fromStatus: SuggestionStatus | null;
  toStatus: SuggestionStatus | null;
  note: string | null;
  user: SuggestionUserRef | null;
  createdAt: string;
}

export interface SuggestionRights {
  edit: boolean;
  withdraw: boolean;
  preEvaluate: boolean;
  committeeScore: boolean;
  decide: boolean;
  manage: boolean;
  implement: boolean;
  createKaizen: boolean;
}

export interface SuggestionDetail extends Omit<SuggestionListItem, 'coSubmitterCount' | 'awaitingMe'> {
  currentState: string;
  proposedState: string;
  expectedBenefit: string;
  coSubmitters: SuggestionUserRef[];
  selfImplementable: boolean;
  fastTrack: boolean;
  preEvaluator: SuggestionUserRef | null;
  decisionNote: string | null;
  rejectionReason: string | null;
  revisionNote: string | null;
  targetDate: string | null;
  implementationNote: string | null;
  suggestionMonth: string | null;
  preEvaluatedAt: string | null;
  implementedAt: string | null;
  closedAt: string | null;
  withdrawnAt: string | null;
  evaluations: SuggestionEvaluationDto[];
  events: SuggestionEventDto[];
  kaizenIds: { id: string; code: string; status: KaizenStatus }[];
  can: SuggestionRights;
}

export interface MyPointsDto {
  total: number;
  tier: RewardTier | null;
  next: { tier: RewardTier; remaining: number } | null;
  submitted: number;
  accepted: number;
  implemented: number;
  history: { id: string; points: number; reason: string; sourceType: string; sourceId: string; createdAt: string }[];
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  fullName: string;
  orgUnitName: string | null;
  points: number;
  tier: RewardTier | null;
  suggestions: number;
}

export interface KaizenGainDto {
  id: string;
  type: KaizenGainType;
  metric: KaizenGainMetric;
  description: string;
  beforeValue: number | null;
  afterValue: number | null;
  annualSaving: number | null;
  financeApproved: boolean;
  financeApprovedBy: SuggestionUserRef | null;
  financeApprovedAt: string | null;
}

export interface KaizenListItem {
  id: string;
  number: number;
  code: string;
  type: KaizenType;
  title: string;
  status: KaizenStatus;
  orgUnit: { id: string; name: string } | null;
  leader: SuggestionUserRef;
  startDate: string | null;
  endDate: string | null;
  publishedAt: string | null;
  suggestionId: string | null;
  totalAnnualSaving: number;
  approvedAnnualSaving: number;
  memberCount: number;
}

export interface KaizenRights {
  edit: boolean;
  submit: boolean;
  approve: boolean;
  financeApprove: boolean;
  createAction: boolean;
}

export interface KaizenDetail extends KaizenListItem {
  problem: string;
  rootCause: string | null;
  beforeDescription: string;
  afterDescription: string;
  members: SuggestionUserRef[];
  gains: KaizenGainDto[];
  standardization: string | null;
  horizontalDeployment: string | null;
  approvedBy: SuggestionUserRef | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  suggestion: { id: string; code: string; title: string } | null;
  createdAt: string;
  can: KaizenRights;
}

export interface SuggestionStats {
  total: number;
  byStatus: Record<string, number>;
  acceptanceRate: number | null;
  implementationRate: number | null;
  avgDaysToDecision: number | null;
  avgDaysToImplementation: number | null;
  activeEmployees: number;
  perEmployee: number | null;
  participationPct: number | null;
  byCategory: { category: SuggestionCategory; count: number }[];
  monthlyTrend: { month: string; submitted: number; accepted: number }[];
  byOrgUnit: { orgUnitId: string | null; name: string; count: number; employees: number; perEmployee: number | null; participationPct: number | null }[];
  topContributors: { userId: string; fullName: string; count: number; accepted: number }[];
  kaizen: {
    total: number;
    byType: Record<string, number>;
    totalAnnualSaving: number;
    approvedAnnualSaving: number;
    byOrgUnit: { orgUnitId: string | null; name: string; count: number; annualSaving: number }[];
  };
}

export interface SuggestionsDashboardWidget {
  mySubmitted: number;
  awaitingMyEvaluation: number;
  myPoints: number;
  tier: string | null;
}

export type SuggestionListResponse = Paginated<SuggestionListItem>;
export type KaizenListResponse = Paginated<KaizenListItem>;
