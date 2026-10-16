import { CENT, KNOWN_CONTRACT_STATUSES, isCurrencyCoherent, isWithinWindow, normalizeDocument, periodFromDetail, usd } from '../common/rules'
import type { ImportResult, PanelSettings, ProviderInstallment, SyncItem } from '../common/types'

/** Una cuota que pasó todas las reglas del contrato y puede convertirse en factura. */
export interface ImportCandidate {
	readonly row: ProviderInstallment
	readonly contractId: number
	readonly installmentId: string
	readonly document: string
	readonly period: string
	readonly amount: number
}

export type ContractOutcome =
	| 'eligible' | 'no_debt' | 'contradictory_response' | 'unknown_status' | 'excluded_status'
	| 'incoherent_currency' | 'invalid_customer' | 'excluded_document'

export interface ContractClassification {
	readonly outcome: ContractOutcome
	readonly items: SyncItem[]
	readonly candidates: ImportCandidate[]
}

type ImportRules = Pick<PanelSettings, 'importableStatuses' | 'importWindow' | 'recentInstallmentsLimit' | 'excludedDocumentTypes'>

/**
 * Aplica las reglas de la sección 4 a la respuesta de `contrato/individual` de un contrato.
 * Las reglas de contrato van primero: si el contrato queda fuera, todas sus cuotas quedan fuera con el mismo motivo.
 */
export function classifyContract(contractId: number, rows: readonly ProviderInstallment[], rules: ImportRules, today: string): ContractClassification {
	const debtRows = rows.filter((row) => row.deuda_id !== '0')
	const reject = (outcome: ContractOutcome, result: ImportResult, reason: string, affected = debtRows): ContractClassification => ({
		outcome,
		candidates: [],
		items: affected.length > 0
			? affected.map((row) => itemFor(contractId, row, result, reason))
			: [{ contractId, customerDocument: normalizeDocument(rows[0]?.identificacion_contrato) ?? rows[0]?.identificacion_contrato, customerName: rows[0]?.nombre_contrato, result, reason }],
	})

	const contradiction = findContradiction(contractId, rows, debtRows)
	if (contradiction) return reject('contradictory_response', 'contradictory_response', contradiction, debtRows.length > 0 ? debtRows : [])
	if (debtRows.length === 0) return { outcome: 'no_debt', items: [], candidates: [] }

	const status = debtRows[0].estado ?? ''
	if (!(KNOWN_CONTRACT_STATUSES as readonly string[]).includes(status)) {
		return reject('unknown_status', 'unknown_status', `Estado de contrato desconocido («${status || 'vacío'}»): no se adivina`)
	}
	if (!rules.importableStatuses.includes(status)) {
		return reject('excluded_status', 'excluded_status', `Contrato ${status}: estado no importable según la configuración`)
	}
	if (!isCurrencyCoherent(debtRows)) {
		const row = debtRows[0]
		return reject('incoherent_currency', 'incoherent_currency', `Moneda incoherente: reporta ${row.moneda_sigla ?? 'sin moneda'} con cuotas de ${row.deuda} frente a un plan de ${Number(row.precio_servicio)}`)
	}
	const document = normalizeDocument(debtRows[0].identificacion_contrato)
	if (!document) {
		return reject('invalid_customer', 'invalid_customer', `Identificación del titular inválida («${debtRows[0].identificacion_contrato ?? ''}»)`)
	}
	if (/^[A-Z]/.test(document) && rules.excludedDocumentTypes.includes(document[0])) {
		return reject('excluded_document', 'excluded_document', `Titular con documento tipo ${document[0]}: excluido por configuración`)
	}

	const items: SyncItem[] = []
	const eligible: ImportCandidate[] = []
	for (const row of debtRows) {
		const amount = Number(row.deuda)
		const period = periodFromDetail(row.detalle_deuda)
		if (amount < CENT) items.push(itemFor(contractId, row, 'zero_balance', `Deuda ${amount} (saldo residual de menos de un centavo): no es deuda`))
		else if (!period) items.push(itemFor(contractId, row, 'unparseable_period', `No se pudo leer el periodo de «${(row.detalle_deuda ?? []).join(' | ')}»`))
		else if (!isWithinWindow(period, rules.importWindow, today)) items.push(itemFor(contractId, row, 'outside_window', `Periodo ${period} fuera de la ventana de ${rules.importWindow} meses`))
		else eligible.push({ row, contractId, installmentId: String(row.deuda_id), document, period, amount })
	}

	// Se conservan las cuotas más recientes; desempate por id para que el resultado sea estable.
	eligible.sort((a, b) => b.period.localeCompare(a.period) || b.installmentId.localeCompare(a.installmentId))
	const limit = rules.recentInstallmentsLimit
	const candidates = limit === null ? eligible : eligible.slice(0, limit)
	for (const candidate of eligible.slice(candidates.length)) {
		items.push(itemFor(contractId, candidate.row, 'recent_limit', `Supera el máximo de ${limit} cuotas recientes por contrato`))
	}
	candidates.sort((a, b) => a.period.localeCompare(b.period) || a.installmentId.localeCompare(b.installmentId))
	return { outcome: 'eligible', items, candidates }
}

/** Una respuesta que se contradice deja el contrato fuera. Devuelve el motivo o null. */
function findContradiction(contractId: number, rows: readonly ProviderInstallment[], debtRows: readonly ProviderInstallment[]): string | null {
	if (rows.length === 0) return 'La API devolvió una lista vacía para un contrato que sí existe'
	if (rows.some((row) => row.contrato_id !== contractId)) return 'La respuesta incluye filas de otro contrato'
	if (debtRows.length > 0 && debtRows.length !== rows.length) return 'La respuesta mezcla la fila «sin deuda» con cuotas pendientes'
	if (debtRows.length === 0 && rows.length > 1) return 'La respuesta repite la fila «sin deuda»'
	const ids = debtRows.map((row) => row.deuda_id)
	if (ids.some((id) => typeof id !== 'string' || !/^\d+$/.test(id))) return 'Hay cuotas sin un deuda_id válido'
	if (new Set(ids).size !== ids.length) return 'La respuesta trae cuotas duplicadas (mismo deuda_id)'
	if (debtRows.some((row) => typeof row.deuda !== 'number' || !Number.isFinite(row.deuda) || row.deuda < 0)) return 'Hay cuotas con un monto inválido'
	for (const field of ['estado', 'identificacion_contrato', 'moneda_sigla'] as const) {
		if (new Set(rows.map((row) => row[field])).size > 1) return `Las filas del contrato no coinciden en ${field}`
	}
	return null
}

function itemFor(contractId: number, row: ProviderInstallment, result: ImportResult, reason: string): SyncItem {
	return {
		installmentId: row.deuda_id,
		contractId,
		customerDocument: normalizeDocument(row.identificacion_contrato) ?? row.identificacion_contrato,
		customerName: row.nombre_contrato,
		period: periodFromDetail(row.detalle_deuda) ?? undefined,
		result,
		reason,
		amount: Number.isFinite(Number(row.deuda)) ? Number(row.deuda) : undefined,
	}
}

export interface CapResult {
	readonly accepted: ImportCandidate[]
	readonly items: SyncItem[]
	readonly amount: number
}

/**
 * Aplica idempotencia y topes por corrida a los candidatos de todos los contratos.
 * Lo ya importado no consume tope; lo que excede queda frenado y se reintenta en la próxima corrida.
 */
export function applyRunCaps(candidates: readonly ImportCandidate[], known: ReadonlySet<string>, rules: Pick<PanelSettings, 'maxNewInvoices' | 'maxNewAmount'>): CapResult {
	const accepted: ImportCandidate[] = []
	const items: SyncItem[] = []
	const seen = new Set(known)
	let amount = 0
	for (const candidate of candidates) {
		const item = (result: ImportResult, reason: string): SyncItem => ({ ...itemFor(candidate.contractId, candidate.row, result, reason), customerDocument: candidate.document, period: candidate.period })
		if (seen.has(candidate.installmentId)) {
			items.push(item('already_imported', 'La cuota ya tiene factura en Cobrix'))
			continue
		}
		if (rules.maxNewInvoices !== null && accepted.length >= rules.maxNewInvoices) {
			items.push(item('capped', `Frenada: se alcanzó el tope de ${rules.maxNewInvoices} facturas nuevas por corrida`))
			continue
		}
		if (rules.maxNewAmount !== null && amount + candidate.amount > rules.maxNewAmount + 0.005) {
			items.push(item('capped', `Frenada: superaría el tope de ${usd(rules.maxNewAmount)} de monto nuevo por corrida`))
			continue
		}
		seen.add(candidate.installmentId)
		accepted.push(candidate)
		amount += candidate.amount
	}
	return { accepted, items, amount }
}
