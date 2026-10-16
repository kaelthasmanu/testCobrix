import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { civilDate, counterLabel, counterValue, dateTime, money, period, resultLabel, setDisplayTimeZone, timeZoneOptions } from '../src/lib/format.ts'

describe('formatos del panel', () => {
	it('muestra los montos con su moneda', () => {
		assert.equal(money(1235), 'USD 1.235,00')
		assert.equal(money(955), 'USD 955,00')
		assert.equal(money(null), '—')
	})

	it('no corre de día las fechas civiles', () => {
		assert.equal(civilDate('2026-08-01'), civilDate('2026-08-01T00:00:00.000Z'))
		assert.match(civilDate('2026-08-01'), /^1 ago\.? 2026$/)
		assert.equal(civilDate(null), '—')
	})

	it('muestra la hora de los eventos en la zona horaria de la empresa', () => {
		// 02:00 UTC del 14 son las 22:00 del 13 en Caracas y las 04:00 del 14 en Madrid.
		assert.match(dateTime('2026-10-14T02:00:00.000Z'), /13 oct.*10:00/)
		setDisplayTimeZone('Europe/Madrid')
		assert.match(dateTime('2026-10-14T02:00:00.000Z'), /14 oct.*4:00/)
		setDisplayTimeZone('America/Caracas')
		assert.match(dateTime('2026-10-14T02:00:00.000Z', 'UTC'), /14 oct.*2:00/)
	})

	it('ofrece las zonas IANA e incluye siempre la elegida', () => {
		assert.ok(timeZoneOptions('America/Caracas').includes('America/Caracas'))
		assert.equal(timeZoneOptions('Zona/Vieja')[0], 'Zona/Vieja')
	})

	it('nombra los periodos en español', () => {
		assert.equal(period('2026-08'), 'agosto de 2026')
	})

	it('traduce resultados y contadores, y tolera valores nuevos', () => {
		assert.deepEqual(resultLabel('partial_payment'), { label: 'Abono parcial', tone: 'warn' })
		assert.deepEqual(resultLabel('algo_nuevo'), { label: 'algo_nuevo', tone: 'mute' })
		assert.equal(counterLabel('excluded_status'), 'Excluida por estado')
		assert.equal(counterValue('newAmount', 1235), 'USD 1.235,00')
		assert.equal(counterValue('newInvoices', 42), '42')
	})
})
