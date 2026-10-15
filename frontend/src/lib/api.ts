const baseUrl = (import.meta.env.VITE_COBRIX_API_URL ?? 'http://127.0.0.1:4320').replace(/\/+$/, '')

export class ApiError extends Error {
	constructor(readonly status: number, message: string, options?: ErrorOptions) {
		super(message, options)
	}
}

function message(body: unknown, status: number): string {
	if (typeof body === 'object' && body !== null && 'message' in body) {
		const value = (body as { message: unknown }).message
		return Array.isArray(value) ? value.join(' ') : String(value)
	}
	if (status === 404) return 'El recurso no existe.'
	return `Cobrix respondió con un error (HTTP ${status}).`
}

/** Petición JSON al backend de Cobrix. Los errores traen un mensaje para el operador. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	let response: Response
	try {
		response = await fetch(`${baseUrl}${path}`, { ...init, headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers } })
	} catch (error) {
		throw new ApiError(0, `No se pudo conectar con el backend de Cobrix en ${baseUrl}. Verifica que esté levantado (npm run start:dev en backend/ o docker compose up).`, { cause: error })
	}
	const body: unknown = await response.json().catch(() => undefined)
	if (!response.ok) throw new ApiError(response.status, message(body, response.status))
	return body as T
}

export function errorText(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message ? cause.message : fallback
}
