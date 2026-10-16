import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'cobrix-theme'
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null)

function readTheme(): Theme {
	try {
		return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
	} catch {
		return 'dark'
	}
}

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
	const [theme, setTheme] = useState<Theme>(readTheme)

	useEffect(() => {
		document.documentElement.dataset.theme = theme
		document.documentElement.style.colorScheme = theme
		try {
			window.localStorage.setItem(STORAGE_KEY, theme)
		} catch {
			// La preferencia sigue funcionando durante esta sesión aunque el almacenamiento esté bloqueado.
		}
	}, [theme])

	const value = useMemo(() => ({
		theme,
		toggleTheme: () => setTheme((current) => current === 'dark' ? 'light' : 'dark'),
	}), [theme])

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
	const context = useContext(ThemeContext)
	if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider')
	return context
}
