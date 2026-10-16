import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { DatabaseService } from '../database/database.service'

@Controller('health')
@ApiTags('Salud')
export class HealthController {
	constructor(private readonly database: DatabaseService) {}

	@Get()
	@ApiOperation({ summary: 'Comprueba que el backend y su base respondan' })
	async check() {
		await this.database.$queryRaw`SELECT 1`
		return { ok: true }
	}
}
