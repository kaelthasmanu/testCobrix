import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { authenticatedGet } from '../auth/api'
import { useAuth } from '../auth/AuthContext'
import type { SummaryResponse } from '../interfaces/SummaryPage.interfaces'

const apiUrl = import.meta.env.VITE_COBRIX_API_URL ?? 'http://127.0.0.1:4320'
const money = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' })
const dateFormatter = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeStyle: 'short' })

function formatDate(value: string): string {
	return dateFormatter.format(new Date(value))
}

function runTypeLabel(run: SummaryResponse['recentRuns'][number]): string {
	return run.type === 'import' ? 'Importación' : 'Actualización de pagadas'
}

function runTone(run: SummaryResponse['recentRuns'][number]): string {
	return run.status === 'completed' ? 'ok' : 'bad'
}

function runStatusLabel(run: SummaryResponse['recentRuns'][number]): string {
	return run.status === 'completed' ? 'Completada' : 'Falló'
}

export default function SummaryPage() {
	const { session } = useAuth()
	const [summary, setSummary] = useState<SummaryResponse | null>(null)
	const [error, setError] = useState('')

	useEffect(() => {
		document.title = 'Resumen · Prueba de facturación'
		if (!session) return
		void authenticatedGet<SummaryResponse>('/summary', session.accessToken)
			.then(setSummary)
			.catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No se pudo cargar el resumen.'))
	}, [session])

	if (!session) return <section className="rounded-[10px] border border-line bg-surface p-5">Configura la conexión con el administrador en <Link to="/configuracion">Configuración</Link>.</section>
	if (error) return <p className="flash bad" role="alert">{error}</p>
	if (!summary) return <p className="text-muted">Cargando resumen…</p>
	const { metrics, automaticRun, recentRuns } = summary

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
				<MetricCard label="Clientes importados" value={metrics.clients} />
				<MetricCard label="Contratos" value={metrics.contracts} />
				<MetricCard label="Facturas abiertas" value={metrics.openInvoices} />
				<MetricCard label="Facturas pagadas" value={metrics.paidInvoices} />
				<MetricCard label="Monto por cobrar" value={money.format(metrics.receivable)} />
			</section>

			<div className="grid gap-5 lg:grid-cols-2">
				<section className="rounded-[10px] border border-line bg-surface">
					<header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3.5">
						<h2>Proveedor configurado</h2>
						<Link className="text-sm font-medium hover:no-underline hover:underline" to="/configuracion">Editar configuración</Link>
					</header>
					<div className="grid gap-3 p-4">
						<dl className="facts">
							<dt>URL de la API</dt><dd className="mono break-all">{apiUrl}</dd>
							<dt>Usuario</dt><dd>{summary.provider?.usuario ?? '—'}</dd>
							<dt>Correo</dt><dd>{summary.provider?.email || session.email}</dd>
							<dt>Estado</dt><dd><span className={`pill ${summary.provider ? 'ok' : 'warn'}`}>{summary.provider ? 'Conectado' : 'Sin conexión'}</span></dd>
						</dl>
						{!session && <Link className="btn primary w-fit !text-primary-fg hover:no-underline" to="/configuracion">Configurar proveedor</Link>}
					</div>
				</section>

				<section className="rounded-[10px] border border-line bg-surface">
					<header className="border-b border-line px-4 py-3.5"><h2>Corrida automática</h2></header>
					<div className="grid gap-3 p-4">
						<div className="flex items-center gap-2">
							<span className={`pill ${automaticRun.enabled ? 'ok' : 'mute'}`}>
							{automaticRun.enabled ? 'Activa' : 'Inactiva'}
							</span>
							<strong>{automaticRun.enabled ? `Todos los días a las ${automaticRun.time}` : 'No programada'}</strong>
						</div>
						<p className="m-0 text-sm text-muted">
							{automaticRun.enabled
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
												<td>{formatDate(run.started_at)}</td>
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
