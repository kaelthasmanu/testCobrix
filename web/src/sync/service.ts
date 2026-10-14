import { authenticatedGet } from '../auth/api'
import type { PanelSettings } from '../config/settings'
import { evaluatePayment, isCurrencyCoherent, isWithinImportWindow, monthFromDetail, normalizeDocument } from './rules'
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
		readonly id_contrato?: number
		readonly id_cuota?: number
		readonly tarifa?: number
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

function firstOfMonth(period: string): string {
	return `${period}-01`
}

function addDays(date: string, days: number): string {
	const result = new Date(`${date}T00:00:00Z`)
	result.setUTCDate(result.getUTCDate() + days)
	return result.toISOString().slice(0, 10)
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
	const knownIds = new Set(invoices.map((invoice) => invoice.id))
	const items: RunItem[] = []
	const candidates: Array<{ installment: PendingInstallment; document: string; period: string }> = []

	for (const contractId of ids) {
		const raw = await authenticatedGet<unknown[]>(`/isp/contrato/individual?id_contrato=${contractId}`, accessToken)
		const installments = raw.filter(isPending).sort((left, right) => (monthFromDetail(right.detalle_deuda) ?? '').localeCompare(monthFromDetail(left.detalle_deuda) ?? ''))
		const contractRows = installments.filter((installment) => installment.deuda_id !== '0')
		const hasContradictoryContract = contractRows.some((installment) => installment.contrato_id !== contractId)
		const debtIds = contractRows.map((installment) => installment.deuda_id).filter((id): id is string => Boolean(id))
		const hasDuplicates = new Set(debtIds).size !== debtIds.length
		if (hasContradictoryContract || hasDuplicates) {
			for (const installment of contractRows) {
				items.push(baseItem(installment, 'invalid_contract', hasContradictoryContract
					? 'La respuesta contiene una fila de otro contrato'
					: 'La respuesta contiene cuotas duplicadas'))
			}
			continue
		}
		const statuses = new Set(contractRows.map((installment) => installment.estado))
		const hasUnknownStatus = [...statuses].some((status) => !status || !['ACTIVO', 'CORTADO', 'CORTESIA', 'RETIRADO', 'RECHAZADO', 'ANULADO'].includes(status))
		if (hasUnknownStatus) {
			for (const installment of contractRows) items.push(baseItem(installment, 'invalid_contract', `Estado de contrato desconocido: ${installment.estado ?? 'desconocido'}`))
			continue
		}
		if ([...statuses].some((status) => !settings.importableStatuses.includes(status as typeof settings.importableStatuses[number]))) {
			for (const installment of contractRows) items.push(baseItem(installment, 'excluded_status', `Estado ${installment.estado ?? 'desconocido'} no importable`))
			continue
		}
		if (!isCurrencyCoherent(contractRows)) {
			for (const installment of contractRows) items.push(baseItem(installment, 'incoherent_currency', 'El contrato reporta una moneda o monto incoherente con el plan'))
			continue
		}
		const limit = settings.recentInstallmentsLimit
		const contractCandidates: Array<{ installment: PendingInstallment; document: string; period: string }> = []
		for (const installment of installments) {
			const document = normalizeDocument(installment.identificacion_contrato)
			const period = monthFromDetail(installment.detalle_deuda)
			if (installment.deuda_id === '0') continue
			if (!Number(installment.deuda)) {
				items.push(baseItem(installment, 'zero_balance', 'La cuota tiene saldo residual o deuda igual a cero'))
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
			if (!isWithinImportWindow(period, settings, new Date())) {
				items.push(baseItem(installment, 'outside_window', 'La cuota está fuera de la ventana configurada'))
				continue
			}
			contractCandidates.push({ installment, document, period })
		}
		if (limit !== null) {
			for (const candidate of contractCandidates.slice(limit)) {
				items.push(baseItem(candidate.installment, 'limit_reached', 'Supera el máximo de cuotas recientes por contrato'))
			}
		}
		candidates.push(...(limit === null ? contractCandidates : contractCandidates.slice(0, limit)))
	}

	let totalAmount = 0
	let imported = 0
	for (const candidate of candidates) {
		const installment = candidate.installment
		const id = installment.deuda_id ?? ''
		if (knownIds.has(id)) {
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
		knownIds.add(id)
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
		const paymentResult = evaluatePayment(response.data ?? [], invoice.contractId, invoice.id, invoice.balance)
		if (paymentResult === 'paid') {
			if (!simulation) {
				const index = invoices.findIndex((item) => item.id === invoice.id)
				if (index >= 0) invoices[index] = { ...invoice, balance: 0, status: 'paid', paidAt: new Date().toISOString() }
			}
			updatedInvoices += 1
			items.push({ id: invoice.id, contractId: invoice.contractId, customerDocument: invoice.customerDocument, period: invoice.period, result: 'paid', reason: simulation ? 'Se marcaría pagada; simulación sin escritura' : 'Factura marcada como pagada', amount: invoice.amount })
		} else if (paymentResult === 'partial_payment') {
			items.push({ id: invoice.id, contractId: invoice.contractId, customerDocument: invoice.customerDocument, period: invoice.period, result: 'partial_payment', reason: 'Existe un abono, pero la cuota conserva saldo', amount: invoice.amount })
		} else {
			items.push({ id: invoice.id, contractId: invoice.contractId, customerDocument: invoice.customerDocument, period: invoice.period, result: 'no_evidence', reason: 'No existe evidencia de pago completo', amount: invoice.amount })
		}
	}
	if (!simulation) saveInvoices(invoices)
	const counters = { ...countResults(items), paidInvoices: updatedInvoices }
	return { invoices, items, counters, summary: `${updatedInvoices} factura${updatedInvoices === 1 ? '' : 's'} ${simulation ? 'se marcarían como pagadas' : 'marcadas como pagadas'}` }
}
