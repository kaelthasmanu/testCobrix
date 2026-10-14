import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS } from '../src/config/settings.ts'
import {
	evaluatePayment,
	isCurrencyCoherent,
	isWithinImportWindow,
	monthFromDetail,
	normalizeDocument,
} from '../src/sync/rules.ts'
import type { StoredInvoice } from '../src/sync/storage.ts'

describe('reglas de clientes y facturas', () => {
	it('normaliza identificaciones y distingue personas jurídicas', () => {
		assert.equal(normalizeDocument('V-12345678'), 'V12345678')
		assert.equal(normalizeDocument('09000123'), '9000123')
		assert.equal(normalizeDocument('J-000123456'), 'J123456')
		assert.equal(normalizeDocument('invalido'), null)
	})

	it('extrae el periodo y aplica la ventana con la zona horaria de Caracas', () => {
		assert.equal(monthFromDetail(['PLAN15MB25 - 2026 Agosto']), '2026-08')
		assert.equal(isWithinImportWindow('2026-08', { ...DEFAULT_SETTINGS, importWindow: '3' }, new Date('2026-10-13T12:00:00Z')), true)
		assert.equal(isWithinImportWindow('2026-05', { ...DEFAULT_SETTINGS, importWindow: '3' }, new Date('2026-10-13T12:00:00Z')), false)
	})

	it('descarta moneda incoherente pero permite un saldo residual separado', () => {
		assert.equal(isCurrencyCoherent([{ deuda: 0.001, moneda_sigla: 'USD', precio_servicio: '20' }]), true)
		assert.equal(isCurrencyCoherent([{ deuda: 0.05, moneda_sigla: 'USD', precio_servicio: '20' }]), false)
		assert.equal(isCurrencyCoherent([{ deuda: 20, moneda_sigla: 'USD', precio_servicio: '20' }]), true)
	})
})

describe('ciclo importar → pagar → actualizar pagadas', () => {
	it('marca solo la cuota pagada y conserva abierta la cuota con abono parcial', () => {
		const imported: StoredInvoice[] = [
			{
				id: '7000001',
				contractId: 900101,
				customerDocument: 'V12345678',
				customerName: 'ANA PEREZ',
				period: '2026-08',
				dueDate: '2026-08-01',
				cutoffDate: '2026-08-04',
				amount: 20,
				balance: 20,
				status: 'open',
				importedAt: '2026-10-13T23:00:00.000Z',
			},
			{
				id: '7000002',
				contractId: 900101,
				customerDocument: 'V12345678',
				customerName: 'ANA PEREZ',
				period: '2026-09',
				dueDate: '2026-09-01',
				cutoffDate: '2026-09-04',
				amount: 20,
				balance: 20,
				status: 'open',
				importedAt: '2026-10-13T23:00:00.000Z',
			},
		]
		const caja = [
			{ detalle_pago: { id_contrato: 900101, id_cuota: 7000001, tarifa: 20, valor_pago: 20, saldo_cuota: 0 } },
			{ detalle_pago: { id_contrato: 900101, id_cuota: 7000002, tarifa: 20, valor_pago: 5, saldo_cuota: 15 } },
		]
		const updated = imported.map((invoice) => {
			const result = evaluatePayment(caja, invoice.contractId, invoice.id, invoice.balance)
			return result === 'paid' ? { ...invoice, balance: 0, status: 'paid' as const } : invoice
		})

		assert.equal(updated.filter((invoice) => invoice.status === 'paid').length, 1)
		assert.equal(updated.find((invoice) => invoice.id === '7000002')?.status, 'open')
		assert.equal(evaluatePayment(caja, 900101, '7000002', 20), 'partial_payment')
		assert.equal(evaluatePayment([], 900101, '7000002', 20), 'no_evidence')
	})
})
