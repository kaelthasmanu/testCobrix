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
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const database_service_1 = require("../database/database.service");
const rules_1 = require("../common/rules");
const settings_types_1 = require("./settings.types");
let SettingsService = class SettingsService {
    database;
    config;
    constructor(database, config) {
        this.database = database;
        this.config = config;
    }
    async get() {
        const rows = await this.database.appSetting.findMany();
        const stored = {};
        for (const row of rows) {
            if (!(row.key in settings_types_1.DEFAULT_SETTINGS))
                continue;
            try {
                stored[row.key] = JSON.parse(row.value);
            }
            catch {
                // Un valor corrupto no debe tumbar la corrida: se usa el valor por defecto.
            }
        }
        const settings = { ...settings_types_1.DEFAULT_SETTINGS, ...stored };
        // Una zona guardada que el motor ya no reconoce no debe romper las corridas.
        if (!(0, rules_1.isValidTimeZone)(settings.timeZone))
            settings.timeZone = rules_1.DEFAULT_TIME_ZONE;
        return settings;
    }
    async save(patch) {
        // El DTO llega como instancia con todos sus campos declarados: los que no vinieron valen `undefined`
        // y no deben pisar lo guardado. `null` sí se guarda (significa «sin límite»).
        const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
        const settings = { ...(await this.get()), ...defined };
        await this.database.$transaction(async (tx) => {
            for (const key of Object.keys(settings_types_1.DEFAULT_SETTINGS)) {
                const value = JSON.stringify(settings[key]);
                await tx.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
            }
        });
        return settings;
    }
    /** Fecha de negocio: hoy en la zona horaria de la empresa, o `BUSINESS_DATE` para reproducir la prueba. */
    async today() {
        return (0, rules_1.businessToday)(this.config.get('BUSINESS_DATE'), (await this.get()).timeZone);
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(1, (0, common_1.Inject)(config_1.ConfigService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService, config_1.ConfigService])
], SettingsService);
