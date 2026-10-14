import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from '../database/database.service'
import { CryptoService } from '../common/crypto.service'
import type { ProviderInstallment, ProviderPaymentRow } from '../common/types'

interface LoginResponse {
	usuario: string
	email: string
	access_token: string
	access_token_expires_in: string
}

interface ProviderIdsResponse {
	data?: number[]
}

interface PaymentResponse {
	data?: ProviderPaymentRow[]
}

@Injectable()
export class ProviderClient {
	private readonly baseUrl: string

	constructor(
		config: ConfigService,
		private readonly database: DatabaseService,
		private readonly crypto: CryptoService,
	) {
		this.baseUrl = config.get<string>('ADMIN_API_URL', 'http://127.0.0.1:4310/api/v1').replace(/\/+$/, '')
	}

	async login(username: string, password: string): Promise<LoginResponse> {
		return this.request<LoginResponse>('/usuario/login', {
			method: 'POST',
			body: JSON.stringify({ user_name: username, password }),
		}, false)
	}

	async getContractIds(): Promise<number[]> {
		const response = await this.request<ProviderIdsResponse>('/isp/lista_ids_contratos', { method: 'GET' })
		return response.data ?? []
	}

	async getPendingInstallments(contractId: number): Promise<ProviderInstallment[]> {
		return this.request<ProviderInstallment[]>(`/isp/contrato/individual?id_contrato=${contractId}`, { method: 'GET' })
	}

	async getPayments(contractId: number): Promise<ProviderPaymentRow[]> {
		const response = await this.request<PaymentResponse>(
			`/isp/pago_informacion?id_contrato=${contractId}&tipo_busqueda=CUOTA&fecha_inicio=2020-01-01&fecha_fin=2099-12-31`,
			{ method: 'GET' },
		)
		return response.data ?? []
	}

	async saveCredentials(username: string, password: string, login: LoginResponse): Promise<void> {
		await this.database.providerAuth.upsert({
			where: { id: 1 },
			create: { id: 1, username, encryptedPassword: this.crypto.encrypt(password), accessToken: login.access_token, tokenExpiresAt: this.parseExpiration(login.access_token_expires_in).toISOString() },
			update: { username, encryptedPassword: this.crypto.encrypt(password), accessToken: login.access_token, tokenExpiresAt: this.parseExpiration(login.access_token_expires_in).toISOString() },
		})
	}

	async getProviderIdentity(): Promise<{ usuario: string; email: string; expiresAt: string } | null> {
		const row = await this.database.providerAuth.findUnique({ where: { id: 1 } })
		return row ? { usuario: row.username, email: '', expiresAt: row.tokenExpiresAt ?? '' } : null
	}

	private async ensureToken(): Promise<string> {
		const row = await this.database.providerAuth.findUnique({ where: { id: 1 } })
		if (!row) throw new UnauthorizedException('Configura las credenciales del administrador antes de sincronizar.')
		if (row.accessToken && row.tokenExpiresAt && Date.parse(row.tokenExpiresAt) > Date.now() + 30_000) return row.accessToken
		const password = this.crypto.decrypt(row.encryptedPassword)
		const login = await this.login(row.username, password)
		await this.saveCredentials(row.username, password, login)
		return login.access_token
	}

	private parseExpiration(value: string): Date {
		const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`)
		if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) throw new UnauthorizedException('El administrador devolvió una sesión inválida o expirada.')
		return date
	}

	private async request<T>(path: string, init: RequestInit, authenticated = true): Promise<T> {
		const headers = new Headers(init.headers)
		headers.set('accept', 'application/json')
		if (init.body) headers.set('content-type', 'application/json')
		if (authenticated) headers.set('authorization', `Bearer ${await this.ensureToken()}`)
		let response: Response
		try {
			response = await fetch(`${this.baseUrl}${path}`, { ...init, headers })
		} catch (error) {
			throw new ServiceUnavailableException('No se pudo conectar con el administrador.', { cause: error })
		}
		const body: unknown = await response.json().catch(() => undefined)
		if (!response.ok) {
			const detail = typeof body === 'object' && body !== null && 'detail' in body ? String(body.detail) : `HTTP ${response.status}`
			throw new ServiceUnavailableException(`El administrador rechazó la solicitud: ${detail}`)
		}
		return body as T
	}
}
