import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { Paginated } from '@lean/shared';

export class PageQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500)
  pageSize = 20;

  @ApiPropertyOptional({ description: 'Arama metni' })
  @IsOptional() @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'alan:asc|desc' })
  @IsOptional() @IsString()
  sort?: string;
}

export function pageArgs(query: PageQueryDto) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/** "alan:yön" ifadesini izin verilen alanlarla Prisma orderBy'a çevirir. */
export function parseSort<T extends string>(
  sort: string | undefined,
  allowed: readonly T[],
  fallback: Record<string, 'asc' | 'desc'>,
): Record<string, 'asc' | 'desc'> {
  if (!sort) return fallback;
  const [field, dir] = sort.split(':');
  if (!allowed.includes(field as T)) return fallback;
  return { [field]: dir === 'asc' ? 'asc' : 'desc' };
}

export function paginated<T>(items: T[], total: number, query: PageQueryDto): Paginated<T> {
  return { items, total, page: query.page, pageSize: query.pageSize };
}
