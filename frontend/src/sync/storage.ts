export type { StoredInvoice, RunItem, SyncRun, RunType, RunStatus, ItemResult } from '../interfaces/sync.interfaces'
import type { StoredInvoice, SyncRun } from '../interfaces/sync.interfaces'

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
