import type { PanelSettings } from '../config/settings.ts'
import type { PaymentEvidence, RuleInstallment } from '../interfaces/rules.interfaces'
export type { PaymentEvidence, RuleInstallment } from '../interfaces/rules.interfaces'

export function normalizeDocument(value: string | undefined): string | null {
	if (!value) return null
	const normalized = value.toUpperCase().replaceAll(/[\s-]/g, '')
	const match = normalized.match(/^([VEJGP]?)(\d{6,12})$/)
	if (!match) return null
	return `${match[1]}${match[2].replace(/^0+(?=\d)/, '')}`
}

export function monthFromDetail(detail: readonly string[] | undefined): string | null {
	const value = detail?.find((item) => /\d{4}-\d{2}/.test(item))
	const numeric = value?.match(/\d{4}-\d{2}/)?.[0]
	if (numeric) return numeric
	const named = detail?.find((item) => /\d{4}\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(item))
	const match = named?.match(/(\d{4})\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i)
	if (!match) return null
	const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
	const month = months.indexOf(match[2].toLowerCase()) + 1
	return `${match[1]}-${String(month).padStart(2, '0')}`
}

export function monthsSince(period: string, date: Date): number {
	const [year, month] = period.split('-').map(Number)
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Caracas',
		year: 'numeric',
		month: '2-digit',
	}).formatToParts(date)
	const currentYear = Number(parts.find((part) => part.type === 'year')?.value)
	const currentMonth = Number(parts.find((part) => part.type === 'month')?.value)
	return (currentYear - year) * 12 + currentMonth - month
}

export function isCurrencyCoherent(installments: readonly RuleInstallment[]): boolean {
	return installments
		.filter((installment) => Number(installment.deuda) >= 0.01)
		.every((installment) => {
			const price = Number(installment.precio_servicio)
			return installment.moneda_sigla === 'USD' && (price <= 0 || Number(installment.deuda) >= price * 0.01)
		})
}

export function isWithinImportWindow(period: string, settings: PanelSettings, date: Date): boolean {
	return settings.importWindow === 'none' || monthsSince(period, date) <= Number(settings.importWindow)
}

export type PaymentResult = 'paid' | 'partial_payment' | 'no_evidence'

export function evaluatePayment(
	rows: readonly PaymentEvidence[],
	contractId: number,
	installmentId: string,
	invoiceBalance: number,
): PaymentResult {
	const matches = rows.filter((row) => row.detalle_pago?.id_cuota === Number(installmentId))
	const first = matches[0]?.detalle_pago
	if (!first || matches.some((row) => row.detalle_pago?.id_contrato !== undefined && row.detalle_pago.id_contrato !== contractId)) {
		return 'no_evidence'
	}
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
