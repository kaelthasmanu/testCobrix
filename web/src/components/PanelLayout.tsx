import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import type { AuthSession } from '../auth/api'

const navigation = [
	{ href: '/', label: 'Resumen' },
	{ href: '/clientes', label: 'Clientes' },
	{ href: '/sincronizacion', label: 'Sincronización' },
	{ href: '/configuracion', label: 'Configuración' },
]

const validTones = ['ok', 'warn', 'bad', 'info', 'mute'] as const

export function PanelLayout({ children, session, onLogout }: {
	readonly children: ReactNode
	readonly session: AuthSession
	readonly onLogout: () => void
}) {
	const location = useLocation()
	const params = new URLSearchParams(location.search)
	const text = params.get('msg')
	const requestedTone = params.get('tone')
	const tone = validTones.find((item) => item === requestedTone)

	return (
		<div className="grid min-h-screen grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
			<aside className="flex h-auto flex-row flex-wrap items-center gap-[18px] border-b border-line bg-surface px-3 py-[18px] md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:border-b-0 md:border-r">
				<div className="flex items-center gap-2.5 px-1.5">
					<span className="grid size-8 place-items-center rounded-lg bg-primary font-bold text-primary-fg">C</span>
					<div>
						<strong className="block">Cobrix</strong>
						<small className="block text-xs text-muted">Prueba de facturación</small>
					</div>
				</div>
				<nav className="flex flex-wrap gap-0.5 md:grid">
					{navigation.map(({ href, label }) => (
						<NavLink
							key={href}
							to={href}
							end={href === '/'}
							className={({ isActive }) =>
								`rounded-md px-2.5 py-2 font-medium text-fg hover:bg-sunken hover:no-underline ${isActive ? 'bg-primary-soft text-primary' : ''}`
							}
						>
							{label}
						</NavLink>
					))}
				</nav>
				<div className="flex w-full items-center justify-between gap-3 border-t border-line pt-3 md:mt-auto md:border-0 md:px-1.5 md:pt-0">
					<div className="min-w-0 text-xs text-muted">
						<strong className="block truncate font-medium text-fg">{session.usuario}</strong>
						<span className="block truncate">{session.email}</span>
					</div>
					<button className="text-xs font-medium text-primary hover:underline" onClick={onLogout} type="button">
						Cerrar sesión
					</button>
				</div>
			</aside>
			<main className="grid min-w-0 content-start gap-5 px-4 pb-[60px] pt-4 md:max-w-[1280px] md:px-7 md:pt-6">
				{text && tone && <div className={`flash ${tone}`} role="status">{text}</div>}
				{children}
			</main>
		</div>
	)
}
