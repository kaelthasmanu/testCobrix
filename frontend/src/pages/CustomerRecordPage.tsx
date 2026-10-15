import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card, EmptyState, ErrorNotice, Loading, Metric, PageHead, Pagination, Pill } from '../components/ui'
import type { CustomerEvent, CustomerInvoice, CustomerRecord, Page } from '../interfaces/api.interfaces'
import { civilDate, contractStatusTone, dateTime, money, period, personTypeLabel } from '../lib/format'
import { queryString, usePage, useResource } from '../lib/useResource'

const EVENT_COPY: Record<string, { readonly title: string; readonly tone: 'ok' | 'info' | 'mute' }> = {
	client_created: { title: 'Cliente creado', tone: 'mute' },
	invoice_imported: { title: 'Factura importada', tone: 'info' },
	invoice_paid: { title: 'Factura pagada en el ISP', tone: 'ok' },
}

export default function CustomerRecordPage() {
	const { document: documentParam = '' } = useParams()
	const base = `/clients/${encodeURIComponent(documentParam)}`
	const { data: record, error, loading, reload } = useResource<CustomerRecord>(base)

	useEffect(() => {
		document.title = `${record?.client.name ?? 'Expediente'} · Cobrix`
	}, [record])

	if (loading && !record) return <Loading label="Cargando expediente…" />
	if (error || !record) return <ErrorNotice hint={<Link to="/clientes">Volver a clientes</Link>} message={error || 'No se encontró el cliente.'} onRetry={reload} title="No se pudo abrir el expediente" />

	const { client, totals, contracts } = record
	return (
		<>
			<div><Link className="text-sm" to="/clientes">← Clientes</Link></div>
			<PageHead description={<><span className="mono">{client.document}</span> · Persona {personTypeLabel(client.personType).toLowerCase()}</>} title={client.name} />

			<section aria-label="Totales del cliente" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Metric hint={totals.oldestOpenDueDate ? `vence desde ${civilDate(totals.oldestOpenDueDate)}` : undefined} label="Deuda abierta" tone={totals.debt > 0 ? 'warn' : 'ok'} value={money(totals.debt)} />
				<Metric label="Facturas abiertas" value={totals.openInvoices} />
				<Metric label="Facturas pagadas" tone={totals.paidInvoices > 0 ? 'ok' : undefined} value={totals.paidInvoices} />
				<Metric label="Contratos" value={totals.contracts} />
			</section>

			<div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
				<Card title="Datos del cliente">
					<dl className="facts p-4">
						<dt>Documento</dt><dd className="mono">{client.document}</dd>
						<dt>Tipo</dt><dd>Persona {personTypeLabel(client.personType).toLowerCase()}</dd>
						<dt>Correo</dt><dd className="break-all">{client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : '—'}</dd>
						<dt>Teléfono</dt><dd>{client.phone ? <a href={`tel:${client.phone}`}>{client.phone}</a> : '—'}</dd>
						<dt>Origen</dt><dd>{client.origin}</dd>
						<dt>En Cobrix desde</dt><dd>{dateTime(client.createdAt)}</dd>
					</dl>
				</Card>
				<Card detail="Según la última importación" title="Contratos en el administrador">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[480px] border-collapse">
							<thead><tr><th>Contrato</th><th>Estado</th><th>Plan</th><th className="text-right">Precio</th><th>Sucursal</th></tr></thead>
							<tbody>
								{contracts.map((contract) => (
									<tr key={contract.providerId}>
										<td className="mono">{contract.providerId}</td>
										<td><Pill tone={contractStatusTone(contract.status)}>{contract.status}</Pill></td>
										<td>{contract.plan ?? '—'}</td>
										<td className="whitespace-nowrap text-right tabular-nums">{money(contract.price)}</td>
										<td>{contract.branch ?? '—'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Card>
			</div>

			<InvoicesCard base={base} totals={totals} />
			<EventsCard base={base} />
		</>
	)
}

function InvoicesCard({ base, totals }: { readonly base: string; readonly totals: CustomerRecord['totals'] }) {
	const [status, setStatus] = useState<'' | 'open' | 'paid'>('')
	const [pageSize, setPageSize] = useState(10)
	const [page, setPage] = usePage({ status, pageSize })
	const { data, error, loading, reload } = useResource<Page<CustomerInvoice>>(`${base}/invoices${queryString({ status, page, pageSize })}`)
	const filters: ReadonlyArray<readonly ['' | 'open' | 'paid', string]> = [['', `Todas (${totals.openInvoices + totals.paidInvoices})`], ['open', `Abiertas (${totals.openInvoices})`], ['paid', `Pagadas (${totals.paidInvoices})`]]

	return (
		<Card
			actions={(
				<div aria-label="Filtrar facturas" className="flex flex-wrap gap-1" role="group">
					{filters.map(([value, label]) => <button aria-pressed={status === value} className={`btn small !px-2.5 !py-1 text-xs ${status === value ? 'primary' : ''}`} key={value} onClick={() => setStatus(value)} type="button">{label}</button>)}
				</div>
			)}
			detail="Una factura de Cobrix por cuota del administrador. El corte es el vencimiento más los días de gracia."
			title="Facturas"
		>
			{error && <div className="p-4"><ErrorNotice message={error} onRetry={reload} title="No se pudieron cargar las facturas" /></div>}
			{data && data.total === 0 && <EmptyState title={status === 'paid' ? 'Ninguna factura pagada todavía' : status === 'open' ? 'Sin facturas abiertas: el cliente está al día' : 'Sin facturas'} />}
			{data && data.items.length > 0 && (
				<div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
					<table className="w-full min-w-[1000px] border-collapse">
						<thead><tr><th>Factura</th><th>Cuota</th><th>Contrato</th><th>Periodo</th><th>Vence</th><th>Corte</th><th className="text-right">Total</th><th className="text-right">Saldo</th><th>Estado</th></tr></thead>
						<tbody>
							{data.items.map((invoice) => {
								const partial = invoice.status === 'open' && invoice.providerBalance !== null && invoice.providerBalance < invoice.balance - 0.005
								return (
									<tr key={invoice.id}>
										<td className="mono whitespace-nowrap">{invoice.number}</td>
										<td className="mono">{invoice.installmentId}</td>
										<td><span className="mono">{invoice.contractId}</span>{invoice.plan && <span className="block text-xs text-muted">{invoice.plan}</span>}</td>
										<td className="whitespace-nowrap">{period(invoice.period)}</td>
										<td className="whitespace-nowrap">{civilDate(invoice.dueDate)}</td>
										<td className="whitespace-nowrap">{civilDate(invoice.cutoffDate)}</td>
										<td className="whitespace-nowrap text-right tabular-nums">{money(invoice.amount)}</td>
										<td className="whitespace-nowrap text-right tabular-nums">{money(invoice.balance)}{partial && <span className="block text-xs text-[var(--warn)]">ISP: {money(invoice.providerBalance)}</span>}</td>
										<td>
											{invoice.status === 'paid'
												? <><Pill tone="ok">Pagada</Pill><span className="block text-xs text-muted">{civilDate(invoice.paidAt)}{invoice.paidByProviderInvoiceNumber && ` · fact. ISP ${invoice.paidByProviderInvoiceNumber}`}</span></>
												: <><Pill tone="warn">Abierta</Pill>{partial && <span className="block text-xs text-[var(--warn)]">con abono parcial</span>}</>}
										</td>
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
			)}
			{data && <Pagination noun="facturas" onPage={setPage} onPageSize={setPageSize} page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} />}
		</Card>
	)
}

function EventsCard({ base }: { readonly base: string }) {
	const [page, setPage] = useState(1)
	const { data, error, loading, reload } = useResource<Page<CustomerEvent>>(`${base}/events${queryString({ page, pageSize: 10 })}`)

	return (
		<Card detail="Del más reciente al más viejo" title="Historial">
			{error && <div className="p-4"><ErrorNotice message={error} onRetry={reload} title="No se pudo cargar el historial" /></div>}
			{data && (
				<ol className={`m-0 grid list-none divide-y divide-line p-0 transition-opacity ${loading ? 'opacity-60' : ''}`}>
					{data.items.map((event) => {
						const copy = EVENT_COPY[event.type] ?? { title: event.type, tone: 'mute' as const }
						return (
							<li className="grid gap-1 px-4 py-3 sm:grid-cols-[170px_minmax(0,1fr)]" key={event.id}>
								<time className="text-xs text-muted" dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time>
								<div>
									<div className="flex flex-wrap items-center gap-2"><Pill tone={copy.tone}>{copy.title}</Pill>{event.invoiceNumber && <span className="mono text-xs">{event.invoiceNumber}</span>}</div>
									<p className="m-0 mt-1 text-sm text-muted">{event.description}</p>
								</div>
							</li>
						)
					})}
				</ol>
			)}
			{data && <Pagination noun="eventos" onPage={setPage} page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} />}
		</Card>
	)
}
