import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { SettingsService } from '../settings/settings.service'
import { SyncService } from '../sync/sync.service'

@Injectable()
export class AutomaticRunService {
	private readonly logger = new Logger(AutomaticRunService.name)
	private running = false
	private lastExecutionKey: string | null = null

	constructor(
		private readonly settings: SettingsService,
		private readonly sync: SyncService,
	) {}

	@Cron('* * * * *', { name: 'cobrix-daily-sync', timeZone: 'America/Caracas' })
	async executeWhenScheduled(): Promise<void> {
		const settings = await this.settings.get()
		if (!settings.automaticRunEnabled || !/^\d{2}:\d{2}$/.test(settings.automaticRunTime)) return

		const now = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'America/Caracas',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23',
		}).formatToParts(new Date())
		const values = Object.fromEntries(now.map((part) => [part.type, part.value]))
		const currentTime = `${values.hour}:${values.minute}`
		const executionKey = `${values.year}-${values.month}-${values.day} ${currentTime}`
		if (currentTime !== settings.automaticRunTime || this.lastExecutionKey === executionKey || this.running) return

		this.running = true
		this.lastExecutionKey = executionKey
		try {
			this.logger.log(`Iniciando corrida automática programada para ${executionKey}.`)
			await this.sync.import(false)
			await this.sync.updatePayments(false)
			this.logger.log(`Corrida automática completada: ${executionKey}.`)
		} catch (error) {
			this.logger.error(`La corrida automática falló: ${error instanceof Error ? error.message : 'error desconocido'}`)
		} finally {
			this.running = false
		}
	}
}
