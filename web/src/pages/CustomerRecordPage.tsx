import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { authenticatedGet } from '../auth/api'
import { useAuth } from '../auth/AuthContext'
import type { ContractRow, Customer } from '../interfaces/CustomerRecordPage.interfaces'
import { loadInvoices, loadRuns, type StoredInvoice, type SyncRun } from '../sync/storage'

const money = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' })
const dateTime = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Caracas' })
const dateOnly = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeZone: 'America/Caracas' })

function normalizeDocument(value: string | undefined): string | null {
	if (!value) return null
	const normalized = value.toUpperCase().replaceAll(/[\s-]/g, '')
	const match = normalized.match(/^([VEJGP]?)(\d{6,12})$/)
	if (!match) return null
	return `${match[1]}${match[2].replace(/^0+(?=\d)/, '')}`
}

function formatDate(value: string | undefined, withTime = false): string {
	if (!value) return '—'
	const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00Z`)
	return (withTime ? dateTime : dateOnly).format(parsed)
}

function invoiceNumber(id: string): string {
	return `FAC-${id.padStart(6, '0')}`
}

function statusClass(status: StoredInvoice['status'] | string): string {
	if (status === 'paid' || status === 'ACTIVO') return 'pill ok'
	if (status === 'open') return 'pill warn'
	return 'pill bad'
}

async function loadCustomer(accessToken: string, document: string): Promise<Customer> {
	const idsResponse = await authenticatedGet<{ readonly data?: readonly number[] }>('/isp/lista_ids_contratos', accessToken)
	const normalizedDocument = normalizeDocument(document)
	const rows = (await Promise.all((idsResponse.data ?? []).map((id) =>
		authenticatedGet<unknown[]>(`/isp/contrato/individual?id_contrato=${id}`, accessToken),
	))).flat().filter((row): row is ContractRow => typeof row === 'object' && row !== null)

	const matchingRows = rows.filter((row) => normalizeDocument(row.identificacion_contrato) === normalizedDocument)
	if (matchingRows.length === 0) throw new Error('No se encontró el cliente en el administrador.')
	const contracts = [...new Map(matchingRows
		.filter((row) => Number(row.contrato_id) > 0)
		.map((row) => [row.contrato_id, {
			id: Number(row.contrato_id),
			status: row.estado ?? 'Desconocido',
			plan: row.nombre_plan ?? 'Sin plan',
			price: Number(row.precio_servicio) || 0,
			branch: row.sigla_sucursal || row.nombre_sucursal || '—',
		}])).values()]
	const first = matchingRows[0]
	return {
		name: first.nombre_contrato ?? 'Sin nombre',
		document: first.identificacion_contrato ?? document,
		email: first.email?.toLowerCase() ?? '—',
		phone: first.telefono ?? '—',
		contracts,
	}
}

function customerInvoices(invoices: readonly StoredInvoice[], customer: Customer): StoredInvoice[] {
	const document = normalizeDocument(customer.document)
	return invoices
		.filter((invoice) => normalizeDocument(invoice.customerDocument) === document)
		.sort((left, right) => right.period.localeCompare(left.period))
}

function matchingRuns(runs: readonly SyncRun[], customer: Customer): SyncRun[] {
	const document = normalizeDocument(customer.document)
	return runs.filter((run) => run.items.some((item) => normalizeDocument(item.customerDocument) === document))
}

export default function CustomerRecordPage() {
	const { customerId } = useParams()
	const { session } = useAuth()
	const [customer, setCustomer] = useState<Customer | null>(null)
	const [error, setError] = useState('')
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		document.title = 'Expediente del cliente · Prueba de facturación'
		if (!session || !customerId) {
			setIsLoading(false)
			return
		}
		let cancelled = false
		const customerDocument = decodeURIComponent(customerId)
		void loadCustomer(session.accessToken, customerDocument)
			.then((loaded) => {
				if (!cancelled) setCustomer(loaded)
			})
			.catch((cause: unknown) => {
				if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudo cargar el expediente.')
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [customerId, session])

	const invoices = useMemo(() => customer ? customerInvoices(loadInvoices(), customer) : [], [customer])
	const runs = useMemo(() => customer ? matchingRuns(loadRuns(), customer) : [], [customer])
	const openAmount = invoices.filter((invoice) => invoice.status === 'open').reduce((total, invoice) => total + invoice.balance, 0)
	const paidCount = invoices.filter((invoice) => invoice.status === 'paid').length
	const importedAt = invoices.length > 0 ? invoices.reduce((oldest, invoice) => invoice.importedAt < oldest ? invoice.importedAt : oldest, invoices[0].importedAt) : undefined
	const events = useMemo(() => {
		if (!customer) return []
		const document = normalizeDocument(customer.document)
		const importedEvents = invoices.map((invoice) => ({
			id: `imported-${invoice.id}`,
			date: invoice.importedAt,
			title: `Factura importada · ${invoiceNumber(invoice.id)}`,
			description: `Cuota ${invoice.id} · ${invoice.period}`,
			type: 'imported',
		}))
		const paidEvents = invoices.filter((invoice) => invoice.status === 'paid').map((invoice) => ({
			id: `paid-${invoice.id}`,
			date: invoice.paidAt ?? invoice.importedAt,
			title: `Pagada en el ISP · ${invoiceNumber(invoice.id)}`,
			description: `Cuota ${invoice.id} · ${invoice.period}`,
			type: 'paid',
		}))
		const created = importedAt ? [{
			id: 'created',
			date: importedAt,
			title: 'Cliente creado',
			description: `Cliente creado desde el contrato del administrador`,
			type: 'created',
		}] : []
		const runEvents = runs.flatMap((run) => run.items
			.filter((item) => normalizeDocument(item.customerDocument) === document && item.result === 'paid')
			.map((item) => ({
				id: `run-paid-${run.id}-${item.id}`,
				date: run.finishedAt,
				title: `Pagada en el ISP · ${invoiceNumber(item.id)}`,
				description: item.reason,
				type: 'paid',
			})))
		return [...created, ...importedEvents, ...paidEvents, ...runEvents]
			.sort((left, right) => right.date.localeCompare(left.date))
			.filter((event, index, all) => all.findIndex((candidate) => candidate.id === event.id) === index)
	}, [customer, importedAt, invoices, runs])

	if (!session) return <section className="rounded-[10px] border border-line bg-surface p-5">Configura la conexión con el administrador en <Link to="/configuracion">Configuración</Link>.</section>
	if (isLoading) return <p className="text-muted">Cargando expediente…</p>
	if (error || !customer) return <section className="rounded-[10px] border border-line bg-surface p-5"><p className="flash bad" role="alert">{error || 'No se encontró el cliente.'}</p><Link to="/clientes">Volver a clientes</Link></section>

	return (
		<>
			<div className="head">
				<div>
					<Link className="text-sm" to="/clientes">← Clientes</Link>
					<h1 className="mt-1">{customer.name}</h1>
					<p>Persona natural o jurídica · {customer.document}</p>
				</div>
			</div>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<Metric label="Deuda abierta" value={money.format(openAmount)} />
				<Metric label="Facturas abiertas" value={String(invoices.filter((invoice) => invoice.status === 'open').length)} />
				<Metric label="Facturas pagadas" value={String(paidCount)} />
				<Metric label="Contratos" value={String(customer.contracts.length)} />
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				<section className="rounded-[10px] border border-line bg-surface">
					<SectionHeader title="Datos del cliente" />
					<dl className="facts p-4">
						<dt>Documento</dt><dd className="mono">{customer.document}</dd>
						<dt>Correo</dt><dd>{customer.email}</dd>
						<dt>Teléfono</dt><dd>{customer.phone}</dd>
						<dt>Origen</dt><dd>Administrador de facturas</dd>
						<dt>Creado</dt><dd>{formatDate(importedAt, true)}</dd>
					</dl>
				</section>
				<section className="rounded-[10px] border border-line bg-surface">
					<SectionHeader title="Contratos en el administrador" />
					<div className="overflow-x-auto">
						<table className="w-full min-w-[520px] border-collapse">
							<thead><tr><th>Contrato</th><th>Estado</th><th>Plan</th><th>Sucursal</th></tr></thead>
							<tbody>{customer.contracts.map((contract) => <tr key={contract.id}><td><strong>{contract.id}</strong><br /><span className="text-xs text-muted">{customer.name}</span></td><td><span className={statusClass(contract.status)}>{contract.status}</span></td><td>{contract.plan}<br /><span className="text-xs text-muted">{money.format(contract.price)}</span></td><td>{contract.branch}</td></tr>)}</tbody>
						</table>
					</div>
				</section>
			</div>
			<section className="rounded-[10px] border border-line bg-surface">
				<SectionHeader title="Facturas" detail="Una factura por cuota del administrador" />
				<div className="overflow-x-auto">
					<table className="w-full min-w-[1050px] border-collapse">
						<thead><tr><th>Factura</th><th>Cuota en el administrador</th><th>Periodo</th><th>Descripción</th><th>Vence</th><th>Corte</th><th>Total</th><th>Saldo</th><th>Estado</th></tr></thead>
						<tbody>{invoices.map((invoice) => <tr key={invoice.id}><td className="mono">{invoiceNumber(invoice.id)}</td><td className="mono">{invoice.id}<br /><span className="text-xs text-muted">contrato {invoice.contractId}</span></td><td>{invoice.period}</td><td>{customer.contracts.find((contract) => contract.id === invoice.contractId)?.plan ?? '—'} - {invoice.period}</td><td>{formatDate(invoice.dueDate)}</td><td>{formatDate(invoice.cutoffDate)}</td><td>{money.format(invoice.amount)}</td><td>{money.format(invoice.balance)}</td><td><span className={statusClass(invoice.status)}>{invoice.status === 'paid' ? `Pagada${invoice.paidAt ? ` · ${formatDate(invoice.paidAt)}` : ''}` : 'Abierta'}</span></td></tr>)}</tbody>
					</table>
				</div>
				<p className="m-4 rounded-md bg-sunken p-3 text-xs text-muted">El vencimiento corresponde al primer día del periodo. El corte suma los días de gracia configurados.</p>
			</section>
			<section className="rounded-[10px] border border-line bg-surface">
				<SectionHeader title="Historial" />
				<div className="divide-y divide-line">
					{events.length === 0 ? <p className="p-4 text-sm text-muted">Todavía no hay eventos registrados para este cliente.</p> : events.map((event) => <div className="grid gap-1 px-4 py-3 sm:grid-cols-[145px_minmax(0,1fr)]" key={event.id}><time className="text-xs text-muted">{formatDate(event.date, true)}</time><div><strong className={event.type === 'paid' ? 'text-ok' : ''}>{event.title}</strong><p className="m-0 text-xs text-muted">{event.description}</p></div></div>)}
				</div>
			</section>
		</>
	)
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
	return <section className="rounded-[9px] border border-line bg-surface px-3.5 py-2.5"><span className="block text-xs text-muted">{label}</span><strong className="text-lg">{value}</strong></section>
}

function SectionHeader({ title, detail }: { readonly title: string; readonly detail?: string }) {
	return <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3"><h2>{title}</h2>{detail && <span className="text-xs text-muted">{detail}</span>}</header>
}
