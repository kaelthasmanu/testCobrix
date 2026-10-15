import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/** `?page=1&pageSize=20`. Las tablas del panel nunca piden más de 100 filas por vez. */
export class PageQueryDto {
	@ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number
	@ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PAGE_SIZE) pageSize?: number
}

export interface Page<T> {
	readonly items: T[]
	readonly total: number
	readonly page: number
	readonly pageSize: number
	readonly pageCount: number
}

export function pageWindow(query: PageQueryDto): { page: number; pageSize: number; skip: number } {
	const page = query.page ?? 1
	const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE
	return { page, pageSize, skip: (page - 1) * pageSize }
}

export function toPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
	return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }
}
