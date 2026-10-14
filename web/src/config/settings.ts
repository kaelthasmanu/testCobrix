export const IMPORTABLE_CONTRACT_STATUSES = ['ACTIVO', 'CORTADO'] as const
export const DOCUMENT_TYPES = ['V', 'E', 'J', 'G', 'P'] as const
export const IMPORT_WINDOWS = ['none', '3', '6', '9', '12'] as const

export type ImportableContractStatus = (typeof IMPORTABLE_CONTRACT_STATUSES)[number]
export type DocumentType = (typeof DOCUMENT_TYPES)[number]
export type ImportWindow = (typeof IMPORT_WINDOWS)[number]

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

const SETTINGS_STORAGE_KEY = 'cobrix.panel.settings'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isOneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
	return typeof value === 'string' && values.includes(value)
}

function nullableNumber(value: unknown, minimum: number, maximum?: number): number | null {
	if (value === null || value === '') return null
	if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || (maximum !== undefined && value > maximum)) return null
	return value
}

function restoreSettings(value: unknown): PanelSettings {
	if (!isRecord(value)) return DEFAULT_SETTINGS
	const statuses = Array.isArray(value.importableStatuses)
		? value.importableStatuses.filter((item): item is ImportableContractStatus => isOneOf(IMPORTABLE_CONTRACT_STATUSES, item))
		: DEFAULT_SETTINGS.importableStatuses
	const excluded = Array.isArray(value.excludedDocumentTypes)
		? value.excludedDocumentTypes.filter((item): item is DocumentType => isOneOf(DOCUMENT_TYPES, item))
		: DEFAULT_SETTINGS.excludedDocumentTypes
	const graceDays = typeof value.graceDays === 'number' && Number.isInteger(value.graceDays)
		&& value.graceDays >= 0 && value.graceDays <= 60 ? value.graceDays : DEFAULT_SETTINGS.graceDays
	const automaticRunTime = typeof value.automaticRunTime === 'string' && /^\d{2}:\d{2}$/.test(value.automaticRunTime)
		? value.automaticRunTime : DEFAULT_SETTINGS.automaticRunTime

	return {
		companyName: typeof value.companyName === 'string' ? value.companyName : DEFAULT_SETTINGS.companyName,
		companyRif: typeof value.companyRif === 'string' ? value.companyRif : DEFAULT_SETTINGS.companyRif,
		billingEmail: typeof value.billingEmail === 'string' ? value.billingEmail : DEFAULT_SETTINGS.billingEmail,
		importableStatuses: statuses.length ? statuses : DEFAULT_SETTINGS.importableStatuses,
		importWindow: isOneOf(IMPORT_WINDOWS, value.importWindow) ? value.importWindow : DEFAULT_SETTINGS.importWindow,
		recentInstallmentsLimit: nullableNumber(value.recentInstallmentsLimit, 1, 60),
		graceDays,
		maxNewInvoices: nullableNumber(value.maxNewInvoices, 1),
		maxNewAmount: nullableNumber(value.maxNewAmount, 0),
		excludedDocumentTypes: excluded,
		automaticRunEnabled: value.automaticRunEnabled === true,
		automaticRunTime,
	}
}

export function loadSettings(): PanelSettings {
	const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY)
	if (!stored) return DEFAULT_SETTINGS
	try {
		return restoreSettings(JSON.parse(stored))
	} catch {
		window.localStorage.removeItem(SETTINGS_STORAGE_KEY)
		return DEFAULT_SETTINGS
	}
}

export function saveSettings(settings: PanelSettings): void {
	window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
}

export function validateSettings(settings: PanelSettings): string | null {
	if (settings.importableStatuses.length === 0) return 'Selecciona al menos un estado de contrato para importar.'
	if (settings.recentInstallmentsLimit !== null && (!Number.isInteger(settings.recentInstallmentsLimit) || settings.recentInstallmentsLimit < 1 || settings.recentInstallmentsLimit > 60)) {
		return 'El máximo de cuotas recientes debe estar entre 1 y 60.'
	}
	if (!Number.isInteger(settings.graceDays) || settings.graceDays < 0 || settings.graceDays > 60) {
		return 'Los días de gracia deben estar entre 0 y 60.'
	}
	if (settings.maxNewInvoices !== null && (!Number.isInteger(settings.maxNewInvoices) || settings.maxNewInvoices < 1)) {
		return 'El tope de facturas nuevas debe ser un número entero mayor que cero.'
	}
	if (settings.maxNewAmount !== null && (!Number.isFinite(settings.maxNewAmount) || settings.maxNewAmount < 0)) {
		return 'El tope de monto nuevo no puede ser negativo.'
	}
	if (!/^\d{2}:\d{2}$/.test(settings.automaticRunTime)) return 'La hora de la corrida automática no es válida.'
	return null
}
