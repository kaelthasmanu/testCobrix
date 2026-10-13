import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

interface LoginLocationState {
	readonly from?: {
		readonly pathname?: string
		readonly search?: string
		readonly hash?: string
	}
}

export default function LoginPage() {
	const { session, login } = useAuth()
	const location = useLocation()
	const navigate = useNavigate()
	const [userName, setUserName] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)
	const state = location.state as LoginLocationState | null

	if (session) {
		const from = state?.from
		return <Navigate to={from ? `${from.pathname ?? '/'}${from.search ?? ''}${from.hash ?? ''}` : '/'} replace />
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setError('')
		setIsSubmitting(true)
		try {
			await login({ user_name: userName.trim(), password })
			const from = state?.from
			navigate(from ? `${from.pathname ?? '/'}${from.search ?? ''}${from.hash ?? ''}` : '/', { replace: true })
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo iniciar sesión.')
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<main className="grid min-h-screen place-items-center bg-bg px-4 py-10">
			<section className="w-full max-w-[420px] rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
				<div className="mb-8 flex items-center gap-3">
					<span className="grid size-10 place-items-center rounded-lg bg-primary text-lg font-bold text-primary-fg">C</span>
					<div>
						<strong className="block text-base">Cobrix</strong>
						<small className="text-xs text-muted">Prueba de facturación</small>
					</div>
				</div>
				<h1 className="text-2xl">Iniciar sesión</h1>
				<p className="mb-6 mt-2 text-sm text-muted">Ingresa tus credenciales para continuar al panel.</p>
				<form className="grid gap-4" onSubmit={handleSubmit}>
					<label className="grid gap-1.5 text-[13px] font-semibold" htmlFor="user_name">
						Usuario
						<input
							autoComplete="username"
							autoFocus
							className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm font-normal text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary"
							id="user_name"
							name="user_name"
							onChange={(event) => setUserName(event.target.value)}
							required
							value={userName}
						/>
					</label>
					<label className="grid gap-1.5 text-[13px] font-semibold" htmlFor="password">
						Contraseña
						<input
							autoComplete="current-password"
							className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm font-normal text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary"
							id="password"
							name="password"
							onChange={(event) => setPassword(event.target.value)}
							required
							type="password"
							value={password}
						/>
					</label>
					{error && <p className="flash bad" role="alert">{error}</p>}
					<button
						className="mt-1 rounded-md border border-primary bg-primary px-4 py-2.5 font-semibold text-primary-fg hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
						disabled={isSubmitting}
						type="submit"
					>
						{isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
					</button>
				</form>
			</section>
		</main>
	)
}
