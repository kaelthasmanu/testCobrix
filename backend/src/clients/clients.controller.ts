import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger'
import { Prisma } from '@prisma/client'
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { DatabaseService } from '../database/database.service'
import { normalizeDocument, personType, roundMoney } from '../common/rules'
import { PageQueryDto, pageWindow, toPage } from '../common/pagination'

const SORTS = { name: 'c.name', document: 'c.document', contracts: 'contracts', openInvoices: 'openInvoices', paidInvoices: 'paidInvoices', debt: 'debt', oldestDueDate: 'oldestDueDate' } as const

export class ClientListQueryDto extends PageQueryDto {
	@ApiPropertyOptional({ description: 'Nombre, o documento con o sin guiones (V-12345678, 12345678).' }) @IsOptional() @IsString() @MaxLength(80) search?: string
	@ApiPropertyOptional({ enum: ['natural', 'juridica'] }) @IsOptional() @IsIn(['natural', 'juridica']) type?: 'natural' | 'juridica'
	@ApiPropertyOptional({ enum: ['with', 'without'] }) @IsOptional() @IsIn(['with', 'without']) debt?: 'with' | 'without'
	@ApiPropertyOptional({ enum: Object.keys(SORTS) }) @IsOptional() @IsIn(Object.keys(SORTS)) sort?: keyof typeof SORTS
	@ApiPropertyOptional({ enum: ['asc', 'desc'] }) @IsOptional() @IsIn(['asc', 'desc']) order?: 'asc' | 'desc'
}

export class RecordPageQueryDto extends PageQueryDto {
	@ApiPropertyOptional({ enum: ['open', 'paid'] }) @IsOptional() @IsIn(['open', 'paid']) status?: 'open' | 'paid'
}

interface ClientAggregate { document: string; name: string; contracts: bigint | number; openInvoices: bigint | number; paidInvoices: bigint | number; debt: number | null; oldestDueDate: string | null }

@Controller('clients')
@ApiTags('Clientes')
export class ClientsController {
	constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

	@Get()
	@ApiOperation({ summary: 'Clientes importados, paginados, con búsqueda por nombre, cédula o RIF, filtros y orden' })
	async list(@Query() query: ClientListQueryDto) {
		const { page, pageSize, skip } = pageWindow(query)
		const conditions: Prisma.Sql[] = []
		const term = query.search?.trim() ?? ''
		if (term) {
			const document = normalizeDocument(term)
			const digits = term.replace(/\D/g, '').replace(/^0+/, '')
			const options = [Prisma.sql`c.name LIKE ${`%${term.toUpperCase()}%`}`]
			if (document) options.push(Prisma.sql`c.document LIKE ${`%${document}%`}`)
			if (digits.length >= 3) options.push(Prisma.sql`c.document LIKE ${`%${digits}%`}`)
			conditions.push(Prisma.sql`(${Prisma.join(options, ' OR ')})`)
		}
		if (query.type === 'juridica') conditions.push(Prisma.sql`(c.document LIKE 'J%' OR c.document LIKE 'G%')`)
		if (query.type === 'natural') conditions.push(Prisma.sql`(c.document NOT LIKE 'J%' AND c.document NOT LIKE 'G%')`)
		const where = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty
		const having = query.debt === 'with' ? Prisma.sql`HAVING debt > 0.005` : query.debt === 'without' ? Prisma.sql`HAVING debt <= 0.005` : Prisma.empty
		// Columna de orden de una lista cerrada; la dirección también. Nada del usuario entra crudo al SQL.
		const sort = Prisma.raw(SORTS[query.sort ?? 'name'])
		const direction = Prisma.raw(query.order === 'desc' ? 'DESC' : 'ASC')
		const nulls = Prisma.raw(query.sort === 'oldestDueDate' ? 'oldestDueDate IS NULL,' : '')
		const aggregate = Prisma.sql`
			SELECT c.document AS document, c.name AS name,
				(SELECT COUNT(*) FROM "Contract" k WHERE k.clientId = c.id) AS contracts,
				COUNT(CASE WHEN i.status = 'open' THEN 1 END) AS openInvoices,
				COUNT(CASE WHEN i.status = 'paid' THEN 1 END) AS paidInvoices,
				COALESCE(SUM(CASE WHEN i.status = 'open' THEN i.balance END), 0) AS debt,
				MIN(CASE WHEN i.status = 'open' THEN i.dueDate END) AS oldestDueDate
			FROM "Client" c LEFT JOIN "Invoice" i ON i.clientId = c.id
			${where}
			GROUP BY c.id
			${having}`
		const [rows, [{ total }]] = await Promise.all([
			this.database.$queryRaw<ClientAggregate[]>`${aggregate} ORDER BY ${nulls} ${sort} ${direction}, c.name ASC LIMIT ${pageSize} OFFSET ${skip}`,
			this.database.$queryRaw<Array<{ total: bigint | number }>>`SELECT COUNT(*) AS total FROM (${aggregate})`,
		])
		return toPage(rows.map((row) => ({
			document: row.document,
			name: row.name,
			personType: personType(row.document),
			contracts: Number(row.contracts),
			openInvoices: Number(row.openInvoices),
			paidInvoices: Number(row.paidInvoices),
			debt: roundMoney(Number(row.debt ?? 0)),
			oldestDueDate: row.oldestDueDate,
		})), Number(total), page, pageSize)
	}

	@Get(':document')
	@ApiOperation({ summary: 'Expediente: datos, totales y contratos. Facturas e historial van paginados en sus propias rutas.' })
	@ApiResponse({ status: 404, description: 'Cliente no encontrado.' })
	async record(@Param('document') rawDocument: string) {
		const client = await this.findClient(rawDocument)
		const [contracts, open, paid] = await Promise.all([
			this.database.contract.findMany({ where: { clientId: client.id }, orderBy: { providerId: 'asc' } }),
			this.database.invoice.aggregate({ where: { clientId: client.id, status: 'open' }, _count: true, _sum: { balance: true }, _min: { dueDate: true } }),
			this.database.invoice.count({ where: { clientId: client.id, status: 'paid' } }),
		])
		const { id: _id, ...data } = client
		return {
			client: { ...data, personType: personType(data.document) },
			totals: { debt: roundMoney(open._sum.balance ?? 0), openInvoices: open._count, paidInvoices: paid, contracts: contracts.length, oldestOpenDueDate: open._min.dueDate },
			contracts: contracts.map((contract) => ({ providerId: contract.providerId, status: contract.status, plan: contract.plan, price: contract.price, currency: contract.currency ?? 'USD', branch: contract.branch, updatedAt: contract.updatedAt })),
		}
	}

	@Get(':document/invoices')
	@ApiOperation({ summary: 'Facturas del cliente, paginadas, de la más reciente a la más vieja' })
	async invoices(@Param('document') rawDocument: string, @Query() query: RecordPageQueryDto) {
		const client = await this.findClient(rawDocument)
		const { page, pageSize, skip } = pageWindow(query)
		const where = { clientId: client.id, ...(query.status ? { status: query.status } : {}) }
		const [rows, total] = await Promise.all([
			this.database.invoice.findMany({ where, include: { contract: { select: { providerId: true, plan: true } } }, orderBy: [{ dueDate: 'desc' }, { id: 'desc' }], skip, take: pageSize }),
			this.database.invoice.count({ where }),
		])
		return toPage(rows.map(({ contract, ...invoice }) => ({ id: invoice.id, number: cobrixInvoiceNumber(invoice.id), installmentId: invoice.externalId, contractId: contract.providerId, plan: contract.plan, period: invoice.period, dueDate: invoice.dueDate, cutoffDate: invoice.cutoffDate, amount: invoice.amount, balance: invoice.balance, providerBalance: invoice.providerBalance, status: invoice.status, importedAt: invoice.importedAt, paidAt: invoice.paidAt, paidByProviderInvoiceNumber: invoice.paidByProviderInvoiceNumber })), total, page, pageSize)
	}

	@Get(':document/events')
	@ApiOperation({ summary: 'Historial del cliente, paginado, del más reciente al más viejo' })
	async events(@Param('document') rawDocument: string, @Query() query: PageQueryDto) {
		const client = await this.findClient(rawDocument)
		const { page, pageSize, skip } = pageWindow(query)
		const [rows, total] = await Promise.all([
			this.database.customerEvent.findMany({ where: { clientId: client.id }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], skip, take: pageSize }),
			this.database.customerEvent.count({ where: { clientId: client.id } }),
		])
		return toPage(rows.map((event) => ({ id: event.id, type: event.type, occurredAt: event.occurredAt, description: event.description, reference: event.reference, invoiceNumber: event.invoiceId ? cobrixInvoiceNumber(event.invoiceId) : null })), total, page, pageSize)
	}

	private async findClient(rawDocument: string) {
		const document = normalizeDocument(rawDocument) ?? rawDocument
		const client = await this.database.client.findUnique({ where: { document } })
		if (!client) throw new NotFoundException(`No hay un cliente con documento ${document}. Puede que aún no se haya importado.`)
		return client
	}
}

/** Número propio de Cobrix, distinto del id de la cuota del administrador. */
export function cobrixInvoiceNumber(id: number): string {
	return `COB-${String(id).padStart(6, '0')}`
}
