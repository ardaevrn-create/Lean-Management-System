import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORG_UNIT_TYPES, type OrgUnitType } from '@lean/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

const toBool = ({ value }: { value: unknown }) => (value === undefined ? undefined : value === true || value === 'true');
const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class CreateOrgUnitDto {
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(50) code?: string | null;
  @ApiProperty({ enum: ORG_UNIT_TYPES }) @IsIn(ORG_UNIT_TYPES) type: OrgUnitType;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() managerEmployeeId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateOrgUnitDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(50) code?: string | null;
  @ApiPropertyOptional({ enum: ORG_UNIT_TYPES }) @IsOptional() @IsIn(ORG_UNIT_TYPES) type?: OrgUnitType;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() managerEmployeeId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class EmployeeQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() orgUnitId?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() includeSubUnits?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean() withoutUser?: boolean;
}

export class CreateEmployeeDto {
  @ApiProperty() @IsString() @MaxLength(50) employeeNo: string;
  @ApiProperty() @IsString() @MaxLength(100) firstName: string;
  @ApiProperty() @IsString() @MaxLength(100) lastName: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() title?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsEmail() email?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() phone?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() hireDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() managerId?: string | null;
  @ApiPropertyOptional({ description: 'Kullanıcı hesabı da oluştur' }) @IsOptional() @IsBoolean() createUser?: boolean;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) employeeNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() title?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsEmail() email?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() phone?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsDateString() hireDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() managerId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export const TEAM_TYPES = ['COMMITTEE', 'KAIZEN_TEAM', 'FIVE_S_TEAM', 'HOSHIN_TEAM', 'OTHER'] as const;

export class TeamMemberDto {
  @ApiProperty() @IsString() employeeId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string | null;
}

export class SaveTeamDto {
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiProperty({ enum: TEAM_TYPES }) @IsIn(TEAM_TYPES) type: (typeof TEAM_TYPES)[number];
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiProperty({ type: [TeamMemberDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => TeamMemberDto) members: TeamMemberDto[];
}
