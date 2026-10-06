import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALL_PERMISSIONS } from '@lean/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class UserQuery extends PageQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() isActive?: boolean;
}

export class CreateUserDto {
  @ApiProperty() @IsString() @Matches(/^[a-zA-Z0-9._@-]{2,100}$/) username: string;
  @ApiProperty() @IsString() @MaxLength(200) fullName: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsEmail() email?: string | null;
  @ApiPropertyOptional({ description: 'Boşsa geçici şifre üretilir' }) @IsOptional() @IsString() @MinLength(8) password?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() employeeId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) roleIds?: string[];
}

export class UpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) fullName?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsEmail() email?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsIn(['tr', 'en']) locale?: string;
}

export class RoleAssignmentDto {
  @ApiProperty() @IsString() roleId: string;
  @ApiPropertyOptional() @IsOptional() @Transform(emptyToNull) @IsString() orgUnitId?: string | null;
}

export class SetRolesDto {
  @ApiProperty({ type: [RoleAssignmentDto] })
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => RoleAssignmentDto)
  assignments: RoleAssignmentDto[];
}

export class BulkFromEmployeesDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(5000) @IsString({ each: true }) employeeIds: string[];
}

export class SaveRoleDto {
  @ApiProperty() @IsString() @Matches(/^[A-Z0-9_]{2,50}$/) code: string;
  @ApiProperty() @IsString() @MaxLength(100) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string | null;
  @ApiProperty({ type: [String] }) @IsArray() @IsIn(ALL_PERMISSIONS, { each: true }) permissions: string[];
}

export class LookupQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() q?: string;
}
