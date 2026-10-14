import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { DatabaseService } from '../database/database.service'
import { ProviderClient } from '../provider/provider.client'
import { SettingsService } from '../settings/settings.service'
import { evaluatePayment, isCurrencyCoherent, isWithinWindow, monthFromDetail, normalizeDocument, addDays } from '../common/rules'
import type { PanelSettings, ProviderInstallment, SyncItem } from '../common/types'

type Candidate = { row: ProviderInstallment; document: string; period: string; amount: number }

@Injectable()
export class SyncService {
	constructor(
		private readonly database: DatabaseService,
		private readonly provider: ProviderClient,
		private readonly settingsService: SettingsService,
	) {}

	async import(simulation: boolean) {
		const settings = await this.settingsService.get()
		return this.runWithHistory('import', simulation, () => this.performImport(settings, simulation))
	}

	async updatePayments(simulation: boolean) {
		return this.runWithHistory('payments', simulation, async (items) => {
			const invoices = await this.database.invoice.findMany({ where: { status: 'open' } })
			const paymentsByContract = new Map<number, Awaited<ReturnType<ProviderClient['getPayments']>>>()
			let paid = 0
			for (const invoice of invoices) {
				const rows = paymentsByContract.get(invoice.contractId) ?? await this.provider.getPayments(invoice.contractId)
				paymentsByContract.set(invoice.contractId, rows)
				const result = evaluatePayment(rows, invoice.contractId, invoice.externalId, invoice.balance)
				const item: SyncItem = { id: invoice.externalId, contractId: invoice.contractId, customerDocument: invoice.customerDocument, period: invoice.period, result, reason: result === 'paid' ? (simulation ? 'Se marcaría pagada; simulación sin escritura' : 'Factura marcada como pagada') : result === 'partial_payment' ? 'Existe un abono, pero la cuota conserva saldo' : 'No existe evidencia de pago completo', amount: invoice.amount }
				items.push(item)
				if (result === 'paid') {
					paid += 1
					if (!simulation) {
						await this.database.$transaction(async (tx) => {
							await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'paid', balance: 0, paidAt: new Date().toISOString() } })
							await tx.customerEvent.create({ data: { clientId: invoice.clientId, type: 'invoice_paid', occurredAt: new Date().toISOString(), description: 'Factura pagada en el ISP', invoiceId: invoice.id } })
						})
					}
				}
			}
			return { counters: { invoicesEvaluated: invoices.length, paidInvoices: paid, partialPayments: items.filter((item) => item.result === 'partial_payment').length, noEvidence: items.filter((item) => item.result === 'no_evidence').length }, summary: `${paid} factura${paid === 1 ? '' : 's'} ${simulation ? 'se marcarían como pagadas' : 'marcadas como pagadas'}` }
		})
	}

	private async performImport(settings: PanelSettings, simulation: boolean): Promise<{ items: SyncItem[]; counters: Record<string, number>; summary: string }> {
		const items: SyncItem[] = []
		const candidates: Candidate[] = []
		const ids = await this.provider.getContractIds()
		const knownInvoices = new Set((await this.database.invoice.findMany({ select: { externalId: true } })).map((row) => row.externalId))
		for (const contractId of ids) {
			const rows = (await this.provider.getPendingInstallments(contractId)).filter((row) => row.deuda_id !== '0')
			const invalidContract = rows.some((row) => row.contrato_id !== contractId) || new Set(rows.map((row) => row.deuda_id)).size !== rows.length
			if (invalidContract) {
				rows.forEach((row) => items.push(this.item(row, 'invalid_contract', 'La respuesta contiene filas contradictorias o cuotas duplicadas')))
				continue
			}
			const statuses = new Set(rows.map((row) => row.estado))
			if ([...statuses].some((status) => !status || !['ACTIVO', 'CORTADO', 'CORTESIA', 'RETIRADO', 'RECHAZADO', 'ANULADO'].includes(status))) {
				rows.forEach((row) => items.push(this.item(row, 'invalid_contract', 'Estado de contrato desconocido')))
				continue
			}
			if ([...statuses].some((status) => !settings.importableStatuses.includes(status as string))) {
				rows.forEach((row) => items.push(this.item(row, 'excluded_status', `Estado ${row.estado ?? 'desconocido'} no importable`)))
				continue
			}
			if (!isCurrencyCoherent(rows)) {
				rows.forEach((row) => items.push(this.item(row, 'incoherent_currency', 'El contrato reporta una moneda o monto incoherente con el plan')))
				continue
			}
			const contractCandidates: Candidate[] = []
			for (const row of rows.sort((a, b) => (monthFromDetail(b.detalle_deuda) ?? '').localeCompare(monthFromDetail(a.detalle_deuda) ?? ''))) {
				const amount = Number(row.deuda) || 0
				const document = normalizeDocument(row.identificacion_contrato)
				const period = monthFromDetail(row.detalle_deuda)
				if (amount < 0.01) items.push(this.item(row, 'zero_balance', 'La cuota tiene saldo residual o deuda igual a cero'))
				else if (!document) items.push(this.item(row, 'invalid_customer', 'Identificación del titular inválida'))
				else if (isExcludedDocument(document, settings)) items.push(this.item(row, 'excluded_document', `Tipo de documento excluido: ${document[0]}`))
				else if (!period || !isWithinWindow(period, settings)) items.push(this.item(row, 'outside_window', 'La cuota está fuera de la ventana configurada'))
				else contractCandidates.push({ row, document, period, amount })
			}
			const limited = settings.recentInstallmentsLimit === null ? contractCandidates : contractCandidates.slice(0, settings.recentInstallmentsLimit)
			contractCandidates.slice(limited.length).forEach((candidate) => items.push(this.item(candidate.row, 'limit_reached', 'Supera el máximo de cuotas recientes por contrato')))
			candidates.push(...limited)
		}
		let total = 0
		let imported = 0
		for (const candidate of candidates) {
			const externalId = candidate.row.deuda_id ?? ''
			if (knownInvoices.has(externalId)) {
				items.push(this.item(candidate.row, 'already_imported', 'La cuota ya fue importada'))
				continue
			}
			if (settings.maxNewInvoices !== null && imported >= settings.maxNewInvoices) {
				items.push(this.item(candidate.row, 'limit_reached', 'Se alcanzó el tope de facturas nuevas'))
				continue
			}
			if (settings.maxNewAmount !== null && total + candidate.amount > settings.maxNewAmount) {
				items.push(this.item(candidate.row, 'limit_reached', 'Se alcanzó el tope de monto nuevo'))
				continue
			}
			if (!simulation) await this.persistInvoice(candidate, settings)
			knownInvoices.add(externalId)
			imported += 1
			total += candidate.amount
			items.push(this.item(candidate.row, 'imported', simulation ? 'Se importaría; simulación sin escritura' : 'Factura importada'))
		}
		return { items, counters: { contractsEvaluated: ids.length, invoicesNew: imported, amountNew: total, ...count(items) }, summary: `${imported} factura${imported === 1 ? '' : 's'} ${simulation ? 'se importarían' : 'importadas'}` }
	}

	private async persistInvoice(candidate: Candidate, settings: PanelSettings): Promise<void> {
		const row = candidate.row
		const document = candidate.document
		const dueDate = `${candidate.period}-01`
		await this.database.$transaction(async (tx) => {
			const client = await tx.client.upsert({
				where: { document },
				create: { document, name: row.nombre_contrato ?? 'Sin nombre', email: row.email ?? null, phone: row.telefono ?? null, origin: 'administrator', createdAt: new Date().toISOString() },
				update: { name: row.nombre_contrato ?? 'Sin nombre', email: row.email ?? null, phone: row.telefono ?? null },
			})
			const contract = await tx.contract.upsert({
				where: { providerId: row.contrato_id! },
				create: { providerId: row.contrato_id!, clientId: client.id, status: row.estado ?? 'UNKNOWN', plan: row.nombre_plan ?? null, price: Number(row.precio_servicio) || 0, branch: row.nombre_sucursal ?? row.sigla_sucursal ?? null, updatedAt: new Date().toISOString() },
				update: { clientId: client.id, status: row.estado ?? 'UNKNOWN', plan: row.nombre_plan ?? null, price: Number(row.precio_servicio) || 0, branch: row.nombre_sucursal ?? row.sigla_sucursal ?? null, updatedAt: new Date().toISOString() },
			})
			const invoice = await tx.invoice.create({ data: { externalId: row.deuda_id ?? '', contractId: contract.id, clientId: client.id, customerDocument: document, customerName: row.nombre_contrato ?? 'Sin nombre', period: candidate.period, dueDate, cutoffDate: addDays(dueDate, settings.graceDays), amount: candidate.amount, balance: candidate.amount, status: 'open', importedAt: new Date().toISOString() } })
			await tx.customerEvent.create({ data: { clientId: client.id, type: 'invoice_imported', occurredAt: new Date().toISOString(), description: 'Factura importada desde el administrador', invoiceId: invoice.id } })
		})
	}

	private item(row: ProviderInstallment, result: SyncItem['result'], reason: string): SyncItem {
		return { id: `${row.contrato_id ?? 'unknown'}:${row.deuda_id ?? 'unknown'}`, contractId: row.contrato_id, customerDocument: normalizeDocument(row.identificacion_contrato) ?? row.identificacion_contrato, period: monthFromDetail(row.detalle_deuda) ?? undefined, result, reason, amount: Number(row.deuda) || 0 }
	}

	private async runWithHistory(type: 'import' | 'payments', simulation: boolean, operation: (items: SyncItem[]) => Promise<{ items?: SyncItem[]; counters: Record<string, number>; summary: string }>): Promise<unknown> {
		const id = randomUUID()
		const started = new Date().toISOString()
		const items: SyncItem[] = []
		try {
			const result = await operation(items)
			const allItems = result.items ?? items
			await this.saveRun(id, type, simulation, 'completed', started, result.summary, result.counters, allItems)
			return { id, type, simulation, status: 'completed', summary: result.summary, counters: result.counters, items: allItems }
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Error desconocido'
			await this.saveRun(id, type, simulation, 'failed', started, 'La corrida falló', {}, items, message)
			throw error
		}
	}

	private async saveRun(id: string, type: string, simulation: boolean, status: string, started: string, summary: string, counters: Record<string, number>, items: SyncItem[], error?: string): Promise<void> {
		await this.database.$transaction(async (tx) => {
			await tx.syncRun.create({ data: { id, type, simulation, status, startedAt: started, finishedAt: new Date().toISOString(), summary, counters: JSON.stringify(counters), error: error ?? null, items: { create: items.map((item) => ({ externalId: item.id, contractId: item.contractId ?? null, customerDocument: item.customerDocument ?? null, period: item.period ?? null, result: item.result, reason: item.reason, amount: item.amount ?? null })) } } })
		})
	}
}

function isExcludedDocument(document: string, settings: PanelSettings): boolean {
	return document.length > 0 && settings.excludedDocumentTypes.includes(document[0])
}

function count(items: readonly SyncItem[]): Record<string, number> {
	return items.reduce<Record<string, number>>((result, item) => ({ ...result, [item.result]: (result[item.result] ?? 0) + 1 }), {})
}
