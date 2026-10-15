import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBooleanString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { PageQueryDto } from '../common/pagination'

export class SyncQueryDto {
	@ApiPropertyOptional({ enum: ['true', 'false'], description: 'Si es true, calcula todo sin escribir nada.' })
	@IsOptional() @IsBooleanString() simulation?: string
}

export class RunQueryDto extends PageQueryDto {
	@ApiPropertyOptional({ enum: ['import', 'payments'] })
	@IsOptional() @IsIn(['import', 'payments']) type?: 'import' | 'payments'
}

export class RunItemQueryDto extends PageQueryDto {
	@ApiPropertyOptional({ description: 'Resultado, por ejemplo partial_payment.' })
	@IsOptional() @IsString() @MaxLength(40) result?: string

	@ApiPropertyOptional({ description: 'Cliente, documento, cuota o contrato.' })
	@IsOptional() @IsString() @MaxLength(80) search?: string
}
