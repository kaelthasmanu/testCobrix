export interface LoginRequest {
	readonly user_name: string
	readonly password: string
}

export interface AuthSession {
	readonly usuario: string
	readonly email: string
	readonly accessToken: string
	readonly expiresAt: number
}

interface LoginResponse {
	readonly usuario: string
	readonly email: string
	readonly access_token: string
	readonly access_token_expires_in: string
}

const configuredApiUrl = import.meta.env.VITE_API_URL

function apiBaseUrl(): string {
	if (!configuredApiUrl) {
		throw new Error('Falta configurar VITE_API_URL en el archivo .env.')
	}

	const configuredUrl = new URL(configuredApiUrl)
	if (import.meta.env.DEV) return configuredUrl.pathname.replace(/\/+$/, '')
	return configuredApiUrl.replace(/\/+$/, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isLoginResponse(value: unknown): value is LoginResponse {
	return isRecord(value)
		&& typeof value.usuario === 'string'
		&& typeof value.email === 'string'
		&& typeof value.access_token === 'string'
		&& typeof value.access_token_expires_in === 'string'
}

function apiErrorMessage(body: unknown): string | undefined {
	if (!isRecord(body) || !isRecord(body.detail)) return undefined
	return typeof body.detail.mensaje === 'string' ? body.detail.mensaje : undefined
}

function parseExpiration(value: string): number {
	const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
	const expiresAt = Date.parse(hasTimezone ? value : `${value}Z`)
	if (!Number.isFinite(expiresAt)) {
		throw new Error('La API devolvió una fecha de expiración inválida.')
	}
	if (expiresAt <= Date.now()) {
		throw new Error('La API devolvió una sesión que ya expiró.')
	}
	return expiresAt
}

export async function login(request: LoginRequest): Promise<AuthSession> {
	const url = `${apiBaseUrl()}/usuario/login`
	let response: Response
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {
				accept: 'application/json',
				'content-type': 'application/json',
			},
			body: JSON.stringify(request),
		})
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') throw error
		throw new Error('No se pudo conectar con la API. Revisa VITE_API_URL y que el servidor esté activo.', { cause: error })
	}

	let body: unknown
	try {
		body = await response.json()
	} catch {
		throw new Error('La API devolvió una respuesta inválida.')
	}
	if (!response.ok) {
		throw new Error(apiErrorMessage(body) ?? `No se pudo iniciar sesión (HTTP ${response.status}).`)
	}
	if (!isLoginResponse(body)) {
		throw new Error('La API devolvió datos de inicio de sesión incompletos.')
	}

	return {
		usuario: body.usuario,
		email: body.email,
		accessToken: body.access_token,
		expiresAt: parseExpiration(body.access_token_expires_in),
	}
}
