import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { authenticatedGet } from '../auth/api'
import { DEFAULT_SETTINGS } from '../config/settings'
import { runImport, runPaymentUpdate } from '../sync/service'
import type { RunItem, RunType, SyncRun } from '../interfaces/sync.interfaces'

const resultLabels: Record<RunItem['result'], string> = {
	imported: 'Importada',
	already_imported: 'Ya importada',
	excluded_status: 'Estado excluido',
	outside_window: 'Fuera de ventana',
	excluded_document: 'Documento excluido',
	invalid_customer: 'Cliente inválido',
	invalid_contract: 'Contrato inválido',
	incoherent_currency: 'Moneda incoherente',
	zero_balance: 'Saldo residual',
	limit_reached: 'Frenada por tope',
	paid: 'Marcada pagada',
	partial_payment: 'Abono parcial',
	no_evidence: 'Sin evidencia',
}

const runLabels: Record<RunType, string> = {
	import: 'Importación',
	payments: 'Actualización de pagadas',
}

const dateFormatter = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeStyle: 'short' })
const money = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' })
const counterLabels: Record<string, string> = {
	contractsScanned: 'Contratos recorridos',
	installmentsEvaluated: 'Cuotas evaluadas',
	customersCreated: 'Clientes creados',
	customersExisting: 'Clientes existentes',
	newInvoices: 'Facturas nuevas',
	newAmount: 'Monto nuevo',
	invoicesEvaluated: 'Facturas evaluadas',
	paidInvoices: 'Facturas pagadas',
	partialPayments: 'Abonos parciales',
	noEvidence: 'Sin evidencia',
}

function formatDate(value: string): string {
	return dateFormatter.format(new Date(value))
}

function summaryCounters(run: SyncRun): string {
	return Object.entries(run.counters)
		.map(([key, value]) => `${counterLabels[key] ?? key}: ${key === 'newAmount' ? money.format(value) : value}`)
		.join(' · ')
}

export default function SynchronizationPage() {
	const { session } = useAuth()
	const [runs, setRuns] = useState<SyncRun[]>([])
	const [running, setRunning] = useState<string | null>(null)
	const [error, setError] = useState('')
	const [expandedRun, setExpandedRun] = useState<string | null>(null)

	useEffect(() => {
		document.title = 'Sincronización · Prueba de facturación'
		if (!session) return
		void authenticatedGet<Array<Record<string, unknown>>>('/sync/runs', session.accessToken)
			.then((rows) => setRuns(rows.map((row) => ({
				id: String(row.id),
				type: row.type as RunType,
				simulation: Boolean(row.simulation),
				status: row.status as SyncRun['status'],
				startedAt: String(row.started_at),
				finishedAt: String(row.finished_at),
				summary: String(row.summary),
				counters: (row.counters ?? {}) as Record<string, number>,
				items: [],
				error: typeof row.error === 'string' ? row.error : undefined,
			}))))
			.catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial.'))
	}, [session])

	async function execute(type: RunType, simulation: boolean) {
		if (!session) return
		if (!simulation) {
			const action = type === 'import' ? 'importar clientes y facturas' : 'actualizar las facturas pagadas'
			if (!window.confirm(`¿Confirmas que deseas ${action}? Esta acción escribirá cambios en Cobrix.`)) return
		}
		setRunning(type)
		setError('')
		try {
			const result = type === 'import'
				? await runImport(session.accessToken, DEFAULT_SETTINGS, simulation)
				: await runPaymentUpdate(session.accessToken, simulation)
			const run = result as unknown as SyncRun
			setRuns((current) => [run, ...current])
			setExpandedRun(run.id)
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : 'La corrida falló.'
			setError(message)
		} finally {
			setRunning(null)
		}
	}

	if (!session) {
		return (
			<>
				<div className="head"><div><h1>Sincronización</h1><p>Importa datos y actualiza las facturas pagadas.</p></div></div>
				<section className="rounded-[10px] border border-line bg-surface p-5">
					<p className="m-0 text-muted">Configura la conexión con el administrador para ejecutar corridas.</p>
					<Link className="mt-4 inline-block rounded-md border border-primary bg-primary px-4 py-2 font-semibold !text-primary-fg hover:no-underline hover:opacity-90" to="/configuracion">Ir a configuración</Link>
				</section>
			</>
		)
	}

	return (
		<>
			<div className="head">
				<div>
					<h1>Sincronización</h1>
					<p>Importa clientes y facturas, y actualiza los pagos registrados por el proveedor.</p>
				</div>
			</div>
			{error && <p className="flash bad" role="alert">{error}</p>}
			<div className="grid gap-4 lg:grid-cols-2">
				<SyncActionCard
					title="Importar clientes y facturas"
					description="Recorre los contratos, aplica las reglas de Configuración y crea las facturas pendientes."
					running={running !== null}
					onRun={(simulation) => void execute('import', simulation)}
				/>
				<SyncActionCard
					title="Actualizar facturas pagadas"
					description="Compara las facturas abiertas con el libro de cuotas del administrador."
					running={running !== null}
					onRun={(simulation) => void execute('payments', simulation)}
				/>
			</div>
			<section className="min-w-0 rounded-[10px] border border-line bg-surface">
				<header className="border-b border-line px-4 py-3.5">
					<h2>Historial de corridas</h2>
					<p className="mb-0 mt-1 text-xs text-muted">Las últimas 50 corridas se conservan en este navegador.</p>
				</header>
				<div className="p-4">
					{runs.length === 0 && <p className="py-8 text-center text-muted">Aún no hay corridas. Puedes simular una importación para revisar sus resultados.</p>}
					{runs.length > 0 && (
						<div className="overflow-x-auto">
							<table className="w-full min-w-[900px] border-collapse">
								<thead><tr><th>Tipo</th><th>Fecha</th><th>Modo</th><th>Estado</th><th>Resultado</th><th>Detalle</th></tr></thead>
								<tbody>
									{runs.map((run) => (
										<RunRow expanded={expandedRun === run.id} key={run.id} onToggle={() => setExpandedRun(expandedRun === run.id ? null : run.id)} run={run} />
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

function SyncActionCard({ title, description, running, onRun }: {
	readonly title: string
	readonly description: string
	readonly running: boolean
	readonly onRun: (simulation: boolean) => void
}) {
	return (
		<section className="rounded-[10px] border border-line bg-surface p-4">
			<h2>{title}</h2>
			<p className="mt-1 text-sm text-muted">{description}</p>
			<div className="mt-4 flex flex-wrap gap-2">
				<button className="btn primary" disabled={running} onClick={() => onRun(false)} type="button">Ejecutar</button>
				<button className="btn" disabled={running} onClick={() => onRun(true)} type="button">Simular</button>
			</div>
		</section>
	)
}

function RunRow({ run, expanded, onToggle }: { readonly run: SyncRun; readonly expanded: boolean; readonly onToggle: () => void }) {
	const [resultFilter, setResultFilter] = useState<RunItem['result'] | 'all'>('all')
	const [page, setPage] = useState(0)
	const pageSize = 10
	const filteredItems = useMemo(
		() => resultFilter === 'all' ? run.items : run.items.filter((item) => item.result === resultFilter),
		[resultFilter, run.items],
	)
	const pageCount = Math.max(1, Math.ceil(filteredItems.length / pageSize))
	const pageItems = filteredItems.slice(page * pageSize, (page + 1) * pageSize)
	const updateFilter = (value: RunItem['result'] | 'all') => {
		setResultFilter(value)
		setPage(0)
	}
	return (
		<>
			<tr>
				<td>{runLabels[run.type]}</td>
				<td>{formatDate(run.startedAt)}</td>
				<td><span className={`pill ${run.simulation ? 'info' : 'mute'}`}>{run.simulation ? 'Simulación' : 'Ejecución'}</span></td>
				<td><span className={`pill ${run.status === 'completed' ? 'ok' : 'bad'}`}>{run.status === 'completed' ? 'Completada' : 'Falló'}</span></td>
				<td>
					<strong className="block">{run.summary}</strong>
					<small className="text-muted">{summaryCounters(run)}</small>
				</td>
				<td><button className="btn small" onClick={onToggle} type="button">{expanded ? 'Ocultar' : 'Ver detalle'}</button></td>
			</tr>
			{expanded && (
				<tr>
					<td colSpan={6}>
						<div className="grid gap-3">
							{run.error && <p className="flash bad m-0">{run.error}</p>}
							{run.items.length > 0 && (
								<div className="flex flex-wrap items-center justify-between gap-3">
									<label className="flex items-center gap-2 text-sm text-muted" htmlFor={`result-filter-${run.id}`}>
										Filtrar resultado
										<select className="rounded-md border border-line bg-surface px-2 py-1.5 text-fg" id={`result-filter-${run.id}`} onChange={(event) => updateFilter(event.target.value as RunItem['result'] | 'all')} value={resultFilter}>
											<option value="all">Todos ({run.items.length})</option>
											{Object.entries(resultLabels).filter(([result]) => run.items.some((item) => item.result === result)).map(([result, label]) => (
												<option key={result} value={result}>{label}</option>
											))}
										</select>
									</label>
									<span className="text-xs text-muted">{filteredItems.length} resultado{filteredItems.length === 1 ? '' : 's'}</span>
								</div>
							)}
							{run.items.length === 0 && !run.error && <p className="m-0 text-muted">La corrida no produjo filas de detalle.</p>}
							{pageItems.length > 0 && (
								<div className="overflow-x-auto">
									<table className="w-full min-w-[720px] border-collapse">
										<thead><tr><th>Cuota</th><th>Contrato</th><th>Cliente</th><th>Periodo</th><th>Resultado</th><th>Monto</th><th>Motivo</th></tr></thead>
										<tbody>
											{pageItems.map((item) => (
												<tr key={`${run.id}-${item.id}`}>
													<td className="mono">{item.id}</td><td>{item.contractId ?? '—'}</td><td>{item.customerDocument ?? '—'}</td><td>{item.period ?? '—'}</td><td><span className="pill info">{resultLabels[item.result]}</span></td><td>{item.amount === undefined ? '—' : money.format(item.amount)}</td><td>{item.reason}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
							{filteredItems.length > pageSize && (
								<div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-sm">
									<span className="text-muted">Página {page + 1} de {pageCount}</span>
									<div className="flex gap-2">
										<button className="btn" disabled={page === 0} onClick={() => setPage((current) => current - 1)} type="button">Anterior</button>
										<button className="btn" disabled={page >= pageCount - 1} onClick={() => setPage((current) => current + 1)} type="button">Siguiente</button>
									</div>
								</div>
							)}
						</div>
					</td>
				</tr>
			)}
		</>
	)
}
