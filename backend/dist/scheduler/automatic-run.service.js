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
var AutomaticRunService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomaticRunService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const settings_service_1 = require("../settings/settings.service");
const sync_service_1 = require("../sync/sync.service");
let AutomaticRunService = AutomaticRunService_1 = class AutomaticRunService {
    settings;
    sync;
    logger = new common_1.Logger(AutomaticRunService_1.name);
    running = false;
    lastExecutionKey = null;
    constructor(settings, sync) {
        this.settings = settings;
        this.sync = sync;
    }
    async executeWhenScheduled() {
        const settings = await this.settings.get();
        if (!settings.automaticRunEnabled || !/^\d{2}:\d{2}$/.test(settings.automaticRunTime))
            return;
        const now = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Caracas',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(new Date());
        const values = Object.fromEntries(now.map((part) => [part.type, part.value]));
        const currentTime = `${values.hour}:${values.minute}`;
        const executionKey = `${values.year}-${values.month}-${values.day} ${currentTime}`;
        if (currentTime !== settings.automaticRunTime || this.lastExecutionKey === executionKey || this.running)
            return;
        this.running = true;
        this.lastExecutionKey = executionKey;
        try {
            this.logger.log(`Iniciando corrida automática programada para ${executionKey}.`);
            await this.sync.import(false);
            await this.sync.updatePayments(false);
            this.logger.log(`Corrida automática completada: ${executionKey}.`);
        }
        catch (error) {
            this.logger.error(`La corrida automática falló: ${error instanceof Error ? error.message : 'error desconocido'}`);
        }
        finally {
            this.running = false;
        }
    }
};
exports.AutomaticRunService = AutomaticRunService;
__decorate([
    (0, schedule_1.Cron)('* * * * *', { name: 'cobrix-daily-sync', timeZone: 'America/Caracas' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AutomaticRunService.prototype, "executeWhenScheduled", null);
exports.AutomaticRunService = AutomaticRunService = AutomaticRunService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [settings_service_1.SettingsService,
        sync_service_1.SyncService])
], AutomaticRunService);
