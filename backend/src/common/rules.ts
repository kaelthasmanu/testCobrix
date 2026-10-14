import type { PanelSettings, ProviderInstallment, ProviderPaymentRow } from './types'

export function normalizeDocument(value: string | undefined): string | null {
	if (!value) return null
	const normalized = value.toUpperCase().replace(/[\s-]/g, '')
	const match = normalized.match(/^([VEJGP]?)(\d{6,12})$/)
	if (!match) return null
	return `${match[1]}${match[2].replace(/^0+(?=\d)/, '')}`
}

export function monthFromDetail(detail: readonly string[] | undefined): string | null {
	const text = detail?.join(' ') ?? ''
	const numeric = text.match(/(\d{4})-(\d{2})/)
	if (numeric) return `${numeric[1]}-${numeric[2]}`
	const named = text.match(/(\d{4})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i)
	if (!named) return null
	const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
	return `${named[1]}-${String(months.indexOf(named[2].toLowerCase()) + 1).padStart(2, '0')}`
}

export function addDays(date: string, days: number): string {
	const result = new Date(`${date}T00:00:00Z`)
	result.setUTCDate(result.getUTCDate() + days)
	return result.toISOString().slice(0, 10)
}

export function monthsSince(period: string, date = new Date()): number {
	const [year, month] = period.split('-').map(Number)
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit' }).formatToParts(date)
	const currentYear = Number(parts.find((part) => part.type === 'year')?.value)
	const currentMonth = Number(parts.find((part) => part.type === 'month')?.value)
	return (currentYear - year) * 12 + currentMonth - month
}

export function isCurrencyCoherent(rows: readonly ProviderInstallment[]): boolean {
	return rows.filter((row) => Number(row.deuda) >= 0.01).every((row) => {
		const price = Number(row.precio_servicio)
		return row.moneda_sigla === 'USD' && (price <= 0 || Number(row.deuda) >= price * 0.01)
	})
}

export function isWithinWindow(period: string, settings: PanelSettings): boolean {
	return settings.importWindow === 'none' || monthsSince(period) <= Number(settings.importWindow)
}

export function evaluatePayment(rows: readonly ProviderPaymentRow[], contractId: number, installmentId: string, invoiceBalance: number): 'paid' | 'partial_payment' | 'no_evidence' {
	const matches = rows.filter((row) => row.detalle_pago?.id_cuota === Number(installmentId))
	const first = matches[0]?.detalle_pago
	if (!first || matches.some((row) => row.detalle_pago?.id_contrato !== undefined && row.detalle_pago.id_contrato !== contractId)) return 'no_evidence'
	const consistent = matches.every((row) => {
		const detail = row.detalle_pago
		return detail
			&& Number(detail.saldo_cuota) === Number(first.saldo_cuota)
			&& Number(detail.valor_pago) === Number(first.valor_pago)
			&& Number(detail.tarifa) === Number(first.tarifa)
	})
	if (!consistent) return 'no_evidence'
	if (Number(first.saldo_cuota) === 0 && Number(first.valor_pago) > 0) return 'paid'
	if (Number(first.valor_pago) > 0 && Number(first.saldo_cuota) > 0 && Number(first.saldo_cuota) < invoiceBalance) return 'partial_payment'
	return 'no_evidence'
}
