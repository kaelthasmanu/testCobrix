import 'reflect-metadata'
import { Logger as NestLogger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { configureApp } from './app.factory'

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(AppModule, { bufferLogs: true })
	app.useLogger(app.get(Logger))
	configureApp(app)
	app.enableShutdownHooks()
	await app.listen(Number(process.env.PORT ?? 4320), process.env.HOST ?? '0.0.0.0')
}

void bootstrap().catch((error: unknown) => {
	const logger = new NestLogger('Bootstrap')
	logger.error('No se pudo iniciar Cobrix', error instanceof Error ? error.stack : String(error))
	process.exitCode = 1
})
