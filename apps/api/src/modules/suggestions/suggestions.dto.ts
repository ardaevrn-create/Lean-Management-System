import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  KAIZEN_GAIN_METRICS, KAIZEN_GAIN_TYPES, KAIZEN_STATUSES, KAIZEN_TYPES, PRE_EVALUATION_MODES, PRIORITIES, SUGGESTION_CATEGORIES,
  SUGGESTION_STATUSES, type KaizenGainMetric, type KaizenGainType, type KaizenStatus, type KaizenType, type PreEvaluationMode, type Priority,
  type SuggestionCategory, type SuggestionStatus,
} from '@lean/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const toBool = ({ value }: { value: unknown }) => value === 'true' || value === true;

/* ------------------------------ Ayarlar ------------------------------ */

export class CriterionDto {
  @ApiProperty() @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_]{0,30}$/) key: string;
  @ApiProperty() @IsString() @MaxLength(100) label: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.1) @Max(1000) weight: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1) @Max(100) max: number;
}

export class AcceptanceBandDto {
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) @Max(100) minScore: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(100000) points: number;
}

export class PointRulesDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(100000) submission: number;
  @ApiProperty({ type: [AcceptanceBandDto] }) @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => AcceptanceBandDto) acceptanceBands: AcceptanceBandDto[];
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(100000) implementation: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) @Max(100000) kaizenPublished: number;
}

export class RewardTierDto {
  @ApiProperty() @IsString() @MaxLength(60) name: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) minPoints: number;
}

export class UpdateSettingsDto {
  @ApiProperty({ type: [CriterionDto] }) @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CriterionDto) criteria: CriterionDto[];
  @ApiProperty({ enum: PRE_EVALUATION_MODES }) @IsIn(PRE_EVALUATION_MODES) preEvaluation: PreEvaluationMode;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() committeeTeamId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() @Min(0) @Max(100) autoAcceptMinScore?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() @Min(0) autoAcceptMaxCost?: number | null;
  @ApiProperty() @ValidateNested() @Type(() => PointRulesDto) pointRules: PointRulesDto;
  @ApiProperty({ type: [RewardTierDto] }) @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => RewardTierDto) rewardTiers: RewardTierDto[];
}

/* ------------------------------ Öneriler ------------------------------ */

export const SUGGESTION_VIEWS = ['mine', 'queue', 'all'] as const;
export type SuggestionView = (typeof SUGGESTION_VIEWS)[number];

export class SuggestionQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: SUGGESTION_VIEWS, default: 'mine' }) @IsOptional() @IsIn(SUGGESTION_VIEWS) view: SuggestionView = 'mine';
  @ApiPropertyOptional({ enum: ['PRE', 'COMMITTEE'] }) @IsOptional() @IsIn(['PRE', 'COMMITTEE']) stage?: 'PRE' | 'COMMITTEE';
  @ApiPropertyOptional({ enum: SUGGESTION_STATUSES }) @IsOptional() @IsIn(SUGGESTION_STATUSES) status?: SuggestionStatus;
  @ApiPropertyOptional({ enum: SUGGESTION_CATEGORIES }) @IsOptional() @IsIn(SUGGESTION_CATEGORIES) category?: SuggestionCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() submittedById?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class StatsQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
}

export class CreateSuggestionDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(5000) currentState: string;
  @ApiProperty() @IsString() @MaxLength(5000) proposedState: string;
  @ApiProperty() @IsString() @MaxLength(5000) expectedBenefit: string;
  @ApiPropertyOptional({ enum: SUGGESTION_CATEGORIES }) @IsOptional() @IsIn(SUGGESTION_CATEGORIES) category?: SuggestionCategory;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() @Min(0) estimatedCost?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() @Min(0) estimatedSaving?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() selfImplementable?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) coSubmitterIds?: string[];
}

export class UpdateSuggestionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) currentState?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) proposedState?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) expectedBenefit?: string;
  @ApiPropertyOptional({ enum: SUGGESTION_CATEGORIES }) @IsOptional() @IsIn(SUGGESTION_CATEGORIES) category?: SuggestionCategory;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() @Min(0) estimatedCost?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() @Min(0) estimatedSaving?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() selfImplementable?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) coSubmitterIds?: string[];
}

export class EvaluateDto {
  @ApiProperty({ description: '{ kriterKey: puan }' }) @IsObject() scores: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) comment?: string;
  @ApiPropertyOptional({ enum: ['FORWARD', 'ACCEPT', 'REJECT', 'REVISE', 'HOLD'] }) @IsOptional() @IsIn(['FORWARD', 'ACCEPT', 'REJECT', 'REVISE', 'HOLD']) decision?: 'FORWARD' | 'ACCEPT' | 'REJECT' | 'REVISE' | 'HOLD';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) reason?: string;
}

export class DecisionDto {
  @ApiProperty({ enum: ['ACCEPT', 'REJECT', 'HOLD'] }) @IsIn(['ACCEPT', 'REJECT', 'HOLD']) decision: 'ACCEPT' | 'REJECT' | 'HOLD';
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) note?: string;
}

export class AssignImplementerDto {
  @ApiProperty() @IsString() implementerId: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() targetDate?: string | null;
}

export class SuggestionActionDto {
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiProperty() @IsString() ownerId: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
}

export class ImplementedDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) note?: string;
}

export class SuggestionOfMonthDto {
  @ApiProperty() @IsBoolean() value: boolean;
  @ApiPropertyOptional({ example: '2026-10' }) @IsOptional() @Matches(/^\d{4}-\d{2}$/) month?: string;
}

export class PointsQuery {
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

/* ------------------------------ Kaizen ------------------------------ */

export const KAIZEN_VIEWS = ['mine', 'approval', 'all', 'library'] as const;
export type KaizenView = (typeof KAIZEN_VIEWS)[number];

export class KaizenQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: KAIZEN_VIEWS, default: 'mine' }) @IsOptional() @IsIn(KAIZEN_VIEWS) view: KaizenView = 'mine';
  @ApiPropertyOptional({ enum: KAIZEN_TYPES }) @IsOptional() @IsIn(KAIZEN_TYPES) type?: KaizenType;
  @ApiPropertyOptional({ enum: KAIZEN_STATUSES }) @IsOptional() @IsIn(KAIZEN_STATUSES) status?: KaizenStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
}

export class GainDto {
  @ApiProperty({ enum: KAIZEN_GAIN_TYPES }) @IsIn(KAIZEN_GAIN_TYPES) type: KaizenGainType;
  @ApiPropertyOptional({ enum: KAIZEN_GAIN_METRICS }) @IsOptional() @IsIn(KAIZEN_GAIN_METRICS) metric?: KaizenGainMetric;
  @ApiProperty() @IsString() @MaxLength(500) description: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() beforeValue?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() afterValue?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() annualSaving?: number | null;
}

export class UpdateGainDto {
  @ApiPropertyOptional({ enum: KAIZEN_GAIN_TYPES }) @IsOptional() @IsIn(KAIZEN_GAIN_TYPES) type?: KaizenGainType;
  @ApiPropertyOptional({ enum: KAIZEN_GAIN_METRICS }) @IsOptional() @IsIn(KAIZEN_GAIN_METRICS) metric?: KaizenGainMetric;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() beforeValue?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() afterValue?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() annualSaving?: number | null;
}

export class FinanceApproveDto {
  @ApiProperty() @IsBoolean() approved: boolean;
}

export class CreateKaizenDto {
  @ApiProperty({ enum: KAIZEN_TYPES }) @IsIn(KAIZEN_TYPES) type: KaizenType;
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(5000) problem: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) rootCause?: string;
  @ApiProperty() @IsString() @MaxLength(5000) beforeDescription: string;
  @ApiProperty() @IsString() @MaxLength(5000) afterDescription: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() leaderId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) memberIds?: string[];
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() startDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() suggestionId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) standardization?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) horizontalDeployment?: string;
  @ApiPropertyOptional({ type: [GainDto] }) @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => GainDto) gains?: GainDto[];
}

export class UpdateKaizenDto {
  @ApiPropertyOptional({ enum: KAIZEN_TYPES }) @IsOptional() @IsIn(KAIZEN_TYPES) type?: KaizenType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) problem?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(5000) rootCause?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) beforeDescription?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) afterDescription?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() leaderId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) memberIds?: string[];
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() startDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(3000) standardization?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(3000) horizontalDeployment?: string | null;
}

export class ConvertToKaizenDto {
  @ApiPropertyOptional({ enum: KAIZEN_TYPES }) @IsOptional() @IsIn(KAIZEN_TYPES) type?: KaizenType;
}

export class KaizenDecisionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) reason?: string;
  /** Onayla ve doğrudan yayınla */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() publish?: boolean;
}

export class KaizenQueryBool {
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() mine?: boolean;
}
