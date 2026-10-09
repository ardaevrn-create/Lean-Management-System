/**
 * Sabit yetki kodları. Roller bu kodların kümesidir.
 * Yeni modül eklerken izinlerini buraya ekleyin ve PERMISSION_GROUPS'u güncelleyin.
 */
export const PERMISSIONS = {
  // Platform / şirket yönetimi
  TENANT_SETTINGS: 'tenant.settings',
  USER_MANAGE: 'user.manage',
  ROLE_MANAGE: 'role.manage',
  ORG_MANAGE: 'org.manage',
  ORG_VIEW: 'org.view',
  EMPLOYEE_MANAGE: 'employee.manage',
  AUDIT_LOG_VIEW: 'auditlog.view',
  API_KEY_MANAGE: 'apikey.manage',
  IMPORT_RUN: 'import.run',

  // Aksiyon
  ACTION_VIEW_ALL: 'action.viewAll',
  ACTION_MANAGE: 'action.manage',

  // KPI
  KPI_VIEW: 'kpi.view',
  KPI_MANAGE: 'kpi.manage',
  KPI_VALUE_ENTER: 'kpi.value.enter',
  KPI_DEVIATION_APPROVE: 'kpi.deviation.approve',

  // Toplantı
  MEETING_VIEW: 'meeting.view',
  MEETING_MANAGE: 'meeting.manage',

  // Strateji & Hoshin
  STRATEGY_VIEW: 'strategy.view',
  STRATEGY_MANAGE: 'strategy.manage',
  HOSHIN_VIEW: 'hoshin.view',
  HOSHIN_MANAGE: 'hoshin.manage',

  // Problem çözme / DÖF
  PROBLEM_VIEW: 'problem.view',
  PROBLEM_CREATE: 'problem.create',
  PROBLEM_MANAGE: 'problem.manage',

  // 5S / TPM denetim
  AUDIT_VIEW: 'audit.view',
  AUDIT_PERFORM: 'audit.perform',
  AUDIT_MANAGE: 'audit.manage',

  // Öneri / Kaizen
  SUGGESTION_CREATE: 'suggestion.create',
  SUGGESTION_EVALUATE: 'suggestion.evaluate',
  SUGGESTION_MANAGE: 'suggestion.manage',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS: PermissionCode[] = Object.values(PERMISSIONS);

export const SYSTEM_ROLES = {
  TENANT_ADMIN: 'TENANT_ADMIN',
  EXECUTIVE: 'EXECUTIVE',
  MANAGER: 'MANAGER',
  QUALITY_COORDINATOR: 'QUALITY_COORDINATOR',
  KPI_OWNER: 'KPI_OWNER',
  AUDITOR: 'AUDITOR',
  COMMITTEE_MEMBER: 'COMMITTEE_MEMBER',
  EMPLOYEE: 'EMPLOYEE',
} as const;
export type SystemRoleCode = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

const P = PERMISSIONS;

/** Seed sırasında oluşturulan sistem rollerinin varsayılan izinleri. */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleCode, PermissionCode[]> = {
  TENANT_ADMIN: ALL_PERMISSIONS,
  EXECUTIVE: [
    P.ORG_VIEW, P.ACTION_VIEW_ALL, P.ACTION_MANAGE, P.KPI_VIEW, P.KPI_DEVIATION_APPROVE,
    P.MEETING_VIEW, P.MEETING_MANAGE, P.STRATEGY_VIEW, P.STRATEGY_MANAGE, P.HOSHIN_VIEW,
    P.HOSHIN_MANAGE, P.PROBLEM_VIEW, P.PROBLEM_CREATE, P.AUDIT_VIEW, P.SUGGESTION_CREATE,
    P.SUGGESTION_EVALUATE,
  ],
  MANAGER: [
    P.ORG_VIEW, P.ACTION_MANAGE, P.KPI_VIEW, P.KPI_MANAGE, P.KPI_VALUE_ENTER,
    P.KPI_DEVIATION_APPROVE, P.MEETING_VIEW, P.MEETING_MANAGE, P.STRATEGY_VIEW, P.HOSHIN_VIEW,
    P.PROBLEM_VIEW, P.PROBLEM_CREATE, P.PROBLEM_MANAGE, P.AUDIT_VIEW, P.AUDIT_PERFORM,
    P.SUGGESTION_CREATE, P.SUGGESTION_EVALUATE, P.IMPORT_RUN,
  ],
  QUALITY_COORDINATOR: [
    P.ORG_VIEW, P.ACTION_VIEW_ALL, P.ACTION_MANAGE, P.KPI_VIEW, P.KPI_MANAGE, P.MEETING_VIEW,
    P.MEETING_MANAGE, P.STRATEGY_VIEW, P.HOSHIN_VIEW, P.PROBLEM_VIEW, P.PROBLEM_CREATE,
    P.PROBLEM_MANAGE, P.AUDIT_VIEW, P.AUDIT_PERFORM, P.AUDIT_MANAGE, P.SUGGESTION_CREATE,
    P.SUGGESTION_EVALUATE, P.SUGGESTION_MANAGE, P.IMPORT_RUN,
  ],
  KPI_OWNER: [P.ORG_VIEW, P.KPI_VIEW, P.KPI_VALUE_ENTER, P.MEETING_VIEW, P.SUGGESTION_CREATE],
  AUDITOR: [P.ORG_VIEW, P.AUDIT_VIEW, P.AUDIT_PERFORM, P.SUGGESTION_CREATE],
  COMMITTEE_MEMBER: [P.ORG_VIEW, P.SUGGESTION_CREATE, P.SUGGESTION_EVALUATE],
  EMPLOYEE: [P.SUGGESTION_CREATE, P.PROBLEM_CREATE],
};
