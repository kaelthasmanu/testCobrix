import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ProviderClient } from '../provider/provider.client'

@Injectable()
export class AuthService {
	constructor(private readonly provider: ProviderClient, private readonly jwt: JwtService) {}

	async login(username: string, password: string): Promise<{ usuario: string; email: string; access_token: string; access_token_expires_in: string }> {
		const providerSession = await this.provider.login(username, password).catch((error: unknown) => {
			throw new UnauthorizedException(error instanceof Error ? error.message : 'Credenciales inválidas.')
		})
		await this.provider.saveCredentials(username, password, providerSession)
		const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000)
		return {
			usuario: providerSession.usuario,
			email: providerSession.email,
			access_token: this.jwt.sign({ sub: providerSession.usuario }),
			access_token_expires_in: expiresAt.toISOString(),
		}
	}
}
