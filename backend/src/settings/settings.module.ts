import { Module } from '@nestjs/common'
import { ProviderModule } from '../provider/provider.module'
import { SettingsController } from './settings.controller'
import { SettingsService } from './settings.service'

@Module({
	imports: [ProviderModule],
	controllers: [SettingsController],
	providers: [SettingsService],
	exports: [SettingsService],
})
export class SettingsModule {}
