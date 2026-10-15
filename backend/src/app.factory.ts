import { ValidationPipe, type INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

/** Configuración común de la app: la usan `main.ts` y las pruebas de integración. */
export function configureApp(app: INestApplication): void {
	app.enableCors()
	app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
	const swaggerConfig = new DocumentBuilder()
		.setTitle('Cobrix API')
		.setDescription('API de Cobrix: configurar el proveedor, importar clientes y facturas, actualizar pagadas y consultar el historial de corridas.')
		.setVersion('1.0')
		.build()
	SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig), {
		customSiteTitle: 'Cobrix API · Swagger',
		swaggerOptions: { displayRequestDuration: true, filter: true },
	})
}
