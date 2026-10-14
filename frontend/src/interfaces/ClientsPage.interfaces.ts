export interface Client {
	readonly id: string
	readonly name: string
	readonly document: string
	readonly type: 'Natural' | 'Jurídico'
	readonly contracts: number
	readonly openInvoices: number
	readonly paidInvoices: number
	readonly debt: number
	readonly oldestDue: string | null
}
