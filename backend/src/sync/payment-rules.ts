import { roundMoney, sameAmount, usd } from '../common/rules'
import type { PaymentResult, ProviderInstallment, ProviderPaymentRow } from '../common/types'

export interface ProviderInvoiceRef {
	readonly id: number
	readonly number: string
	readonly issuedAt: string
}

export interface PaymentEvaluation {
	readonly result: PaymentResult
	readonly reason: string
	/** Saldo de la cuota en el administrador, cuando se conoce. */
	readonly providerBalance?: number
	/** Factura del administrador que dejó la cuota en cero. Solo cuando `result` es `paid`. */
	readonly paidBy?: ProviderInvoiceRef
}

export interface PaymentInput {
	readonly contractId: number
	readonly installmentId: string
	/** Saldo con el que la factura sigue abierta en Cobrix. */
	readonly balance: number
	/** Libro de cuotas del contrato (`pago_informacion`, tipo CUOTA), ya pedido hasta `today`. */
	readonly ledger: readonly ProviderPaymentRow[]
	/**
	 * Cuotas pendientes del contrato (`contrato/individual`). Solo se consultan cuando la cuota no
	 * aparece en el libro, como pasa con la del mes en curso hasta fin de mes. `undefined` = no consultado.
	 */
	readonly pending?: readonly ProviderInstallment[]
	readonly today: string
}

/** Indica si hace falta consultar el contrato para decidir sobre esta cuota. */
export function needsPendingLookup(input: Omit<PaymentInput, 'pending'>): boolean {
	return rowsFor(input).length === 0
}

/**
 * Decide qué pasó con una cuota según el libro del administrador. Solo `paid` cierra la factura.
 * Ante cualquier duda (filas que no coinciden, sin rastro de la cuota) la factura sigue abierta.
 */
export function evaluatePayment(input: PaymentInput): PaymentEvaluation {
	const rows = rowsFor(input)
	if (rows.length === 0) return evaluateWithoutLedger(input)

	if (rows.some((row) => row.detalle_pago?.id_contrato !== input.contractId || (row.id_contrato !== undefined && row.id_contrato !== 0 && row.id_contrato !== input.contractId))) {
		return { result: 'inconsistent_ledger', reason: 'El libro asigna la cuota a otro contrato: no se marca pagada' }
	}
	const values = rows.map((row) => ({
		saldo: Number(row.detalle_pago?.saldo_cuota),
		pagado: Number(row.detalle_pago?.valor_pago),
		tarifa: Number(row.detalle_pago?.tarifa),
		descuento: Number(row.detalle_pago?.descuento ?? 0),
		periodo: row.detalle_pago?.periodo_cuota,
	}))
	const first = values[0]
	if (values.some((value) => !Number.isFinite(value.saldo) || !Number.isFinite(value.pagado) || !Number.isFinite(value.tarifa) || !Number.isFinite(value.descuento))) {
		return { result: 'inconsistent_ledger', reason: 'El libro trae montos inválidos para la cuota' }
	}
	const consistent = values.every((value) => sameAmount(value.saldo, first.saldo) && sameAmount(value.pagado, first.pagado) && sameAmount(value.tarifa, first.tarifa) && sameAmount(value.descuento, first.descuento) && value.periodo === first.periodo)
	if (!consistent) {
		return { result: 'inconsistent_ledger', reason: `Las ${rows.length} filas del libro para la cuota no coinciden entre sí: no se adivina` }
	}

	const providerBalance = roundMoney(first.saldo)
	if (first.saldo < 0) return { result: 'inconsistent_ledger', reason: 'El libro reporta un saldo negativo', providerBalance }
	if (sameAmount(first.saldo, 0)) {
		if (first.pagado <= 0) return { result: 'exonerated', reason: 'Saldo 0 sin nada pagado (exonerada): no es un pago', providerBalance: 0 }
		const paidBy = lastCollection(rows)
		if (!paidBy) return { result: 'inconsistent_ledger', reason: 'Saldo 0 con pagos pero sin factura de cobro asociada', providerBalance: 0 }
		return { result: 'paid', reason: `Pagada en el ISP con la factura ${paidBy.number} del ${paidBy.issuedAt}`, providerBalance: 0, paidBy }
	}
	if (first.saldo < input.balance - 0.005) {
		return { result: 'partial_payment', reason: `Abono parcial: el ISP reporta saldo ${usd(providerBalance)} de ${usd(input.balance)}; sigue abierta`, providerBalance }
	}
	return { result: 'still_open', reason: first.pagado > 0 ? 'El ISP no registra cobros nuevos sobre el saldo importado' : 'El ISP no registra cobros para la cuota', providerBalance }
}

/** Filas del libro para la cuota, sin las fechadas después de hoy (cuotas futuras o del mes aún sin cerrar). */
function rowsFor(input: Pick<PaymentInput, 'ledger' | 'installmentId' | 'today'>): ProviderPaymentRow[] {
	const id = Number(input.installmentId)
	return input.ledger.filter((row) => row.detalle_pago?.id_cuota === id && (!row.fecha_emision || row.fecha_emision <= input.today))
}

function evaluateWithoutLedger(input: PaymentInput): PaymentEvaluation {
	const pending = input.pending?.filter((row) => row.deuda_id === input.installmentId) ?? []
	if (pending.length === 1 && pending[0].contrato_id === input.contractId) {
		const debt = Number(pending[0].deuda)
		if (Number.isFinite(debt) && debt > 0) {
			const providerBalance = roundMoney(debt)
			if (debt < input.balance - 0.005) return { result: 'partial_payment', reason: `Aún no figura en el libro; el contrato la lista con saldo ${usd(providerBalance)} de ${usd(input.balance)}`, providerBalance }
			return { result: 'still_open', reason: 'Aún no figura en el libro; el contrato la sigue listando como pendiente', providerBalance }
		}
	}
	return { result: 'no_evidence', reason: 'La cuota no aparece en el libro ni como pendiente: sin evidencia, no se marca pagada' }
}

/** La factura de cobro más reciente que tocó la cuota: la que la dejó en cero. */
function lastCollection(rows: readonly ProviderPaymentRow[]): ProviderInvoiceRef | null {
	const collections = rows
		.filter((row) => typeof row.id_factura === 'number' && row.id_factura > 0)
		.sort((a, b) => (a.fecha_emision ?? '').localeCompare(b.fecha_emision ?? '') || (a.id_factura ?? 0) - (b.id_factura ?? 0))
	const last = collections.at(-1)
	if (!last?.id_factura) return null
	return { id: last.id_factura, number: last.num_factura || String(last.id_factura), issuedAt: (last.fecha_emision ?? '').slice(0, 10) }
}
