export type ImportableContractStatus = 'ACTIVO' | 'CORTADO' | 'CORTESIA' | 'RETIRADO' | 'RECHAZADO' | 'ANULADO'
export type DocumentType = 'V' | 'E' | 'J' | 'G' | 'P'
export type ImportWindow = 'none' | '3' | '6' | '9' | '12'

export interface PanelSettings {
	readonly companyName: string
	readonly companyRif: string
	readonly billingEmail: string
	readonly importableStatuses: readonly ImportableContractStatus[]
	readonly importWindow: ImportWindow
	readonly recentInstallmentsLimit: number | null
	readonly graceDays: number
	readonly maxNewInvoices: number | null
	readonly maxNewAmount: number | null
	readonly excludedDocumentTypes: readonly DocumentType[]
	readonly automaticRunEnabled: boolean
	readonly automaticRunTime: string
}
