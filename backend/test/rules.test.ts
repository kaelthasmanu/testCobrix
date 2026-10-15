/**
 * Reglas de negocio de la sección 4 del enunciado, probadas como funciones puras con filas
 * que imitan las respuestas de la API (incluidas sus rarezas). No necesitan base ni red.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isCurrencyCoherent, isValidTimeZone, isWithinWindow, normalizeDocument, periodFromDetail, personType, addDays, businessToday, zonedParts, zonedTimeToUtc } from '../src/common/rules'
import { applyRunCaps, classifyContract } from '../src/sync/import-rules'
import { evaluatePayment, needsPendingLookup } from '../src/sync/payment-rules'
import type { PanelSettings, ProviderInstallment, ProviderPaymentRow } from '../src/common/types'

const TODAY = '2026-10-13'
const RULES: Pick<PanelSettings, 'importableStatuses' | 'importWindow' | 'recentInstallmentsLimit' | 'excludedDocumentTypes'> = { importableStatuses: ['ACTIVO', 'CORTADO'], importWindow: 'none', recentInstallmentsLimit: null, excludedDocumentTypes: [] }

function cuota(overrides: Partial<ProviderInstallment> & { period?: string } = {}): ProviderInstallment {
	const { period = '2026-09', ...rest } = overrides
	const [year, month] = period.split('-')
	const names = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
	return { contrato_id: 900101, identificacion_contrato: 'V-12345678', nombre_contrato: 'ANA PEREZ', estado: 'ACTIVO', deuda: 25, deuda_id: `70${year.slice(2)}${month}`, detalle_deuda: [`PLAN15MB25 - ${year} ${names[Number(month) - 1]}`], moneda_sigla: 'USD', precio_servicio: '25.000000', nombre_plan: 'PLAN15MB25', ...rest }
}

function libro(overrides: { id_cuota?: number; id_factura?: number; num_factura?: string; fecha_emision?: string; saldo?: number; pagado?: number; tarifa?: number; descuento?: number; contrato?: number; periodo?: string } = {}): ProviderPaymentRow {
	const { id_cuota = 7000009, id_factura = 0, num_factura = '', fecha_emision = '2026-09-06', saldo = 25, pagado = 0, tarifa = 25, descuento = 0, contrato = 900101, periodo = '2026-09' } = overrides
	return { id_factura, num_factura, fecha_emision, id_contrato: contrato, detalle_pago: { id_contrato: contrato, id_cuota, periodo_cuota: periodo, tarifa, valor_pago: pagado, descuento, saldo_cuota: saldo } }
}

describe('clientes', () => {
	it('normaliza la identificación: letra opcional, 6 a 12 dígitos, sin separadores ni ceros a la izquierda', () => {
		assert.equal(normalizeDocument('V-12345678'), 'V12345678')
		assert.equal(normalizeDocument('09000123'), '9000123')
		assert.equal(normalizeDocument('J-40123456-7'), 'J401234567')
		assert.equal(normalizeDocument('v 12.345.678'), 'V12345678')
		assert.equal(normalizeDocument('E-081234567'), 'E81234567')
	})

	it('rechaza identificaciones inválidas', () => {
		for (const value of ['', 'ABC', 'X-12345678', 'V-12345', 'V-1234567890123', '000000', undefined, null]) assert.equal(normalizeDocument(value), null, String(value))
	})

	it('J y G son personas jurídicas; el resto, naturales', () => {
		assert.equal(personType('J401234567'), 'juridica')
		assert.equal(personType('G20000001'), 'juridica')
		assert.equal(personType('V12345678'), 'natural')
		assert.equal(personType('9000123'), 'natural')
	})

	it('un contrato sin identificación válida no se importa', () => {
		const result = classifyContract(900101, [cuota({ identificacion_contrato: 'SIN-CEDULA' })], RULES, TODAY)
		assert.equal(result.outcome, 'invalid_customer')
		assert.equal(result.candidates.length, 0)
		assert.equal(result.items[0].result, 'invalid_customer')
	})

	it('excluye titulares por tipo de documento', () => {
		const result = classifyContract(900104, [cuota({ contrato_id: 900104, identificacion_contrato: 'J-40123456-7' })], { ...RULES, excludedDocumentTypes: ['J'] }, TODAY)
		assert.equal(result.outcome, 'excluded_document')
	})
})

describe('facturas: periodo, vencimiento y corte', () => {
	it('lee el periodo de detalle_deuda', () => {
		assert.equal(periodFromDetail(['PLAN15MB25 - 2026 Agosto']), '2026-08')
		assert.equal(periodFromDetail(['EMPRESA50MB - 2025 diciembre']), '2025-12')
		assert.equal(periodFromDetail(['PLAN - sin fecha']), null)
		assert.equal(periodFromDetail(['A - 2026 Agosto', 'B - 2026 Septiembre']), null)
		assert.equal(periodFromDetail(undefined), null)
	})

	it('el corte es el vencimiento más los días de gracia', () => {
		assert.equal(addDays('2026-08-01', 5), '2026-08-06')
		assert.equal(addDays('2026-12-01', 31), '2027-01-01')
	})

	it('la ventana cuenta desde el mes actual menos N meses', () => {
		assert.equal(isWithinWindow('2026-07', '3', TODAY), true)
		assert.equal(isWithinWindow('2026-06', '3', TODAY), false)
		assert.equal(isWithinWindow('2020-01', 'none', TODAY), true)
		assert.equal(isWithinWindow('2025-10', '12', TODAY), true)
	})

	it('la fecha de negocio se puede fijar para reproducir la prueba', () => {
		assert.equal(businessToday('2026-10-13', 'Asia/Tokyo'), '2026-10-13')
	})

	it('«hoy» depende de la zona horaria de la empresa', () => {
		const instant = new Date('2026-10-14T02:00:00Z')
		// 02:00 UTC del 14 todavía es 13 en Caracas (UTC−4), pero ya es 14 en Madrid.
		assert.equal(businessToday(undefined, 'America/Caracas', instant), '2026-10-13')
		assert.equal(businessToday(undefined, 'Europe/Madrid', instant), '2026-10-14')
		assert.deepEqual(zonedParts('America/Bogota', instant), { date: '2026-10-13', time: '21:00' })
		// La ventana cambia con el día: el 31 de octubre a las 23:00 en Caracas ya es noviembre en UTC.
		const lateOctober = businessToday(undefined, 'America/Caracas', new Date('2026-11-01T03:00:00Z'))
		assert.equal(lateOctober, '2026-10-31')
		assert.equal(isWithinWindow('2026-07', '3', lateOctober), true)
		assert.equal(isWithinWindow('2026-07', '3', businessToday(undefined, 'UTC', new Date('2026-11-01T03:00:00Z'))), false)
	})

	it('convierte la hora de la corrida automática de la zona de la empresa a UTC', () => {
		assert.equal(zonedTimeToUtc('2026-10-15', '06:00', 'America/Caracas').toISOString(), '2026-10-15T10:00:00.000Z')
		assert.equal(zonedTimeToUtc('2026-07-15', '06:00', 'Europe/Madrid').toISOString(), '2026-07-15T04:00:00.000Z')
		assert.equal(zonedTimeToUtc('2026-12-15', '06:00', 'Europe/Madrid').toISOString(), '2026-12-15T05:00:00.000Z')
	})

	it('solo acepta zonas horarias IANA reales', () => {
		assert.equal(isValidTimeZone('America/Caracas'), true)
		assert.equal(isValidTimeZone('UTC'), true)
		assert.equal(isValidTimeZone('America/Atlantis'), false)
		assert.equal(isValidTimeZone(''), false)
		assert.equal(isValidTimeZone(-4), false)
	})
})

describe('facturas: qué se importa', () => {
	it('una factura por cuota pendiente, con deuda_id como id externo y deuda como monto', () => {
		const result = classifyContract(900101, [cuota({ period: '2026-09', deuda_id: '7000009', deuda: 25 }), cuota({ period: '2026-08', deuda_id: '7000008', deuda: 20 })], RULES, TODAY)
		assert.equal(result.outcome, 'eligible')
		assert.deepEqual(result.candidates.map((c) => [c.installmentId, c.amount, c.period, c.document]), [['7000008', 20, '2026-08', 'V12345678'], ['7000009', 25, '2026-09', 'V12345678']])
	})

	it('la fila con deuda_id "0" significa sin deuda', () => {
		const result = classifyContract(900108, [cuota({ contrato_id: 900108, deuda_id: '0', deuda: 0, detalle_deuda: [] })], RULES, TODAY)
		assert.equal(result.outcome, 'no_debt')
		assert.equal(result.items.length, 0)
	})

	it('una cuota con deuda 0 (saldo residual) no se importa', () => {
		const result = classifyContract(900110, [cuota({ contrato_id: 900110, deuda: 0, deuda_id: '7000100', period: '2026-09' }), cuota({ contrato_id: 900110, deuda_id: '7000101', period: '2026-10' })], RULES, TODAY)
		assert.deepEqual(result.items.map((i) => i.result), ['zero_balance'])
		assert.equal(result.candidates.length, 1)
	})

	it('solo se importan estados configurados; un estado desconocido deja el contrato fuera', () => {
		assert.equal(classifyContract(900105, [cuota({ contrato_id: 900105, estado: 'CORTESIA' })], RULES, TODAY).outcome, 'excluded_status')
		assert.equal(classifyContract(900105, [cuota({ contrato_id: 900105, estado: 'CORTESIA' })], { ...RULES, importableStatuses: ['ACTIVO', 'CORTESIA'] }, TODAY).outcome, 'eligible')
		assert.equal(classifyContract(900105, [cuota({ contrato_id: 900105, estado: 'SUSPENDIDO' })], { ...RULES, importableStatuses: ['SUSPENDIDO'] }, TODAY).outcome, 'unknown_status')
	})

	it('descarta USD incoherente (cuotas por debajo del 1 % del plan) y monedas que no son USD', () => {
		const ves = cuota({ contrato_id: 900109, deuda: 0.05, precio_servicio: '20.000000' })
		assert.equal(isCurrencyCoherent([ves]), false)
		assert.equal(isCurrencyCoherent([cuota({ moneda_sigla: 'VES' })]), false)
		assert.equal(isCurrencyCoherent([cuota({ deuda: 0.2, precio_servicio: '20.000000' })]), true)
		const result = classifyContract(900109, [ves, { ...ves, deuda_id: '7000999', detalle_deuda: ['PLAN3MB20 - 2026 Octubre'] }], RULES, TODAY)
		assert.equal(result.outcome, 'incoherent_currency')
		assert.equal(result.items.length, 2)
	})

	it('una respuesta que se contradice deja el contrato fuera: nunca se adivina', () => {
		const otherContract = classifyContract(900101, [cuota(), cuota({ contrato_id: 900102, deuda_id: '7000020' })], RULES, TODAY)
		assert.equal(otherContract.outcome, 'contradictory_response')
		assert.match(otherContract.items[0].reason, /otro contrato/)
		const duplicated = classifyContract(900101, [cuota({ deuda_id: '7000009' }), cuota({ deuda_id: '7000009' })], RULES, TODAY)
		assert.equal(duplicated.outcome, 'contradictory_response')
		assert.match(duplicated.items[0].reason, /duplicadas/)
		const mixed = classifyContract(900101, [cuota(), cuota({ deuda_id: '0', deuda: 0 })], RULES, TODAY)
		assert.equal(mixed.outcome, 'contradictory_response')
		const twoStatuses = classifyContract(900101, [cuota({ deuda_id: '1' }), cuota({ deuda_id: '2', estado: 'CORTADO' })], RULES, TODAY)
		assert.equal(twoStatuses.outcome, 'contradictory_response')
		assert.equal(classifyContract(900101, [], RULES, TODAY).outcome, 'contradictory_response')
	})

	it('acepta filas sin orden y conserva las cuotas más recientes según el máximo por contrato', () => {
		const rows = ['2026-03', '2026-10', '2026-05', '2026-08', '2026-04'].map((period, index) => cuota({ period, deuda_id: String(7000010 + index) }))
		const result = classifyContract(900101, rows, { ...RULES, recentInstallmentsLimit: 2 }, TODAY)
		assert.deepEqual(result.candidates.map((c) => c.period), ['2026-08', '2026-10'])
		assert.deepEqual(result.items.filter((i) => i.result === 'recent_limit').map((i) => i.period).sort(), ['2026-03', '2026-04', '2026-05'])
	})

	it('aplica la ventana de importación', () => {
		const rows = [cuota({ period: '2026-03', deuda_id: '1' }), cuota({ period: '2026-09', deuda_id: '2' })]
		const result = classifyContract(900101, rows, { ...RULES, importWindow: '6' }, TODAY)
		assert.deepEqual(result.candidates.map((c) => c.period), ['2026-09'])
		assert.equal(result.items[0].result, 'outside_window')
	})

	it('idempotencia y topes: lo ya importado no se repite y lo que excede queda frenado', () => {
		const { candidates } = classifyContract(900101, [cuota({ period: '2026-07', deuda_id: '1', deuda: 30 }), cuota({ period: '2026-08', deuda_id: '2', deuda: 30 }), cuota({ period: '2026-09', deuda_id: '3', deuda: 30 })], RULES, TODAY)
		const again = applyRunCaps(candidates, new Set(['1', '2', '3']), { maxNewInvoices: null, maxNewAmount: null })
		assert.equal(again.accepted.length, 0)
		assert.deepEqual(again.items.map((i) => i.result), ['already_imported', 'already_imported', 'already_imported'])
		const byCount = applyRunCaps(candidates, new Set(['1']), { maxNewInvoices: 1, maxNewAmount: null })
		assert.deepEqual(byCount.accepted.map((c) => c.installmentId), ['2'])
		assert.deepEqual(byCount.items.map((i) => i.result), ['already_imported', 'capped'])
		const byAmount = applyRunCaps(candidates, new Set(), { maxNewInvoices: null, maxNewAmount: 60 })
		assert.equal(byAmount.amount, 60)
		assert.equal(byAmount.items[0].result, 'capped')
	})
})

describe('pagos', () => {
	const base = { contractId: 900101, installmentId: '7000009', balance: 25, today: TODAY }

	it('pagada solo si todas las filas coinciden, el saldo es 0 y hay algo pagado', () => {
		const result = evaluatePayment({ ...base, ledger: [libro({ id_factura: 8800120, num_factura: '008800120', fecha_emision: '2026-10-13', saldo: 0, pagado: 25 })] })
		assert.equal(result.result, 'paid')
		assert.deepEqual(result.paidBy, { id: 8800120, number: '008800120', issuedAt: '2026-10-13' })
	})

	it('con varias facturas de cobro, la que la pagó es la más reciente', () => {
		const rows = [libro({ id_factura: 8800007, num_factura: '008800007', fecha_emision: '2026-09-06', saldo: 0, pagado: 25 }), libro({ id_factura: 8800120, num_factura: '008800120', fecha_emision: '2026-10-13', saldo: 0, pagado: 25 })]
		assert.equal(evaluatePayment({ ...base, ledger: rows }).paidBy?.number, '008800120')
	})

	it('filas que no coinciden entre sí no son evidencia', () => {
		const rows = [libro({ id_factura: 1, saldo: 0, pagado: 25 }), libro({ id_factura: 2, saldo: 5, pagado: 20 })]
		assert.equal(evaluatePayment({ ...base, ledger: rows }).result, 'inconsistent_ledger')
		assert.equal(evaluatePayment({ ...base, ledger: [libro({ id_factura: 1, saldo: 0, pagado: 25, contrato: 900102 })] }).result, 'inconsistent_ledger')
	})

	it('abono parcial: saldo menor al de Cobrix, la factura sigue abierta', () => {
		const result = evaluatePayment({ ...base, balance: 20, ledger: [libro({ id_factura: 8800121, saldo: 15, pagado: 5, tarifa: 20 })] })
		assert.equal(result.result, 'partial_payment')
		assert.equal(result.providerBalance, 15)
	})

	it('un abono anterior a la importación no es un abono nuevo', () => {
		// ANA PEREZ: cuota de 25 con 5 abonados antes; Cobrix importó 20.
		assert.equal(evaluatePayment({ ...base, balance: 20, ledger: [libro({ id_factura: 8800007, saldo: 20, pagado: 5 })] }).result, 'still_open')
	})

	it('una cuota exonerada (saldo 0 sin nada pagado) no es un pago', () => {
		assert.equal(evaluatePayment({ ...base, ledger: [libro({ saldo: 0, pagado: 0, descuento: -25 })] }).result, 'exonerated')
	})

	it('un cobro anulado devuelve la deuda: no es un pago', () => {
		// Tras /__sim/anular la fila de la factura anulada sigue en el libro, pero con el saldo restituido.
		assert.equal(evaluatePayment({ ...base, ledger: [libro({ id_factura: 8800130, num_factura: '008800130', fecha_emision: '2026-10-13', saldo: 25, pagado: 0 })] }).result, 'still_open')
	})

	it('ignora las filas de otras cuotas y las fechadas en el futuro', () => {
		const rows = [libro({ id_cuota: 7000010, id_factura: 9, saldo: 0, pagado: 25 }), libro({ id_factura: 0, fecha_emision: '2026-10-31', saldo: 0, pagado: 25 })]
		assert.equal(needsPendingLookup({ ...base, ledger: rows }), true)
		assert.equal(evaluatePayment({ ...base, ledger: rows }).result, 'no_evidence')
	})

	it('sin rastro en el libro ni como pendiente: sin evidencia, nunca pagada', () => {
		assert.equal(evaluatePayment({ ...base, ledger: [], pending: [] }).result, 'no_evidence')
	})

	it('la cuota del mes en curso que aún no está en el libro se consulta en el contrato', () => {
		const pending = [cuota({ deuda_id: '7000009', deuda: 25, period: '2026-10' })]
		assert.equal(evaluatePayment({ ...base, ledger: [], pending }).result, 'still_open')
		assert.equal(evaluatePayment({ ...base, ledger: [], pending: [cuota({ deuda_id: '7000009', deuda: 10 })] }).result, 'partial_payment')
		assert.equal(evaluatePayment({ ...base, ledger: [], pending: [cuota({ deuda_id: '0', deuda: 0 })] }).result, 'no_evidence')
	})

	it('no se fía de montos inválidos', () => {
		const row = libro({ id_factura: 1, saldo: 0, pagado: 25 })
		assert.equal(evaluatePayment({ ...base, ledger: [{ ...row, detalle_pago: { ...row.detalle_pago, saldo_cuota: undefined } }] }).result, 'inconsistent_ledger')
		assert.equal(evaluatePayment({ ...base, ledger: [{ ...row, detalle_pago: null }] }).result, 'no_evidence')
	})
})
