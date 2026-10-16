import { Controller, Get, Inject, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { PageQueryDto } from '../common/pagination'
import { ClientsService } from './clients.service'

export class ClientListQueryDto extends PageQueryDto {
	@ApiPropertyOptional({ description: 'Nombre, o documento con o sin guiones (V-12345678, 12345678).' }) @IsOptional() @IsString() @MaxLength(80) search?: string
	@ApiPropertyOptional({ enum: ['natural', 'juridica'] }) @IsOptional() @IsIn(['natural', 'juridica']) type?: 'natural' | 'juridica'
	@ApiPropertyOptional({ enum: ['with', 'without'] }) @IsOptional() @IsIn(['with', 'without']) debt?: 'with' | 'without'
	@ApiPropertyOptional({ enum: ['name', 'document', 'contracts', 'openInvoices', 'paidInvoices', 'debt', 'oldestDueDate'] }) @IsOptional() @IsIn(['name', 'document', 'contracts', 'openInvoices', 'paidInvoices', 'debt', 'oldestDueDate']) sort?: 'name' | 'document' | 'contracts' | 'openInvoices' | 'paidInvoices' | 'debt' | 'oldestDueDate'
	@ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc'
}

export class RecordPageQueryDto extends PageQueryDto {
	@ApiPropertyOptional({ enum: ['open', 'paid'] }) @IsOptional() @IsIn(['open', 'paid']) status?: 'open' | 'paid'
}

@Controller('clients')
@ApiTags('Clientes')
export class ClientsController {
	constructor(@Inject(ClientsService) private readonly clients: ClientsService) {}

	@Get()
	@ApiOperation({ summary: 'Clientes importados, paginados, con búsqueda por nombre, cédula o RIF, filtros y orden' })
	async list(@Query() query: ClientListQueryDto) {
		return this.clients.list(query)
	}

	@Get(':document')
	@ApiOperation({ summary: 'Expediente: datos, totales y contratos. Facturas e historial van paginados en sus propias rutas.' })
	@ApiResponse({ status: 404, description: 'Cliente no encontrado.' })
	async record(@Param('document') rawDocument: string) {
		return this.clients.record(rawDocument)
	}

	@Get(':document/invoices')
	@ApiOperation({ summary: 'Facturas del cliente, paginadas, de la más reciente a la más vieja' })
	async invoices(@Param('document') rawDocument: string, @Query() query: RecordPageQueryDto) {
		return this.clients.invoices(rawDocument, query)
	}

	@Get(':document/events')
	@ApiOperation({ summary: 'Historial del cliente, paginado, del más reciente al más viejo' })
	async events(@Param('document') rawDocument: string, @Query() query: PageQueryDto) {
		return this.clients.events(rawDocument, query)
	}
}
