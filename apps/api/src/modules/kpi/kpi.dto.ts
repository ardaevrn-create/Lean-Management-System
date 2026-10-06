import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  KPI_AGGREGATIONS, KPI_CATEGORIES, KPI_DIRECTIONS, KPI_FREQUENCIES,
  type KpiAggregation, type KpiCategory, type KpiDirection, type KpiFrequency,
} from '@lean/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const bool = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);

export class KpiListQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional({ enum: KPI_CATEGORIES }) @IsOptional() @IsIn(KPI_CATEGORIES) category?: KpiCategory;
  @ApiPropertyOptional({ enum: KPI_FREQUENCIES }) @IsOptional() @IsIn(KPI_FREQUENCIES) frequency?: KpiFrequency;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerId?: string;
  @ApiPropertyOptional({ description: 'Sahibi veya veri giriş sorumlusu olduğum KPI\'lar' }) @IsOptional() @Transform(bool) @IsBoolean() mine?: boolean;
  @ApiPropertyOptional({ description: 'Verilmezse yalnız aktifler' }) @IsOptional() @Transform(bool) @IsBoolean() isActive?: boolean;
}

export class CreateKpiDto {
  @ApiProperty() @IsString() @Matches(/^[A-Za-z0-9_.-]{2,40}$/, { message: 'code must be 2-40 chars: letters, digits, _ . -' }) code: string;
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) description?: string | null;
  @ApiPropertyOptional({ enum: KPI_CATEGORIES }) @IsOptional() @IsIn(KPI_CATEGORIES) category?: KpiCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(6) decimals?: number;
  @ApiPropertyOptional({ enum: KPI_DIRECTIONS }) @IsOptional() @IsIn(KPI_DIRECTIONS) direction?: KpiDirection;
  @ApiProperty({ enum: KPI_FREQUENCIES }) @IsIn(KPI_FREQUENCIES) frequency: KpiFrequency;
  @ApiPropertyOptional({ enum: KPI_AGGREGATIONS }) @IsOptional() @IsIn(KPI_AGGREGATIONS) aggregation?: KpiAggregation;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1000) warningTolerancePct?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(90) entryDueDays?: number;
  @ApiProperty() @IsString() orgUnitId: string;
  @ApiProperty() @IsString() ownerId: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() dataEntryUserId?: string | null;
  @ApiPropertyOptional({ example: '({SCRAP_QTY} / {PROD_QTY}) * 100' }) @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(500) formula?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() startPeriod?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() isActive?: boolean;
}

export class UpdateKpiDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) description?: string | null;
  @ApiPropertyOptional({ enum: KPI_CATEGORIES }) @IsOptional() @IsIn(KPI_CATEGORIES) category?: KpiCategory;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(6) decimals?: number;
  @ApiPropertyOptional({ enum: KPI_DIRECTIONS }) @IsOptional() @IsIn(KPI_DIRECTIONS) direction?: KpiDirection;
  @ApiPropertyOptional({ enum: KPI_FREQUENCIES }) @IsOptional() @IsIn(KPI_FREQUENCIES) frequency?: KpiFrequency;
  @ApiPropertyOptional({ enum: KPI_AGGREGATIONS }) @IsOptional() @IsIn(KPI_AGGREGATIONS) aggregation?: KpiAggregation;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(1000) warningTolerancePct?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(90) entryDueDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() dataEntryUserId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(500) formula?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() startPeriod?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(bool) @IsBoolean() isActive?: boolean;
}

export class PeriodRangeQuery {
  @ApiPropertyOptional({ description: 'Dönem anahtarı (KPI sıklığında)' }) @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
}

export class TargetInputDto {
  @ApiProperty() @IsString() period: string;
  @ApiProperty({ nullable: true, description: 'null = hedefi sil' }) @Type(() => Number) @IsOptional() @IsNumber() target: number | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() targetMax?: number | null;
}

export class SetTargetsDto {
  @ApiProperty({ type: [TargetInputDto] }) @IsArray() @ArrayMaxSize(400) @ValidateNested({ each: true }) @Type(() => TargetInputDto) targets: TargetInputDto[];
}

export class SetValueDto {
  @ApiProperty() @IsString() kpiId: string;
  @ApiProperty() @IsString() period: string;
  @ApiProperty() @Type(() => Number) @IsNumber() value: number;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(1000) note?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class BulkValueItemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() kpiCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kpiId?: string;
  @ApiProperty() @IsString() period: string;
  @ApiProperty() @Type(() => Number) @IsNumber() value: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class BulkValuesDto {
  @ApiProperty({ type: [BulkValueItemDto] }) @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => BulkValueItemDto) items: BulkValueItemDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class EntryQuery {
  @ApiPropertyOptional({ description: 'Referans dönem/tarih anahtarı; her KPI için bu referansta biten son dönem' }) @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional({ enum: KPI_FREQUENCIES }) @IsOptional() @IsIn(KPI_FREQUENCIES) frequency?: KpiFrequency;
}

export class DateRangeQuery {
  @ApiPropertyOptional({ description: 'Son giriş tarihi >= (YYYY-MM-DD)' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ description: 'Son giriş tarihi <= (YYYY-MM-DD)' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
}

export class ComplianceExportQuery extends DateRangeQuery {
  @ApiPropertyOptional({ enum: ['orgUnit', 'person'] }) @IsOptional() @IsIn(['orgUnit', 'person']) by?: 'orgUnit' | 'person';
}

export class DeviationListQuery {
  @ApiPropertyOptional({ enum: ['required', 'pending', 'all'] }) @IsOptional() @IsIn(['required', 'pending', 'all']) state?: 'required' | 'pending' | 'all';
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
}

export class DeviationByPeriodQuery {
  @ApiProperty() @IsString() kpiId: string;
  @ApiProperty() @IsString() period: string;
}

export class SaveDeviationDto {
  @ApiProperty() @IsString() kpiId: string;
  @ApiProperty() @IsString() period: string;
  @ApiProperty() @IsString() @MaxLength(5000) explanation: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(5000) rootCause?: string | null;
}

export class DeviationActionDto {
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiProperty() @IsString() ownerId: string;
  @ApiProperty({ example: '2026-12-31' }) @IsDateString() dueDate: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) supporterIds?: string[];
}

export class DecideDeviationDto {
  @ApiProperty() @IsBoolean() approve: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class BoardQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional({ description: 'Referans dönem/tarih; boşsa bugün' }) @IsOptional() @IsString() period?: string;
  @ApiPropertyOptional({ description: 'Alt birimler dahil mi (varsayılan evet)' }) @IsOptional() @Transform(bool) @IsBoolean() includeSub?: boolean;
}

export class FeedQuery extends DateRangeQuery {}

export class RevisionQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() period?: string;
}
