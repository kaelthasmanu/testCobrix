import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ButtonLink, Card, EmptyState, ErrorNotice, Loading, Metric, PageHead, Pagination, Pill } from '../components/ui'
import type { Page, RunDetail, RunItem } from '../interfaces/api.interfaces'
import { HIGHLIGHTED_COUNTERS, RUN_TYPE_LABELS, counterLabel, counterValue, dateTime, money, resultLabel } from '../lib/format'
import { queryString, useDebounced, usePage, useResource } from '../lib/useResource'


export default function RunDetailPage() {
	const { runId = '' } = useParams()
	const { data: run, error, loading, reload } = useResource<RunDetail>(`/sync/runs/${encodeURIComponent(runId)}`)

	useEffect(() => {
		document.title = 'Detalle de corrida · Cobrix'
	}, [])

	if (loading && !run) return <Loading label="Cargando corrida…" />
	if (error || !run) return <ErrorNotice hint={<Link to="/sincronizacion">Volver al historial</Link>} message={error || 'La corrida no existe.'} onRetry={reload} title="No se pudo abrir la corrida" />
	return <RunDetailContent run={run} />
}

function RunDetailContent({ run }: { readonly run: RunDetail }) {
	const [result, setResult] = useState('')
	const [searchInput, setSearchInput] = useState('')
	const search = useDebounced(searchInput.trim())
	const [pageSize, setPageSize] = useState(25)
	const [page, setPage] = usePage({ result, search, pageSize })
	// Una corrida de un ISP grande puede tener miles de filas: se piden de a una página, ya filtradas.
	const { data: items, error, loading, reload } = useResource<Page<RunItem>>(`/sync/runs/${encodeURIComponent(run.id)}/items${queryString({ result, search, page, pageSize })}`)

	const resultCounts = Object.entries(run.resultCounts)
	const highlighted = HIGHLIGHTED_COUNTERS[run.type]
	const otherCounters = Object.entries(run.counters).filter(([key]) => !highlighted.includes(key) && !(key in run.resultCounts))

	return (
		<>
			<div><Link className="text-sm" to="/sincronizacion">← Historial de corridas</Link></div>
			<PageHead
				actions={<ButtonLink to="/sincronizacion">Nueva corrida</ButtonLink>}
				description={<>{dateTime(run.startedAt)} · {run.trigger === 'automatic' ? 'corrida automática' : 'corrida manual'} · {run.summary}</>}
				title={RUN_TYPE_LABELS[run.type]}
			/>
			<div className="flex flex-wrap gap-2">
				<Pill tone={run.simulation ? 'info' : 'mute'}>{run.simulation ? 'Simulación: no se escribió nada' : 'Real: los cambios se guardaron'}</Pill>
				<Pill tone={run.status === 'completed' ? 'ok' : run.status === 'failed' ? 'bad' : 'info'}>{run.status === 'completed' ? 'Completada' : run.status === 'failed' ? 'Falló' : 'En curso'}</Pill>
			</div>
			{run.error && <ErrorNotice hint="Corrige la causa (credenciales o URL en Configuración, o espera a que el administrador responda) y vuelve a ejecutarla: es idempotente." message={run.error} title="La corrida falló" />}

			<section aria-label="Contadores destacados" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{highlighted.map((key) => <Metric key={key} label={counterLabel(key)} value={counterValue(key, run.counters[key] ?? 0)} />)}
			</section>

			<div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<Card detail="Cuántas filas terminaron en cada resultado. Pulsa uno para filtrar." title="Resultados">
					{resultCounts.length === 0 ? <p className="m-0 p-4 text-sm text-muted">La corrida no produjo filas.</p> : (
						<ul className="m-0 grid list-none gap-1.5 p-4">
							{resultCounts.map(([key, count]) => (
								<li key={key}>
									<button aria-pressed={result === key} className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left hover:bg-sunken ${result === key ? 'bg-primary-soft' : ''}`} onClick={() => setResult(result === key ? '' : key)} type="button">
										<Pill tone={resultLabel(key).tone}>{resultLabel(key).label}</Pill>
										<strong className="tabular-nums">{count.toLocaleString('es-VE')}</strong>
									</button>
								</li>
							))}
						</ul>
					)}
				</Card>
				<Card title="Todos los contadores">
					<dl className="facts p-4">
						{otherCounters.map(([key, value]) => <div className="contents" key={key}><dt>{counterLabel(key)}</dt><dd className="tabular-nums">{counterValue(key, value)}</dd></div>)}
					</dl>
				</Card>
			</div>

			<Card detail={items ? `${items.total.toLocaleString('es-VE')} de ${run.itemCount.toLocaleString('es-VE')} filas` : 'Cargando…'} title={run.type === 'import' ? 'Una fila por cuota' : 'Una fila por factura revisada'}>
				<div className="grid gap-2 border-b border-line p-4 sm:grid-cols-[minmax(0,1fr)_240px]">
					<label className="sr-only" htmlFor="item-search">Buscar</label>
					<input id="item-search" onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar por cliente, documento, cuota o contrato…" type="search" value={searchInput} />
					<label className="sr-only" htmlFor="item-result">Resultado</label>
					<select id="item-result" onChange={(event) => setResult(event.target.value)} value={result}>
						<option value="">Todos los resultados</option>
						{resultCounts.map(([key, count]) => <option key={key} value={key}>{resultLabel(key).label} ({count})</option>)}
					</select>
				</div>
				{error && <div className="p-4"><ErrorNotice message={error} onRetry={reload} title="No se pudieron cargar las filas" /></div>}
				{items && items.total === 0 && <EmptyState title="Sin filas para este filtro">Cambia el resultado o la búsqueda.</EmptyState>}
				{items && items.items.length > 0 && (
					<div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
						<table className="w-full min-w-[920px] border-collapse">
							<thead><tr><th>Cuota</th><th>Contrato</th><th>Cliente</th><th>Periodo</th><th className="text-right">Monto</th><th>Resultado</th><th>Motivo</th></tr></thead>
							<tbody>
								{items.items.map((item, index) => (
									<tr key={`${item.installmentId ?? 'c'}-${item.contractId}-${index}`}>
										<td className="mono">{item.installmentId ?? '—'}</td>
										<td className="mono">{item.contractId ?? '—'}</td>
										<td>{item.customerName ?? '—'}{item.customerDocument && <span className="mono block text-xs text-muted">{item.customerDocument}</span>}</td>
										<td className="mono">{item.period ?? '—'}</td>
										<td className="whitespace-nowrap text-right tabular-nums">{money(item.amount)}</td>
										<td><Pill tone={resultLabel(item.result).tone}>{resultLabel(item.result).label}</Pill></td>
										<td className="text-sm">{item.reason}{item.detail && <span className="block text-xs text-muted">{item.detail}</span>}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				{items && <Pagination noun="filas" onPage={setPage} onPageSize={setPageSize} page={items.page} pageCount={items.pageCount} pageSize={items.pageSize} total={items.total} />}
			</Card>
		</>
	)
}
