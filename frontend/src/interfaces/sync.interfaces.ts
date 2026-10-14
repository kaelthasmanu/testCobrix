export type RunType = 'import' | 'payments'
export type RunStatus = 'completed' | 'failed'
export type ItemResult = 'imported' | 'already_imported' | 'excluded_status' | 'outside_window' | 'excluded_document' | 'invalid_customer' | 'invalid_contract' | 'incoherent_currency' | 'zero_balance' | 'limit_reached' | 'paid' | 'partial_payment' | 'no_evidence'

export interface StoredInvoice {
	readonly id: string
	readonly contractId: number
	readonly customerDocument: string
	readonly customerName: string
	readonly period: string
	readonly dueDate: string
	readonly cutoffDate: string
	readonly amount: number
	readonly balance: number
	readonly status: 'open' | 'paid'
	readonly importedAt: string
	readonly paidAt?: string
}

export interface RunItem {
	readonly id: string
	readonly contractId?: number
	readonly customerDocument?: string
	readonly period?: string
	readonly result: ItemResult
	readonly reason: string
	readonly amount?: number
}

export interface SyncRun {
	readonly id: string
	readonly type: RunType
	readonly simulation: boolean
	readonly status: RunStatus
	readonly startedAt: string
	readonly finishedAt: string
	readonly summary: string
	readonly counters: Readonly<Record<string, number>>
	readonly items: readonly RunItem[]
	readonly error?: string
}
