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
var AutomaticRunService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomaticRunService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const database_service_1 = require("../database/database.service");
const rules_1 = require("../common/rules");
const settings_service_1 = require("../settings/settings.service");
const sync_service_1 = require("../sync/sync.service");
/**
 * Corrida automática diaria: importar y después actualizar pagadas, a la hora configurada en la zona horaria de la empresa.
 * Revisa cada minuto si toca correr (hasta dos horas después de la hora elegida). La última corrida automática se lee de la base, así que un reinicio
 * del proceso no repite la corrida del día.
 */
let AutomaticRunService = AutomaticRunService_1 = class AutomaticRunService {
    settings;
    sync;
    database;
    logger = new common_1.Logger(AutomaticRunService_1.name);
    running = false;
    constructor(settings, sync, database) {
        this.settings = settings;
        this.sync = sync;
        this.database = database;
    }
    async tick() {
        if (this.running)
            return;
        const settings = await this.settings.get();
        if (!settings.automaticRunEnabled)
            return;
        const now = (0, rules_1.zonedParts)(settings.timeZone);
        // Solo dentro de las dos horas siguientes a la hora elegida: si el servidor estuvo apagado, se pone al día,
        // pero activar la corrida a media tarde no dispara una corrida inesperada.
        const late = minutes(now.time) - minutes(settings.automaticRunTime);
        if (late < 0 || late > 120)
            return;
        const lastRun = await this.database.syncRun.findFirst({ where: { trigger: 'automatic', type: 'import' }, orderBy: { startedAt: 'desc' } });
        if (lastRun && (0, rules_1.zonedParts)(settings.timeZone, new Date(lastRun.startedAt)).date === now.date)
            return;
        await this.runNow();
    }
    async runNow() {
        this.running = true;
        try {
            this.logger.log('Iniciando corrida automática: importar y actualizar pagadas.');
            const imported = await this.sync.import(false, 'automatic');
            this.logger.log(`Importación automática: ${imported?.summary}`);
            const payments = await this.sync.updatePayments(false, 'automatic');
            this.logger.log(`Actualización automática: ${payments?.summary}`);
        }
        catch (error) {
            // Una corrida manual en curso (409) u otro error: se reintenta en el próximo minuto.
            this.logger.warn(`La corrida automática no pudo ejecutarse: ${error instanceof Error ? error.message : 'error desconocido'}`);
        }
        finally {
            this.running = false;
        }
    }
};
exports.AutomaticRunService = AutomaticRunService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_MINUTE, { name: 'cobrix-daily-sync' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AutomaticRunService.prototype, "tick", null);
exports.AutomaticRunService = AutomaticRunService = AutomaticRunService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(settings_service_1.SettingsService)),
    __param(1, (0, common_1.Inject)(sync_service_1.SyncService)),
    __param(2, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [settings_service_1.SettingsService,
        sync_service_1.SyncService,
        database_service_1.DatabaseService])
], AutomaticRunService);
function minutes(time) {
    const [hours, mins] = time.split(':').map(Number);
    return hours * 60 + mins;
}
