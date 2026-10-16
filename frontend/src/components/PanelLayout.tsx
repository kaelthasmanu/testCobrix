import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useTheme } from '../lib/theme'

const navigation = [
	{ href: '/', label: 'Resumen' },
	{ href: '/clientes', label: 'Clientes' },
	{ href: '/sincronizacion', label: 'Sincronización' },
	{ href: '/configuracion', label: 'Configuración' },
]

export function PanelLayout({ children }: { readonly children: ReactNode }) {
	const { theme, toggleTheme } = useTheme()
	return (
		<div className="grid min-h-screen grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
			<aside className="flex h-auto flex-row flex-wrap items-center gap-x-[18px] gap-y-3 border-b border-line bg-surface px-3 py-3 md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:border-b-0 md:border-r md:py-[18px]">
				<div className="flex items-center gap-2.5 px-1.5">
					<span className="grid size-8 place-items-center rounded-lg bg-primary font-bold text-primary-fg">C</span>
					<div>
						<strong className="block">Cobrix</strong>
						<small className="block text-xs text-muted">Facturas del ISP</small>
					</div>
				</div>
				<nav aria-label="Principal" className="flex w-full flex-wrap gap-0.5 md:grid">
					{navigation.map(({ href, label }) => (
						<NavLink
							key={href}
							to={href}
							end={href === '/'}
							className={({ isActive }) =>
								`rounded-md px-2.5 py-2 font-medium text-fg hover:bg-sunken hover:no-underline ${isActive ? 'bg-primary-soft !text-primary' : ''}`
							}
						>
							{label}
						</NavLink>
					))}
				</nav>
				<button
					aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
					className="group flex items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-2 text-left text-sm font-medium text-fg transition-colors hover:border-primary hover:bg-primary-soft md:mt-auto"
					onClick={toggleTheme}
					type="button"
				>
					<span className="grid size-7 place-items-center rounded-md bg-surface text-primary shadow-sm transition-transform group-hover:scale-105" aria-hidden="true">
						{theme === 'dark' ? (
							<svg fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M12 3v1.5M12 19.5V21M4.5 12H3M21 12h-1.5M5.64 5.64 4.58 4.58M19.42 19.42l-1.06-1.06M18.36 5.64l1.06-1.06M4.58 19.42l1.06-1.06M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>
						) : (
							<svg fill="none" height="16" viewBox="0 0 24 24" width="16"><path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z" fill="currentColor" /></svg>
						)}
					</span>
					<span className="flex-1">{theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
					<span className="text-xs text-muted">{theme === 'dark' ? 'Claro' : 'Oscuro'}</span>
				</button>
			</aside>
			<main className="grid min-w-0 content-start gap-5 px-4 pb-[60px] pt-4 md:px-7 md:pt-6">
				{children}
			</main>
		</div>
	)
}
