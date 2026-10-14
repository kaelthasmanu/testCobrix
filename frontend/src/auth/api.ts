import type { AuthCredentials, AuthSession } from '../interfaces/auth.interfaces'
export type { AuthCredentials, AuthSession } from '../interfaces/auth.interfaces'

const baseUrl = (import.meta.env.VITE_COBRIX_API_URL ?? 'http://127.0.0.1:4320').replace(/\/+$/, '')

function message(body: unknown): string {
	if (typeof body === 'object' && body !== null && 'message' in body) return String(body.message)
	if (typeof body === 'object' && body !== null && 'detail' in body) return String(body.detail)
	return 'La solicitud no pudo completarse.'
}

export async function authenticatedGet<T>(path: string, accessToken: string): Promise<T> {
	return request<T>(path, { headers: { authorization: `Bearer ${accessToken}` } })
}

export async function authenticatedRequest<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
	return request<T>(path, { ...init, headers: { ...init.headers, authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' } })
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
	let response: Response
	try {
		response = await fetch(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, init)
	} catch (error) {
		throw new Error('No se pudo conectar con Cobrix.', { cause: error })
	}
	const body: unknown = await response.json().catch(() => undefined)
	if (!response.ok) throw new Error(message(body))
	return body as T
}

export async function authenticate(credentials: AuthCredentials): Promise<AuthSession> {
	const body = await request<{ usuario: string; email: string; access_token: string; access_token_expires_in: string }>('/auth/login', {
		method: 'POST',
		headers: { accept: 'application/json', 'content-type': 'application/json' },
		body: JSON.stringify(credentials),
	})
	const expiresAt = Date.parse(body.access_token_expires_in)
	if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('Cobrix devolvió una sesión expirada.')
	return { usuario: body.usuario, email: body.email, accessToken: body.access_token, expiresAt }
}
