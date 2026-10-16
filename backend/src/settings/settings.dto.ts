import { ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayUnique, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, ValidateIf, ValidateBy } from 'class-validator'
import { DOCUMENT_TYPES, KNOWN_CONTRACT_STATUSES, isValidTimeZone } from '../common/rules'
import type { ImportWindow } from '../common/types'

/** Todos los campos son opcionales: se guarda solo lo que llega. `null` significa «sin límite». */
export class UpdateSettingsDto {
	@ApiPropertyOptional({ example: 'Cobrix' }) @IsOptional() @IsString() @MaxLength(120) companyName?: string
	@ApiPropertyOptional({ example: 'J-00000000-0' }) @IsOptional() @IsString() @Matches(/^$|^[VEJGP]-?\d{6,9}-?\d?$/i, { message: 'El RIF debe tener la forma J-12345678-9.' }) companyRif?: string
	@ApiPropertyOptional({ example: 'cobranza@cobrix.com' }) @IsOptional() @ValidateIf((dto: UpdateSettingsDto) => dto.billingEmail !== '') @IsEmail({}, { message: 'El correo de cobranza no es válido.' }) billingEmail?: string
	@ApiPropertyOptional({ example: 'America/Caracas', description: 'Zona horaria IANA de la empresa.' }) @IsOptional() @ValidateBy({ name: 'isTimeZone', validator: { validate: isValidTimeZone, defaultMessage: () => 'La zona horaria no es válida (usa un nombre IANA, por ejemplo America/Caracas).' } }) timeZone?: string
	@ApiPropertyOptional({ enum: KNOWN_CONTRACT_STATUSES, isArray: true }) @IsOptional() @IsArray() @ArrayUnique() @IsIn(KNOWN_CONTRACT_STATUSES, { each: true }) importableStatuses?: string[]
	@ApiPropertyOptional({ enum: ['none', '3', '6', '9', '12'] }) @IsOptional() @IsIn(['none', '3', '6', '9', '12']) importWindow?: ImportWindow
	@ApiPropertyOptional({ nullable: true, minimum: 1, maximum: 60 }) @IsOptional() @IsInt() @Min(1) @Max(60) recentInstallmentsLimit?: number | null
	@ApiPropertyOptional({ minimum: 0, maximum: 60 }) @IsOptional() @IsInt() @Min(0) @Max(60) graceDays?: number
	@ApiPropertyOptional({ nullable: true, minimum: 1 }) @IsOptional() @IsInt() @Min(1) maxNewInvoices?: number | null
	@ApiPropertyOptional({ nullable: true, minimum: 0 }) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) maxNewAmount?: number | null
	@ApiPropertyOptional({ enum: DOCUMENT_TYPES, isArray: true }) @IsOptional() @IsArray() @ArrayUnique() @IsIn(DOCUMENT_TYPES, { each: true }) excludedDocumentTypes?: string[]
	@ApiPropertyOptional() @IsOptional() @IsBoolean() automaticRunEnabled?: boolean
	@ApiPropertyOptional({ example: '06:00' }) @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora debe tener la forma HH:MM.' }) automaticRunTime?: string
}

/** Datos del proveedor. La contraseña vacía conserva la guardada. */
export class ProviderConnectionDto {
	@ApiPropertyOptional({ example: 'http://127.0.0.1:4310/api/v1' }) @IsOptional() @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] }, { message: 'La URL de la API debe empezar por http:// o https://.' }) baseUrl?: string
	@ApiPropertyOptional({ example: 'cobrix' }) @IsOptional() @IsString() @MaxLength(120) username?: string
	@ApiPropertyOptional({ example: 'cobrix-sandbox', format: 'password' }) @IsOptional() @IsString() @MaxLength(200) password?: string
}
