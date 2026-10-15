import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { DEFAULT_TIME_ZONE, businessToday, isValidTimeZone } from '../common/rules'
import { DEFAULT_SETTINGS } from './settings.types'
import type { PanelSettings } from '../common/types'

@Injectable()
export class SettingsService {
	constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(ConfigService) private readonly config: ConfigService) {}

	async get(): Promise<PanelSettings> {
		const rows = await this.database.appSetting.findMany()
		const stored: Record<string, unknown> = {}
		for (const row of rows) {
			if (!(row.key in DEFAULT_SETTINGS)) continue
			try {
				stored[row.key] = JSON.parse(row.value)
			} catch {
				// Un valor corrupto no debe tumbar la corrida: se usa el valor por defecto.
			}
		}
		const settings = { ...DEFAULT_SETTINGS, ...stored } as PanelSettings
		// Una zona guardada que el motor ya no reconoce no debe romper las corridas.
		if (!isValidTimeZone(settings.timeZone)) settings.timeZone = DEFAULT_TIME_ZONE
		return settings
	}

	async save(patch: Partial<PanelSettings>): Promise<PanelSettings> {
		// El DTO llega como instancia con todos sus campos declarados: los que no vinieron valen `undefined`
		// y no deben pisar lo guardado. `null` sí se guarda (significa «sin límite»).
		const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
		const settings = { ...(await this.get()), ...defined }
		await this.database.$transaction(async (tx) => {
			for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof PanelSettings>) {
				const value = JSON.stringify(settings[key])
				await tx.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
			}
		})
		return settings
	}

	/** Fecha de negocio: hoy en la zona horaria de la empresa, o `BUSINESS_DATE` para reproducir la prueba. */
	async today(): Promise<string> {
		return businessToday(this.config.get<string>('BUSINESS_DATE'), (await this.get()).timeZone)
	}
}
