import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
	createColumnHelper,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	useReactTable,
	type PaginationState,
	type SortingState,
} from '@tanstack/react-table'
import { authenticatedGet } from '../auth/api'
import { useAuth } from '../auth/AuthContext'

interface ContractIdsResponse {
	readonly data?: readonly number[]
}

interface PendingInstallment {
	readonly contrato_id?: number
	readonly identificacion_contrato?: string
	readonly nombre_contrato?: string
	readonly telefono?: string
	readonly email?: string
	readonly estado?: string
	readonly deuda?: number
	readonly deuda_id?: string
	readonly detalle_deuda?: readonly string[]
}

interface PaymentRow {
	readonly id_factura?: number
	readonly detalle_pago?: {
		readonly id_cuota?: number
		readonly valor_pago?: number
		readonly saldo_cuota?: number
	}
}

interface PaymentResponse {
	readonly data?: readonly PaymentRow[]
}

interface Client {
	readonly id: string
	readonly name: string
	readonly document: string
	readonly type: 'Natural' | 'Jurídico'
	readonly contracts: number
	readonly openInvoices: number
	readonly paidInvoices: number
	readonly debt: number
	readonly oldestDue: string | null
}

const columnHelper = createColumnHelper<Client>()
const money = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' })
const dateFormatter = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium' })

function isPendingInstallment(value: unknown): value is PendingInstallment {
	return typeof value === 'object' && value !== null
}

function isPaymentResponse(value: unknown): value is PaymentResponse {
	return typeof value === 'object' && value !== null
}

function monthFromInstallment(installment: PendingInstallment): string | null {
	const source = installment.detalle_deuda?.find((item) => /\d{4}-\d{2}/.test(item))
	const match = source?.match(/\d{4}-\d{2}/)
	return match ? `${match[0]}-01` : null
}

function formatDueDate(value: string | null): string {
	if (!value) return '—'
	return dateFormatter.format(new Date(`${value}T00:00:00Z`))
}

function clientType(document: string): Client['type'] {
	return /^[JG]/i.test(document.trim()) ? 'Jurídico' : 'Natural'
}

async function loadClients(accessToken: string): Promise<Client[]> {
	const contractsResponse = await authenticatedGet<ContractIdsResponse>('/isp/lista_ids_contratos', accessToken)
	const contractIds = contractsResponse.data ?? []
	const results = await Promise.all(contractIds.map(async (contractId) => {
		const [pendingResponse, paymentResponse] = await Promise.all([
			authenticatedGet<unknown[]>(`/isp/contrato/individual?id_contrato=${contractId}`, accessToken),
			authenticatedGet<PaymentResponse>(`/isp/pago_informacion?id_contrato=${contractId}&tipo_busqueda=CUOTA&fecha_inicio=2020-01-01&fecha_fin=2099-12-31`, accessToken),
		])
		const pending = pendingResponse.filter(isPendingInstallment)
		const payments = isPaymentResponse(paymentResponse) ? paymentResponse.data ?? [] : []
		return { pending, payments }
	}))

	const grouped = new Map<string, {
		name: string
		document: string
		contracts: Set<number>
		openInvoices: number
		paidInvoices: Set<number>
		debt: number
		oldestDue: string | null
	}>()

	for (const result of results) {
		const first = result.pending[0]
		const document = first?.identificacion_contrato
		if (!document) continue
		const current = grouped.get(document) ?? {
			name: first.nombre_contrato ?? 'Sin nombre',
			document,
			contracts: new Set<number>(),
			openInvoices: 0,
			paidInvoices: new Set<number>(),
			debt: 0,
			oldestDue: null,
		}
		for (const installment of result.pending) {
			if (installment.contrato_id) current.contracts.add(installment.contrato_id)
			if (Number(installment.deuda) > 0 && installment.deuda_id !== '0') {
				current.openInvoices += 1
				current.debt += Number(installment.deuda)
				const due = monthFromInstallment(installment)
				if (due && (!current.oldestDue || due < current.oldestDue)) current.oldestDue = due
			}
		}
		for (const payment of result.payments) {
			const invoiceId = Number(payment.id_factura)
			const detail = payment.detalle_pago
			if (invoiceId > 0 && Number(detail?.valor_pago) > 0 && Number(detail?.saldo_cuota) === 0) {
				current.paidInvoices.add(invoiceId)
			}
		}
		grouped.set(document, current)
	}

	return [...grouped.values()]
		.map((client) => ({
			id: client.document,
			name: client.name,
			document: client.document,
			type: clientType(client.document),
			contracts: client.contracts.size,
			openInvoices: client.openInvoices,
			paidInvoices: client.paidInvoices.size,
			debt: client.debt,
			oldestDue: client.oldestDue,
		}))
		.sort((left, right) => left.name.localeCompare(right.name, 'es'))
}

const columns = [
	columnHelper.accessor('name', {
		header: 'Nombre',
		cell: (info) => info.getValue(),
		sortingFn: (left, right, id) => String(left.getValue(id)).localeCompare(String(right.getValue(id)), 'es'),
	}),
	columnHelper.accessor('document', { header: 'Documento', cell: (info) => <span className="mono">{info.getValue()}</span> }),
	columnHelper.accessor('type', { header: 'Tipo', cell: (info) => <span className="pill info">{info.getValue()}</span> }),
	columnHelper.accessor('contracts', { header: 'Contratos' }),
	columnHelper.accessor('openInvoices', { header: 'Abiertas' }),
	columnHelper.accessor('paidInvoices', { header: 'Pagadas' }),
	columnHelper.accessor('debt', { header: 'Deuda', cell: (info) => money.format(info.getValue()) }),
	columnHelper.accessor('oldestDue', { header: 'Vencimiento más antiguo', cell: (info) => formatDueDate(info.getValue()) }),
]
const numericColumnIds = new Set(['contracts', 'openInvoices', 'paidInvoices', 'debt'])

export default function ClientsPage() {
	const { session } = useAuth()
	const [clients, setClients] = useState<Client[]>([])
	const [globalFilter, setGlobalFilter] = useState('')
	const [typeFilter, setTypeFilter] = useState<'all' | Client['type']>('all')
	const [debtFilter, setDebtFilter] = useState<'all' | 'with-debt' | 'without-debt'>('all')
	const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 })
	const [error, setError] = useState('')
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		document.title = 'Clientes · Prueba de facturación'
		if (!session) {
			setIsLoading(false)
			setError('')
			return
		}
		let cancelled = false
		setIsLoading(true)
		setError('')
		void loadClients(session.accessToken)
			.then((loadedClients) => {
				if (!cancelled) setClients(loadedClients)
			})
			.catch((cause: unknown) => {
				if (!cancelled) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los clientes.')
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false)
			})
		return () => {
			cancelled = true
		}
	}, [session])

	const filteredClients = useMemo(
		() => clients.filter((client) => {
			const matchesType = typeFilter === 'all' || client.type === typeFilter
			const matchesDebt = debtFilter === 'all'
				|| (debtFilter === 'with-debt' && client.debt > 0)
				|| (debtFilter === 'without-debt' && client.debt === 0)
			return matchesType && matchesDebt
		}),
		[clients, debtFilter, typeFilter],
	)

	const table = useReactTable({
		data: filteredClients,
		columns,
		state: { globalFilter, sorting, pagination },
		onGlobalFilterChange: setGlobalFilter,
		onSortingChange: setSorting,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		globalFilterFn: 'includesString',
		autoResetPageIndex: true,
	})
	const visibleRows = table.getRowModel().rows
	const filteredRowCount = table.getFilteredRowModel().rows.length
	const countLabel = `${filteredRowCount} ${filteredRowCount === 1 ? 'cliente' : 'clientes'}`

	if (!session) {
		return (
			<>
				<div className="head">
					<div>
						<h1>Clientes</h1>
						<p>Tabla de los clientes importados desde el administrador.</p>
					</div>
				</div>
				<section className="rounded-[10px] border border-line bg-surface p-5">
					<p className="m-0 text-muted">Configura la conexión con el administrador para consultar los clientes.</p>
					<Link className="mt-4 inline-block rounded-md border border-primary bg-primary px-4 py-2 font-semibold !text-primary-fg hover:no-underline hover:opacity-90" to="/configuracion">
						Ir a configuración
					</Link>
				</section>
			</>
		)
	}

	function updatePageSize(value: number) {
		setPagination((current) => ({ ...current, pageIndex: 0, pageSize: value }))
	}

	function resetFilters() {
		setGlobalFilter('')
		setTypeFilter('all')
		setDebtFilter('all')
		setSorting([{ id: 'name', desc: false }])
		updatePageSize(10)
	}

	return (
		<>
			<div className="head">
				<div>
					<h1>Clientes</h1>
					<p>Tabla de los clientes importados desde el administrador.</p>
				</div>
			</div>
			<section className="min-w-0 rounded-[10px] border border-line bg-surface">
				<header className="grid gap-4 border-b border-line px-4 py-3.5">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h2>Clientes importados</h2>
						<p className="mb-0 text-xs text-muted">{countLabel}</p>
					</div>
					<div className="grid gap-2 sm:grid-cols-[minmax(240px,1fr)_180px_180px_auto]">
						<label className="text-sm font-medium" htmlFor="client-search">
							<span className="sr-only">Buscar clientes</span>
							<input
								className="w-full rounded-md border border-line bg-surface px-3 py-2 font-normal text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary"
								id="client-search"
								onChange={(event) => setGlobalFilter(event.target.value)}
								placeholder="Buscar por nombre o documento..."
								type="search"
								value={globalFilter}
							/>
						</label>
						<label className="sr-only" htmlFor="client-type-filter">Filtrar por tipo</label>
						<select
							className="rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary"
							id="client-type-filter"
							onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
							value={typeFilter}
						>
							<option value="all">Todos los tipos</option>
							<option value="Natural">Naturales</option>
							<option value="Jurídico">Jurídicos</option>
						</select>
						<label className="sr-only" htmlFor="client-debt-filter">Filtrar por deuda</label>
						<select
							className="rounded-md border border-line bg-surface px-3 py-2 text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary"
							id="client-debt-filter"
							onChange={(event) => setDebtFilter(event.target.value as typeof debtFilter)}
							value={debtFilter}
						>
							<option value="all">Toda situación</option>
							<option value="with-debt">Con deuda</option>
							<option value="without-debt">Sin deuda</option>
						</select>
						<button className="rounded-md border border-line bg-surface px-3 py-2 font-medium text-fg hover:bg-sunken" onClick={resetFilters} type="button">
							Limpiar
						</button>
					</div>
				</header>
				<div className="p-4">
					{isLoading && <p className="py-8 text-center text-muted">Cargando clientes…</p>}
					{error && <p className="flash bad" role="alert">{error}</p>}
					{!isLoading && !error && visibleRows.length === 0 && (
						<p className="py-8 text-center text-muted">{filteredRowCount === 0 ? 'No hay clientes que coincidan con los filtros.' : 'No hay clientes importados.'}</p>
					)}
					{!isLoading && !error && visibleRows.length > 0 && (
						<div className="overflow-x-auto">
							<table className="w-full min-w-[900px] border-collapse">
								<thead>
									{table.getHeaderGroups().map((headerGroup) => (
										<tr key={headerGroup.id}>
											{headerGroup.headers.map((header) => (
												<th className={numericColumnIds.has(header.column.id) ? 'text-right' : 'text-left'} key={header.id}>
													{header.isPlaceholder ? null : (
														<button
															className="inline-flex items-center gap-1 hover:text-fg"
															onClick={header.column.getToggleSortingHandler()}
															type="button"
														>
															{flexRender(header.column.columnDef.header, header.getContext())}
															<span aria-hidden="true" className="text-[11px]">
																{header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : '↕'}
															</span>
														</button>
													)}
												</th>
											))}
										</tr>
									))}
								</thead>
								<tbody>
									{visibleRows.map((row) => (
										<tr className="cursor-pointer hover:bg-sunken" key={row.id}>
											{row.getVisibleCells().map((cell) => (
												<td className={numericColumnIds.has(cell.column.id) ? 'text-right' : ''} key={cell.id}>
													{cell.column.id === 'name'
														? <Link className="font-medium" to={`/clientes/${encodeURIComponent(row.original.document)}`}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Link>
														: flexRender(cell.column.columnDef.cell, cell.getContext())}
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
					{!isLoading && !error && filteredRowCount > 0 && (
						<div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
							<label className="flex items-center gap-2 text-sm text-muted" htmlFor="client-page-size">
								Filas por página
								<select
									className="rounded-md border border-line bg-surface px-2 py-1.5 text-fg outline-none focus-visible:ring-2 focus-visible:ring-primary"
									id="client-page-size"
									onChange={(event) => updatePageSize(Number(event.target.value))}
									value={pagination.pageSize}
								>
									<option value={10}>10</option>
									<option value={20}>20</option>
									<option value={50}>50</option>
									<option value={100}>100</option>
								</select>
							</label>
							<div className="flex items-center gap-2">
								<span className="text-sm text-muted">
									Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
								</span>
								<button
									aria-label="Página anterior"
									className="rounded-md border border-line bg-surface px-3 py-1.5 font-medium text-fg hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50"
									disabled={!table.getCanPreviousPage()}
									onClick={() => table.previousPage()}
									type="button"
								>
									Anterior
								</button>
								<button
									aria-label="Página siguiente"
									className="rounded-md border border-line bg-surface px-3 py-1.5 font-medium text-fg hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50"
									disabled={!table.getCanNextPage()}
									onClick={() => table.nextPage()}
									type="button"
								>
									Siguiente
								</button>
							</div>
						</div>
					)}
				</div>
			</section>
		</>
	)
}
