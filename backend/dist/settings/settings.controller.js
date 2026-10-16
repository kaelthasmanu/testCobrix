"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const provider_client_1 = require("../provider/provider.client");
const settings_service_1 = require("./settings.service");
const settings_dto_1 = require("./settings.dto");
let SettingsController = class SettingsController {
    settings;
    provider;
    constructor(settings, provider) {
        this.settings = settings;
        this.provider = provider;
    }
    async get() {
        return { ...(await this.settings.get()), provider: await this.provider.getSettingsView(), businessDate: await this.settings.today() };
    }
    async save(body) {
        return this.settings.save(body);
    }
    async testProvider(body) {
        const connection = await this.provider.resolveConnection(body);
        const result = await this.provider.probe(connection);
        return { connected: true, baseUrl: connection.baseUrl, ...result };
    }
    async saveProvider(body) {
        const connection = await this.provider.resolveConnection(body);
        const login = await this.provider.login(connection);
        await this.provider.saveConnection(connection, login);
        return this.provider.getSettingsView();
    }
};
exports.SettingsController = SettingsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Configuración operativa y datos del proveedor (sin la contraseña)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)(),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar empresa, reglas de importación o corrida automática' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [settings_dto_1.UpdateSettingsDto]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "save", null);
__decorate([
    (0, common_1.Post)('provider/test'),
    (0, swagger_1.ApiOperation)({ summary: 'Probar conexión: inicia sesión y cuenta los contratos. No guarda nada.' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [settings_dto_1.ProviderConnectionDto]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "testProvider", null);
__decorate([
    (0, common_1.Put)('provider'),
    (0, swagger_1.ApiOperation)({ summary: 'Guardar URL y credenciales del proveedor tras verificarlas' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [settings_dto_1.ProviderConnectionDto]),
    __metadata("design:returntype", Promise)
], SettingsController.prototype, "saveProvider", null);
exports.SettingsController = SettingsController = __decorate([
    (0, common_1.Controller)('settings'),
    (0, swagger_1.ApiTags)('Configuración'),
    __param(0, (0, common_1.Inject)(settings_service_1.SettingsService)),
    __param(1, (0, common_1.Inject)(provider_client_1.ProviderClient)),
    __metadata("design:paramtypes", [settings_service_1.SettingsService, provider_client_1.ProviderClient])
], SettingsController);
