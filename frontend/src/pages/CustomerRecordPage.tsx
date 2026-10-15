import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { authenticatedGet } from '../auth/api'
import { useAuth } from '../auth/AuthContext'
import type { Contract, Customer } from '../interfaces/CustomerRecordPage.interfaces'
import type { StoredInvoice } from '../interfaces/sync.interfaces'

const money = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' })
const dateTime = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Caracas' })
const dateOnly = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeZone: 'America/Caracas' })

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

interface CustomerEvent {
	readonly id: number
	readonly type: 'paid' | 'imported' | 'created'
	readonly date: string
	readonly title: string
	readonly description: string
}

interface CustomerRecord {
	readonly customer: Customer
	readonly invoices: readonly StoredInvoice[]
	readonly events: readonly CustomerEvent[]
}

async function loadCustomer(accessToken: string, document: string): Promise<CustomerRecord> {
	const response = await authenticatedGet<{
		readonly client: { name: string; document: string; email?: string | null; phone?: string | null }
		readonly contracts: readonly { provider_id: number; status: string; plan?: string | null; price: number; branch?: string | null }[]
		readonly invoices: readonly { id: number; external_id: string; customer_document: string; customer_name: string; contract_id: number; period: string; due_date: string; cutoff_date: string; amount: number; balance: number; status: 'open' | 'paid'; imported_at: string; paid_at?: string | null }[]
		readonly events: readonly { id: number; type: string; occurred_at: string; description: string }[]
	}>(`/clients/${encodeURIComponent(document)}`, accessToken)
	return {
		customer: {
			name: response.client.name,
			document: response.client.document,
			email: response.client.email ?? '—',
			phone: response.client.phone ?? '—',
			contracts: response.contracts.map((contract): Contract => ({ id: contract.provider_id, status: contract.status, plan: contract.plan ?? 'Sin plan', price: contract.price, branch: contract.branch ?? '—' })),
		},
		invoices: response.invoices.map((invoice) => ({
			id: invoice.external_id,
			contractId: invoice.contract_id,
			customerDocument: invoice.customer_document,
			customerName: invoice.customer_name,
			period: invoice.period,
			dueDate: invoice.due_date,
			cutoffDate: invoice.cutoff_date,
			amount: invoice.amount,
			balance: invoice.balance,
			status: invoice.status,
			importedAt: invoice.imported_at,
			paidAt: invoice.paid_at ?? undefined,
		})),
		events: response.events.map((event) => ({
			id: event.id,
			type: event.type === 'invoice_paid' ? 'paid' : event.type === 'invoice_imported' ? 'imported' : 'created',
			date: event.occurred_at,
			title: event.type === 'invoice_paid' ? 'Pagada en el ISP' : event.type === 'invoice_imported' ? 'Factura importada' : 'Cliente creado',
			description: event.description,
		})),
	}
}

export default function CustomerRecordPage() {
	const { customerId } = useParams()
	const { session } = useAuth()
	const [customer, setCustomer] = useState<Customer | null>(null)
	const [invoices, setInvoices] = useState<readonly StoredInvoice[]>([])
	const [events, setEvents] = useState<readonly CustomerEvent[]>([])
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
				if (!cancelled) {
					setCustomer(loaded.customer)
					setInvoices(loaded.invoices)
					setEvents(loaded.events)
				}
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

	const openAmount = invoices.filter((invoice) => invoice.status === 'open').reduce((total, invoice) => total + invoice.balance, 0)
	const paidCount = invoices.filter((invoice) => invoice.status === 'paid').length
	const importedAt = invoices.length > 0 ? invoices.reduce((oldest, invoice) => invoice.importedAt < oldest ? invoice.importedAt : oldest, invoices[0].importedAt) : undefined

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
