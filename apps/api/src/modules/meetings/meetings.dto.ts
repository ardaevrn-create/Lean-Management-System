import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MEETING_ATTENDANCES, MEETING_CATEGORIES, MEETING_FREQUENCIES, MEETING_PARTICIPANT_ROLES, MEETING_STATUSES, PRIORITIES, SERIES_FREQUENCIES,
  type MeetingAttendance, type MeetingCategory, type MeetingFrequency, type MeetingParticipantRole, type MeetingStatus, type Priority, type SeriesFrequency,
} from '@lean/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const toBool = ({ value }: { value: unknown }) => value === 'true' || value === true;

/* ------------------------------ Toplantı tipleri ------------------------------ */

export class AgendaTemplateItemDto {
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1440) durationMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
}

export class TypeMemberDto {
  @ApiProperty() @IsString() userId: string;
  @ApiPropertyOptional({ enum: MEETING_PARTICIPANT_ROLES }) @IsOptional() @IsIn(MEETING_PARTICIPANT_ROLES) role?: MeetingParticipantRole;
}

export class CreateMeetingTypeDto {
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_-]{2,40}$/) code: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ enum: MEETING_CATEGORIES }) @IsOptional() @IsIn(MEETING_CATEGORIES) category?: MeetingCategory;
  @ApiPropertyOptional({ minimum: 1, maximum: 3 }) @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsInt() @Min(1) @Max(3) tier?: number | null;
  @ApiPropertyOptional({ enum: MEETING_FREQUENCIES }) @IsOptional() @IsIn(MEETING_FREQUENCIES) frequency?: MeetingFrequency;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(1440) defaultDurationMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) defaultLocation?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() facilitatorId?: string | null;
  @ApiPropertyOptional({ type: [TypeMemberDto] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => TypeMemberDto) members?: TypeMemberDto[];
  @ApiPropertyOptional({ type: [AgendaTemplateItemDto] }) @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AgendaTemplateItemDto) agendaTemplate?: AgendaTemplateItemDto[];
}

export class UpdateMeetingTypeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{2,40}$/) code?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) description?: string | null;
  @ApiPropertyOptional({ enum: MEETING_CATEGORIES }) @IsOptional() @IsIn(MEETING_CATEGORIES) category?: MeetingCategory;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsInt() @Min(1) @Max(3) tier?: number | null;
  @ApiPropertyOptional({ enum: MEETING_FREQUENCIES }) @IsOptional() @IsIn(MEETING_FREQUENCIES) frequency?: MeetingFrequency;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(1440) defaultDurationMin?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(200) defaultLocation?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() facilitatorId?: string | null;
  @ApiPropertyOptional({ type: [TypeMemberDto] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => TypeMemberDto) members?: TypeMemberDto[];
  @ApiPropertyOptional({ type: [AgendaTemplateItemDto] }) @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AgendaTemplateItemDto) agendaTemplate?: AgendaTemplateItemDto[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class FromTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_-]{2,40}$/) code?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() facilitatorId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) defaultLocation?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) participantIds?: string[];
}

export class MeetingTypeQuery {
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() includeInactive?: boolean;
}

/* ------------------------------ Toplantılar ------------------------------ */

export const MEETING_VIEWS = ['mine', 'all'] as const;
export type MeetingView = (typeof MEETING_VIEWS)[number];

export class MeetingQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: MEETING_VIEWS, default: 'mine' }) @IsOptional() @IsIn(MEETING_VIEWS) view: MeetingView = 'mine';
  @ApiPropertyOptional() @IsOptional() @IsString() typeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional({ enum: MEETING_STATUSES }) @IsOptional() @IsIn(MEETING_STATUSES) status?: MeetingStatus;
  @ApiPropertyOptional({ description: 'upcoming | past' }) @IsOptional() @IsIn(['upcoming', 'past']) when?: 'upcoming' | 'past';
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class RangeQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() typeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class CreateMeetingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() typeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) title?: string;
  @ApiProperty() @IsDateString() startAt: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endAt?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(1440) durationMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) onlineUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizerId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) participantIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) guests?: string[];
}

export class UpdateMeetingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endAt?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(200) location?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(500) onlineUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() organizerId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional({ description: 'Genel notlar / tutanak özeti' }) @IsOptional() @IsString() @MaxLength(50_000) summary?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) guests?: string[];
}

export class CancelMeetingDto {
  @ApiProperty() @IsString() @MaxLength(1000) reason: string;
}

export class ParticipantInputDto {
  @ApiProperty() @IsString() userId: string;
  @ApiPropertyOptional({ enum: MEETING_PARTICIPANT_ROLES }) @IsOptional() @IsIn(MEETING_PARTICIPANT_ROLES) role?: MeetingParticipantRole;
}

export class SetParticipantsDto {
  @ApiProperty({ type: [ParticipantInputDto] }) @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => ParticipantInputDto) participants: ParticipantInputDto[];
}

export class AttendanceItemDto {
  @ApiProperty() @IsString() userId: string;
  @ApiProperty({ enum: MEETING_ATTENDANCES }) @IsIn(MEETING_ATTENDANCES) attendance: MeetingAttendance;
}

export class SetAttendanceDto {
  @ApiProperty({ type: [AttendanceItemDto] }) @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => AttendanceItemDto) items: AttendanceItemDto[];
}

export class AgendaItemInputDto {
  @ApiPropertyOptional({ description: 'Mevcut madde id (yoksa yeni oluşturulur)' }) @IsOptional() @IsString() id?: string;
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() presenterId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsInt() @Min(1) @Max(1440) durationMin?: number | null;
}

export class SetAgendaDto {
  @ApiProperty({ type: [AgendaItemInputDto] }) @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AgendaItemInputDto) items: AgendaItemInputDto[];
}

export class UpdateAgendaItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20_000) discussion?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCompleted?: boolean;
}

export class CreateDecisionDto {
  @ApiProperty() @IsString() @MaxLength(5000) text: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() agendaItemId?: string | null;
}

export class UpdateDecisionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) text?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() agendaItemId?: string | null;
}

/** Toplantıdan aksiyon açma: kaynak alanları sunucu tarafından doldurulur. */
export class CreateMeetingActionDto {
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiProperty() @IsString() ownerId: string;
  @ApiProperty({ example: '2026-12-31' }) @IsDateString() dueDate: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() startDate?: string;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) supporterIds?: string[];
}

/* ------------------------------ Seriler ------------------------------ */

export class CreateSeriesDto {
  @ApiPropertyOptional() @IsOptional() @IsString() typeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) title?: string;
  @ApiProperty({ example: '2026-10-05' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) firstDate: string;
  @ApiProperty({ example: '2026-12-31' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) untilDate: string;
  @ApiProperty({ example: '09:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time: string;
  @ApiProperty({ enum: SERIES_FREQUENCIES }) @IsIn(SERIES_FREQUENCIES) frequency: SeriesFrequency;
  @ApiPropertyOptional({ description: 'ISO gün no: 1=Pzt ... 7=Paz' }) @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true }) weekdays?: number[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() skipWeekends?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(1440) durationMin?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) participantIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) onlineUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizerId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string;
}

export class SeriesActionDto {
  @ApiProperty({ enum: ['CANCEL'] }) @IsIn(['CANCEL']) action: 'CANCEL';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
