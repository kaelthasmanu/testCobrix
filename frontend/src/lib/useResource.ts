import { useCallback, useEffect, useState } from 'react'
import { api, errorText } from './api'

/** Carga un recurso del backend con estado de carga, error y recarga. */
export function useResource<T>(path: string) {
	const [data, setData] = useState<T | null>(null)
	const [error, setError] = useState('')
	const [loading, setLoading] = useState(true)
	const [version, setVersion] = useState(0)

	useEffect(() => {
		let cancelled = false
		setLoading(true)
		setError('')
		api<T>(path)
			.then((value) => { if (!cancelled) setData(value) })
			.catch((cause: unknown) => { if (!cancelled) setError(errorText(cause, 'No se pudo cargar la información.')) })
			.finally(() => { if (!cancelled) setLoading(false) })
		return () => { cancelled = true }
	}, [path, version])

	const reload = useCallback(() => setVersion((value) => value + 1), [])
	return { data, error, loading, reload }
}

/** Valor que se actualiza solo cuando el usuario deja de escribir, para no consultar en cada tecla. */
export function useDebounced<T>(value: T, delayMs = 250): T {
	const [debounced, setDebounced] = useState(value)
	useEffect(() => {
		const timeout = window.setTimeout(() => setDebounced(value), delayMs)
		return () => window.clearTimeout(timeout)
	}, [value, delayMs])
	return debounced
}

/** `{ page: 2, search: '' }` → `?page=2`. Omite vacíos. */
export function queryString(params: Record<string, string | number | null | undefined>): string {
	const query = new URLSearchParams()
	for (const [key, value] of Object.entries(params)) if (value !== null && value !== undefined && value !== '') query.set(key, String(value))
	const text = query.toString()
	return text ? `?${text}` : ''
}

/**
 * Página actual atada a los criterios de la tabla (búsqueda, filtros, orden, tamaño): si cambian,
 * la página vuelve a 1 en el mismo render, sin pedir antes una página que ya no corresponde.
 */
export function usePage(criteria: unknown): [number, (page: number) => void] {
	const key = JSON.stringify(criteria)
	const [state, setState] = useState({ key, page: 1 })
	const page = state.key === key ? state.page : 1
	const setPage = useCallback((value: number) => setState({ key, page: value }), [key])
	return [page, setPage]
}
