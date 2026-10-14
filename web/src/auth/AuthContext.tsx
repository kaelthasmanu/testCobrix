import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { login as requestLogin, type AuthSession, type LoginRequest } from './api'

interface AuthContextValue {
	readonly session: AuthSession | null
	readonly login: (request: LoginRequest) => Promise<void>
	readonly logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const SESSION_STORAGE_KEY = 'cobrix.auth.session'

function isStoredSession(value: unknown): value is AuthSession {
	return typeof value === 'object'
		&& value !== null
		&& 'usuario' in value
		&& typeof value.usuario === 'string'
		&& 'email' in value
		&& typeof value.email === 'string'
		&& 'accessToken' in value
		&& typeof value.accessToken === 'string'
		&& 'expiresAt' in value
		&& typeof value.expiresAt === 'number'
		&& Number.isFinite(value.expiresAt)
}

function restoreSession(): AuthSession | null {
	const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
	if (!stored) return null

	let value: unknown
	try {
		value = JSON.parse(stored)
	} catch {
		window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
		return null
	}

	if (!isStoredSession(value) || value.expiresAt <= Date.now()) {
		window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
		return null
	}
	return value
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [session, setSession] = useState<AuthSession | null>(restoreSession)

	useEffect(() => {
		if (!session) return
		const timeout = window.setTimeout(
			() => {
				window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
				setSession(null)
			},
			Math.max(0, session.expiresAt - Date.now()),
		)
		return () => window.clearTimeout(timeout)
	}, [session])

	const login = useCallback(async (request: LoginRequest) => {
		const authenticatedSession = await requestLogin(request)
		try {
			window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(authenticatedSession))
		} catch (error) {
			throw new Error('No se pudo guardar la sesión en esta pestaña.', { cause: error })
		}
		setSession(authenticatedSession)
	}, [])

	const logout = useCallback(() => {
		window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
		setSession(null)
	}, [])

	return (
		<AuthContext.Provider value={{ session, login, logout }}>
			{children}
		</AuthContext.Provider>
	)
}

export function useAuth(): AuthContextValue {
	const context = useContext(AuthContext)
	if (!context) throw new Error('useAuth debe utilizarse dentro de AuthProvider.')
	return context
}
