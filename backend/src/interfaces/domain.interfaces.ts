export type RunType = 'import' | 'payments'
export type RunStatus = 'running' | 'completed' | 'failed'
export type RunTrigger = 'manual' | 'automatic'
export type InvoiceStatus = 'open' | 'paid'
export type PersonType = 'natural' | 'juridica'

/** Resultado de una cuota (o de un contrato completo) en una corrida de importación. */
export type ImportResult =
	| 'imported' | 'already_imported'
	| 'excluded_status' | 'unknown_status' | 'contradictory_response' | 'incoherent_currency'
	| 'invalid_customer' | 'excluded_document'
	| 'zero_balance' | 'unparseable_period' | 'outside_window' | 'recent_limit' | 'capped'
	| 'provider_error'

/** Resultado de una factura abierta en una corrida de actualización de pagadas. */
export type PaymentResult =
	| 'paid' | 'partial_payment' | 'still_open' | 'exonerated' | 'inconsistent_ledger' | 'no_evidence'
	| 'provider_error'

export type ItemResult = ImportResult | PaymentResult

export type ImportWindow = 'none' | '3' | '6' | '9' | '12'

export interface PanelSettings {
	companyName: string
	companyRif: string
	billingEmail: string
	/** Zona horaria IANA de la empresa: define «hoy», la ventana y la hora de la corrida automática. */
	timeZone: string
	importableStatuses: string[]
	importWindow: ImportWindow
	recentInstallmentsLimit: number | null
	graceDays: number
	maxNewInvoices: number | null
	maxNewAmount: number | null
	excludedDocumentTypes: string[]
	automaticRunEnabled: boolean
	automaticRunTime: string
}

/** Fila de `GET /isp/contrato/individual`: una por cuota pendiente. */
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

/** Fila de `GET /isp/pago_informacion?tipo_busqueda=CUOTA`: una por cuota y por factura de cobro. */
export interface ProviderPaymentRow {
	id_factura?: number
	num_factura?: string
	fecha_emision?: string
	id_contrato?: number
	detalle_pago?: {
		id_contrato?: number
		id_cuota?: number
		periodo_cuota?: string
		tarifa?: number
		valor_pago?: number
		descuento?: number
		saldo_cuota?: number
	} | null
}

export interface SyncItem {
	/** `deuda_id`; ausente cuando el resultado aplica a todo el contrato. */
	installmentId?: string
	contractId?: number
	customerDocument?: string
	customerName?: string
	period?: string
	result: ItemResult
	reason: string
	amount?: number
	/** Dato de apoyo: factura del administrador, saldo en el ISP, etc. */
	detail?: string
}
