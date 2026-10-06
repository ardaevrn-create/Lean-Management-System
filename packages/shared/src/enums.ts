export const ORG_UNIT_TYPES = [
  'COMPANY', 'SITE', 'DIRECTORATE', 'DEPARTMENT', 'UNIT', 'LINE', 'AREA',
] as const;
export type OrgUnitType = (typeof ORG_UNIT_TYPES)[number];

export const ACTION_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'VERIFIED', 'CANCELLED'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
/** Gecikme hesabına giren (henüz bitmemiş) durumlar. */
export const ACTION_ACTIVE_STATUSES: ActionStatus[] = ['OPEN', 'IN_PROGRESS'];

export const ACTION_SOURCE_TYPES = [
  'MANUAL', 'MEETING', 'KPI_DEVIATION', 'PROBLEM', 'AUDIT_FINDING', 'HOSHIN', 'SUGGESTION', 'KAIZEN',
] as const;
export type ActionSourceType = (typeof ACTION_SOURCE_TYPES)[number];

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const NOTIFICATION_TYPES = [
  'ACTION_ASSIGNED', 'ACTION_DUE_SOON', 'ACTION_OVERDUE', 'ACTION_STATUS_CHANGED', 'ACTION_COMMENT',
  'KPI_VALUE_MISSING', 'KPI_DEVIATION_REQUIRED', 'MEETING_INVITED', 'GENERIC',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
