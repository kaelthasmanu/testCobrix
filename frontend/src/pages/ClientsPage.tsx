import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ButtonLink, Card, EmptyState, ErrorNotice, PageHead, Pagination, Pill } from '../components/ui'
import type { ClientRow, Page } from '../interfaces/api.interfaces'
import { civilDate, money, personTypeLabel } from '../lib/format'
import { queryString, useDebounced, usePage, useResource } from '../lib/useResource'

type SortKey = 'name' | 'document' | 'contracts' | 'openInvoices' | 'paidInvoices' | 'debt' | 'oldestDueDate'

const COLUMNS: ReadonlyArray<{ readonly key: SortKey | 'personType'; readonly label: string; readonly numeric?: boolean }> = [
	{ key: 'name', label: 'Nombre' },
	{ key: 'document', label: 'Documento' },
	{ key: 'personType', label: 'Tipo' },
	{ key: 'contracts', label: 'Contratos', numeric: true },
	{ key: 'openInvoices', label: 'Abiertas', numeric: true },
	{ key: 'paidInvoices', label: 'Pagadas', numeric: true },
	{ key: 'debt', label: 'Deuda', numeric: true },
	{ key: 'oldestDueDate', label: 'Vencimiento más antiguo' },
]

export default function ClientsPage() {
	const navigate = useNavigate()
	const [searchInput, setSearchInput] = useState('')
	const search = useDebounced(searchInput.trim())
	const [type, setType] = useState<'' | 'natural' | 'juridica'>('')
	const [debt, setDebt] = useState<'' | 'with' | 'without'>('')
	const [sort, setSort] = useState<{ key: SortKey; order: 'asc' | 'desc' }>({ key: 'name', order: 'asc' })
	const [pageSize, setPageSize] = useState(20)
	const [page, setPage] = usePage({ search, type, debt, sort, pageSize })
	// La búsqueda, los filtros, el orden y la paginación los resuelve el backend: solo viaja la página visible.
	const { data, error, loading, reload } = useResource<Page<ClientRow>>(`/clients${queryString({ search, type, debt, sort: sort.key, order: sort.order, page, pageSize })}`)

	useEffect(() => {
		document.title = 'Clientes · Cobrix'
	}, [])

	function toggleSort(key: SortKey) {
		setSort((current) => current.key === key ? { key, order: current.order === 'asc' ? 'desc' : 'asc' } : { key, order: key === 'debt' || key === 'openInvoices' ? 'desc' : 'asc' })
	}

	function resetFilters() {
		setSearchInput('')
		setType('')
		setDebt('')
		setSort({ key: 'name', order: 'asc' })
	}

	const filtering = Boolean(search || type || debt)
	const rows = data?.items ?? []

	return (
		<>
			<PageHead description="Clientes que Cobrix importó del administrador: uno por titular, con todos sus contratos." title="Clientes" />
			<Card detail={data ? `${data.total.toLocaleString('es-VE')} ${data.total === 1 ? 'cliente' : 'clientes'}${filtering ? ' con estos filtros' : ''}` : 'Cargando…'} title="Clientes importados">
				<div className="grid gap-2 border-b border-line p-4 sm:grid-cols-[minmax(220px,1fr)_170px_170px_auto]">
					<label className="sr-only" htmlFor="client-search">Buscar clientes</label>
					<input id="client-search" onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar por nombre, cédula o RIF (V-12345678)…" type="search" value={searchInput} />
					<label className="sr-only" htmlFor="client-type-filter">Filtrar por tipo</label>
					<select id="client-type-filter" onChange={(event) => setType(event.target.value as typeof type)} value={type}>
						<option value="">Todos los tipos</option>
						<option value="natural">Personas naturales</option>
						<option value="juridica">Personas jurídicas</option>
					</select>
					<label className="sr-only" htmlFor="client-debt-filter">Filtrar por deuda</label>
					<select id="client-debt-filter" onChange={(event) => setDebt(event.target.value as typeof debt)} value={debt}>
						<option value="">Con y sin deuda</option>
						<option value="with">Con deuda</option>
						<option value="without">Al día</option>
					</select>
					<button className="btn" onClick={resetFilters} type="button">Limpiar</button>
				</div>
				{error && <div className="p-4"><ErrorNotice message={error} onRetry={reload} title="No se pudieron cargar los clientes" /></div>}
				{!error && data && data.total === 0 && !filtering && <EmptyState action={<ButtonLink primary to="/sincronizacion">Ir a Sincronización</ButtonLink>} title="Todavía no hay clientes">Los clientes aparecen al importar facturas desde el administrador. Simula una importación para ver cuántos se crearían.</EmptyState>}
				{!error && data && data.total === 0 && filtering && <EmptyState title="Ningún cliente coincide">Prueba con otro nombre o documento, o pulsa «Limpiar».</EmptyState>}
				{rows.length > 0 && (
					<div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
						<table className="w-full min-w-[920px] border-collapse">
							<thead>
								<tr>
									{COLUMNS.map((column) => {
										const sortable = column.key !== 'personType'
										const active = sort.key === column.key
										return (
											<th aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined} className={column.numeric ? 'text-right' : 'text-left'} key={column.key}>
												{sortable
													? <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => toggleSort(column.key as SortKey)} type="button">{column.label}<span aria-hidden="true" className="text-[11px]">{active ? (sort.order === 'asc' ? '↑' : '↓') : '↕'}</span></button>
													: column.label}
											</th>
										)
									})}
								</tr>
							</thead>
							<tbody>
								{rows.map((client) => (
									<tr className="cursor-pointer hover:bg-sunken" key={client.document} onClick={(event) => { if (!(event.target as HTMLElement).closest('a')) navigate(`/clientes/${encodeURIComponent(client.document)}`) }}>
										<td><Link className="font-medium" to={`/clientes/${encodeURIComponent(client.document)}`}>{client.name}</Link></td>
										<td className="mono">{client.document}</td>
										<td><Pill tone={client.personType === 'juridica' ? 'info' : 'mute'}>{personTypeLabel(client.personType)}</Pill></td>
										<td className="text-right tabular-nums">{client.contracts}</td>
										<td className="text-right tabular-nums">{client.openInvoices}</td>
										<td className="text-right tabular-nums">{client.paidInvoices}</td>
										<td className="text-right tabular-nums"><span className={client.debt > 0 ? 'font-semibold' : 'text-muted'}>{money(client.debt)}</span></td>
										<td>{civilDate(client.oldestDueDate)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
				{data && <Pagination noun="clientes" onPage={setPage} onPageSize={setPageSize} page={data.page} pageCount={data.pageCount} pageSize={data.pageSize} total={data.total} />}
			</Card>
		</>
	)
}
