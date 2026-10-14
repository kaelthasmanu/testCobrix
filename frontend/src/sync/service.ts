import { authenticatedRequest } from '../auth/api'
import type { PanelSettings } from '../config/settings'
import type { RunItem, StoredInvoice } from './storage'

interface BackendSyncResult {
	readonly summary: string
	readonly counters: Readonly<Record<string, number>>
	readonly items: readonly RunItem[]
}

export async function runImport(accessToken: string, _settings: PanelSettings, simulation: boolean): Promise<BackendSyncResult & { invoices: readonly StoredInvoice[] }> {
	const result = await authenticatedRequest<BackendSyncResult & { invoices?: readonly StoredInvoice[] }>(`/sync/import?simulation=${simulation}`, accessToken, { method: 'POST' })
	return { ...result, invoices: result.invoices ?? [] }
}

export async function runPaymentUpdate(accessToken: string, simulation: boolean): Promise<BackendSyncResult & { invoices: readonly StoredInvoice[] }> {
	const result = await authenticatedRequest<BackendSyncResult & { invoices?: readonly StoredInvoice[] }>(`/sync/payments?simulation=${simulation}`, accessToken, { method: 'POST' })
	return { ...result, invoices: result.invoices ?? [] }
}
