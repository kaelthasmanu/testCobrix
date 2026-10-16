import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Tone } from '../lib/format'

export function PageHead({ title, description, actions }: { readonly title: string; readonly description?: ReactNode; readonly actions?: ReactNode }) {
	return (
		<div className="head">
			<div>
				<h1>{title}</h1>
				{description && <p>{description}</p>}
			</div>
			{actions && <div className="flex flex-wrap gap-2">{actions}</div>}
		</div>
	)
}

export function Card({ title, detail, actions, children, className = '' }: { readonly title?: ReactNode; readonly detail?: ReactNode; readonly actions?: ReactNode; readonly children: ReactNode; readonly className?: string }) {
	return (
		<section className={`min-w-0 rounded-[10px] border border-line bg-surface ${className}`}>
			{title && (
				<header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
					<div>
						<h2>{title}</h2>
						{detail && <p className="mb-0 mt-0.5 text-xs text-muted">{detail}</p>}
					</div>
					{actions}
				</header>
			)}
			{children}
		</section>
	)
}

export function Metric({ label, value, hint, tone }: { readonly label: string; readonly value: ReactNode; readonly hint?: ReactNode; readonly tone?: Tone }) {
	const color = tone === 'ok' ? 'text-[var(--ok)]' : tone === 'warn' ? 'text-[var(--warn)]' : tone === 'bad' ? 'text-[var(--bad)]' : ''
	return (
		<div className="grid content-start gap-0.5 rounded-[10px] border border-line bg-surface px-3.5 py-3">
			<span className="text-xs text-muted">{label}</span>
			<strong className={`text-xl tabular-nums ${color}`}>{value}</strong>
			{hint && <span className="text-xs text-muted">{hint}</span>}
		</div>
	)
}

export function Pill({ tone, children }: { readonly tone: Tone; readonly children: ReactNode }) {
	return <span className={`pill ${tone}`}>{children}</span>
}

/** Un vacío que explica qué hacer. */
export function EmptyState({ title, children, action }: { readonly title: string; readonly children?: ReactNode; readonly action?: ReactNode }) {
	return (
		<div className="grid justify-items-center gap-2 px-4 py-10 text-center">
			<strong>{title}</strong>
			{children && <p className="m-0 max-w-[56ch] text-sm text-muted">{children}</p>}
			{action && <div className="mt-2">{action}</div>}
		</div>
	)
}

/** Un error que dice qué pasó y cómo seguir. */
export function ErrorNotice({ title = 'Algo salió mal', message, hint, onRetry }: { readonly title?: string; readonly message: string; readonly hint?: ReactNode; readonly onRetry?: () => void }) {
	return (
		<div className="flash bad grid gap-1" role="alert">
			<strong>{title}</strong>
			<span className="font-normal">{message}</span>
			{hint && <span className="text-xs font-normal opacity-90">{hint}</span>}
			{onRetry && <button className="btn mt-1 w-fit" onClick={onRetry} type="button">Reintentar</button>}
		</div>
	)
}

export function ButtonLink({ to, children, primary = false }: { readonly to: string; readonly children: ReactNode; readonly primary?: boolean }) {
	return <Link className={`btn inline-block hover:no-underline ${primary ? 'primary !text-primary-fg' : '!text-fg'}`} to={to}>{children}</Link>
}

export function ProgressBar({ value, max, label }: { readonly value: number; readonly max: number; readonly label: string }) {
	const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
	return (
		<div className="grid gap-1.5">
			<div className="flex justify-between gap-3 text-xs text-muted"><span>{label}</span><span className="tabular-nums">{max > 0 ? `${value} de ${max}` : ''}</span></div>
			<div aria-label={label} aria-valuemax={max || undefined} aria-valuemin={0} aria-valuenow={max ? value : undefined} className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar">
				<div className={`h-full rounded-full bg-primary transition-[width] duration-300 ${max === 0 ? 'w-1/3 animate-pulse' : ''}`} style={max > 0 ? { width: `${percent}%` } : undefined} />
			</div>
		</div>
	)
}

/** Confirmación antes de una acción que escribe. Usa `<dialog>` nativo: foco atrapado y Escape para cancelar. */
export function ConfirmDialog({ open, title, children, confirmLabel, onConfirm, onCancel }: { readonly open: boolean; readonly title: string; readonly children: ReactNode; readonly confirmLabel: string; readonly onConfirm: () => void; readonly onCancel: () => void }) {
	const ref = useRef<HTMLDialogElement>(null)
	useEffect(() => {
		const dialog = ref.current
		if (!dialog) return
		if (open && !dialog.open) dialog.showModal()
		if (!open && dialog.open) dialog.close()
	}, [open])
	return (
		<dialog className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[12px] border border-line bg-surface p-0 text-fg backdrop:bg-black/40" onCancel={(event) => { event.preventDefault(); onCancel() }} ref={ref}>
			<div className="grid gap-3 p-5">
				<h2>{title}</h2>
				<div className="text-sm text-muted">{children}</div>
				<div className="mt-2 flex flex-wrap justify-end gap-2">
					<button className="btn" onClick={onCancel} type="button">Cancelar</button>
					<button autoFocus className="btn primary" onClick={onConfirm} type="button">{confirmLabel}</button>
				</div>
			</div>
		</dialog>
	)
}

export function Loading({ label }: { readonly label: string }) {
	return <p className="py-8 text-center text-muted" role="status">{label}</p>
}

const PAGE_SIZES = [10, 20, 50, 100] as const

/** Pie de tabla paginada en el servidor: rango visible, tamaño de página y anterior/siguiente. */
export function Pagination({ page, pageSize, total, pageCount, onPage, onPageSize, noun = 'filas' }: {
	readonly page: number
	readonly pageSize: number
	readonly total: number
	readonly pageCount: number
	readonly onPage: (page: number) => void
	readonly onPageSize?: (pageSize: number) => void
	readonly noun?: string
}) {
	if (total === 0) return null
	const from = (page - 1) * pageSize + 1
	const to = Math.min(total, page * pageSize)
	return (
		<nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm">
			<span className="text-muted tabular-nums">{from}–{to} de {total.toLocaleString('es-VE')} {noun}</span>
			<div className="flex flex-wrap items-center gap-2">
				{onPageSize && (
					<label className="flex items-center gap-2 text-muted">Por página
						<select className="!w-auto" onChange={(event) => onPageSize(Number(event.target.value))} value={pageSize}>
							{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
						</select>
					</label>
				)}
				<span className="text-muted tabular-nums">Página {page} de {pageCount}</span>
				<button aria-label="Página anterior" className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)} type="button">Anterior</button>
				<button aria-label="Página siguiente" className="btn" disabled={page >= pageCount} onClick={() => onPage(page + 1)} type="button">Siguiente</button>
			</div>
		</nav>
	)
}
