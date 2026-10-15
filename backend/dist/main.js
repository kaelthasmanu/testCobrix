"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const app_factory_1 = require("./app.factory");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    (0, app_factory_1.configureApp)(app);
    app.enableShutdownHooks();
    await app.listen(Number(process.env.PORT ?? 4320), process.env.HOST ?? '0.0.0.0');
}
void bootstrap();
