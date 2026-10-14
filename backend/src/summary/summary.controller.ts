import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { DatabaseService } from '../database/database.service'
import { ProviderClient } from '../provider/provider.client'
import { SettingsService } from '../settings/settings.service'

@Controller('summary')
@UseGuards(AuthGuard)
export class SummaryController {
	constructor(private readonly database: DatabaseService, private readonly provider: ProviderClient, private readonly settings: SettingsService) {}

	@Get()
	async get() {
		const [clientCount, contractCount, openInvoices, paidInvoices, receivable, runs, settings] = await Promise.all([
			this.database.invoice.groupBy({ by: ['clientId'] }),
			this.database.invoice.groupBy({ by: ['contractId'] }),
			this.database.invoice.count({ where: { status: 'open' } }),
			this.database.invoice.count({ where: { status: 'paid' } }),
			this.database.invoice.aggregate({ where: { status: 'open' }, _sum: { balance: true } }),
			this.database.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 5 }),
			this.settings.get(),
		])
		const metrics = { clients: clientCount.length, contracts: contractCount.length, openInvoices, paidInvoices, receivable: receivable._sum.balance ?? 0 }
		return { metrics, provider: await this.provider.getProviderIdentity(), automaticRun: { enabled: settings.automaticRunEnabled, time: settings.automaticRunTime }, recentRuns: runs.map((run) => ({ ...toSnakeCase(run), counters: JSON.parse(run.counters) })) }
	}
}

function toSnakeCase<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item]))
}
