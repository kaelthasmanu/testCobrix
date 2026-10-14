export interface AuthCredentials {
	readonly user_name: string
	readonly password: string
}

export interface AuthSession {
	readonly usuario: string
	readonly email: string
	readonly accessToken: string
	readonly expiresAt: number
}

export interface AuthContextValue {
	readonly session: AuthSession | null
	readonly authenticate: (credentials: AuthCredentials) => Promise<void>
	readonly disconnect: () => void
}
