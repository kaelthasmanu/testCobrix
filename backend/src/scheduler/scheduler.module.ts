import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { SettingsModule } from '../settings/settings.module'
import { SyncModule } from '../sync/sync.module'
import { AutomaticRunService } from './automatic-run.service'

@Module({
	imports: [ScheduleModule.forRoot(), SettingsModule, SyncModule],
	providers: [AutomaticRunService],
})
export class SchedulerModule {}
