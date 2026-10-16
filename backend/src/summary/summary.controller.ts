import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { SummaryService } from './summary.service'

@Controller('summary')
@ApiTags('Resumen')
export class SummaryController {
	constructor(private readonly summary: SummaryService) {}

	@Get()
	@ApiOperation({ summary: 'Totales, proveedor, corrida automática, últimas corridas, antigüedad de la deuda y alertas' })
	async get() {
		return this.summary.get()
	}
}
