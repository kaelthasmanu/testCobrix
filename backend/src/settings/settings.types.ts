import type { PanelSettings } from '../common/types'

export const DEFAULT_SETTINGS: PanelSettings = {
	companyName: '',
	companyRif: '',
	billingEmail: '',
	importableStatuses: ['ACTIVO', 'CORTADO'],
	importWindow: 'none',
	recentInstallmentsLimit: null,
	graceDays: 0,
	maxNewInvoices: null,
	maxNewAmount: null,
	excludedDocumentTypes: [],
	automaticRunEnabled: false,
	automaticRunTime: '06:00',
}
