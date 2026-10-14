import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { DatabaseService } from '../database/database.service'

@Controller('clients')
@UseGuards(AuthGuard)
export class ClientsController {
	constructor(private readonly database: DatabaseService) {}

	@Get()
	async list(@Query('search') search = '') {
		const clients = await this.database.client.findMany({
			where: { OR: [{ name: { contains: search } }, { document: { contains: search } }, { email: { contains: search } }] },
			include: { contracts: true, invoices: true },
			orderBy: { name: 'asc' },
		})
		return clients.map(({ contracts, invoices, ...client }) => ({
			...toSnakeCase(client),
			contracts: contracts.length,
			openInvoices: invoices.filter((invoice) => invoice.status === 'open').length,
			paidInvoices: invoices.filter((invoice) => invoice.status === 'paid').length,
			debt: invoices.filter((invoice) => invoice.status === 'open').reduce((sum, invoice) => sum + invoice.balance, 0),
			oldestDueDate: invoices.filter((invoice) => invoice.status === 'open').map((invoice) => invoice.dueDate).sort()[0] ?? null,
		}))
	}

	@Get(':document')
	async record(@Param('document') document: string) {
		const client = await this.database.client.findUnique({ where: { document }, include: { contracts: true, invoices: true, events: true } })
		if (!client) throw new NotFoundException('Cliente no encontrado.')
		const { contracts, invoices, events, ...clientData } = client
		return {
			client: toSnakeCase(clientData),
			contracts: contracts.sort((a, b) => a.providerId - b.providerId).map(toSnakeCase),
			invoices: invoices.sort((a, b) => b.dueDate.localeCompare(a.dueDate)).map(toSnakeCase),
			events: events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map(toSnakeCase),
		}
	}
}

function toSnakeCase<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item]))
}
