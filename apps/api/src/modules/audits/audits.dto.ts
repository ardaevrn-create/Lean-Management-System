import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AUDIT_AREA_TYPES, AUDIT_PLAN_FREQUENCIES, AUDIT_SCALE_TYPES, AUDIT_STATUSES, AUDIT_TEMPLATE_TYPES, AUDITOR_ASSIGN_MODES,
  EQUIPMENT_CRITICALITIES, PRIORITIES, TAG_CATEGORIES, TAG_COLORS, TAG_STATUSES,
  type AuditAreaType, type AuditPlanFrequency, type AuditScaleType, type AuditStatus, type AuditTemplateType, type AuditorAssignMode,
  type EquipmentCriticality, type Priority, type TagCategory, type TagColor, type TagStatus,
} from '@lean/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const toBool = ({ value }: { value: unknown }) => value === 'true' || value === true;
const CODE = /^[A-Za-z0-9_-]{2,40}$/;

/* ------------------------------ Şablonlar ------------------------------ */

export class TemplateQuestionDto {
  @ApiProperty() @IsString() @MaxLength(1000) text: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) guidance?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) weight?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsInt() @Min(1) @Max(5) photoRequiredBelow?: number | null;
}

export class TemplateSectionDto {
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) weight?: number;
  @ApiProperty({ type: [TemplateQuestionDto] }) @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => TemplateQuestionDto) questions: TemplateQuestionDto[];
}

export class CreateTemplateDto {
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiProperty() @IsString() @Matches(CODE) code: string;
  @ApiPropertyOptional({ enum: AUDIT_TEMPLATE_TYPES }) @IsOptional() @IsIn(AUDIT_TEMPLATE_TYPES) type?: AuditTemplateType;
  @ApiPropertyOptional({ enum: AUDIT_AREA_TYPES }) @IsOptional() @IsIn(AUDIT_AREA_TYPES) areaType?: AuditAreaType;
  @ApiPropertyOptional({ enum: AUDIT_SCALE_TYPES }) @IsOptional() @IsIn(AUDIT_SCALE_TYPES) scaleType?: AuditScaleType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiProperty({ type: [TemplateSectionDto] }) @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => TemplateSectionDto) sections: TemplateSectionDto[];
}

export class UpdateTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional({ enum: AUDIT_TEMPLATE_TYPES }) @IsOptional() @IsIn(AUDIT_TEMPLATE_TYPES) type?: AuditTemplateType;
  @ApiPropertyOptional({ enum: AUDIT_AREA_TYPES }) @IsOptional() @IsIn(AUDIT_AREA_TYPES) areaType?: AuditAreaType;
  @ApiPropertyOptional({ enum: AUDIT_SCALE_TYPES }) @IsOptional() @IsIn(AUDIT_SCALE_TYPES) scaleType?: AuditScaleType;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional({ type: [TemplateSectionDto] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => TemplateSectionDto) sections?: TemplateSectionDto[];
}

export class BuiltinTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(CODE) code?: string;
}

export class TemplateQuery {
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() includeInactive?: boolean;
  @ApiPropertyOptional({ enum: AUDIT_TEMPLATE_TYPES }) @IsOptional() @IsIn(AUDIT_TEMPLATE_TYPES) type?: AuditTemplateType;
}

/* ------------------------------ Alan / ekipman ------------------------------ */

export class CreateAreaDto {
  @ApiProperty() @IsString() @Matches(CODE) code: string;
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiProperty() @IsString() orgUnitId: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() responsibleId?: string | null;
  @ApiPropertyOptional({ enum: AUDIT_AREA_TYPES }) @IsOptional() @IsIn(AUDIT_AREA_TYPES) areaType?: AuditAreaType;
}

export class UpdateAreaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(CODE) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() responsibleId?: string | null;
  @ApiPropertyOptional({ enum: AUDIT_AREA_TYPES }) @IsOptional() @IsIn(AUDIT_AREA_TYPES) areaType?: AuditAreaType;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AreaQuery {
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() includeInactive?: boolean;
}

export class CreateEquipmentDto {
  @ApiProperty() @IsString() @Matches(CODE) code: string;
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiProperty() @IsString() areaId: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional({ enum: EQUIPMENT_CRITICALITIES }) @IsOptional() @IsIn(EQUIPMENT_CRITICALITIES) criticality?: EquipmentCriticality;
}

export class UpdateEquipmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(CODE) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() areaId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional({ enum: EQUIPMENT_CRITICALITIES }) @IsOptional() @IsIn(EQUIPMENT_CRITICALITIES) criticality?: EquipmentCriticality;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EquipmentQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() areaId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() includeInactive?: boolean;
}

/* ------------------------------ Planlar ------------------------------ */

export class CreatePlanDto {
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiProperty() @IsString() templateId: string;
  @ApiPropertyOptional({ enum: AUDIT_PLAN_FREQUENCIES }) @IsOptional() @IsIn(AUDIT_PLAN_FREQUENCIES) frequency?: AuditPlanFrequency;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) areaIds: string[];
  @ApiPropertyOptional({ enum: AUDITOR_ASSIGN_MODES }) @IsOptional() @IsIn(AUDITOR_ASSIGN_MODES) assignMode?: AuditorAssignMode;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() fixedAuditorId?: string | null;
  @ApiPropertyOptional({ type: [String], description: 'Sıralı rotasyon denetçi listesi' }) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) auditorIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() crossAudit?: boolean;
  @ApiProperty() @IsDateString() startDate: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() endDate?: string | null;
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;
  @ApiPropertyOptional({ enum: AUDIT_PLAN_FREQUENCIES }) @IsOptional() @IsIn(AUDIT_PLAN_FREQUENCIES) frequency?: AuditPlanFrequency;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) areaIds?: string[];
  @ApiPropertyOptional({ enum: AUDITOR_ASSIGN_MODES }) @IsOptional() @IsIn(AUDITOR_ASSIGN_MODES) assignMode?: AuditorAssignMode;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() fixedAuditorId?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(100) @IsString({ each: true }) auditorIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() crossAudit?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class GenerateQuery {
  @ApiPropertyOptional({ description: 'Bu tarihi içeren döneme kadar üretir (varsayılan: bugünün dönemi)' }) @IsOptional() @IsDateString() until?: string;
}

/* ------------------------------ Denetimler ------------------------------ */

export const AUDIT_VIEWS = ['mine', 'all'] as const;

export class AuditQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: AUDIT_VIEWS, default: 'all' }) @IsOptional() @IsIn(AUDIT_VIEWS) view: 'mine' | 'all' = 'all';
  @ApiPropertyOptional({ enum: AUDIT_STATUSES }) @IsOptional() @IsIn(AUDIT_STATUSES) status?: AuditStatus;
  @ApiPropertyOptional({ description: 'Yalnız PLANNED + IN_PROGRESS' }) @IsOptional() @Transform(toBool) @IsBoolean() open?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() overdue?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() areaId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;
  @ApiPropertyOptional({ enum: AUDIT_TEMPLATE_TYPES }) @IsOptional() @IsIn(AUDIT_TEMPLATE_TYPES) templateType?: AuditTemplateType;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() auditorId?: string;
  @ApiPropertyOptional({ description: 'Termin başlangıcı' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ description: 'Termin bitişi' }) @IsOptional() @IsDateString() to?: string;
}

export class StatsQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() areaId?: string;
  @ApiPropertyOptional({ enum: AUDIT_TEMPLATE_TYPES }) @IsOptional() @IsIn(AUDIT_TEMPLATE_TYPES) templateType?: AuditTemplateType;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class CreateAuditDto {
  @ApiProperty() @IsString() templateId: string;
  @ApiProperty() @IsString() areaId: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() equipmentId?: string | null;
  @ApiPropertyOptional({ description: 'Yalnız audit.manage ile başkasına atanabilir' }) @IsOptional() @IsString() auditorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
}

export class UpdateAuditDto {
  @ApiPropertyOptional() @IsOptional() @IsString() auditorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(5000) notes?: string | null;
}

export class UpdateAnswerDto {
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsInt() @Min(0) @Max(5) score?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) comment?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isFinding?: boolean;
}

export class CancelAuditDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class CreateFindingActionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiPropertyOptional({ description: 'Varsayılan: alan sorumlusu' }) @IsOptional() @IsString() ownerId?: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
}

/* ------------------------------ TPM etiketleri ------------------------------ */

export const TAG_VIEWS = ['mine', 'all'] as const;

export class TagQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: TAG_VIEWS }) @IsOptional() @IsIn(TAG_VIEWS) view?: 'mine' | 'all';
  @ApiPropertyOptional({ enum: TAG_STATUSES }) @IsOptional() @IsIn(TAG_STATUSES) status?: TagStatus;
  @ApiPropertyOptional({ description: 'Yalnız OPEN + IN_PROGRESS' }) @IsOptional() @Transform(toBool) @IsBoolean() open?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() overdue?: boolean;
  @ApiPropertyOptional({ enum: TAG_COLORS }) @IsOptional() @IsIn(TAG_COLORS) color?: TagColor;
  @ApiPropertyOptional({ enum: TAG_CATEGORIES }) @IsOptional() @IsIn(TAG_CATEGORIES) category?: TagCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() areaId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() equipmentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() assignedToId?: string;
}

export class CreateTagDto {
  @ApiProperty() @IsString() areaId: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() equipmentId?: string | null;
  @ApiProperty({ enum: TAG_COLORS }) @IsIn(TAG_COLORS) color: TagColor;
  @ApiProperty({ enum: TAG_CATEGORIES }) @IsIn(TAG_CATEGORIES) category: TagCategory;
  @ApiProperty() @IsString() @MaxLength(2000) description: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() assignedToId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() dueDate?: string | null;
}

export class UpdateTagDto {
  @ApiPropertyOptional({ enum: TAG_COLORS }) @IsOptional() @IsIn(TAG_COLORS) color?: TagColor;
  @ApiPropertyOptional({ enum: TAG_CATEGORIES }) @IsOptional() @IsIn(TAG_CATEGORIES) category?: TagCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() assignedToId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() dueDate?: string | null;
}

export class CloseTagDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) closeNote?: string;
}
