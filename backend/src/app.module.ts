import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { CommonModule } from './common/common.module'
import { DatabaseModule } from './database/database.module'
import { HealthController } from './health/health.controller'
import { SettingsModule } from './settings/settings.module'
import { SyncModule } from './sync/sync.module'
import { SchedulerModule } from './scheduler/scheduler.module'

@Module({
	imports: [ConfigModule.forRoot({ isGlobal: true }), CommonModule, DatabaseModule, SettingsModule, SyncModule, SchedulerModule],
	controllers: [HealthController],
})
export class AppModule {}
