/**
 * KPI iş kuralları (saf fonksiyonlar): durum (renk) hesabı, sapma zorunluluğu, dönem giriş durumu, toplulaştırma.
 */
import type { KpiAggregation, KpiApprovalStatus, KpiDirection, KpiEntryState, KpiStatus } from './kpi';

const EPS = 1e-9;
const ge = (a: number, b: number) => a >= b - EPS;
const le = (a: number, b: number) => a <= b + EPS;

export interface KpiStatusInput {
  value: number | null | undefined;
  target: number | null | undefined;
  /** Yalnız RANGE: bandın üst sınırı (yoksa hedef tek nokta sayılır) */
  targetMax?: number | null;
  direction: KpiDirection;
  /** Hedefin yüzdesi olarak sarı tolerans (varsayılan 5) */
  tolerancePct: number;
}

/**
 * tolerans = |hedef| * tolerans% / 100
 * HIGHER_BETTER: değer >= hedef → GREEN; >= hedef - tol → YELLOW; aksi RED
 * LOWER_BETTER : değer <= hedef → GREEN; <= hedef + tol → YELLOW; aksi RED
 * RANGE        : hedef <= değer <= hedefMax → GREEN; bandın dışında ama tolerans içinde → YELLOW; aksi RED
 * Hedef (veya değer) yoksa NO_TARGET.
 */
export function computeKpiStatus(i: KpiStatusInput): KpiStatus {
  const { value, target } = i;
  if (value === null || value === undefined || target === null || target === undefined) return 'NO_TARGET';
  if (!Number.isFinite(value) || !Number.isFinite(target)) return 'NO_TARGET';
  const pct = Number.isFinite(i.tolerancePct) ? Math.max(0, i.tolerancePct) : 0;
  const tol = (x: number) => (Math.abs(x) * pct) / 100;

  switch (i.direction) {
    case 'HIGHER_BETTER':
      if (ge(value, target)) return 'GREEN';
      return ge(value, target - tol(target)) ? 'YELLOW' : 'RED';
    case 'LOWER_BETTER':
      if (le(value, target)) return 'GREEN';
      return le(value, target + tol(target)) ? 'YELLOW' : 'RED';
    case 'RANGE': {
      const min = target;
      const max = i.targetMax !== null && i.targetMax !== undefined && Number.isFinite(i.targetMax) ? Math.max(i.targetMax, min) : min;
      if (ge(value, min) && le(value, max)) return 'GREEN';
      if (value < min) return ge(value, min - tol(min)) ? 'YELLOW' : 'RED';
      return le(value, max + tol(max)) ? 'YELLOW' : 'RED';
    }
  }
}

/** Sarı için açıklama, kırmızı için açıklama + en az bir karşı önlem aksiyonu gerekir. */
export function deviationRequirements(status: KpiStatus | null | undefined): { explanation: boolean; actions: boolean } {
  return { explanation: status === 'YELLOW' || status === 'RED', actions: status === 'RED' };
}

export interface EntryStateInput {
  hasValue: boolean;
  /** Girilen değerin durumu (değer yoksa yok sayılır) */
  status: KpiStatus | null | undefined;
  /** Dönem sonu + entryDueDays */
  dueDate: Date;
  today: Date;
  deviation?: { approvalStatus: KpiApprovalStatus; explanation: string } | null;
  /** Sapmaya bağlı (iptal edilmemiş) aksiyon sayısı */
  actionCount: number;
}

const dayNum = (d: Date) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);

/**
 * Bir KPI/dönem için giriş durumu (saklanmaz, hesaplanır):
 *  NOT_DUE            değer yok, son giriş tarihi henüz geçmedi
 *  MISSING            değer yok, son giriş tarihi geçti
 *  DEVIATION_REQUIRED sarı/kırmızı değer; açıklama (ve kırmızıda aksiyon) eksik ya da açıklama reddedildi
 *  PENDING_APPROVAL   gereklilikler tamam, yönetici onayı bekliyor
 *  COMPLETE           yeşil/hedefsiz ya da gereklilikler tamam ve onaylandı
 */
export function computeEntryState(i: EntryStateInput): KpiEntryState {
  if (!i.hasValue) return dayNum(i.today) > dayNum(i.dueDate) ? 'MISSING' : 'NOT_DUE';
  const req = deviationRequirements(i.status);
  if (!req.explanation) return 'COMPLETE';
  const dev = i.deviation;
  if (!dev || !dev.explanation.trim() || dev.approvalStatus === 'REJECTED') return 'DEVIATION_REQUIRED';
  if (req.actions && i.actionCount < 1) return 'DEVIATION_REQUIRED';
  return dev.approvalStatus === 'APPROVED' ? 'COMPLETE' : 'PENDING_APPROVAL';
}

/** YTD / kümülatif için toplulaştırma. Boş listede null. */
export function aggregateValues(values: number[], aggregation: KpiAggregation): number | null {
  if (!values.length) return null;
  switch (aggregation) {
    case 'SUM': return values.reduce((a, b) => a + b, 0);
    case 'AVERAGE': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'LAST': return values[values.length - 1];
    case 'MIN': return Math.min(...values);
    case 'MAX': return Math.max(...values);
  }
}

/** Değeri KPI'nın ondalık basamağına yuvarlar. */
export function roundKpiValue(value: number, decimals: number): number {
  const f = 10 ** Math.max(0, Math.min(8, decimals));
  return Math.round((value + Number.EPSILON) * f) / f;
}
