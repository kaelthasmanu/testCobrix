import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { DatabaseService } from '../database/database.service'
import { SyncService } from './sync.service'

@Controller()
@UseGuards(AuthGuard)
export class SyncController {
	constructor(private readonly sync: SyncService, private readonly database: DatabaseService) {}

	@Post('sync/import')
	async import(@Query('simulation') simulation = 'false') {
		return this.sync.import(simulation === 'true')
	}

	@Post('sync/payments')
	async updatePayments(@Query('simulation') simulation = 'false') {
		return this.sync.updatePayments(simulation === 'true')
	}

	@Get('sync/runs')
	async listRuns() {
		const runs = await this.database.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 50 })
		return runs.map((run) => ({ ...toSnakeCase(run), simulation: run.simulation, counters: JSON.parse(run.counters) }))
	}

	@Get('sync/runs/:id')
	async getRun(@Param('id') id: string) {
		const run = await this.database.syncRun.findUnique({ where: { id }, include: { items: { orderBy: { id: 'asc' } } } })
		if (!run) return null
		const { items, ...runData } = run
		return { ...toSnakeCase(runData), simulation: run.simulation, counters: JSON.parse(run.counters), items: items.map(toSnakeCase) }
	}
}

function toSnakeCase<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
	return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item]))
}
