import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { loadSettings } from '../config/settings'
import { runImport, runPaymentUpdate } from '../sync/service'
import { loadRuns, saveRun, type RunItem, type RunType, type SyncRun } from '../sync/storage'

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

function formatDate(value: string): string {
	return dateFormatter.format(new Date(value))
}

function summaryCounters(run: SyncRun): string {
	return Object.entries(run.counters)
		.filter(([key]) => key !== 'newAmount')
		.map(([key, value]) => `${key}: ${value}`)
		.join(' · ')
}

export default function SynchronizationPage() {
	const { session } = useAuth()
	const [runs, setRuns] = useState<SyncRun[]>(loadRuns)
	const [running, setRunning] = useState<string | null>(null)
	const [error, setError] = useState('')
	const [expandedRun, setExpandedRun] = useState<string | null>(null)

	useEffect(() => {
		document.title = 'Sincronización · Prueba de facturación'
	}, [])

	async function execute(type: RunType, simulation: boolean) {
		if (!session) return
		const startedAt = new Date().toISOString()
		const id = `${type}-${startedAt}`
		setRunning(id)
		setError('')
		try {
			const result = type === 'import'
				? await runImport(session.accessToken, loadSettings(), simulation)
				: await runPaymentUpdate(session.accessToken, simulation)
			const run: SyncRun = {
				id,
				type,
				simulation,
				status: 'completed',
				startedAt,
				finishedAt: new Date().toISOString(),
				summary: result.summary,
				counters: result.counters,
				items: result.items,
			}
			saveRun(run)
			setRuns(loadRuns())
			setExpandedRun(id)
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : 'La corrida falló.'
			const failedRun: SyncRun = {
				id,
				type,
				simulation,
				status: 'failed',
				startedAt,
				finishedAt: new Date().toISOString(),
				summary: 'La corrida falló antes de completar.',
				counters: {},
				items: [],
				error: message,
			}
			saveRun(failedRun)
			setRuns(loadRuns())
			setExpandedRun(id)
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
							{run.items.length === 0 && !run.error && <p className="m-0 text-muted">La corrida no produjo filas de detalle.</p>}
							{run.items.length > 0 && (
								<div className="overflow-x-auto">
									<table className="w-full min-w-[720px] border-collapse">
										<thead><tr><th>Cuota</th><th>Contrato</th><th>Cliente</th><th>Periodo</th><th>Resultado</th><th>Monto</th><th>Motivo</th></tr></thead>
										<tbody>
											{run.items.map((item) => (
												<tr key={`${run.id}-${item.id}`}>
													<td className="mono">{item.id}</td><td>{item.contractId ?? '—'}</td><td>{item.customerDocument ?? '—'}</td><td>{item.period ?? '—'}</td><td><span className="pill info">{resultLabels[item.result]}</span></td><td>{item.amount === undefined ? '—' : money.format(item.amount)}</td><td>{item.reason}</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</div>
					</td>
				</tr>
			)}
		</>
	)
}
