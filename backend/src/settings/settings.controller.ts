import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.guard'
import { ProviderClient } from '../provider/provider.client'
import { SettingsService } from './settings.service'

@Controller('settings')
@UseGuards(AuthGuard)
export class SettingsController {
	constructor(private readonly settings: SettingsService, private readonly provider: ProviderClient) {}

	@Get()
	async get() {
		return this.settings.get()
	}

	@Patch()
	async save(@Body() body: Record<string, unknown>) {
		return this.settings.save(body)
	}

	@Post('test-connection')
	async testConnection(@Body() body: { user_name?: string; password?: string }) {
		if (!body.user_name || !body.password) return { connected: false, error: 'Usuario y contraseña son obligatorios.' }
		const login = await this.provider.login(body.user_name, body.password)
		await this.provider.saveCredentials(body.user_name, body.password, login)
		return { connected: true, usuario: login.usuario, email: login.email, expiresAt: login.access_token_expires_in }
	}
}
