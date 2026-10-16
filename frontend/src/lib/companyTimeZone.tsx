import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import { DEFAULT_TIME_ZONE, setDisplayTimeZone } from './format'

interface CompanyTimeZone {
	readonly timeZone: string
	/** Cambia la zona; `notice` es un aviso que la pantalla puede mostrar después de volver a montarse. */
	readonly setTimeZone: (timeZone: string, notice?: string) => void
	readonly notice: string | null
}

const Context = createContext<CompanyTimeZone>({ timeZone: DEFAULT_TIME_ZONE, setTimeZone: () => undefined, notice: null })

/**
 * Carga la zona horaria de la empresa y la aplica a todas las fechas del panel.
 * Al cambiarla en Configuración, las pantallas se vuelven a montar con la zona nueva.
 */
export function CompanyTimeZoneProvider({ children }: { readonly children: ReactNode }) {
	const [timeZone, setState] = useState<string | null>(null)
	const [notice, setNotice] = useState<string | null>(null)

	useEffect(() => {
		api<{ timeZone?: string }>('/settings')
			.then((settings) => apply(settings.timeZone ?? DEFAULT_TIME_ZONE))
			// Si el backend no responde, cada pantalla muestra su propio error; las fechas usan la zona por defecto.
			.catch(() => apply(DEFAULT_TIME_ZONE))
	}, [])

	const apply = useCallback((value: string, message?: string) => {
		setDisplayTimeZone(value)
		setNotice(message ?? null)
		setState(value)
	}, [])

	if (timeZone === null) return null
	return <Context.Provider value={{ timeZone, setTimeZone: apply, notice }}><div className="contents" key={timeZone}>{children}</div></Context.Provider>
}

export function useCompanyTimeZone(): CompanyTimeZone {
	return useContext(Context)
}
