import { authenticatedGet } from '../auth/api'
import type { PanelSettings } from '../config/settings'
import { loadInvoices, saveInvoices, type ItemResult, type RunItem, type StoredInvoice } from './storage'

interface ContractIdsResponse {
	readonly data?: readonly number[]
}

interface PendingInstallment {
	readonly contrato_id?: number
	readonly identificacion_contrato?: string
	readonly nombre_contrato?: string
	readonly estado?: string
	readonly deuda?: number
	readonly deuda_id?: string
	readonly detalle_deuda?: readonly string[]
	readonly moneda_sigla?: string
	readonly precio_servicio?: string
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

interface SyncResult {
	readonly invoices: readonly StoredInvoice[]
	readonly items: readonly RunItem[]
	readonly counters: Readonly<Record<string, number>>
	readonly summary: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isPending(value: unknown): value is PendingInstallment {
	return isRecord(value)
}

function monthFromDetail(detail: readonly string[] | undefined): string | null {
	const value = detail?.find((item) => /\d{4}-\d{2}/.test(item))
	const match = value?.match(/\d{4}-\d{2}/)
	return match?.[0] ?? null
}

function normalizeDocument(value: string | undefined): string | null {
	if (!value) return null
	const normalized = value.toUpperCase().replaceAll(/[\s-]/g, '')
	const match = normalized.match(/^([VEJGP]?)(\d{6,12})$/)
	if (!match) return null
	const digits = match[2].replace(/^0+(?=\d)/, '')
	return `${match[1]}${digits}`
}

function firstOfMonth(period: string): string {
	return `${period}-01`
}

function addDays(date: string, days: number): string {
	const result = new Date(`${date}T00:00:00Z`)
	result.setUTCDate(result.getUTCDate() + days)
	return result.toISOString().slice(0, 10)
}

function monthAge(period: string): number {
	const [year, month] = period.split('-').map(Number)
	const now = new Date()
	return (now.getUTCFullYear() - year) * 12 + now.getUTCMonth() - (month - 1)
}

function isExcludedDocument(document: string, excluded: readonly string[]): boolean {
	const prefix = /^[VEJGP]/.exec(document)?.[0]
	return prefix ? excluded.includes(prefix) : false
}

function baseItem(installment: PendingInstallment, result: ItemResult, reason: string): RunItem {
	return {
		id: `${installment.contrato_id ?? 'unknown'}:${installment.deuda_id ?? 'unknown'}`,
		contractId: installment.contrato_id,
		customerDocument: installment.identificacion_contrato,
		period: monthFromDetail(installment.detalle_deuda) ?? undefined,
		result,
		reason,
		amount: Number(installment.deuda) || 0,
	}
}

function countResults(items: readonly RunItem[]): Record<string, number> {
	return items.reduce<Record<string, number>>((counts, item) => {
		counts[item.result] = (counts[item.result] ?? 0) + 1
		return counts
	}, {})
}

export async function runImport(accessToken: string, settings: PanelSettings, simulation: boolean): Promise<SyncResult> {
	const response = await authenticatedGet<ContractIdsResponse>('/isp/lista_ids_contratos', accessToken)
	const ids = response.data ?? []
	const invoices = loadInvoices()
	const existingIds = new Set(invoices.map((invoice) => invoice.id))
	const items: RunItem[] = []
	const candidates: Array<{ installment: PendingInstallment; document: string; period: string }> = []

	for (const contractId of ids) {
		const raw = await authenticatedGet<unknown[]>(`/isp/contrato/individual?id_contrato=${contractId}`, accessToken)
		const installments = raw.filter(isPending).sort((left, right) => (monthFromDetail(right.detalle_deuda) ?? '').localeCompare(monthFromDetail(left.detalle_deuda) ?? ''))
		const limit = settings.recentInstallmentsLimit
		for (const installment of installments) {
			const document = normalizeDocument(installment.identificacion_contrato)
			const period = monthFromDetail(installment.detalle_deuda)
			if (installment.deuda_id === '0' || !Number(installment.deuda)) continue
			if (!settings.importableStatuses.some((status) => status === installment.estado)) {
				items.push(baseItem(installment, 'excluded_status', `Estado ${installment.estado ?? 'desconocido'} no importable`))
				continue
			}
			if (!document) {
				items.push(baseItem(installment, 'invalid_customer', 'Identificación del titular inválida'))
				continue
			}
			if (isExcludedDocument(document, settings.excludedDocumentTypes)) {
				items.push(baseItem(installment, 'excluded_document', `Tipo de documento excluido: ${document[0]}`))
				continue
			}
			if (!period) {
				items.push(baseItem(installment, 'outside_window', 'No se pudo obtener el periodo de la cuota'))
				continue
			}
			if (settings.importWindow !== 'none' && monthAge(period) > Number(settings.importWindow)) {
				items.push(baseItem(installment, 'outside_window', 'La cuota está fuera de la ventana configurada'))
				continue
			}
			const price = Number(installment.precio_servicio)
			if (installment.moneda_sigla !== 'USD' || (price > 0 && Number(installment.deuda) < price * 0.01)) {
				items.push(baseItem(installment, 'incoherent_currency', 'Moneda o monto incoherente con el plan'))
				continue
			}
			candidates.push({ installment, document, period })
		}
		if (limit !== null) {
			const contractCandidates = candidates.filter(({ installment }) => installment.contrato_id === contractId)
			for (const candidate of contractCandidates.slice(limit)) {
				const index = candidates.indexOf(candidate)
				if (index >= 0) candidates.splice(index, 1)
				items.push(baseItem(candidate.installment, 'outside_window', 'Supera el máximo de cuotas recientes por contrato'))
			}
		}
	}

	let totalAmount = 0
	let imported = 0
	for (const candidate of candidates) {
		const installment = candidate.installment
		const id = installment.deuda_id ?? ''
		if (existingIds.has(id)) {
			items.push(baseItem(installment, 'already_imported', 'La cuota ya fue importada'))
			continue
		}
		if (settings.maxNewInvoices !== null && imported >= settings.maxNewInvoices) {
			items.push(baseItem(installment, 'limit_reached', 'Se alcanzó el tope de facturas nuevas'))
			continue
		}
		const amount = Number(installment.deuda)
		if (settings.maxNewAmount !== null && totalAmount + amount > settings.maxNewAmount) {
			items.push(baseItem(installment, 'limit_reached', 'Se alcanzó el tope de monto nuevo'))
			continue
		}
		const dueDate = firstOfMonth(candidate.period)
		const invoice: StoredInvoice = {
			id,
			contractId: installment.contrato_id ?? 0,
			customerDocument: candidate.document,
			customerName: installment.nombre_contrato ?? 'Sin nombre',
			period: candidate.period,
			dueDate,
			cutoffDate: addDays(dueDate, settings.graceDays),
			amount,
			balance: amount,
			status: 'open',
			importedAt: new Date().toISOString(),
		}
		if (!simulation) invoices.push(invoice)
		imported += 1
		totalAmount += amount
		items.push(baseItem(installment, 'imported', simulation ? 'Se importaría; simulación sin escritura' : 'Factura importada'))
	}
	if (!simulation) saveInvoices(invoices)
	const counters = { ...countResults(items), newInvoices: imported, newAmount: Number(totalAmount.toFixed(2)) }
	return { invoices, items, counters, summary: `${imported} factura${imported === 1 ? '' : 's'} ${simulation ? 'se importarían' : 'importadas'} por USD ${totalAmount.toFixed(2)}` }
}

export async function runPaymentUpdate(accessToken: string, simulation: boolean): Promise<SyncResult> {
	const invoices = loadInvoices()
	const items: RunItem[] = []
	let updatedInvoices = 0
	for (const invoice of invoices.filter((item) => item.status === 'open')) {
		const response = await authenticatedGet<PaymentResponse>(`/isp/pago_informacion?id_contrato=${invoice.contractId}&tipo_busqueda=CUOTA&fecha_inicio=2020-01-01&fecha_fin=2099-12-31`, accessToken)
		const matches = (response.data ?? []).filter((row) => row.detalle_pago?.id_cuota === Number(invoice.id))
		const fullyPaid = matches.length > 0 && matches.every((row) => Number(row.detalle_pago?.saldo_cuota) === 0 && Number(row.detalle_pago?.valor_pago) > 0)
		const partial = matches.some((row) => Number(row.detalle_pago?.valor_pago) > 0 && Number(row.detalle_pago?.saldo_cuota) > 0)
		if (fullyPaid) {
			if (!simulation) {
				const index = invoices.findIndex((item) => item.id === invoice.id)
				if (index >= 0) invoices[index] = { ...invoice, balance: 0, status: 'paid' }
			}
			updatedInvoices += 1
			items.push({ id: invoice.id, contractId: invoice.contractId, customerDocument: invoice.customerDocument, period: invoice.period, result: 'paid', reason: simulation ? 'Se marcaría pagada; simulación sin escritura' : 'Factura marcada como pagada', amount: invoice.amount })
		} else if (partial) {
			items.push({ id: invoice.id, contractId: invoice.contractId, customerDocument: invoice.customerDocument, period: invoice.period, result: 'partial_payment', reason: 'Existe un abono, pero la cuota conserva saldo', amount: invoice.amount })
		} else {
			items.push({ id: invoice.id, contractId: invoice.contractId, customerDocument: invoice.customerDocument, period: invoice.period, result: 'no_evidence', reason: 'No existe evidencia de pago completo', amount: invoice.amount })
		}
	}
	if (!simulation) saveInvoices(invoices)
	const counters = { ...countResults(items), paidInvoices: updatedInvoices }
	return { invoices, items, counters, summary: `${updatedInvoices} factura${updatedInvoices === 1 ? '' : 's'} ${simulation ? 'se marcarían como pagadas' : 'marcadas como pagadas'}` }
}
