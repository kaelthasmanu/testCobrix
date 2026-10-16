import { ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { DatabaseService } from '../database/database.service'
import { ProviderClient } from '../provider/provider.client'
import { SettingsService } from '../settings/settings.service'
import { addDays, roundMoney, usd } from '../common/rules'
import type { ProviderInstallment, RunTrigger, RunType, SyncItem } from '../common/types'
import { applyRunCaps, classifyContract, type ContractOutcome, type ImportCandidate } from './import-rules'
import { evaluatePayment, needsPendingLookup } from './payment-rules'

type Counters = Record<string, number>
interface RunOutcome { readonly counters: Counters; readonly summary: string }

export interface RunProgress {
	readonly runId: string
	readonly type: RunType
	readonly simulation: boolean
	readonly trigger: RunTrigger
	readonly startedAt: string
	total: number
	processed: number
	stage: string
}

/** Un bloqueo más viejo que esto pertenece a un proceso que murió a mitad de corrida. */
const LOCK_TTL_MS = 30 * 60 * 1000

@Injectable()
export class SyncService implements OnModuleInit {
	private readonly logger = new Logger(SyncService.name)
	private progress: RunProgress | null = null

	constructor(
		private readonly database: DatabaseService,
		private readonly provider: ProviderClient,
		private readonly settingsService: SettingsService,
	) {}

	/** Si el proceso se reinició a mitad de una corrida, esa corrida queda como fallida y se libera el bloqueo. */
	async onModuleInit(): Promise<void> {
		const now = new Date().toISOString()
		await this.database.syncRun.updateMany({ where: { status: 'running' }, data: { status: 'failed', finishedAt: now, summary: 'La corrida se interrumpió', error: 'El servidor se reinició antes de terminar la corrida. Vuelve a ejecutarla: la importación y la actualización son idempotentes.' } })
		await this.database.syncLock.deleteMany({})
	}

	currentProgress(): RunProgress | null {
		return this.progress
	}

	async import(simulation: boolean, trigger: RunTrigger = 'manual') {
		return this.runWithHistory('import', simulation, trigger, (items, progress) => this.performImport(simulation, items, progress))
	}

	async updatePayments(simulation: boolean, trigger: RunTrigger = 'manual') {
		return this.runWithHistory('payments', simulation, trigger, (items, progress) => this.performPaymentUpdate(simulation, items, progress))
	}

	// ---------- importación ----------

	private async performImport(simulation: boolean, items: SyncItem[], progress: RunProgress): Promise<RunOutcome> {
		const settings = await this.settingsService.get()
		const today = await this.settingsService.today()
		progress.stage = 'Listando contratos'
		const contractIds = await this.provider.getContractIds()
		progress.total = contractIds.length
		progress.stage = 'Leyendo cuotas pendientes'

		const outcomes: Record<ContractOutcome | 'provider_error', number> = { eligible: 0, no_debt: 0, contradictory_response: 0, unknown_status: 0, excluded_status: 0, incoherent_currency: 0, invalid_customer: 0, excluded_document: 0, provider_error: 0 }
		const candidates: ImportCandidate[] = []
		const contractRows = new Map<number, ProviderInstallment>()
		let installmentsSeen = 0
		for (const contractId of contractIds) {
			try {
				const rows = await this.provider.getPendingInstallments(contractId)
				const classification = classifyContract(contractId, rows, settings, today)
				outcomes[classification.outcome] += 1
				installmentsSeen += rows.filter((row) => row.deuda_id !== '0').length
				items.push(...classification.items)
				candidates.push(...classification.candidates)
				if (classification.outcome !== 'contradictory_response' && rows[0]) contractRows.set(contractId, rows[0])
			} catch (error) {
				outcomes.provider_error += 1
				items.push({ contractId, result: 'provider_error', reason: `No se pudieron leer las cuotas del contrato: ${errorMessage(error)}` })
			}
			progress.processed += 1
		}

		progress.stage = simulation ? 'Calculando resultado' : 'Guardando facturas'
		const known = new Set((await this.database.invoice.findMany({ select: { externalId: true } })).map((invoice) => invoice.externalId))
		const capped = applyRunCaps(candidates, known, settings)
		items.push(...capped.items)

		const existingClients = new Set((await this.database.client.findMany({ select: { document: true } })).map((client) => client.document))
		const newClients = new Set<string>()
		let imported = 0
		let amount = 0
		for (const candidate of capped.accepted) {
			const isNewClient = !existingClients.has(candidate.document) && !newClients.has(candidate.document)
			if (!simulation) {
				const created = await this.persistInvoice(candidate, settings.graceDays)
				if (!created) {
					items.push(this.candidateItem(candidate, 'already_imported', 'Otra corrida la importó al mismo tiempo'))
					continue
				}
			}
			if (isNewClient) newClients.add(candidate.document)
			imported += 1
			amount += candidate.amount
			items.push(this.candidateItem(candidate, 'imported', simulation ? 'Se importaría (simulación: no se escribió nada)' : 'Factura abierta creada en Cobrix'))
		}
		if (!simulation) await this.refreshKnownContracts(contractRows)

		amount = roundMoney(amount)
		const counters: Counters = {
			contractsScanned: contractIds.length,
			contractsEligible: outcomes.eligible,
			contractsWithoutDebt: outcomes.no_debt,
			contractsExcludedStatus: outcomes.excluded_status,
			contractsIncoherentCurrency: outcomes.incoherent_currency,
			contractsContradictory: outcomes.contradictory_response,
			contractsUnknownStatus: outcomes.unknown_status,
			contractsInvalidCustomer: outcomes.invalid_customer,
			contractsExcludedDocument: outcomes.excluded_document,
			contractsWithErrors: outcomes.provider_error,
			installmentsSeen,
			newInvoices: imported,
			newAmount: amount,
			newClients: newClients.size,
			...countResults(items),
		}
		const verb = simulation ? (imported === 1 ? 'se importaría' : 'se importarían') : (imported === 1 ? 'importada' : 'importadas')
		const warning = outcomes.provider_error > 0 ? ` · ${outcomes.provider_error} contrato(s) con error del administrador` : ''
		return { counters, summary: `${imported} factura${imported === 1 ? '' : 's'} ${verb} por ${usd(amount)}${warning}` }
	}

	/** Crea cliente (si no existe), contrato y factura en una transacción. Devuelve false si la factura ya existía. */
	private async persistInvoice(candidate: ImportCandidate, graceDays: number): Promise<boolean> {
		const { row, document } = candidate
		const now = new Date().toISOString()
		const dueDate = `${candidate.period}-01`
		try {
			await this.database.$transaction(async (tx) => {
				let client = await tx.client.findUnique({ where: { document } })
				if (!client) {
					client = await tx.client.create({ data: { document, name: row.nombre_contrato?.trim() || 'Sin nombre', email: row.email?.trim().toLowerCase() || null, phone: row.telefono?.trim() || null, origin: 'Administrador de facturas', createdAt: now } })
					await tx.customerEvent.create({ data: { clientId: client.id, type: 'client_created', occurredAt: now, description: `Cliente creado al importar el contrato ${candidate.contractId}` } })
				}
				const contractData = contractFields(row)
				const contract = await tx.contract.upsert({
					where: { providerId: candidate.contractId },
					create: { providerId: candidate.contractId, clientId: client.id, ...contractData, updatedAt: now },
					update: { clientId: client.id, ...contractData, updatedAt: now },
				})
				const invoice = await tx.invoice.create({ data: { externalId: candidate.installmentId, contractId: contract.id, clientId: client.id, customerDocument: document, customerName: client.name, period: candidate.period, dueDate, cutoffDate: addDays(dueDate, graceDays), amount: candidate.amount, balance: candidate.amount, status: 'open', importedAt: now } })
				await tx.customerEvent.create({ data: { clientId: client.id, type: 'invoice_imported', occurredAt: now, invoiceId: invoice.id, reference: candidate.installmentId, description: `Factura importada: cuota ${candidate.installmentId} del contrato ${candidate.contractId}, periodo ${candidate.period}, ${usd(candidate.amount)}` } })
			})
			return true
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false
			throw error
		}
	}

	/** Mantiene al día estado, plan y sucursal de los contratos que Cobrix ya conoce. */
	private async refreshKnownContracts(rows: ReadonlyMap<number, ProviderInstallment>): Promise<void> {
		const known = await this.database.contract.findMany({ where: { providerId: { in: [...rows.keys()] } }, select: { providerId: true } })
		for (const { providerId } of known) {
			const row = rows.get(providerId)
			if (row) await this.database.contract.update({ where: { providerId }, data: { ...contractFields(row), updatedAt: new Date().toISOString() } })
		}
	}

	private candidateItem(candidate: ImportCandidate, result: SyncItem['result'], reason: string): SyncItem {
		return { installmentId: candidate.installmentId, contractId: candidate.contractId, customerDocument: candidate.document, customerName: candidate.row.nombre_contrato, period: candidate.period, result, reason, amount: candidate.amount }
	}

	// ------------------------------------------------------------------ pagos

	private async performPaymentUpdate(simulation: boolean, items: SyncItem[], progress: RunProgress): Promise<RunOutcome> {
		const today = await this.settingsService.today()
		const invoices = await this.database.invoice.findMany({ where: { status: 'open' }, include: { contract: { select: { providerId: true } } }, orderBy: [{ contractId: 'asc' }, { period: 'asc' }] })
		const byContract = new Map<number, typeof invoices>()
		for (const invoice of invoices) byContract.set(invoice.contract.providerId, [...(byContract.get(invoice.contract.providerId) ?? []), invoice])
		progress.total = byContract.size
		progress.stage = 'Revisando el libro de cuotas'

		let paidAmount = 0
		for (const [contractId, contractInvoices] of byContract) {
			try {
				const ledger = await this.provider.getPaymentLedger(contractId, today)
				const needsLookup = contractInvoices.some((invoice) => needsPendingLookup({ contractId, installmentId: invoice.externalId, balance: invoice.balance, ledger, today }))
				const pending = needsLookup ? await this.provider.getPendingInstallments(contractId) : undefined
				for (const invoice of contractInvoices) {
					const evaluation = evaluatePayment({ contractId, installmentId: invoice.externalId, balance: invoice.balance, ledger, pending, today })
					const item: SyncItem = { installmentId: invoice.externalId, contractId, customerDocument: invoice.customerDocument, customerName: invoice.customerName, period: invoice.period, result: evaluation.result, reason: evaluation.reason, amount: invoice.balance, detail: evaluation.paidBy ? `Factura ISP ${evaluation.paidBy.number}` : evaluation.providerBalance !== undefined ? `Saldo en el ISP: ${usd(evaluation.providerBalance)}` : undefined }
					if (evaluation.result === 'paid') paidAmount += invoice.balance
					if (!simulation) await this.applyPaymentEvaluation(invoice.id, invoice.clientId, invoice.externalId, evaluation)
					items.push(simulation && evaluation.result === 'paid' ? { ...item, reason: `${item.reason} (simulación: no se marcó)` } : item)
				}
			} catch (error) {
				for (const invoice of contractInvoices) {
					items.push({ installmentId: invoice.externalId, contractId, customerDocument: invoice.customerDocument, customerName: invoice.customerName, period: invoice.period, result: 'provider_error', reason: `No se pudo revisar el contrato: ${errorMessage(error)}. La factura sigue abierta.`, amount: invoice.balance })
				}
			}
			progress.processed += 1
		}

		const results = countResults(items)
		const paid = results.paid ?? 0
		const counters: Counters = { invoicesEvaluated: invoices.length, contractsChecked: byContract.size, paidInvoices: paid, paidAmount: roundMoney(paidAmount), ...results }
		const verb = simulation ? (paid === 1 ? 'se marcaría pagada' : 'se marcarían pagadas') : (paid === 1 ? 'marcada pagada' : 'marcadas pagadas')
		const partial = results.partial_payment ? ` · ${results.partial_payment} abono(s) parcial(es)` : ''
		return { counters, summary: `${paid} factura${paid === 1 ? '' : 's'} ${verb}${partial}` }
	}

	private async applyPaymentEvaluation(invoiceId: number, clientId: number, installmentId: string, evaluation: ReturnType<typeof evaluatePayment>): Promise<void> {
		if (evaluation.result === 'paid' && evaluation.paidBy) {
			const paidBy = evaluation.paidBy
			await this.database.$transaction(async (tx) => {
				// `status: open` en el filtro hace la escritura idempotente aunque dos corridas se crucen.
				const updated = await tx.invoice.updateMany({ where: { id: invoiceId, status: 'open' }, data: { status: 'paid', balance: 0, providerBalance: 0, paidAt: paidBy.issuedAt, paidByProviderInvoiceId: paidBy.id, paidByProviderInvoiceNumber: paidBy.number } })
				if (updated.count === 0) return
				await tx.customerEvent.create({ data: { clientId, invoiceId, type: 'invoice_paid', occurredAt: new Date().toISOString(), reference: paidBy.number, description: `Cuota ${installmentId} pagada en el ISP con la factura ${paidBy.number} del ${paidBy.issuedAt}` } })
			})
			return
		}
		if (evaluation.providerBalance !== undefined) {
			await this.database.invoice.updateMany({ where: { id: invoiceId, status: 'open' }, data: { providerBalance: evaluation.providerBalance } })
		}
	}

	// ------------------------------------------------------------------ historial

	private async runWithHistory(type: RunType, simulation: boolean, trigger: RunTrigger, operation: (items: SyncItem[], progress: RunProgress) => Promise<RunOutcome>) {
		const id = randomUUID()
		const startedAt = new Date().toISOString()
		await this.acquireLock(id, startedAt)
		const items: SyncItem[] = []
		const progress: RunProgress = { runId: id, type, simulation, trigger, startedAt, total: 0, processed: 0, stage: 'Iniciando' }
		this.progress = progress
		try {
			await this.database.syncRun.create({ data: { id, type, simulation, trigger, status: 'running', startedAt, finishedAt: startedAt, summary: 'Corrida en curso', counters: '{}' } })
			try {
				const result = await operation(items, progress)
				await this.finishRun(id, 'completed', result.summary, result.counters, items)
			} catch (error) {
				const message = errorMessage(error)
				this.logger.warn(`Corrida ${type} ${id} falló: ${message}`)
				await this.finishRun(id, 'failed', type === 'import' ? 'La importación falló' : 'La actualización de pagadas falló', countResults(items), items, message)
			}
			return this.getRun(id)
		} finally {
			this.progress = null
			await this.database.syncLock.deleteMany({ where: { key: 'sync', runId: id } })
		}
	}

	private async acquireLock(runId: string, acquiredAt: string): Promise<void> {
		await this.database.syncLock.deleteMany({ where: { key: 'sync', acquiredAt: { lt: new Date(Date.now() - LOCK_TTL_MS).toISOString() } } })
		try {
			await this.database.syncLock.create({ data: { key: 'sync', runId, acquiredAt } })
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				throw new ConflictException('Ya hay una corrida en curso. Espera a que termine; su progreso se ve en Sincronización.')
			}
			throw error
		}
	}

	private async finishRun(id: string, status: 'completed' | 'failed', summary: string, counters: Counters, items: readonly SyncItem[], error?: string): Promise<void> {
		await this.database.$transaction([
			this.database.syncRunItem.createMany({ data: items.map((item) => ({ runId: id, externalId: item.installmentId ?? null, contractId: item.contractId ?? null, customerDocument: item.customerDocument ?? null, customerName: item.customerName ?? null, period: item.period ?? null, result: item.result, reason: item.reason, amount: item.amount ?? null, detail: item.detail ?? null })) }),
			this.database.syncRun.update({ where: { id }, data: { status, finishedAt: new Date().toISOString(), summary, counters: JSON.stringify(counters), error: error ?? null } }),
		])
	}

	async listRuns(filter: { type?: RunType; skip?: number; take?: number } = {}) {
		const where = filter.type ? { type: filter.type } : {}
		const [runs, total] = await Promise.all([
			this.database.syncRun.findMany({ where, orderBy: { startedAt: 'desc' }, skip: filter.skip ?? 0, take: filter.take ?? 50 }),
			this.database.syncRun.count({ where }),
		])
		return { runs: runs.map((run) => ({ ...run, counters: parseCounters(run.counters) })), total }
	}

	/** Cabecera de la corrida: contadores y cuántas filas hay por resultado. Las filas se piden aparte, paginadas. */
	async getRun(id: string) {
		const run = await this.database.syncRun.findUnique({ where: { id } })
		if (!run) return null
		const groups = await this.database.syncRunItem.groupBy({ by: ['result'], where: { runId: id }, _count: { _all: true } })
		const resultCounts = Object.fromEntries(groups.sort((a, b) => b._count._all - a._count._all).map((group) => [group.result, group._count._all]))
		return { ...run, counters: parseCounters(run.counters), resultCounts, itemCount: groups.reduce((sum, group) => sum + group._count._all, 0) }
	}

	async listRunItems(runId: string, filter: { result?: string; search?: string; skip: number; take: number }) {
		const term = filter.search?.trim() ?? ''
		const normalized = term.toUpperCase().replace(/[\s.-]/g, '')
		const search = term
			? { OR: [{ customerName: { contains: term.toUpperCase() } }, { customerDocument: { contains: normalized } }, { externalId: { contains: normalized } }, ...(/^\d+$/.test(normalized) ? [{ contractId: Number(normalized) }] : [])] }
			: {}
		const where = { runId, ...(filter.result ? { result: filter.result } : {}), ...search }
		const [items, total] = await Promise.all([
			this.database.syncRunItem.findMany({ where, orderBy: { id: 'asc' }, skip: filter.skip, take: filter.take }),
			this.database.syncRunItem.count({ where }),
		])
		return { items: items.map((item) => ({ installmentId: item.externalId, contractId: item.contractId, customerDocument: item.customerDocument, customerName: item.customerName, period: item.period, result: item.result, reason: item.reason, amount: item.amount, detail: item.detail })), total }
	}
}

function contractFields(row: ProviderInstallment) {
	return { status: row.estado ?? 'DESCONOCIDO', plan: row.nombre_plan ?? null, price: Number(row.precio_servicio) || 0, currency: row.moneda_sigla ?? null, branch: row.nombre_sucursal ?? row.sigla_sucursal ?? null }
}

function countResults(items: readonly SyncItem[]): Counters {
	const counters: Counters = {}
	for (const item of items) counters[item.result] = (counters[item.result] ?? 0) + 1
	return counters
}

function parseCounters(value: string): Counters {
	try {
		return JSON.parse(value) as Counters
	} catch {
		return {}
	}
}

function errorMessage(error: unknown): string {
	if (error instanceof Error) {
		const response = (error as { getResponse?: () => unknown }).getResponse?.()
		if (typeof response === 'object' && response !== null && 'message' in response) return String((response as { message: unknown }).message)
		return error.message
	}
	return 'Error desconocido'
}
