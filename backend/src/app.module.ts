import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'
import { CommonModule } from './common/common.module'
import { DatabaseModule } from './database/database.module'
import { HealthController } from './health/health.controller'
import { SettingsModule } from './settings/settings.module'
import { SyncModule } from './sync/sync.module'
import { SchedulerModule } from './scheduler/scheduler.module'

@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		LoggerModule.forRoot({
			pinoHttp: {
				level: process.env.LOG_LEVEL ?? 'info',
				autoLogging: { ignore: (request) => request.url === '/health' },
				serializers: {
					req: (request) => ({
						id: request.id,
						method: request.method,
						url: request.url,
					}),
					res: (response) => ({
						statusCode: response.statusCode,
					}),
				},
				redact: {
					paths: ['body.password', 'body.encryptedPassword', 'body.access_token'],
					remove: true,
				},
				transport: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' ? undefined : {
					target: 'pino-pretty',
					options: {
						colorize: true,
						singleLine: true,
						translateTime: 'SYS:standard',
						messageFormat: '{req.method} {req.url} -> {res.statusCode} ({responseTime}ms)',
						ignore: 'pid,hostname,req,res,responseTime',
					},
				},
			},
		}),
		CommonModule,
		DatabaseModule,
		SettingsModule,
		SyncModule,
		SchedulerModule,
	],
	controllers: [HealthController],
})
export class AppModule {}
