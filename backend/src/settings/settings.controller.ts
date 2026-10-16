import { Body, Controller, Get, Patch, Post, Put } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ProviderClient } from '../provider/provider.client'
import { SettingsService } from './settings.service'
import { ProviderConnectionDto, UpdateSettingsDto } from './settings.dto'

@Controller('settings')
@ApiTags('Configuración')
export class SettingsController {
	constructor(private readonly settings: SettingsService, private readonly provider: ProviderClient) {}

	@Get()
	@ApiOperation({ summary: 'Configuración operativa y datos del proveedor (sin la contraseña)' })
	async get() {
		return { ...(await this.settings.get()), provider: await this.provider.getSettingsView(), businessDate: await this.settings.today() }
	}

	@Patch()
	@ApiOperation({ summary: 'Actualizar empresa, reglas de importación o corrida automática' })
	async save(@Body() body: UpdateSettingsDto) {
		return this.settings.save(body)
	}

	@Post('provider/test')
	@ApiOperation({ summary: 'Probar conexión: inicia sesión y cuenta los contratos. No guarda nada.' })
	async testProvider(@Body() body: ProviderConnectionDto) {
		const connection = await this.provider.resolveConnection(body)
		const result = await this.provider.probe(connection)
		return { connected: true, baseUrl: connection.baseUrl, ...result }
	}

	@Put('provider')
	@ApiOperation({ summary: 'Guardar URL y credenciales del proveedor tras verificarlas' })
	async saveProvider(@Body() body: ProviderConnectionDto) {
		const connection = await this.provider.resolveConnection(body)
		const login = await this.provider.login(connection)
		await this.provider.saveConnection(connection, login)
		return this.provider.getSettingsView()
	}
}
