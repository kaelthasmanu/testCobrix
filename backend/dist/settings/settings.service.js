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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const settings_types_1 = require("./settings.types");
let SettingsService = class SettingsService {
    database;
    constructor(database) {
        this.database = database;
    }
    async get() {
        const rows = await this.database.appSetting.findMany();
        const values = Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]));
        return { ...settings_types_1.DEFAULT_SETTINGS, ...values };
    }
    async save(patch) {
        const settings = { ...(await this.get()), ...patch };
        await this.database.$transaction(async (tx) => {
            for (const [key, value] of Object.entries(settings)) {
                await tx.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
            }
        });
        return settings;
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], SettingsService);
