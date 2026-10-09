import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ACTION_SOURCE_TYPES, ACTION_STATUSES, PRIORITIES, type ActionSourceType, type ActionStatus, type Priority } from '@lean/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

const csv = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value);
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export const ACTION_VIEWS = ['mine', 'team', 'created', 'all'] as const;
export type ActionView = (typeof ACTION_VIEWS)[number];

export class ActionQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: ACTION_VIEWS, default: 'mine' }) @IsOptional() @IsIn(ACTION_VIEWS) view: ActionView = 'mine';
  @ApiPropertyOptional({ description: 'Virgülle ayrılmış durumlar' }) @IsOptional() @Transform(csv) @IsIn(ACTION_STATUSES, { each: true }) status?: ActionStatus[];
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() overdue?: boolean;
  @ApiPropertyOptional({ enum: ACTION_SOURCE_TYPES }) @IsOptional() @IsIn(ACTION_SOURCE_TYPES) sourceType?: ActionSourceType;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
}

export class CreateActionDto {
  @ApiProperty() @IsString() @MaxLength(300) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @ApiProperty() @IsString() ownerId: string;
  @ApiProperty({ example: '2026-12-31' }) @IsDateString() dueDate: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() startDate?: string;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) supporterIds?: string[];
  @ApiPropertyOptional({ enum: ACTION_SOURCE_TYPES }) @IsOptional() @IsIn(ACTION_SOURCE_TYPES) sourceType?: ActionSourceType;
  @ApiPropertyOptional() @IsOptional() @IsString() sourceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) sourceLabel?: string;
}

export class UpdateActionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() ownerId?: string;
  @ApiPropertyOptional({ enum: PRIORITIES }) @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) progress?: number;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) supporterIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() startDate?: string | null;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: ACTION_STATUSES }) @IsIn(ACTION_STATUSES) status: ActionStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class CommentDto {
  @ApiProperty() @IsString() @MaxLength(5000) body: string;
}

export class DueDateRequestDto {
  @ApiProperty() @IsDateString() newDueDate: string;
  @ApiProperty() @IsString() @MaxLength(2000) reason: string;
}

export class DecideDto {
  @ApiProperty() @IsBoolean() approve: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}
