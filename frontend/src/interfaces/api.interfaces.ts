/** Formas de las respuestas del backend de Cobrix (ver http://127.0.0.1:4320/docs). */

export type RunType = 'import' | 'payments'
export type RunStatus = 'running' | 'completed' | 'failed'
export type PersonType = 'natural' | 'juridica'
export type ImportWindow = 'none' | '3' | '6' | '9' | '12'

export type ItemResult =
	| 'imported' | 'already_imported' | 'excluded_status' | 'unknown_status' | 'contradictory_response' | 'incoherent_currency'
	| 'invalid_customer' | 'excluded_document' | 'zero_balance' | 'unparseable_period' | 'outside_window' | 'recent_limit' | 'capped'
	| 'paid' | 'partial_payment' | 'still_open' | 'exonerated' | 'inconsistent_ledger' | 'no_evidence'
	| 'provider_error'

export interface RunSummary {
	readonly id: string
	readonly type: RunType
	readonly simulation: boolean
	readonly trigger: 'manual' | 'automatic'
	readonly status: RunStatus
	readonly startedAt: string
	readonly finishedAt: string
	readonly summary: string
	readonly counters: Readonly<Record<string, number>>
	readonly error: string | null
}

export interface RunItem {
	readonly installmentId: string | null
	readonly contractId: number | null
	readonly customerDocument: string | null
	readonly customerName: string | null
	readonly period: string | null
	readonly result: ItemResult
	readonly reason: string
	readonly amount: number | null
	readonly detail: string | null
}

export interface RunDetail extends RunSummary {
	/** Filas por resultado, de más a menos. Las filas se piden paginadas a /sync/runs/:id/items. */
	readonly resultCounts: Readonly<Record<string, number>>
	readonly itemCount: number
}

/** Respuesta paginada del backend. */
export interface Page<T> {
	readonly items: readonly T[]
	readonly total: number
	readonly page: number
	readonly pageSize: number
	readonly pageCount: number
}

export interface RunProgress {
	readonly runId: string
	readonly type: RunType
	readonly simulation: boolean
	readonly trigger: 'manual' | 'automatic'
	readonly startedAt: string
	readonly total: number
	readonly processed: number
	readonly stage: string
}

export interface PanelSettings {
	readonly companyName: string
	readonly companyRif: string
	readonly billingEmail: string
	readonly timeZone: string
	readonly importableStatuses: readonly string[]
	readonly importWindow: ImportWindow
	readonly recentInstallmentsLimit: number | null
	readonly graceDays: number
	readonly maxNewInvoices: number | null
	readonly maxNewAmount: number | null
	readonly excludedDocumentTypes: readonly string[]
	readonly automaticRunEnabled: boolean
	readonly automaticRunTime: string
}

export interface ProviderView {
	readonly baseUrl: string
	readonly username: string
	readonly hasPassword: boolean
}

export interface SettingsResponse extends PanelSettings {
	readonly provider: ProviderView
	readonly businessDate: string
}

export interface ProviderTestResult {
	readonly connected: boolean
	readonly baseUrl: string
	readonly usuario: string
	readonly contracts: number
}

export interface Alert {
	readonly id: string
	readonly severity: 'bad' | 'warn' | 'info'
	readonly title: string
	readonly detail: string
	readonly link?: string
	readonly items?: readonly string[]
}

export interface SummaryResponse {
	readonly today: string
	readonly metrics: { readonly clients: number; readonly contracts: number; readonly openInvoices: number; readonly paidInvoices: number; readonly receivable: number }
	readonly aging: ReadonlyArray<{ readonly key: string; readonly label: string; readonly count: number; readonly amount: number }>
	readonly provider: ProviderView & { readonly configured: boolean }
	readonly automaticRun: {
		readonly enabled: boolean
		readonly time: string
		readonly timeZone: string
		readonly nextRunAt: string | null
		readonly last: Pick<RunSummary, 'id' | 'type' | 'status' | 'startedAt' | 'summary'> | null
	}
	readonly recentRuns: readonly RunSummary[]
	readonly alerts: readonly Alert[]
}

export interface ClientRow {
	readonly document: string
	readonly name: string
	readonly personType: PersonType
	readonly contracts: number
	readonly openInvoices: number
	readonly paidInvoices: number
	readonly debt: number
	readonly oldestDueDate: string | null
}

export interface CustomerRecord {
	readonly client: { readonly document: string; readonly name: string; readonly email: string | null; readonly phone: string | null; readonly origin: string; readonly createdAt: string; readonly personType: PersonType }
	readonly totals: { readonly debt: number; readonly openInvoices: number; readonly paidInvoices: number; readonly contracts: number; readonly oldestOpenDueDate: string | null }
	readonly contracts: ReadonlyArray<{ readonly providerId: number; readonly status: string; readonly plan: string | null; readonly price: number; readonly currency: string; readonly branch: string | null; readonly updatedAt: string }>
}

export interface CustomerInvoice {
	readonly id: number
	readonly number: string
	readonly installmentId: string
	readonly contractId: number
	readonly plan: string | null
	readonly period: string
	readonly dueDate: string
	readonly cutoffDate: string
	readonly amount: number
	readonly balance: number
	readonly providerBalance: number | null
	readonly status: 'open' | 'paid'
	readonly importedAt: string
	readonly paidAt: string | null
	readonly paidByProviderInvoiceNumber: string | null
}

export interface CustomerEvent {
	readonly id: number
	readonly type: 'client_created' | 'invoice_imported' | 'invoice_paid' | string
	readonly occurredAt: string
	readonly description: string
	readonly reference: string | null
	readonly invoiceNumber: string | null
}
