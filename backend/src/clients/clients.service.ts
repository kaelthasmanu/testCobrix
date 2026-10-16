import { Injectable, NotFoundException } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { normalizeDocument, personType, roundMoney } from '../common/rules'
import { PageQueryDto, pageWindow, toPage } from '../common/pagination'

export interface ClientListOptions extends PageQueryDto {
	search?: string
	type?: 'natural' | 'juridica'
	debt?: 'with' | 'without'
	sort?: 'name' | 'document' | 'contracts' | 'openInvoices' | 'paidInvoices' | 'debt' | 'oldestDueDate'
	order?: 'asc' | 'desc'
}

export interface RecordListOptions extends PageQueryDto {
	status?: 'open' | 'paid'
}

@Injectable()
export class ClientsService {
	constructor(private readonly database: DatabaseService) {}

	async list(query: ClientListOptions) {
		const { page, pageSize, skip } = pageWindow(query)
		const term = query.search?.trim() ?? ''
		const document = normalizeDocument(term)
		const digits = term.replace(/\D/g, '').replace(/^0+/, '')
		const where = {
			AND: [
				...(term ? [{
					OR: [
						{ name: { contains: term.toUpperCase() } },
						...(document ? [{ document: { contains: document } }] : []),
						...(digits.length >= 3 ? [{ document: { contains: digits } }] : []),
					],
				}] : []),
				...(query.type === 'juridica' ? [{ OR: [{ document: { startsWith: 'J' } }, { document: { startsWith: 'G' } }] }] : []),
				...(query.type === 'natural' ? [{ NOT: [{ document: { startsWith: 'J' } }, { document: { startsWith: 'G' } }] }] : []),
			],
		}
		const clients = await this.database.client.findMany({
			where,
			select: {
				id: true,
				document: true,
				name: true,
				_count: { select: { contracts: true } },
				invoices: { select: { status: true, balance: true, dueDate: true } },
			},
		})
		const rows = clients
			.map((client) => {
				const openInvoices = client.invoices.filter((invoice) => invoice.status === 'open')
				const paidInvoices = client.invoices.filter((invoice) => invoice.status === 'paid')
				const debt = openInvoices.reduce((sum, invoice) => sum + invoice.balance, 0)
				return {
					document: client.document,
					name: client.name,
					personType: personType(client.document),
					contracts: client._count.contracts,
					openInvoices: openInvoices.length,
					paidInvoices: paidInvoices.length,
					debt: roundMoney(debt),
					oldestDueDate: openInvoices.reduce<string | null>((oldest, invoice) => !oldest || invoice.dueDate < oldest ? invoice.dueDate : oldest, null),
				}
			})
			.filter((client) => query.debt === 'with' ? client.debt > 0.005 : query.debt === 'without' ? client.debt <= 0.005 : true)

		rows.sort((left, right) => {
			const direction = query.order === 'desc' ? -1 : 1
			if (query.sort === 'oldestDueDate') {
				const leftNull = left.oldestDueDate === null
				const rightNull = right.oldestDueDate === null
				if (leftNull !== rightNull) return leftNull ? -1 : 1
			}
			const leftValue = left[query.sort ?? 'name']
			const rightValue = right[query.sort ?? 'name']
			if (leftValue === null || rightValue === null) {
				if (leftValue === rightValue) return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
				return leftValue === null ? -1 : 1
			}
			if (leftValue < rightValue) return -1 * direction
			if (leftValue > rightValue) return 1 * direction
			return left.name < right.name ? -1 : left.name > right.name ? 1 : 0
		})

		return toPage(rows.slice(skip, skip + pageSize), rows.length, page, pageSize)
	}

	async record(rawDocument: string) {
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

	async invoices(rawDocument: string, query: RecordListOptions) {
		const client = await this.findClient(rawDocument)
		const { page, pageSize, skip } = pageWindow(query)
		const where = { clientId: client.id, ...(query.status ? { status: query.status } : {}) }
		const [rows, total] = await Promise.all([
			this.database.invoice.findMany({ where, include: { contract: { select: { providerId: true, plan: true } } }, orderBy: [{ dueDate: 'desc' }, { id: 'desc' }], skip, take: pageSize }),
			this.database.invoice.count({ where }),
		])
		return toPage(rows.map(({ contract, ...invoice }) => ({ id: invoice.id, number: cobrixInvoiceNumber(invoice.id), installmentId: invoice.externalId, contractId: contract.providerId, plan: contract.plan, period: invoice.period, dueDate: invoice.dueDate, cutoffDate: invoice.cutoffDate, amount: invoice.amount, balance: invoice.balance, providerBalance: invoice.providerBalance, status: invoice.status, importedAt: invoice.importedAt, paidAt: invoice.paidAt, paidByProviderInvoiceNumber: invoice.paidByProviderInvoiceNumber })), total, page, pageSize)
	}

	async events(rawDocument: string, query: PageQueryDto) {
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
