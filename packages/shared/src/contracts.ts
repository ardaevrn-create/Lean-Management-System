/**
 * API yanıt sözleşmeleri (web, mobil ve api ortak kullanır).
 * Tarih alanları JSON'da ISO string olarak taşınır.
 */
import type { ActionSourceType, ActionStatus, NotificationType, OrgUnitType, Priority } from './enums';
import type { AuthUser, TokenPair } from './types';

export type ISODate = string;

/* ---------- Auth ---------- */
export interface LoginRequest { tenantCode: string; username: string; password: string }
export interface LoginResponse extends TokenPair { user: AuthUser }
export interface ChangePasswordRequest { currentPassword: string; newPassword: string }

/* ---------- Tenant ---------- */
export interface TenantInfo {
  id: string; code: string; name: string; status: 'ACTIVE' | 'SUSPENDED';
  locale: string; timezone: string; logoUrl: string | null; primaryColor: string | null;
}

/* ---------- Organizasyon ---------- */
export interface UserRef { id: string; fullName: string; username: string }
export interface OrgUnitRef { id: string; name: string; code: string | null }

export interface OrgUnit {
  id: string; parentId: string | null; name: string; code: string | null; type: OrgUnitType;
  level: number; path: string; sortOrder: number; isActive: boolean;
  managerEmployeeId: string | null; managerName: string | null; employeeCount: number;
}
export interface OrgUnitNode extends OrgUnit { children: OrgUnitNode[] }

export interface Employee {
  id: string; employeeNo: string; firstName: string; lastName: string; fullName: string;
  title: string | null; email: string | null; phone: string | null; hireDate: ISODate | null;
  isActive: boolean; orgUnit: OrgUnitRef | null; manager: { id: string; fullName: string } | null;
  user: { id: string; username: string; isActive: boolean } | null;
}

export interface TeamMember { employeeId: string; fullName: string; role: string | null }
export interface Team {
  id: string; name: string; type: 'COMMITTEE' | 'KAIZEN_TEAM' | 'FIVE_S_TEAM' | 'HOSHIN_TEAM' | 'OTHER';
  description: string | null; members: TeamMember[];
}

/* ---------- Kullanıcı / Rol ---------- */
export interface Role {
  id: string; code: string; name: string; description: string | null; isSystem: boolean;
  permissions: string[]; userCount: number;
}
export interface UserRoleAssignment { roleId: string; roleName: string; orgUnitId: string | null; orgUnitName: string | null }
export interface UserListItem {
  id: string; username: string; fullName: string; email: string | null; isActive: boolean;
  mustChangePassword: boolean; lastLoginAt: ISODate | null; employeeId: string | null;
  orgUnitName: string | null; roles: UserRoleAssignment[];
}
export interface CreatedCredential { userId: string; employeeId: string | null; username: string; temporaryPassword: string }

/* ---------- Aksiyon ---------- */
export interface ActionListItem {
  id: string; number: number; code: string; title: string; status: ActionStatus; priority: Priority;
  sourceType: ActionSourceType; sourceId: string | null; sourceLabel: string | null;
  owner: UserRef; orgUnit: OrgUnitRef | null; dueDate: ISODate; startDate: ISODate | null;
  progress: number; isOverdue: boolean; overdueDays: number; createdAt: ISODate;
}
export interface ActionHistoryEntry {
  id: string; type: 'CREATED' | 'UPDATED' | 'STATUS_CHANGED' | 'DUE_DATE_CHANGED' | 'OWNER_CHANGED' | 'PROGRESS';
  fromValue: string | null; toValue: string | null; note: string | null; user: UserRef | null; createdAt: ISODate;
}
export interface ActionComment { id: string; body: string; user: UserRef; createdAt: ISODate }
export interface DueDateRequest {
  id: string; newDueDate: ISODate; reason: string; status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedBy: UserRef; decidedBy: UserRef | null; decidedAt: ISODate | null; createdAt: ISODate;
}
export interface ActionDetail extends ActionListItem {
  description: string | null; originalDueDate: ISODate; completedAt: ISODate | null;
  verifiedAt: ISODate | null; completionNote: string | null; createdBy: UserRef;
  supporters: UserRef[]; history: ActionHistoryEntry[]; comments: ActionComment[];
  dueDateRequests: DueDateRequest[];
  /** Kullanıcının bu aksiyon üzerindeki yetkileri */
  can: { edit: boolean; changeStatus: boolean; verify: boolean; decideDueDate: boolean };
}
export interface CreateActionRequest {
  title: string; description?: string; ownerId: string; dueDate: ISODate; startDate?: ISODate;
  priority?: Priority; orgUnitId?: string; supporterIds?: string[];
  sourceType?: ActionSourceType; sourceId?: string; sourceLabel?: string;
}
export interface ActionStats {
  open: number; inProgress: number; done: number; verified: number; overdue: number;
  onTimeCompletionRate: number | null;
  bySource: { sourceType: ActionSourceType; open: number; overdue: number }[];
}

/* ---------- Bildirim ---------- */
export interface NotificationItem {
  id: string; type: NotificationType; title: string; body: string | null; link: string | null;
  readAt: ISODate | null; createdAt: ISODate;
}

/* ---------- Dosya ---------- */
export interface AttachmentItem {
  id: string; fileName: string; mimeType: string; size: number; uploadedBy: UserRef; createdAt: ISODate;
}

/* ---------- Excel içe aktarma ---------- */
export interface ImportColumn { key: string; label: string; required: boolean; type: 'string' | 'number' | 'date' | 'boolean'; description?: string }
export interface ImportTypeInfo { type: string; label: string; columns: ImportColumn[] }
export interface ImportPreview {
  jobId: string; type: string; fileName: string; headers: string[]; sampleRows: Record<string, unknown>[];
  totalRows: number; suggestedMapping: Record<string, string | null>;
}
/** mapping: içe aktarma kolon anahtarı -> Excel başlığı */
export interface ImportMappingRequest { mapping: Record<string, string | null> }
export interface ImportRowError { row: number; column: string | null; message: string }
export interface ImportValidationResult { totalRows: number; validRows: number; errorRows: number; errors: ImportRowError[] }
export interface ImportCommitResult { totalRows: number; successRows: number; errorRows: number; errors: ImportRowError[] }

/* ---------- Denetim izi ---------- */
export interface AuditLogItem {
  id: string; entity: string; entityId: string; action: string; diff: unknown; user: UserRef | null; createdAt: ISODate;
}

/* ---------- Kişisel pano ---------- */
export interface MyDashboard {
  actions: { open: number; overdue: number; dueThisWeek: number };
  upcomingActions: ActionListItem[];
  unreadNotifications: number;
  /** Modüller (KPI, toplantı, denetim...) ek kartlar ekler */
  widgets: Record<string, unknown>;
}
