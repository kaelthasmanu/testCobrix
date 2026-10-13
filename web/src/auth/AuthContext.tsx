import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { login as requestLogin, type AuthSession, type LoginRequest } from './api'

interface AuthContextValue {
	readonly session: AuthSession | null
	readonly login: (request: LoginRequest) => Promise<void>
	readonly logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
	const [session, setSession] = useState<AuthSession | null>(null)

	useEffect(() => {
		if (!session) return
		const timeout = window.setTimeout(
			() => setSession(null),
			Math.max(0, session.expiresAt - Date.now()),
		)
		return () => window.clearTimeout(timeout)
	}, [session])

	const login = useCallback(async (request: LoginRequest) => {
		const authenticatedSession = await requestLogin(request)
		setSession(authenticatedSession)
	}, [])

	const logout = useCallback(() => setSession(null), [])

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
