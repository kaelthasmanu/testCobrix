export type RunType = 'import' | 'payments'
export type RunStatus = 'completed' | 'failed'
export type InvoiceStatus = 'open' | 'paid'
export type ItemResult =
	| 'imported' | 'already_imported' | 'excluded_status' | 'outside_window' | 'excluded_document'
	| 'invalid_customer' | 'invalid_contract' | 'incoherent_currency' | 'zero_balance' | 'limit_reached'
	| 'paid' | 'partial_payment' | 'no_evidence'

export interface PanelSettings {
	companyName: string
	companyRif: string
	billingEmail: string
	importableStatuses: string[]
	importWindow: 'none' | '3' | '6' | '9' | '12'
	recentInstallmentsLimit: number | null
	graceDays: number
	maxNewInvoices: number | null
	maxNewAmount: number | null
	excludedDocumentTypes: string[]
	automaticRunEnabled: boolean
	automaticRunTime: string
}

export interface ProviderInstallment {
	contrato_id?: number
	identificacion_contrato?: string
	nombre_contrato?: string
	telefono?: string
	email?: string
	estado?: string
	deuda?: number
	deuda_id?: string
	detalle_deuda?: string[]
	moneda_sigla?: string
	precio_servicio?: string
	nombre_plan?: string
	nombre_sucursal?: string
	sigla_sucursal?: string
}

export interface ProviderPaymentRow {
	id_factura?: number
	num_factura?: string
	fecha_emision?: string
	detalle_pago?: { id_contrato?: number; id_cuota?: number; tarifa?: number; valor_pago?: number; saldo_cuota?: number }
}

export interface SyncItem {
	id: string
	contractId?: number
	customerDocument?: string
	period?: string
	result: ItemResult
	reason: string
	amount?: number
}
