import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, ErrorNotice, Loading, PageHead, Pagination, Pill } from '../components/ui'
import type { Page, RunSummary, RunType, SettingsResponse } from '../interfaces/api.interfaces'
import { RUN_TYPE_LABELS, dateTime } from '../lib/format'
import { api, errorText } from '../lib/api'
import { downloadRunHistoryPdf } from '../lib/runHistoryPdf'
import { useSyncRunner } from '../lib/runner'
import { queryString, usePage, useResource } from '../lib/useResource'
import { ProviderMissing } from '../components/ProviderMissing'

const ACTIONS: ReadonlyArray<{ readonly type: RunType; readonly title: string; readonly description: string; readonly run: string; readonly simulate: string }> = [
	{ type: 'import', title: 'Importar clientes y facturas', description: 'Recorre todos los contratos del administrador y crea una factura abierta por cada cuota pendiente que cumpla las reglas de Configuración. Lo ya importado no se repite.', run: 'Importar', simulate: 'Simular importación' },
	{ type: 'payments', title: 'Actualizar facturas pagadas', description: 'Revisa cada factura abierta contra el libro de cuotas del administrador y marca pagadas las que el ISP cobró por completo. Un abono parcial se informa y la factura sigue abierta.', run: 'Actualizar pagadas', simulate: 'Simular actualización' },
]

export default function SynchronizationPage() {
	const [filter, setFilter] = useState<RunType | 'all'>('all')
	const [pageSize, setPageSize] = useState(20)
	const [exporting, setExporting] = useState(false)
	const [exportError, setExportError] = useState('')
	const [page, setPage] = usePage({ filter, pageSize })
	const { data, error, loading, reload } = useResource<Page<RunSummary>>(`/sync/runs${queryString({ type: filter === 'all' ? '' : filter, page, pageSize })}`)
	const runs = data?.items ?? null
	const runner = useSyncRunner()
	const { data: settings } = useResource<SettingsResponse>('/settings')
	const providerMissing = settings !== null && !(settings.provider.username && settings.provider.hasPassword)

	async function exportHistory(): Promise<void> {
		setExporting(true)
		setExportError('')
		try {
			const allRuns: RunSummary[] = []
			let exportPage = 1
			let pageCount = 1
			do {
				const result = await api<Page<RunSummary>>(`/sync/runs${queryString({ type: filter === 'all' ? '' : filter, page: exportPage, pageSize: 100 })}`)
				allRuns.push(...result.items)
				pageCount = result.pageCount
				exportPage += 1
			} while (exportPage <= pageCount)
			downloadRunHistoryPdf(allRuns, filter)
		} catch (cause) {
			setExportError(errorText(cause, 'No se pudo exportar el historial.'))
		} finally {
			setExporting(false)
		}
	}

	useEffect(() => {
		document.title = 'Sincronización · Cobrix'
	}, [])

	return (
		<>
			<PageHead description="Trae los datos del administrador a Cobrix. Cada acción tiene su versión «Simular», que calcula todo sin escribir nada." title="Sincronización" />
			{runner.dialog}
			{providerMissing && <ProviderMissing />}
			<div className="grid gap-4 lg:grid-cols-2">
				{ACTIONS.map((action) => (
					<Card key={action.type}>
						<div className="grid h-full content-between gap-4 p-4">
							<div>
								<h2>{action.title}</h2>
								<p className="mb-0 mt-1 text-sm text-muted">{action.description}</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<button className="btn primary" disabled={runner.running || providerMissing} onClick={() => runner.request(action.type, false)} type="button">{action.run}</button>
								<button className="btn" disabled={runner.running || providerMissing} onClick={() => runner.request(action.type, true)} type="button">{action.simulate}</button>
							</div>
						</div>
					</Card>
				))}
			</div>
			{runner.progressView}
			{runner.error && <ErrorNotice message={runner.error} title="No se pudo ejecutar la corrida" />}
			{exportError && <ErrorNotice message={exportError} onRetry={exportHistory} title="No se pudo exportar el historial" />}

			<Card
				actions={(
					<div className="flex flex-wrap items-center gap-2">
						<label className="flex items-center gap-2 text-sm text-muted" htmlFor="run-type-filter">Mostrar
							<select className="!w-auto" id="run-type-filter" onChange={(event) => setFilter(event.target.value as RunType | 'all')} value={filter}>
								<option value="all">Todas</option>
								<option value="import">Importaciones</option>
								<option value="payments">Actualizaciones de pagadas</option>
							</select>
						</label>
						<button className="btn" disabled={exporting || !data} onClick={exportHistory} type="button">{exporting ? 'Generando PDF…' : 'Exportar PDF'}</button>
					</div>
				)}
				detail="De la más reciente a la más vieja. Abre una corrida para ver sus contadores y una fila por cuota."
				title="Historial de corridas"
			>
				{loading && !data && <Loading label="Cargando historial…" />}
				{error && <div className="p-4"><ErrorNotice message={error} onRetry={reload} title="No se pudo cargar el historial" /></div>}
				{runs && runs.length === 0 && <EmptyState title="Aún no hay corridas">Empieza con «Simular importación»: verás qué se importaría sin crear nada.</EmptyState>}
				{runs && runs.length > 0 && (
					<div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
						<table className="w-full min-w-[760px] border-collapse">
							<thead><tr><th>Corrida</th><th>Fecha</th><th>Modo</th><th>Estado</th><th>Resumen</th><th aria-label="Acciones" /></tr></thead>
							<tbody>
								{runs.map((run) => (
									<tr className="hover:bg-sunken" key={run.id}>
										<td className="font-medium">{RUN_TYPE_LABELS[run.type]}{run.trigger === 'automatic' && <> <Pill tone="mute">Automática</Pill></>}</td>
										<td className="whitespace-nowrap">{dateTime(run.startedAt)}</td>
										<td><Pill tone={run.simulation ? 'info' : 'mute'}>{run.simulation ? 'Simulación' : 'Real'}</Pill></td>
										<td><Pill tone={run.status === 'completed' ? 'ok' : run.status === 'failed' ? 'bad' : 'info'}>{run.status === 'completed' ? 'Completada' : run.status === 'failed' ? 'Falló' : 'En curso'}</Pill></td>
										<td>{run.summary}{run.error && <span className="block text-xs text-[var(--bad)]">{run.error}</span>}</td>
										<td><Link className="whitespace-nowrap" to={`/sincronizacion/${run.id}`}>Ver detalle</Link></td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				{data && <Pagination noun="corridas" onPage={setPage} onPageSize={setPageSize} page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} />}
			</Card>
		</>
	)
}
