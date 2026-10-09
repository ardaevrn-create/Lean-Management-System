// Toplantı modülü sözleşmeleri (M4)
import type { ActionListItem } from './contracts';

export const MEETING_CATEGORIES = ['TIER', 'DEPARTMENT', 'MANAGEMENT_REVIEW', 'PROJECT', 'OTHER'] as const;
export type MeetingCategory = (typeof MEETING_CATEGORIES)[number];

export const MEETING_FREQUENCIES = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ADHOC'] as const;
export type MeetingFrequency = (typeof MEETING_FREQUENCIES)[number];

export const MEETING_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_PARTICIPANT_ROLES = ['ORGANIZER', 'PARTICIPANT', 'OPTIONAL', 'GUEST'] as const;
export type MeetingParticipantRole = (typeof MEETING_PARTICIPANT_ROLES)[number];

export const MEETING_ATTENDANCES = ['UNKNOWN', 'PRESENT', 'ABSENT', 'EXCUSED', 'LATE'] as const;
export type MeetingAttendance = (typeof MEETING_ATTENDANCES)[number];

export const SERIES_FREQUENCIES = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY'] as const;
export type SeriesFrequency = (typeof SERIES_FREQUENCIES)[number];

/** Bir seride en fazla üretilebilecek toplantı sayısı. */
export const MAX_SERIES_MEETINGS = 260;

type ISODate = string;
interface UserRef { id: string; fullName: string; username: string }
interface OrgUnitRef { id: string; name: string; code: string | null }

export interface AgendaTemplateItem { title: string; durationMin?: number; description?: string }

export interface MeetingTypeMemberItem { user: UserRef; role: MeetingParticipantRole }

export interface MeetingTypeItem {
  id: string; name: string; code: string; description: string | null;
  category: MeetingCategory; tier: number | null; frequency: MeetingFrequency;
  defaultDurationMin: number; defaultLocation: string | null;
  orgUnit: OrgUnitRef | null; facilitator: UserRef | null;
  members: MeetingTypeMemberItem[]; agendaTemplate: AgendaTemplateItem[];
  isActive: boolean; meetingCount: number;
}

export interface MeetingTemplateInfo {
  key: string; name: string; description: string; category: MeetingCategory; tier: number | null;
  frequency: MeetingFrequency; durationMin: number; agenda: AgendaTemplateItem[];
}

export interface MeetingParticipantItem {
  userId: string; user: UserRef; role: MeetingParticipantRole; attendance: MeetingAttendance;
}

export interface MeetingAgendaItemDto {
  id: string; sortOrder: number; title: string; description: string | null;
  presenter: UserRef | null; durationMin: number | null; discussion: string | null; isCompleted: boolean;
}

export interface MeetingDecisionItem {
  id: string; agendaItemId: string | null; text: string; sortOrder: number; createdAt: ISODate;
}

export interface MeetingListItem {
  id: string; number: number; code: string; title: string;
  type: { id: string; name: string; code: string; category: MeetingCategory; tier: number | null } | null;
  startAt: ISODate; endAt: ISODate; location: string | null; onlineUrl: string | null;
  status: MeetingStatus; organizer: UserRef; orgUnit: OrgUnitRef | null; seriesId: string | null;
  participantCount: number; openActionCount: number; isParticipant: boolean;
}

export interface MeetingDetail extends MeetingListItem {
  summary: string | null; guests: string[]; completedAt: ISODate | null; cancelledReason: string | null;
  createdBy: UserRef; participants: MeetingParticipantItem[]; agenda: MeetingAgendaItemDto[];
  decisions: MeetingDecisionItem[]; actionCount: number; facilitator: UserRef | null;
  attendanceRate: number | null;
  /** Tamamlanmış/iptal edilmiş toplantı salt okunurdur. */
  locked: boolean;
  can: { edit: boolean; run: boolean; manage: boolean };
}

export interface MeetingCarriedAction extends ActionListItem {
  meeting: { id: string; code: string; title: string; startAt: ISODate };
  /** Önceki toplantıdan bu yana kapanmış (bilgi amaçlı) */
  closedSinceLast: boolean;
}

export interface MeetingCalendarItem {
  id: string; code: string; title: string; startAt: ISODate; endAt: ISODate; status: MeetingStatus;
  typeId: string | null; typeName: string | null; location: string | null; organizerName: string; isParticipant: boolean;
}

export interface MeetingTypeStats {
  typeId: string | null; typeName: string; held: number; planned: number; cancelled: number;
  attendanceRate: number | null; actionsOpened: number; actionsClosedOnTimeRate: number | null; overdueActions: number;
}

export interface MeetingStats {
  held: number; planned: number; cancelled: number; total: number;
  /** (KATILDI+GEÇ) / (mazeretli ve kaydedilmemiş hariç katılımcılar), yüzde */
  attendanceRate: number | null;
  actionsOpened: number; actionsClosed: number;
  /** Süresinde kapanan aksiyon yüzdesi */
  actionsClosedOnTimeRate: number | null;
  overdueActions: number;
  byType: MeetingTypeStats[];
}

export interface MeetingsDashboardWidget {
  upcoming: { id: string; code: string; title: string; startAt: ISODate; location: string | null }[];
  todayCount: number;
  minutesPending: number;
}

export interface CreateMeetingRequest {
  typeId?: string; title?: string; startAt: ISODate; endAt?: ISODate; durationMin?: number;
  location?: string; onlineUrl?: string; organizerId?: string; orgUnitId?: string;
  participantIds?: string[]; guests?: string[];
}

export interface CreateSeriesRequest {
  typeId?: string; title?: string; firstDate: string; untilDate: string; time: string;
  frequency: SeriesFrequency; weekdays?: number[]; skipWeekends?: boolean; durationMin?: number;
  participantIds?: string[]; location?: string; onlineUrl?: string; organizerId?: string; orgUnitId?: string;
}
