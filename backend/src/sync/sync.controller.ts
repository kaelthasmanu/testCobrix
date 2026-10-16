import { Controller, Get, Inject, NotFoundException, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { SyncService } from './sync.service'
import { RunItemQueryDto, RunQueryDto, SyncQueryDto } from './sync.dto'
import { pageWindow, toPage } from '../common/pagination'

@Controller('sync')
@ApiTags('Sincronización')
export class SyncController {
	constructor(@Inject(SyncService) private readonly sync: SyncService) {}

	@Post('import')
	@ApiOperation({ summary: 'Importar clientes y facturas (o simularlo con simulation=true)' })
	@ApiResponse({ status: 201, description: 'Corrida registrada; si falló, viene con status «failed» y el error.' })
	@ApiResponse({ status: 409, description: 'Ya hay una corrida en curso.' })
	import(@Query() query: SyncQueryDto) {
		return this.sync.import(query.simulation === 'true')
	}

	@Post('payments')
	@ApiOperation({ summary: 'Actualizar facturas pagadas (o simularlo con simulation=true)' })
	@ApiResponse({ status: 409, description: 'Ya hay una corrida en curso.' })
	updatePayments(@Query() query: SyncQueryDto) {
		return this.sync.updatePayments(query.simulation === 'true')
	}

	@Get('current')
	@ApiOperation({ summary: 'Progreso de la corrida en curso, o null' })
	current() {
		return { progress: this.sync.currentProgress() }
	}

	@Get('runs')
	@ApiOperation({ summary: 'Historial de corridas, paginado, de la más reciente a la más vieja' })
	async listRuns(@Query() query: RunQueryDto) {
		const { page, pageSize, skip } = pageWindow(query)
		const { runs, total } = await this.sync.listRuns({ type: query.type, skip, take: pageSize })
		return toPage(runs, total, page, pageSize)
	}

	@Get('runs/:id')
	@ApiOperation({ summary: 'Detalle de una corrida: contadores y cuántas filas hay por resultado' })
	@ApiResponse({ status: 404, description: 'La corrida no existe.' })
	async getRun(@Param('id') id: string) {
		const run = await this.sync.getRun(id)
		if (!run) throw new NotFoundException('La corrida no existe. Puede que la base se haya reiniciado.')
		return run
	}

	@Get('runs/:id/items')
	@ApiOperation({ summary: 'Filas de una corrida (una por cuota), paginadas, con filtro por resultado y búsqueda' })
	async listRunItems(@Param('id') id: string, @Query() query: RunItemQueryDto) {
		const { page, pageSize, skip } = pageWindow(query)
		const { items, total } = await this.sync.listRunItems(id, { result: query.result, search: query.search, skip, take: pageSize })
		return toPage(items, total, page, pageSize)
	}
}
