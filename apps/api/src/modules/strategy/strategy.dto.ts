import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CATCHBALL_SIDES, CATCHBALL_TYPES, CORRELATION_ROLES, CORRELATION_STRENGTHS, CORRELATION_TARGET_TYPES, HOSHIN_DIRECTIONS,
  HOSHIN_LEVELS, KPI_AGGREGATIONS, STRATEGY_PERSPECTIVES, SWOT_TYPES,
  type CatchballSide, type CatchballType, type CorrelationRole, type CorrelationStrength, type CorrelationTargetType,
  type HoshinDirection, type HoshinLevel, type KpiAggregation, type StrategyPerspective, type SwotType,
} from '@lean/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const bool = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);

/* ------------------------------ Strateji ------------------------------ */

export class CreatePlanDto {
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(2000) @Max(2200) startYear: number;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(2000) @Max(2200) endYear: number;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(4000) vision?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(4000) mission?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) values?: string[];
}

export class UpdatePlanDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2200) startYear?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2200) endYear?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(4000) vision?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(4000) mission?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) values?: string[];
}

export class SwotDto {
  @ApiProperty({ enum: SWOT_TYPES }) @IsIn(SWOT_TYPES) type: SwotType;
  @ApiProperty() @IsString() @MaxLength(1000) text: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) impact?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateSwotDto {
  @ApiPropertyOptional({ enum: SWOT_TYPES }) @IsOptional() @IsIn(SWOT_TYPES) type?: SwotType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) text?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) impact?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class ObjectiveDto {
  @ApiPropertyOptional({ description: 'Boşsa SA1, SA2... otomatik' }) @IsOptional() @Transform(emptyToNull) @IsString() @Matches(/^[A-Za-z0-9_.-]{1,20}$/) code?: string;
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) description?: string | null;
  @ApiPropertyOptional({ enum: STRATEGY_PERSPECTIVES }) @IsOptional() @Transform(emptyToNull) @IsIn(STRATEGY_PERSPECTIVES) perspective?: StrategyPerspective | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() ownerId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateObjectiveDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_.-]{1,20}$/) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) title?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) description?: string | null;
  @ApiPropertyOptional({ enum: STRATEGY_PERSPECTIVES }) @IsOptional() @Transform(emptyToNull) @IsIn(STRATEGY_PERSPECTIVES) perspective?: StrategyPerspective | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() ownerId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

/* ------------------------------ Hoshin ------------------------------ */

export class PlanYearQuery {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2200) year?: number;
}

export class GoalListQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() planId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() year?: number;
  @ApiPropertyOptional({ enum: HOSHIN_LEVELS }) @IsOptional() @IsIn(HOSHIN_LEVELS) level?: HoshinLevel;
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() mine?: boolean;
}

export class BowlingQuery {
  @ApiPropertyOptional({ description: 'Boşsa aktif plan' }) @IsOptional() @IsString() planId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2200) year?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional({ description: 'Hedef ve alt ağacı' }) @IsOptional() @IsString() goalId?: string;
  @ApiPropertyOptional({ enum: HOSHIN_LEVELS }) @IsOptional() @IsIn(HOSHIN_LEVELS) level?: HoshinLevel;
  @ApiPropertyOptional({ description: 'Yalnız ölçümü olanlar' }) @IsOptional() @Transform(bool) @IsBoolean() measuredOnly?: boolean;
}

export class DrilldownQuery extends PlanYearQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
}

export class OffTargetQuery {
  @ApiProperty({ example: '2026-05' }) @IsString() @Matches(/^\d{4}-\d{2}$/) period: string;
}

export class CreateGoalDto {
  @ApiProperty() @IsString() planId: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() parentId?: string | null;
  @ApiProperty({ enum: HOSHIN_LEVELS }) @IsIn(HOSHIN_LEVELS) level: HoshinLevel;
  @ApiPropertyOptional({ description: 'Boşsa otomatik (AH1, YH1...)' }) @IsOptional() @Transform(emptyToNull) @IsString() @Matches(/^[A-Za-z0-9_.-]{1,30}$/) code?: string;
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(4000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsInt() @Min(2000) @Max(2200) year?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() objectiveId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() ownerId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() kpiId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() baseline?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() targetValue?: number | null;
  @ApiPropertyOptional({ enum: HOSHIN_DIRECTIONS }) @IsOptional() @IsIn(HOSHIN_DIRECTIONS) direction?: HoshinDirection;
  @ApiPropertyOptional({ enum: KPI_AGGREGATIONS }) @IsOptional() @IsIn(KPI_AGGREGATIONS) aggregation?: KpiAggregation;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1000) weight?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() startDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @ApiPropertyOptional({ description: 'Oluşturulunca catchball öner (PROPOSED)' }) @IsOptional() @Transform(bool) @IsBoolean() propose?: boolean;
}

export class UpdateGoalDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[A-Za-z0-9_.-]{1,30}$/) code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) title?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(4000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsInt() @Min(2000) @Max(2200) year?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() objectiveId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() ownerId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() kpiId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() baseline?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() targetValue?: number | null;
  @ApiPropertyOptional({ enum: HOSHIN_DIRECTIONS }) @IsOptional() @IsIn(HOSHIN_DIRECTIONS) direction?: HoshinDirection;
  @ApiPropertyOptional({ enum: KPI_AGGREGATIONS }) @IsOptional() @IsIn(KPI_AGGREGATIONS) aggregation?: KpiAggregation;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1000) weight?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() startDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() endDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class GoalStatusDto {
  @ApiProperty({ enum: ['COMPLETED', 'CANCELLED', 'ACTIVE'] }) @IsIn(['COMPLETED', 'CANCELLED', 'ACTIVE']) status: 'COMPLETED' | 'CANCELLED' | 'ACTIVE';
}

export class CatchballDto {
  @ApiProperty({ enum: CATCHBALL_TYPES }) @IsIn(CATCHBALL_TYPES) type: CatchballType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() proposedTarget?: number | null;
  @ApiPropertyOptional({ enum: CATCHBALL_SIDES, description: 'Her iki tarafta da yetkili kullanıcılar için açık seçim' }) @IsOptional() @IsIn(CATCHBALL_SIDES) side?: CatchballSide;
}

export class MonthItemDto {
  @ApiProperty({ example: 5 }) @Type(() => Number) @IsInt() @Min(1) @Max(12) month: number;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() plan?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @Type(() => Number) @IsNumber() actual?: number | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) comment?: string | null;
}

export class SetMonthlyDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(2000) @Max(2200) year: number;
  @ApiProperty({ type: [MonthItemDto] }) @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => MonthItemDto) months: MonthItemDto[];
}

export class CountermeasureDto {
  @ApiProperty({ example: '2026-05' }) @IsString() @Matches(/^\d{4}-\d{2}$/) period: string;
  @ApiPropertyOptional({ description: 'Hedef altı açıklaması (aylık kayıttaki yorum)' }) @IsOptional() @IsString() @MaxLength(2000) explanation?: string;
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @ApiProperty() @IsString() ownerId: string;
  @ApiProperty() @IsDateString() dueDate: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export class CorrelationItemDto {
  @ApiProperty() @IsString() fromGoalId: string;
  @ApiProperty({ enum: CORRELATION_TARGET_TYPES }) @IsIn(CORRELATION_TARGET_TYPES) targetType: CorrelationTargetType;
  @ApiProperty() @IsString() targetId: string;
  @ApiProperty({ enum: CORRELATION_STRENGTHS }) @IsIn(CORRELATION_STRENGTHS) strength: CorrelationStrength;
  @ApiPropertyOptional({ enum: CORRELATION_ROLES }) @IsOptional() @IsIn(CORRELATION_ROLES) role?: CorrelationRole;
}

export class SetCorrelationsDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(2000) @Max(2200) year: number;
  @ApiProperty({ type: [CorrelationItemDto] }) @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => CorrelationItemDto) items: CorrelationItemDto[];
}
