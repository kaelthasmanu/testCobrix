export interface RuleInstallment {
	readonly contrato_id?: number
	readonly identificacion_contrato?: string
	readonly deuda?: number
	readonly deuda_id?: string
	readonly detalle_deuda?: readonly string[]
	readonly estado?: string
	readonly moneda_sigla?: string
	readonly precio_servicio?: string
}

export interface PaymentEvidence {
	readonly detalle_pago?: {
		readonly id_contrato?: number
		readonly id_cuota?: number
		readonly tarifa?: number
		readonly valor_pago?: number
		readonly saldo_cuota?: number
	}
}
