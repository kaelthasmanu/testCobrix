import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { loadSettings } from '../config/settings'
import { loadInvoices, loadRuns, type StoredInvoice, type SyncRun } from '../sync/storage'

const apiUrl = import.meta.env.VITE_API_URL ?? 'No configurada'
const money = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' })
const dateFormatter = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeStyle: 'short' })

interface SummaryMetrics {
	readonly customers: number
	readonly contracts: number
	readonly openInvoices: number
	readonly paidInvoices: number
	readonly outstandingAmount: number
}

function calculateMetrics(invoices: readonly StoredInvoice[]): SummaryMetrics {
	return {
		customers: new Set(invoices.map((invoice) => invoice.customerDocument)).size,
		contracts: new Set(invoices.map((invoice) => invoice.contractId)).size,
		openInvoices: invoices.filter((invoice) => invoice.status === 'open').length,
		paidInvoices: invoices.filter((invoice) => invoice.status === 'paid').length,
		outstandingAmount: invoices
			.filter((invoice) => invoice.status === 'open')
			.reduce((total, invoice) => total + invoice.balance, 0),
	}
}

function formatDate(value: string): string {
	return dateFormatter.format(new Date(value))
}

function runTypeLabel(run: SyncRun): string {
	return run.type === 'import' ? 'Importación' : 'Actualización de pagadas'
}

function runTone(run: SyncRun): string {
	return run.status === 'completed' ? 'ok' : 'bad'
}

function runStatusLabel(run: SyncRun): string {
	return run.status === 'completed' ? 'Completada' : 'Falló'
}

export default function SummaryPage() {
	const { session } = useAuth()
	const settings = useMemo(loadSettings, [])
	const invoices = useMemo(loadInvoices, [])
	const runs = useMemo(loadRuns, [])
	const metrics = useMemo(() => calculateMetrics(invoices), [invoices])
	const recentRuns = runs.slice(0, 5)

	useEffect(() => {
		document.title = 'Resumen · Prueba de facturación'
	}, [])

	return (
		<>
			<div className="head">
				<div>
					<h1>Resumen</h1>
					<p>Vista general de la integración con el administrador de facturas.</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Link className="btn primary !text-primary-fg hover:no-underline" to="/sincronizacion">Importar cuotas</Link>
					<Link className="btn hover:no-underline" to="/sincronizacion">Actualizar pagadas</Link>
				</div>
			</div>

			<section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
				<MetricCard label="Clientes importados" value={metrics.customers} />
				<MetricCard label="Contratos" value={metrics.contracts} />
				<MetricCard label="Facturas abiertas" value={metrics.openInvoices} />
				<MetricCard label="Facturas pagadas" value={metrics.paidInvoices} />
				<MetricCard label="Monto por cobrar" value={money.format(metrics.outstandingAmount)} />
			</section>

			<div className="grid gap-5 lg:grid-cols-2">
				<section className="rounded-[10px] border border-line bg-surface">
					<header className="border-b border-line px-4 py-3.5"><h2>Proveedor configurado</h2></header>
					<div className="grid gap-3 p-4">
						<dl className="facts">
							<dt>URL de la API</dt><dd className="mono break-all">{apiUrl}</dd>
							<dt>Usuario</dt><dd>{session?.usuario ?? '—'}</dd>
							<dt>Correo</dt><dd>{session?.email ?? '—'}</dd>
							<dt>Estado</dt><dd><span className={`pill ${session ? 'ok' : 'warn'}`}>{session ? 'Conectado' : 'Sin conexión'}</span></dd>
						</dl>
						{!session && <Link className="btn primary w-fit !text-primary-fg hover:no-underline" to="/configuracion">Configurar proveedor</Link>}
					</div>
				</section>

				<section className="rounded-[10px] border border-line bg-surface">
					<header className="border-b border-line px-4 py-3.5"><h2>Corrida automática</h2></header>
					<div className="grid gap-3 p-4">
						<div className="flex items-center gap-2">
							<span className={`pill ${settings.automaticRunEnabled ? 'ok' : 'mute'}`}>
								{settings.automaticRunEnabled ? 'Activa' : 'Inactiva'}
							</span>
							<strong>{settings.automaticRunEnabled ? `Todos los días a las ${settings.automaticRunTime}` : 'No programada'}</strong>
						</div>
						<p className="m-0 text-sm text-muted">
							{settings.automaticRunEnabled
								? 'La programación está guardada para ejecutarse en America/Caracas.'
								: 'Activa una corrida diaria desde Configuración.'}
						</p>
						<Link className="btn w-fit hover:no-underline" to="/configuracion">Ver configuración</Link>
					</div>
				</section>
			</div>

			<section className="rounded-[10px] border border-line bg-surface">
				<header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5">
					<div>
						<h2>Últimas corridas</h2>
						<p className="mb-0 mt-1 text-xs text-muted">Historial reciente de importaciones y actualizaciones.</p>
					</div>
					<Link to="/sincronizacion">Ver historial completo</Link>
				</header>
				<div className="p-4">
					{recentRuns.length === 0
						? <p className="m-0 py-5 text-center text-muted">Aún no hay corridas registradas.</p>
						: (
							<div className="overflow-x-auto">
								<table className="w-full min-w-[680px] border-collapse">
									<thead><tr><th>Tipo</th><th>Fecha</th><th>Modo</th><th>Estado</th><th>Resultado</th></tr></thead>
									<tbody>
										{recentRuns.map((run) => (
											<tr key={run.id}>
												<td>{runTypeLabel(run)}</td>
												<td>{formatDate(run.startedAt)}</td>
												<td><span className="pill info">{run.simulation ? 'Simulación' : 'Ejecución'}</span></td>
												<td><span className={`pill ${runTone(run)}`}>{runStatusLabel(run)}</span></td>
												<td>{run.summary}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
				</div>
			</section>

		</>
	)
}

function MetricCard({ label, value }: { readonly label: string; readonly value: number | string }) {
	return (
		<div className="grid gap-1 rounded-[10px] border border-line bg-surface p-3.5">
			<span className="text-xs text-muted">{label}</span>
			<strong className="text-xl tabular-nums">{value}</strong>
		</div>
	)
}
