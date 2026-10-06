// 5S & TPM denetim modülü sözleşmeleri (M6)
import type { ActionListItem } from './contracts';

export const AUDIT_TEMPLATE_TYPES = ['FIVE_S', 'TPM_AUTONOMOUS', 'TPM_EQUIPMENT', 'SAFETY', 'LAYERED', 'CUSTOM'] as const;
export type AuditTemplateType = (typeof AUDIT_TEMPLATE_TYPES)[number];

export const AUDIT_AREA_TYPES = ['PRODUCTION', 'OFFICE', 'WAREHOUSE', 'ANY'] as const;
export type AuditAreaType = (typeof AUDIT_AREA_TYPES)[number];

export const AUDIT_SCALE_TYPES = ['ZERO_TO_FOUR', 'ZERO_TO_FIVE', 'YES_NO'] as const;
export type AuditScaleType = (typeof AUDIT_SCALE_TYPES)[number];

export const AUDIT_PLAN_FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY'] as const;
export type AuditPlanFrequency = (typeof AUDIT_PLAN_FREQUENCIES)[number];

export const AUDITOR_ASSIGN_MODES = ['FIXED', 'ROTATION'] as const;
export type AuditorAssignMode = (typeof AUDITOR_ASSIGN_MODES)[number];

export const AUDIT_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export const EQUIPMENT_CRITICALITIES = ['A', 'B', 'C'] as const;
export type EquipmentCriticality = (typeof EQUIPMENT_CRITICALITIES)[number];

/** RED = bakım ekibi, BLUE = operatör / otonom bakım */
export const TAG_COLORS = ['RED', 'BLUE'] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const TAG_CATEGORIES = ['LEAK', 'LOOSENESS', 'CONTAMINATION', 'DAMAGE', 'SAFETY', 'MISSING_PART', 'OTHER'] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];

export const TAG_STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED'] as const;
export type TagStatus = (typeof TAG_STATUSES)[number];

/** Skalada verilebilecek en yüksek puan. */
export function auditScaleMax(scale: AuditScaleType): number {
  return scale === 'ZERO_TO_FIVE' ? 5 : scale === 'YES_NO' ? 1 : 4;
}

export const auditCode = (n: number) => `DNT-${String(n).padStart(5, '0')}`;
export const tagCode = (n: number) => `ETK-${String(n).padStart(5, '0')}`;

type ISODate = string;
interface UserRef { id: string; fullName: string; username: string }
interface OrgUnitRef { id: string; name: string; code: string | null }

/* ---------- Şablonlar ---------- */
export interface AuditQuestionItem {
  id?: string; text: string; guidance: string | null; weight: number; sortOrder: number; photoRequiredBelow: number | null;
}
export interface AuditSectionItem {
  id?: string; title: string; weight: number; sortOrder: number; questions: AuditQuestionItem[];
}
export interface AuditTemplateItem {
  id: string; name: string; code: string; type: AuditTemplateType; areaType: AuditAreaType; scaleType: AuditScaleType;
  version: number; isActive: boolean; description: string | null; builtinKey: string | null;
  sectionCount: number; questionCount: number; auditCount: number;
}
export interface AuditTemplateDetail extends AuditTemplateItem {
  sections: AuditSectionItem[];
  /** Düzenleme sonucu yeni sürüm oluştuysa true */
  versioned?: boolean;
}
export interface AuditBuiltinTemplateInfo {
  key: string; name: string; description: string; type: AuditTemplateType; areaType: AuditAreaType; scaleType: AuditScaleType;
  sectionCount: number; questionCount: number;
}

/* ---------- Alan / ekipman ---------- */
export interface AuditAreaItem {
  id: string; code: string; name: string; areaType: AuditAreaType; isActive: boolean;
  orgUnit: OrgUnitRef; responsible: UserRef | null; equipmentCount: number;
}
export interface EquipmentItem {
  id: string; code: string; name: string; criticality: EquipmentCriticality; isActive: boolean;
  area: { id: string; code: string; name: string }; orgUnit: OrgUnitRef | null;
}

/* ---------- Plan ---------- */
export interface AuditPlanItem {
  id: string; name: string; frequency: AuditPlanFrequency; assignMode: AuditorAssignMode; crossAudit: boolean;
  startDate: string; endDate: string | null; isActive: boolean;
  template: { id: string; name: string; code: string; version: number; type: AuditTemplateType };
  areas: { id: string; code: string; name: string }[];
  fixedAuditor: UserRef | null;
  auditors: UserRef[];
  plannedCount: number; completedCount: number;
}
export interface AuditPlanGenerateResult {
  created: number; existing: number; skipped: { areaId: string; periodKey: string; reason: string }[];
  audits: AuditListItem[];
}

/* ---------- Denetim ---------- */
export interface AuditListItem {
  id: string; number: number; code: string; status: AuditStatus; dueDate: string;
  template: { id: string; name: string; code: string; type: AuditTemplateType };
  templateVersion: number; scaleType: AuditScaleType;
  area: { id: string; code: string; name: string; orgUnit: OrgUnitRef | null };
  equipment: { id: string; code: string; name: string } | null;
  auditor: UserRef; planId: string | null; periodKey: string | null;
  startedAt: ISODate | null; completedAt: ISODate | null; scorePct: number | null;
  isOverdue: boolean; daysOverdue: number;
  answeredCount: number; questionCount: number; findingCount: number;
}
export interface AuditAnswerItem {
  id: string; sectionTitle: string; sectionSortOrder: number; sectionWeight: number;
  questionText: string; guidance: string | null; weight: number; sortOrder: number;
  photoRequiredBelow: number | null; score: number | null; comment: string | null;
  isFinding: boolean; actionId: string | null; photoCount: number;
}
export interface AuditSectionScore { title: string; weight: number; scorePct: number | null }
export interface AuditDetail extends AuditListItem {
  notes: string | null; cancelledReason: string | null; createdBy: UserRef | null;
  responsible: UserRef | null;
  sectionScores: AuditSectionScore[];
  answers: AuditAnswerItem[];
  can: { perform: boolean; manage: boolean; createAction: boolean };
}

export interface AuditRequestAnswer { score?: number | null; comment?: string | null; isFinding?: boolean }

/* ---------- Etiketler ---------- */
export interface AbnormalityTagItem {
  id: string; number: number; code: string; color: TagColor; category: TagCategory; description: string;
  status: TagStatus; dueDate: string | null; isOverdue: boolean;
  area: { id: string; code: string; name: string };
  equipment: { id: string; code: string; name: string } | null;
  openedBy: UserRef; assignedTo: UserRef | null;
  createdAt: ISODate; closedAt: ISODate | null; closeNote: string | null;
  can: { close: boolean; edit: boolean };
}

/* ---------- Raporlar ---------- */
export interface AuditTrendPoint { auditId: string; date: ISODate; scorePct: number }
export interface AuditAreaStat {
  areaId: string; code: string; name: string; orgUnit: OrgUnitRef | null;
  auditCount: number; latestScore: number | null; latestAt: ISODate | null; previousScore: number | null;
  average: number | null; trend: AuditTrendPoint[];
  sectionAverages: { title: string; scorePct: number }[];
}
export interface AuditMissedItem {
  auditId: string; code: string; areaName: string; auditorName: string; dueDate: string; daysOverdue: number; status: AuditStatus;
}
export interface AuditStats {
  areas: AuditAreaStat[];
  best: AuditAreaStat[];
  worst: AuditAreaStat[];
  sectionAverages: { title: string; scorePct: number }[];
  compliance: { total: number; completed: number; planned: number; overdue: number; cancelled: number; completionRate: number | null };
  missed: AuditMissedItem[];
  findings: { total: number; withoutAction: number; openActions: number; overdueActions: number };
  tags: {
    open: number; overdue: number; byColor: Record<TagColor, number>; byCategory: Record<TagCategory, number>;
    avgClosureDays: number | null; closed: number;
  };
}

export interface AuditsDashboardWidget { myDue: number; myOverdue: number; tagsAssigned: number }

export type AuditFindingAction = ActionListItem;
