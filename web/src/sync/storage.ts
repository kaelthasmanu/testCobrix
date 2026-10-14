export type RunType = 'import' | 'payments'
export type RunStatus = 'completed' | 'failed'
export type ItemResult =
	| 'imported'
	| 'already_imported'
	| 'excluded_status'
	| 'outside_window'
	| 'excluded_document'
	| 'invalid_customer'
	| 'invalid_contract'
	| 'incoherent_currency'
	| 'zero_balance'
	| 'limit_reached'
	| 'paid'
	| 'partial_payment'
	| 'no_evidence'

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

const INVOICES_KEY = 'cobrix.sync.invoices'
const RUNS_KEY = 'cobrix.sync.runs'

function read<T>(key: string, fallback: T): T {
	const value = window.localStorage.getItem(key)
	if (!value) return fallback
	try {
		return JSON.parse(value) as T
	} catch {
		window.localStorage.removeItem(key)
		return fallback
	}
}

function write<T>(key: string, value: T): void {
	window.localStorage.setItem(key, JSON.stringify(value))
}

export function loadInvoices(): StoredInvoice[] {
	return read<StoredInvoice[]>(INVOICES_KEY, [])
}

export function saveInvoices(invoices: readonly StoredInvoice[]): void {
	write(INVOICES_KEY, invoices)
}

export function loadRuns(): SyncRun[] {
	return read<SyncRun[]>(RUNS_KEY, []).sort((left, right) => right.startedAt.localeCompare(left.startedAt))
}

export function saveRun(run: SyncRun): void {
	const runs = loadRuns()
	write(RUNS_KEY, [run, ...runs].slice(0, 50))
}
