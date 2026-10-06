import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PRIORITIES, PROBLEM_ACTION_KINDS, PROBLEM_CAUSE_CATEGORIES, PROBLEM_METHODS, PROBLEM_PHASES, PROBLEM_SEVERITIES, PROBLEM_SOURCES,
  PROBLEM_VERIFICATION_RESULTS,
  type Priority, type ProblemActionKind, type ProblemCauseCategory, type ProblemMethod, type ProblemPhase, type ProblemSeverity,
  type ProblemSource, type ProblemVerificationResult,
} from '@lean/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

const csv = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value);
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const toBool = ({ value }: { value: unknown }) => value === 'true' || value === true;

export const PROBLEM_VIEWS = ['mine', 'all'] as const;
export type ProblemView = (typeof PROBLEM_VIEWS)[number];

export class ProblemQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: PROBLEM_VIEWS, default: 'mine' }) @IsOptional() @IsIn(PROBLEM_VIEWS) view: ProblemView = 'mine';
  @ApiPropertyOptional({ description: 'Virgülle ayrılmış fazlar' }) @IsOptional() @Transform(csv) @IsIn(PROBLEM_PHASES, { each: true }) phase?: ProblemPhase[];
  @ApiPropertyOptional({ enum: PROBLEM_SOURCES }) @IsOptional() @IsIn(PROBLEM_SOURCES) source?: ProblemSource;
  @ApiPropertyOptional({ enum: PROBLEM_SEVERITIES }) @IsOptional() @IsIn(PROBLEM_SEVERITIES) severity?: ProblemSeverity;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() overdue?: boolean;
  /** true: yalnız açık (kapanmamış / iptal edilmemiş) problemler */
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() open?: boolean;
}

export class StatsQuery {
  @ApiPropertyOptional({ enum: PROBLEM_VIEWS, default: 'all' }) @IsOptional() @IsIn(PROBLEM_VIEWS) view: ProblemView = 'all';
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
}

export class CreateProblemDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  /** Boşsa bildirenin personel kartındaki birim kullanılır */
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string;
  @ApiPropertyOptional({ enum: PROBLEM_SEVERITIES }) @IsOptional() @IsIn(PROBLEM_SEVERITIES) severity?: ProblemSeverity;
  @ApiPropertyOptional({ enum: PROBLEM_SOURCES }) @IsOptional() @IsIn(PROBLEM_SOURCES) source?: ProblemSource;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) sourceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) sourceLabel?: string;
}

export class UpdateProblemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(3) @MaxLength(300) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @ApiPropertyOptional({ enum: PROBLEM_SEVERITIES }) @IsOptional() @IsIn(PROBLEM_SEVERITIES) severity?: ProblemSeverity;
  @ApiPropertyOptional({ enum: PROBLEM_METHODS }) @IsOptional() @IsIn(PROBLEM_METHODS) method?: ProblemMethod;
  @ApiPropertyOptional({ enum: PROBLEM_SOURCES }) @IsOptional() @IsIn(PROBLEM_SOURCES) source?: ProblemSource;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) what?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) whereText?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() occurredAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) who?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) how?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) howMuch?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) isNot?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) customerName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) customerRef?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() @Min(0) costImpact?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) containment?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() containmentNotNeeded?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) containmentSkipReason?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() targetCloseDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() verificationDate?: string | null;
}

export class MemberDto {
  @ApiProperty() @IsString() userId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) role?: string;
}

export class SetTeamDto {
  @ApiProperty({ type: [MemberDto] }) @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => MemberDto) members: MemberDto[];
}

export class CreateCauseDto {
  @ApiProperty({ enum: PROBLEM_CAUSE_CATEGORIES }) @IsIn(PROBLEM_CAUSE_CATEGORIES) category: ProblemCauseCategory;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(500) text: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() parentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCandidate?: boolean;
}

export class UpdateCauseDto {
  @ApiPropertyOptional({ enum: PROBLEM_CAUSE_CATEGORIES }) @IsOptional() @IsIn(PROBLEM_CAUSE_CATEGORIES) category?: ProblemCauseCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(500) text?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCandidate?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
}

export class CreateWhyChainDto {
  @ApiProperty() @IsString() causeId: string;
}

export class UpdateWhyChainDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) rootCause?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() confirmed?: boolean;
}

export class WhyStepDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) question?: string | null;
  @ApiProperty() @IsString() @MaxLength(1000) answer: string;
}

export class SetWhyStepsDto {
  @ApiProperty({ type: [WhyStepDto], description: 'Sıralı tam liste (sıra dizideki konumdur)' })
  @IsArray() @ArrayMaxSize(15) @ValidateNested({ each: true }) @Type(() => WhyStepDto) steps: WhyStepDto[];
}

export class CreateProblemActionDto {
  @ApiProperty({ enum: PROBLEM_ACTION_KINDS }) @IsIn(PROBLEM_ACTION_KINDS) kind: ProblemActionKind;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() rootCauseChainId?: string | null;
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiProperty() @IsString() ownerId: string;
  @ApiProperty({ example: '2026-12-31' }) @IsDateString() dueDate: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() startDate?: string;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  /** Yatay yaygınlaştırmada hedef birim; diğer türlerde problem birimi kullanılır */
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) supporterIds?: string[];
}

export class HorizontalDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) orgUnitIds: string[];
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiProperty() @IsDateString() dueDate: string;
  /** Birimin yöneticisi bulunamazsa kullanılacak sorumlu */
  @ApiProperty() @IsString() ownerId: string;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() rootCauseChainId?: string | null;
}

export class PhaseDto {
  @ApiProperty({ enum: PROBLEM_PHASES }) @IsIn(PROBLEM_PHASES) to: ProblemPhase;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class CreateVerificationDto {
  @ApiProperty({ enum: PROBLEM_VERIFICATION_RESULTS }) @IsIn(PROBLEM_VERIFICATION_RESULTS) result: ProblemVerificationResult;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(3000) note?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() plannedDate?: string | null;
}

export class CancelProblemDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(2000) reason: string;
}
