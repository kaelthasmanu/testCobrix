import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ButtonLink, Card, EmptyState, ErrorNotice, Loading, Metric, PageHead, Pill } from '../components/ui'
import type { Alert, SummaryResponse } from '../interfaces/api.interfaces'
import { RUN_TYPE_LABELS, civilDate, dateTime, money } from '../lib/format'
import { useSyncRunner } from '../lib/runner'
import { useResource } from '../lib/useResource'
import { ProviderMissing } from '../components/ProviderMissing'

export default function SummaryPage() {
	const { data: summary, error, loading, reload } = useResource<SummaryResponse>('/summary')
	const runner = useSyncRunner()

	useEffect(() => {
		document.title = 'Resumen · Cobrix'
	}, [])

	const actions = (
		<>
			<button className="btn primary" disabled={runner.running || summary?.provider.configured === false} onClick={() => runner.request('import', false)} type="button">Importar</button>
			<button className="btn" disabled={runner.running || summary?.provider.configured === false} onClick={() => runner.request('payments', false)} type="button">Actualizar pagadas</button>
		</>
	)

	return (
		<>
			<PageHead actions={actions} description="Cómo está la cartera importada del administrador de facturas." title="Resumen" />
			{runner.dialog}
			{runner.progressView}
			{runner.error && <ErrorNotice message={runner.error} title="No se pudo ejecutar la corrida" />}
			{loading && !summary && <Loading label="Cargando resumen…" />}
			{error && <ErrorNotice message={error} onRetry={reload} title="No se pudo cargar el resumen" />}
			{summary && <SummaryContent summary={summary} />}
		</>
	)
}

function SummaryContent({ summary }: { readonly summary: SummaryResponse }) {
	const { metrics, aging, provider, automaticRun, recentRuns, alerts } = summary
	const empty = metrics.clients === 0
	return (
		<>
			<section aria-label="Totales" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
				<Metric label="Clientes" value={metrics.clients} />
				<Metric label="Contratos" value={metrics.contracts} />
				<Metric label="Facturas abiertas" tone={metrics.openInvoices > 0 ? 'warn' : undefined} value={metrics.openInvoices} />
				<Metric label="Facturas pagadas" tone={metrics.paidInvoices > 0 ? 'ok' : undefined} value={metrics.paidInvoices} />
				<div className="col-span-2 lg:col-span-1"><Metric hint={`al ${civilDate(summary.today)}`} label="Por cobrar" value={money(metrics.receivable)} /></div>
			</section>

			{!provider.configured && <ProviderMissing />}

			{empty && provider.configured && (
				<Card>
					<EmptyState action={<ButtonLink primary to="/sincronizacion">Ir a Sincronización</ButtonLink>} title="Todavía no hay datos importados">
						Revisa las reglas en Configuración y luego usa «Simular importación» para ver qué se traería del administrador sin escribir nada.
					</EmptyState>
				</Card>
			)}

			<div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
				<Card detail="Lo que conviene mirar hoy" title="Atención">
					{alerts.length === 0
						? <p className="m-0 p-4 text-sm text-muted">Nada pendiente: la última importación y la última actualización no dejaron casos dudosos.</p>
						: <ul className="m-0 grid list-none gap-0 divide-y divide-line p-0">{alerts.map((alert) => <AlertRow alert={alert} key={alert.id} />)}</ul>}
				</Card>
				<Card detail="Facturas abiertas según días desde el vencimiento" title="Antigüedad de la deuda">
					<AgingBars aging={aging} />
				</Card>
			</div>

			<div className="grid gap-5 lg:grid-cols-2">
				<Card actions={<Link className="text-sm" to="/configuracion">Editar</Link>} title="Proveedor configurado">
					<dl className="facts p-4">
						<dt>URL de la API</dt><dd className="mono break-all">{provider.baseUrl}</dd>
						<dt>Usuario</dt><dd>{provider.username || '—'}</dd>
						<dt>Estado</dt><dd><Pill tone={provider.configured ? 'ok' : 'bad'}>{provider.configured ? 'Credenciales guardadas' : 'Sin configurar'}</Pill></dd>
					</dl>
				</Card>
				<Card actions={<Link className="text-sm" to="/configuracion#corrida-automatica">Editar</Link>} title="Corrida automática">
					<dl className="facts p-4">
						<dt>Estado</dt><dd><Pill tone={automaticRun.enabled ? 'ok' : 'mute'}>{automaticRun.enabled ? 'Activa' : 'Inactiva'}</Pill></dd>
						<dt>Horario</dt><dd>{automaticRun.enabled ? `Todos los días a las ${automaticRun.time} (${automaticRun.timeZone}): importar y actualizar pagadas` : 'Actívala en Configuración para correr sin intervención.'}</dd>
						{automaticRun.nextRunAt && <><dt>Próxima</dt><dd>{dateTime(automaticRun.nextRunAt)}</dd></>}
						<dt>Última</dt><dd>{automaticRun.last ? <Link to={`/sincronizacion/${automaticRun.last.id}`}>{dateTime(automaticRun.last.startedAt)} · {automaticRun.last.summary}</Link> : 'Ninguna todavía'}</dd>
					</dl>
				</Card>
			</div>

			<Card actions={<Link className="text-sm" to="/sincronizacion">Ver historial</Link>} title="Últimas corridas">
				{recentRuns.length === 0
					? <EmptyState title="Aún no hay corridas">Empieza con «Simular importación» en Sincronización.</EmptyState>
					: (
						<div className="overflow-x-auto">
							<table className="w-full min-w-[640px] border-collapse">
								<thead><tr><th>Corrida</th><th>Fecha</th><th>Estado</th><th>Resultado</th></tr></thead>
								<tbody>
									{recentRuns.map((run) => (
										<tr key={run.id}>
											<td><Link className="font-medium" to={`/sincronizacion/${run.id}`}>{RUN_TYPE_LABELS[run.type]}</Link>{run.simulation && <> <Pill tone="info">Simulación</Pill></>}{run.trigger === 'automatic' && <> <Pill tone="mute">Automática</Pill></>}</td>
											<td className="whitespace-nowrap">{dateTime(run.startedAt)}</td>
											<td><Pill tone={run.status === 'completed' ? 'ok' : run.status === 'failed' ? 'bad' : 'info'}>{run.status === 'completed' ? 'Completada' : run.status === 'failed' ? 'Falló' : 'En curso'}</Pill></td>
											<td>{run.summary}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
			</Card>
		</>
	)
}

function AlertRow({ alert }: { readonly alert: Alert }) {
	const icon = alert.severity === 'bad' ? '⛔' : alert.severity === 'warn' ? '⚠️' : 'ℹ️'
	const severity = alert.severity === 'bad' ? 'Urgente' : alert.severity === 'warn' ? 'Revisar' : 'Aviso'
	return (
		<li className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 py-3">
			<span aria-hidden="true">{icon}</span>
			<div className="grid gap-1">
				<div className="flex flex-wrap items-center gap-2"><Pill tone={alert.severity}>{severity}</Pill><strong>{alert.title}</strong></div>
				<p className="m-0 text-sm text-muted">{alert.detail}</p>
				{alert.items && <ul className="m-0 grid gap-0.5 pl-4 text-xs text-muted">{alert.items.map((item) => <li key={item}>{item}</li>)}</ul>}
				{alert.link && <Link className="w-fit text-sm" to={alert.link}>Ver detalle →</Link>}
			</div>
		</li>
	)
}

/** Barras horizontales de una sola serie (monto por tramo), con etiqueta directa de monto y cantidad. */
function AgingBars({ aging }: { readonly aging: SummaryResponse['aging'] }) {
	const max = Math.max(0, ...aging.map((bucket) => bucket.amount))
	if (max === 0) return <p className="m-0 p-4 text-sm text-muted">Sin facturas abiertas.</p>
	return (
		<div className="grid gap-3 p-4">
			{aging.map((bucket) => (
				<div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[130px_minmax(0,1fr)]" key={bucket.key} title={`${bucket.label}: ${bucket.count} factura(s), ${money(bucket.amount)}`}>
					<span className="text-xs text-muted">{bucket.label}</span>
					<div className="flex items-center gap-2">
						<div className="h-3 min-w-[2px] rounded-r bg-primary" style={{ width: `${(bucket.amount / max) * 70}%` }} />
						<span className="whitespace-nowrap text-xs tabular-nums"><strong>{money(bucket.amount)}</strong> <span className="text-muted">· {bucket.count}</span></span>
					</div>
				</div>
			))}
		</div>
	)
}
