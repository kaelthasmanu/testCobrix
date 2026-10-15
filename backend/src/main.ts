import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { configureApp } from './app.factory'

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(AppModule)
	configureApp(app)
	app.enableShutdownHooks()
	await app.listen(Number(process.env.PORT ?? 4320), process.env.HOST ?? '0.0.0.0')
}

void bootstrap()
