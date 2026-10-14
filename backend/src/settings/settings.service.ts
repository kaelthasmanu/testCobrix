import { Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { DEFAULT_SETTINGS } from './settings.types'
import type { PanelSettings } from '../common/types'

@Injectable()
export class SettingsService {
	constructor(private readonly database: DatabaseService) {}

	async get(): Promise<PanelSettings> {
		const rows = await this.database.appSetting.findMany()
		const values = Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value) as unknown]))
		return { ...DEFAULT_SETTINGS, ...values }
	}

	async save(patch: Partial<PanelSettings>): Promise<PanelSettings> {
		const settings = { ...(await this.get()), ...patch }
		await this.database.$transaction(async (tx) => {
			for (const [key, value] of Object.entries(settings)) {
				await tx.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } })
			}
		})
		return settings
	}
}
