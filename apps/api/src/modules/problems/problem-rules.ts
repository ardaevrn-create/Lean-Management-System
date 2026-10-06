import {
  MIN_WHY_STEPS, PROBLEM_CAUSE_CATEGORIES, PROBLEM_FLOW_PHASES,
  type ParetoPoint, type ProblemCauseCategory, type ProblemGateCode, type ProblemPhase, type ProblemVerificationResult,
} from '@lean/shared';

export const problemCode = (n: number) => `PRB-${String(n).padStart(5, '0')}`;

export const CLOSED_PHASES: ProblemPhase[] = ['CLOSED', 'CANCELLED'];
export const isOpenPhase = (p: ProblemPhase) => !CLOSED_PHASES.includes(p);

export function nextPhase(phase: ProblemPhase): ProblemPhase | null {
  const i = PROBLEM_FLOW_PHASES.indexOf(phase);
  return i >= 0 && i < PROBLEM_FLOW_PHASES.length - 1 ? PROBLEM_FLOW_PHASES[i + 1] : null;
}

export function previousPhase(phase: ProblemPhase): ProblemPhase | null {
  const i = PROBLEM_FLOW_PHASES.indexOf(phase);
  return i > 0 ? PROBLEM_FLOW_PHASES[i - 1] : null;
}

const filled = (s: string | null | undefined) => !!s && s.trim().length > 0;

/** Bir 5 Neden zinciri: en az 3 dolu "neden" adımı + kök neden ifadesi. */
export function isWhyChainComplete(chain: { rootCause: string | null; steps: { answer: string }[] }): boolean {
  return filled(chain.rootCause) && chain.steps.filter((s) => filled(s.answer)).length >= MIN_WHY_STEPS;
}

export interface GateInput {
  phase: ProblemPhase;
  what: string | null; whereText: string | null; occurredAt: Date | null;
  containment: string | null; containmentNotNeeded: boolean; containmentSkipReason: string | null;
  containmentActionCount: number;
  causes: { id: string; category: ProblemCauseCategory; isCandidate: boolean }[];
  /** Tamamlanmış (isComplete) 5 Neden zincirleri; correctiveCount = bağlı iptal edilmemiş DÜZELTİCİ aksiyon sayısı */
  chains: { causeId: string; complete: boolean; correctiveCount: number }[];
  /** İptal edilmemiş + iptal edilmiş tüm düzeltici aksiyon durumları */
  correctiveStatuses: string[];
  latestVerification: ProblemVerificationResult | null;
}

export interface GateResult {
  nextPhase: ProblemPhase | null;
  canAdvance: boolean;
  missing: ProblemGateCode[];
}

/** Mevcut fazdan bir sonraki faza geçiş engellerini hesaplar (saf fonksiyon). */
export function evaluateGate(input: GateInput): GateResult {
  const next = nextPhase(input.phase);
  const missing: ProblemGateCode[] = [];
  switch (input.phase) {
    case 'DEFINITION':
      if (!filled(input.what) || !filled(input.whereText) || !input.occurredAt) missing.push('DEFINITION_INCOMPLETE');
      break;
    case 'CONTAINMENT': {
      const skipped = input.containmentNotNeeded && filled(input.containmentSkipReason);
      if (!(filled(input.containment) || input.containmentActionCount > 0 || skipped)) missing.push('CONTAINMENT_REQUIRED');
      break;
    }
    case 'ROOT_CAUSE': {
      const categories = new Set(input.causes.map((c) => c.category));
      if (categories.size < 2 || !input.causes.some((c) => c.isCandidate)) missing.push('FISHBONE_REQUIRED');
      if (!input.chains.some((c) => c.complete)) missing.push('FIVE_WHY_REQUIRED');
      break;
    }
    case 'ACTIONS': {
      const live = input.correctiveStatuses.filter((s) => s !== 'CANCELLED');
      if (input.chains.some((c) => c.complete && c.correctiveCount === 0)) missing.push('ROOT_CAUSE_UNADDRESSED');
      if (live.length === 0) missing.push('CORRECTIVE_REQUIRED');
      if (live.some((s) => s === 'OPEN' || s === 'IN_PROGRESS')) missing.push('ACTIONS_OPEN');
      break;
    }
    case 'VERIFICATION':
      if (input.latestVerification !== 'EFFECTIVE') missing.push('VERIFICATION_REQUIRED');
      break;
    default:
      return { nextPhase: null, canAdvance: false, missing: [] };
  }
  return { nextPhase: next, canAdvance: missing.length === 0 && next !== null, missing };
}

/** 6M Pareto: kategori sayıları büyükten küçüğe + kümülatif yüzde. Boş kategoriler atlanır. */
export function buildPareto(categories: ProblemCauseCategory[]): ParetoPoint[] {
  const counts = new Map<ProblemCauseCategory, number>();
  for (const c of categories) counts.set(c, (counts.get(c) ?? 0) + 1);
  const total = categories.length;
  let running = 0;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || PROBLEM_CAUSE_CATEGORIES.indexOf(a[0]) - PROBLEM_CAUSE_CATEGORIES.indexOf(b[0]))
    .map(([category, count]) => {
      running += count;
      return { category, count, cumulativePercent: Math.round((running / total) * 1000) / 10 };
    });
}
