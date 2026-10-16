import { Module } from '@nestjs/common'
import { ClientsController } from '../clients/clients.controller'
import { SummaryController } from '../summary/summary.controller'
import { ProviderModule } from '../provider/provider.module'
import { SettingsModule } from '../settings/settings.module'
import { ClientsService } from '../clients/clients.service'
import { SummaryService } from '../summary/summary.service'
import { SyncController } from './sync.controller'
import { SyncService } from './sync.service'

@Module({
	imports: [ProviderModule, SettingsModule],
	controllers: [SyncController, ClientsController, SummaryController],
	providers: [SyncService, ClientsService, SummaryService],
	exports: [SyncService],
})
export class SyncModule {}
