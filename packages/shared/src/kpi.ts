// KPI modülü (M8) sözleşmeleri: enum'lar, yanıt tipleri; dönem / kural / formül yardımcıları buradan yeniden dışa aktarılır.
import type { ActionListItem, CreateActionRequest, ISODate, OrgUnitRef, UserRef } from './contracts';
import type { KpiFrequency } from './kpi-periods';

export * from './kpi-periods';
export * from './kpi-rules';
export * from './kpi-formula';

/* ---------- Enum'lar ---------- */
export const KPI_CATEGORIES = ['QUALITY', 'PRODUCTIVITY', 'COST', 'DELIVERY', 'SAFETY', 'PEOPLE', 'ENVIRONMENT', 'OTHER'] as const;
export type KpiCategory = (typeof KPI_CATEGORIES)[number];

export const KPI_DIRECTIONS = ['HIGHER_BETTER', 'LOWER_BETTER', 'RANGE'] as const;
export type KpiDirection = (typeof KPI_DIRECTIONS)[number];

export const KPI_AGGREGATIONS = ['SUM', 'AVERAGE', 'LAST', 'MIN', 'MAX'] as const;
export type KpiAggregation = (typeof KPI_AGGREGATIONS)[number];

export const KPI_STATUSES = ['GREEN', 'YELLOW', 'RED', 'NO_TARGET'] as const;
export type KpiStatus = (typeof KPI_STATUSES)[number];

export const KPI_VALUE_SOURCES = ['MANUAL', 'IMPORT', 'API', 'CALCULATED'] as const;
export type KpiValueSource = (typeof KPI_VALUE_SOURCES)[number];

export const KPI_ENTRY_STATES = ['NOT_DUE', 'MISSING', 'DEVIATION_REQUIRED', 'PENDING_APPROVAL', 'COMPLETE'] as const;
export type KpiEntryState = (typeof KPI_ENTRY_STATES)[number];

export const KPI_APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type KpiApprovalStatus = (typeof KPI_APPROVAL_STATUSES)[number];

/** Hata kodları (422) */
export const KPI_ERROR_CODES = [
  'CALCULATED_KPI', 'REASON_REQUIRED', 'KPI_INACTIVE', 'FUTURE_PERIOD', 'INVALID_PERIOD', 'CODE_TAKEN',
  'INVALID_FORMULA', 'FREQUENCY_LOCKED', 'DEVIATION_NOT_REQUIRED', 'ALREADY_DECIDED', 'ACTION_REQUIRED',
] as const;

/* ---------- Tanım ---------- */
export interface KpiBrief {
  id: string;
  code: string;
  name: string;
  unit: string;
  decimals: number;
  category: KpiCategory;
  direction: KpiDirection;
  frequency: KpiFrequency;
  aggregation: KpiAggregation;
  warningTolerancePct: number;
  entryDueDays: number;
  orgUnit: OrgUnitRef;
  owner: UserRef;
  dataEntryUser: UserRef | null;
  formula: string | null;
  isActive: boolean;
}

export interface KpiListItem extends KpiBrief {
  description: string | null;
  startPeriod: string | null;
  /** Veri girişi beklenen son tamamlanmış dönem ve o dönemin giriş durumu */
  duePeriod: string;
  entryState: KpiEntryState;
  /** Değeri olan en son dönem */
  lastPeriod: string | null;
  lastValue: number | null;
  lastTarget: number | null;
  lastTargetMax: number | null;
  lastStatus: KpiStatus | null;
  /** Son 12 dönemde eksik giriş sayısı / sapma açıklaması bekleyen dönem sayısı */
  missingCount: number;
  deviationRequiredCount: number;
}

export interface KpiDefinitionDetail extends KpiListItem {
  createdAt: ISODate;
  formulaRefs: string[];
  hasValues: boolean;
  can: { manage: boolean; enter: boolean };
}

export interface KpiDefinitionRequest {
  code: string;
  name: string;
  description?: string | null;
  category?: KpiCategory;
  unit?: string;
  decimals?: number;
  direction?: KpiDirection;
  frequency: KpiFrequency;
  aggregation?: KpiAggregation;
  warningTolerancePct?: number;
  entryDueDays?: number;
  orgUnitId: string;
  ownerId: string;
  dataEntryUserId?: string | null;
  formula?: string | null;
  startPeriod?: string | null;
  isActive?: boolean;
}

/* ---------- Hedef ---------- */
export interface KpiTargetItem {
  period: string;
  target: number | null;
  targetMax: number | null;
}
export interface KpiTargetInput {
  period: string;
  /** null = o dönemin hedefini sil */
  target: number | null;
  targetMax?: number | null;
}

/* ---------- Değer ---------- */
export interface KpiDeviationSummary {
  id: string;
  explanation: string;
  rootCause: string | null;
  approvalStatus: KpiApprovalStatus;
  decidedBy: UserRef | null;
  decidedAt: ISODate | null;
  decisionNote: string | null;
}

export interface KpiSeriesPoint {
  period: string;
  periodStart: ISODate;
  periodEnd: ISODate;
  dueDate: ISODate;
  target: number | null;
  targetMax: number | null;
  value: number | null;
  status: KpiStatus | null;
  entryState: KpiEntryState | null;
  source: KpiValueSource | null;
  note: string | null;
  isLate: boolean;
  enteredBy: UserRef | null;
  enteredAt: ISODate | null;
  deviation: KpiDeviationSummary | null;
  actionCount: number;
  /** Önceki yılın karşılık gelen dönemindeki değer */
  previousYearValue: number | null;
}

export interface KpiAggregate {
  /** YTD'nin kapsadığı dönem sayısı (değeri olan) */
  periods: number;
  value: number | null;
  target: number | null;
  status: KpiStatus;
}

export interface KpiSeries {
  kpi: KpiBrief;
  from: string;
  to: string;
  points: KpiSeriesPoint[];
  /** `to` döneminin yılı için yıl başından bugüne */
  ytd: KpiAggregate;
  previousYearYtd: KpiAggregate;
  year: number;
  /** Aralıktaki sapmalara bağlı karşı önlem aksiyonları (sourceId = deviation.id) */
  actions: ActionListItem[];
}

export interface KpiRevisionItem {
  id: string;
  period: string;
  oldValue: number | null;
  newValue: number;
  reason: string | null;
  changedBy: UserRef;
  createdAt: ISODate;
}

export interface SetKpiValueRequest {
  kpiId: string;
  period: string;
  value: number;
  note?: string | null;
  /** Mevcut değer değiştirilirken zorunlu */
  reason?: string;
}

export interface KpiValueResult {
  kpiId: string;
  period: string;
  value: number;
  status: KpiStatus;
  entryState: KpiEntryState;
  isLate: boolean;
  revised: boolean;
  /** Sapma açıklaması / aksiyon gerekliliği */
  requiresExplanation: boolean;
  requiresAction: boolean;
}

export interface BulkKpiValueItem {
  kpiCode?: string;
  kpiId?: string;
  period: string;
  value: number;
  note?: string;
}
export interface BulkKpiValuesRequest {
  items: BulkKpiValueItem[];
  /** Mevcut değer üzerine yazılırsa revizyon gerekçesi (varsayılan: "API ile güncelleme") */
  reason?: string;
}
export interface BulkKpiValueResultItem {
  index: number;
  kpiCode: string | null;
  period: string;
  ok: boolean;
  status?: KpiStatus;
  entryState?: KpiEntryState;
  code?: string;
  error?: string;
}
export interface BulkKpiValuesResult {
  total: number;
  succeeded: number;
  failed: number;
  results: BulkKpiValueResultItem[];
}

/* ---------- Veri giriş çalışma listesi ---------- */
export interface KpiEntryItem {
  kpi: KpiBrief;
  period: string;
  periodStart: ISODate;
  dueDate: ISODate;
  target: number | null;
  targetMax: number | null;
  value: number | null;
  status: KpiStatus | null;
  source: KpiValueSource | null;
  note: string | null;
  isLate: boolean;
  isCalculated: boolean;
  canEnter: boolean;
  entryState: KpiEntryState;
  deviation: KpiDeviationSummary | null;
  actionCount: number;
  /** Aynı KPI için önceki eksik dönemler */
  missingPeriods: string[];
}
export interface KpiEntryGroup {
  frequency: KpiFrequency;
  period: string;
  dueDate: ISODate;
  items: KpiEntryItem[];
}
export interface KpiEntryResponse {
  groups: KpiEntryGroup[];
}

/* ---------- Eksik veri & uyum ---------- */
export interface KpiMissingItem {
  kpi: KpiBrief;
  period: string;
  dueDate: ISODate;
  daysLate: number;
  responsible: UserRef;
  orgUnit: OrgUnitRef;
}
export interface KpiMissingResponse {
  total: number;
  items: KpiMissingItem[];
}

export interface KpiComplianceRow {
  /** orgUnit satırı için birim, kişi satırı için kullanıcı */
  orgUnit: OrgUnitRef | null;
  user: UserRef | null;
  expected: number;
  onTime: number;
  late: number;
  missing: number;
  /** Zamanında girilen / beklenen (%) */
  complianceRate: number | null;
  /** Geç de olsa girilen / beklenen (%) */
  completionRate: number | null;
}
export interface KpiComplianceResponse {
  overall: KpiComplianceRow;
  byOrgUnit: KpiComplianceRow[];
  byPerson: KpiComplianceRow[];
}

/* ---------- Sapma ---------- */
export interface KpiDeviationListItem {
  kpi: KpiBrief;
  period: string;
  value: number;
  target: number | null;
  targetMax: number | null;
  status: KpiStatus;
  entryState: KpiEntryState;
  deviation: KpiDeviationSummary | null;
  actionCount: number;
  needsActions: boolean;
  canApprove: boolean;
  /** Değerin girildiği tarih */
  enteredAt: ISODate | null;
}

export interface KpiDeviationDetail extends KpiDeviationListItem {
  actions: ActionListItem[];
  history: { id: string; action: string; user: UserRef | null; createdAt: ISODate }[];
}

export interface SaveKpiDeviationRequest {
  kpiId: string;
  period: string;
  explanation: string;
  rootCause?: string | null;
}
export type CreateKpiDeviationActionRequest = Omit<CreateActionRequest, 'sourceType' | 'sourceId' | 'sourceLabel' | 'orgUnitId'>;
export interface DecideKpiDeviationRequest {
  approve: boolean;
  note?: string;
}

/* ---------- Pano / özet / besleme ---------- */
export interface KpiBoardPoint {
  period: string;
  label: string;
  value: number | null;
  target: number | null;
  status: KpiStatus | null;
}
export interface KpiBoardItem {
  kpi: KpiBrief;
  current: KpiBoardPoint | null;
  entryState: KpiEntryState | null;
  spark: KpiBoardPoint[];
}
export interface KpiBoardResponse {
  orgUnit: OrgUnitRef | null;
  summary: { green: number; yellow: number; red: number; noData: number; total: number };
  items: KpiBoardItem[];
}

export interface KpiFeedRow {
  kpiCode: string;
  kpiName: string;
  category: KpiCategory;
  unit: string;
  direction: KpiDirection;
  frequency: KpiFrequency;
  orgUnitCode: string | null;
  orgUnitName: string;
  ownerName: string;
  period: string;
  periodStart: ISODate;
  target: number | null;
  targetMax: number | null;
  value: number | null;
  status: KpiStatus | null;
  deviationExplanation: string | null;
}

export interface KpiSummary {
  missing: number;
  deviationRequired: number;
  pendingApproval: number;
  kpiCount: number;
  complianceRate: number | null;
}

/** Ana sayfa kartı: dashboard widgets.kpi */
export interface KpiDashboardWidget {
  toEnter: number;
  missing: number;
  deviationsRequired: number;
  pendingApprovals?: number;
}
