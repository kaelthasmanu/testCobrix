export interface ContractRow {
	readonly contrato_id?: number
	readonly identificacion_contrato?: string
	readonly nombre_contrato?: string
	readonly telefono?: string
	readonly email?: string
	readonly estado?: string
	readonly nombre_plan?: string
	readonly precio_servicio?: string
	readonly nombre_sucursal?: string
	readonly sigla_sucursal?: string
}

export interface Contract {
	readonly id: number
	readonly status: string
	readonly plan: string
	readonly price: number
	readonly branch: string
}

export interface Customer {
	readonly name: string
	readonly document: string
	readonly email: string
	readonly phone: string
	readonly contracts: readonly Contract[]
}
