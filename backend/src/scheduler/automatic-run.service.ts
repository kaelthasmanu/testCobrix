import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { DatabaseService } from '../database/database.service'
import { zonedParts } from '../common/rules'
import { SettingsService } from '../settings/settings.service'
import { SyncService } from '../sync/sync.service'

/**
 * Corrida automática diaria: importar y después actualizar pagadas, a la hora configurada en la zona horaria de la empresa.
 * Revisa cada minuto si toca correr (hasta dos horas después de la hora elegida). La última corrida automática se lee de la base, así que un reinicio
 * del proceso no repite la corrida del día.
 */
@Injectable()
export class AutomaticRunService {
	private readonly logger = new Logger(AutomaticRunService.name)
	private running = false

	constructor(
		private readonly settings: SettingsService,
		private readonly sync: SyncService,
		private readonly database: DatabaseService,
	) {}

	@Cron(CronExpression.EVERY_MINUTE, { name: 'cobrix-daily-sync' })
	async tick(): Promise<void> {
		if (this.running) return
		const settings = await this.settings.get()
		if (!settings.automaticRunEnabled) return
		const now = zonedParts(settings.timeZone)
		// Solo dentro de las dos horas siguientes a la hora elegida: si el servidor estuvo apagado, se pone al día,
		// pero activar la corrida a media tarde no dispara una corrida inesperada.
		const late = minutes(now.time) - minutes(settings.automaticRunTime)
		if (late < 0 || late > 120) return
		const lastRun = await this.database.syncRun.findFirst({ where: { trigger: 'automatic', type: 'import' }, orderBy: { startedAt: 'desc' } })
		if (lastRun && zonedParts(settings.timeZone, new Date(lastRun.startedAt)).date === now.date) return
		await this.runNow()
	}

	async runNow(): Promise<void> {
		this.running = true
		try {
			this.logger.log('Iniciando corrida automática: importar y actualizar pagadas.')
			const imported = await this.sync.import(false, 'automatic')
			this.logger.log(`Importación automática: ${imported?.summary}`)
			const payments = await this.sync.updatePayments(false, 'automatic')
			this.logger.log(`Actualización automática: ${payments?.summary}`)
		} catch (error) {
			// Una corrida manual en curso (409) u otro error: se reintenta en el próximo minuto.
			this.logger.warn(`La corrida automática no pudo ejecutarse: ${error instanceof Error ? error.message : 'error desconocido'}`)
		} finally {
			this.running = false
		}
	}
}

function minutes(time: string): number {
	const [hours, mins] = time.split(':').map(Number)
	return hours * 60 + mins
}
