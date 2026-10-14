import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { CommonModule } from './common/common.module'
import { DatabaseModule } from './database/database.module'
import { SettingsModule } from './settings/settings.module'
import { SyncModule } from './sync/sync.module'
import { SchedulerModule } from './scheduler/scheduler.module'

@Module({
	imports: [ConfigModule.forRoot({ isGlobal: true }), CommonModule, DatabaseModule, AuthModule, SettingsModule, SyncModule, SchedulerModule],
})
export class AppModule {}
