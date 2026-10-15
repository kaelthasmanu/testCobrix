"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureApp = configureApp;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
/** Configuración común de la app: la usan `main.ts` y las pruebas de integración. */
function configureApp(app) {
    app.enableCors();
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    const swaggerConfig = new swagger_1.DocumentBuilder()
        .setTitle('Cobrix API')
        .setDescription('API de Cobrix: configurar el proveedor, importar clientes y facturas, actualizar pagadas y consultar el historial de corridas.')
        .setVersion('1.0')
        .build();
    swagger_1.SwaggerModule.setup('docs', app, swagger_1.SwaggerModule.createDocument(app, swaggerConfig), {
        customSiteTitle: 'Cobrix API · Swagger',
        swaggerOptions: { displayRequestDuration: true, filter: true },
    });
}
