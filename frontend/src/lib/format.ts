/**
 * Formatos y etiquetas del panel. Sin React: se prueba con el runner nativo de Node.
 * Las fechas con hora vienen en UTC y se muestran en la zona horaria de la empresa; las fechas civiles
 * (`YYYY-MM-DD`, vencimientos y cortes) se muestran tal cual, sin cambiar de día.
 */
import type { ItemResult, RunType } from '../interfaces/api.interfaces'

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute'

export const DEFAULT_TIME_ZONE = 'America/Caracas'
const moneyFormatter = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', currencyDisplay: 'code' })
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()
let displayTimeZone = DEFAULT_TIME_ZONE

/** Zona horaria de la empresa (Configuración → Empresa) con la que se muestran fechas y horas. */
export function setDisplayTimeZone(timeZone: string): void {
	displayTimeZone = timeZone || DEFAULT_TIME_ZONE
}

export function getDisplayTimeZone(): string {
	return displayTimeZone
}

function dateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
	let formatter = dateTimeFormatters.get(timeZone)
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('es-VE', { dateStyle: 'medium', timeStyle: 'short', timeZone })
		dateTimeFormatters.set(timeZone, formatter)
	}
	return formatter
}
const civilDateFormatter = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const periodFormatter = new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** `1235` → `USD 1.235,00`. */
export function money(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) return '—'
	return moneyFormatter.format(value).replace(/ /g, ' ')
}

/** Fecha y hora de un evento (ISO en UTC), en la zona horaria de la empresa. */
export function dateTime(value: string | null | undefined, timeZone = displayTimeZone): string {
	if (!value) return '—'
	const date = new Date(value)
	return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter(timeZone).format(date)
}

/** Zonas horarias IANA que ofrece el navegador, con la de la empresa siempre presente. */
export function timeZoneOptions(current: string): string[] {
	const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [DEFAULT_TIME_ZONE, 'UTC']
	return zones.includes(current) ? zones : [current, ...zones]
}

/** Fecha civil `2026-08-01` → `1 ago 2026`, sin desplazarla por zona horaria. */
export function civilDate(value: string | null | undefined): string {
	if (!value) return '—'
	const date = new Date(`${value.slice(0, 10)}T00:00:00Z`)
	return Number.isNaN(date.getTime()) ? '—' : civilDateFormatter.format(date)
}

/** `2026-08` → `agosto de 2026`. */
export function period(value: string | null | undefined): string {
	if (!value || !/^\d{4}-\d{2}$/.test(value)) return value || '—'
	return periodFormatter.format(new Date(`${value}-01T00:00:00Z`))
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : pluralForm}`
}

export const RUN_TYPE_LABELS: Record<RunType, string> = { import: 'Importación', payments: 'Actualización de pagadas' }

export const RESULT_LABELS: Record<ItemResult, { readonly label: string; readonly tone: Tone }> = {
	imported: { label: 'Importada', tone: 'ok' },
	already_imported: { label: 'Ya importada', tone: 'mute' },
	excluded_status: { label: 'Excluida por estado', tone: 'mute' },
	unknown_status: { label: 'Estado desconocido', tone: 'bad' },
	contradictory_response: { label: 'Respuesta contradictoria', tone: 'bad' },
	incoherent_currency: { label: 'Moneda incoherente', tone: 'warn' },
	invalid_customer: { label: 'Identificación inválida', tone: 'bad' },
	excluded_document: { label: 'Documento excluido', tone: 'mute' },
	zero_balance: { label: 'Saldo residual', tone: 'mute' },
	unparseable_period: { label: 'Periodo ilegible', tone: 'bad' },
	outside_window: { label: 'Fuera de la ventana', tone: 'mute' },
	recent_limit: { label: 'Excede cuotas recientes', tone: 'mute' },
	capped: { label: 'Frenada por tope', tone: 'warn' },
	paid: { label: 'Marcada pagada', tone: 'ok' },
	partial_payment: { label: 'Abono parcial', tone: 'warn' },
	still_open: { label: 'Sigue abierta', tone: 'info' },
	exonerated: { label: 'Exonerada', tone: 'mute' },
	inconsistent_ledger: { label: 'Libro inconsistente', tone: 'bad' },
	no_evidence: { label: 'Sin evidencia', tone: 'bad' },
	provider_error: { label: 'Error del administrador', tone: 'bad' },
}

export function resultLabel(result: string): { readonly label: string; readonly tone: Tone } {
	return RESULT_LABELS[result as ItemResult] ?? { label: result, tone: 'mute' }
}

/** Contadores que se destacan arriba del detalle de cada tipo de corrida. */
export const HIGHLIGHTED_COUNTERS: Record<RunType, readonly string[]> = {
	import: ['newInvoices', 'newAmount', 'newClients', 'contractsScanned'],
	payments: ['paidInvoices', 'paidAmount', 'partial_payment', 'still_open'],
}

const COUNTER_LABELS: Record<string, string> = {
	contractsScanned: 'Contratos recorridos',
	contractsEligible: 'Contratos importables',
	contractsWithoutDebt: 'Contratos sin deuda',
	contractsExcludedStatus: 'Contratos excluidos por estado',
	contractsIncoherentCurrency: 'Contratos con moneda incoherente',
	contractsContradictory: 'Contratos con respuesta contradictoria',
	contractsUnknownStatus: 'Contratos con estado desconocido',
	contractsInvalidCustomer: 'Contratos sin identificación válida',
	contractsExcludedDocument: 'Contratos excluidos por documento',
	contractsWithErrors: 'Contratos con error del administrador',
	installmentsSeen: 'Cuotas pendientes leídas',
	newInvoices: 'Facturas nuevas',
	newAmount: 'Monto nuevo',
	newClients: 'Clientes nuevos',
	invoicesEvaluated: 'Facturas abiertas revisadas',
	contractsChecked: 'Contratos consultados',
	paidInvoices: 'Marcadas pagadas',
	paidAmount: 'Monto cobrado',
}

export function counterLabel(key: string): string {
	return COUNTER_LABELS[key] ?? RESULT_LABELS[key as ItemResult]?.label ?? key
}

export function counterValue(key: string, value: number): string {
	return /amount/i.test(key) ? money(value) : value.toLocaleString('es-VE')
}

export const CONTRACT_STATUSES = ['ACTIVO', 'CORTADO', 'CORTESIA', 'RETIRADO', 'RECHAZADO', 'ANULADO'] as const
export const DOCUMENT_TYPES = ['V', 'E', 'J', 'G', 'P'] as const

export function contractStatusTone(status: string): Tone {
	if (status === 'ACTIVO') return 'ok'
	if (status === 'CORTADO') return 'warn'
	return 'mute'
}

export function personTypeLabel(type: 'natural' | 'juridica'): string {
	return type === 'juridica' ? 'Jurídica' : 'Natural'
}
