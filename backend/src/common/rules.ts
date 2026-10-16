import type { ImportWindow, PersonType, ProviderInstallment } from './types'

/** Zona horaria por defecto de la empresa. Se cambia en Configuración → Empresa. */
export const DEFAULT_TIME_ZONE = 'America/Caracas'

/** Estados que la API puede devolver. Cualquier otro valor deja el contrato fuera. */
export const KNOWN_CONTRACT_STATUSES = ['ACTIVO', 'CORTADO', 'CORTESIA', 'RETIRADO', 'RECHAZADO', 'ANULADO'] as const
export const DOCUMENT_TYPES = ['V', 'E', 'J', 'G', 'P'] as const

/** Por debajo de un centavo se considera saldo residual, no deuda. */
export const CENT = 0.01

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** `V-12345678` → `V12345678`; `09000123` → `9000123`. Devuelve null si no es una identificación válida. */
export function normalizeDocument(value: string | undefined | null): string | null {
	if (typeof value !== 'string') return null
	const compact = value.toUpperCase().replace(/[\s.\-_/]/g, '')
	const match = compact.match(/^([VEJGP]?)(\d{6,12})$/)
	if (!match) return null
	const digits = match[2].replace(/^0+/, '')
	if (digits.length === 0) return null
	return `${match[1]}${digits}`
}

/** J y G son personas jurídicas; el resto (incluida la identificación sin letra), naturales. */
export function personType(document: string): PersonType {
	return /^[JG]/.test(document) ? 'juridica' : 'natural'
}

/** «PLAN - 2026 Agosto» → `2026-08`. */
export function periodFromDetail(detail: readonly string[] | undefined): string | null {
	if (!Array.isArray(detail)) return null
	const periods = new Set<string>()
	for (const text of detail) {
		if (typeof text !== 'string') continue
		const named = text.match(/(\d{4})\s+([a-záéíóú]+)\s*$/i)
		const month = named ? MONTHS_ES.indexOf(named[2].toLowerCase()) : -1
		if (named && month >= 0) periods.add(`${named[1]}-${String(month + 1).padStart(2, '0')}`)
	}
	// Dos periodos distintos para una sola cuota es una contradicción: no se adivina.
	return periods.size === 1 ? [...periods][0] : null
}

export function addDays(date: string, days: number): string {
	const result = new Date(`${date}T00:00:00Z`)
	result.setUTCDate(result.getUTCDate() + days)
	return result.toISOString().slice(0, 10)
}

/** Indica si `value` es una zona horaria IANA que el motor reconoce (`America/Caracas`, `UTC`…). */
export function isValidTimeZone(value: unknown): value is string {
	if (typeof value !== 'string' || value.trim() === '') return false
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value })
		return true
	} catch {
		return false
	}
}

/** Fecha (`YYYY-MM-DD`) y hora (`HH:MM`) civiles de un instante en la zona de la empresa. */
export function zonedParts(timeZone: string, now = new Date()): { date: string; time: string } {
	const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((part) => [part.type, part.value]))
	return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

/** Fecha civil de hoy en la zona de la empresa, o la fecha fija de la prueba (`BUSINESS_DATE`). */
export function businessToday(override: string | undefined, timeZone: string, now = new Date()): string {
	if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) return override
	return zonedParts(timeZone, now).date
}

/** Instante UTC de una fecha y hora civiles en una zona (`2026-10-15`, `06:00`, `America/Caracas` → 10:00Z). */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
	const [year, month, day] = date.split('-').map(Number)
	const [hours, minutes] = time.split(':').map(Number)
	const wanted = Date.UTC(year, month - 1, day, hours, minutes)
	// Dos pasadas: la segunda corrige cuando el desfase cambia ese día (horario de verano).
	let guess = wanted
	for (let i = 0; i < 2; i++) {
		const seen = zonedParts(timeZone, new Date(guess))
		const [y, m, d] = seen.date.split('-').map(Number)
		const [h, min] = seen.time.split(':').map(Number)
		guess += wanted - Date.UTC(y, m - 1, d, h, min)
	}
	return new Date(guess)
}

/** Meses entre un periodo `YYYY-MM` y la fecha civil `today`. 0 = mes en curso. */
export function monthsAgo(period: string, today: string): number {
	const [year, month] = period.split('-').map(Number)
	const [currentYear, currentMonth] = today.split('-').map(Number)
	return (currentYear - year) * 12 + (currentMonth - month)
}

/** Solo cuotas desde el mes actual menos N meses. */
export function isWithinWindow(period: string, window: ImportWindow, today: string): boolean {
	return window === 'none' || monthsAgo(period, today) <= Number(window)
}

/**
 * Un contrato reportado en USD con cuotas por debajo del 1 % del precio del plan está en otra
 * moneda (por ejemplo VES con la sigla equivocada): se descarta en lugar de importar montos absurdos.
 */
export function isCurrencyCoherent(rows: readonly ProviderInstallment[]): boolean {
	return rows.every((row) => {
		if (row.moneda_sigla !== 'USD') return false
		const debt = Number(row.deuda)
		const price = Number(row.precio_servicio)
		if (debt < CENT) return true
		return Number.isFinite(price) && price > 0 && debt >= price * 0.01
	})
}

const USD = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** `1235` → `USD 1.235,00`, para los textos que lee el operador. */
export function usd(value: number): string {
	return `USD ${USD.format(value)}`
}

export function roundMoney(value: number): number {
	return Math.round(value * 100) / 100
}

export function sameAmount(left: number, right: number): boolean {
	return Math.abs(left - right) < 0.005
}
