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
exports.SummaryController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const database_service_1 = require("../database/database.service");
const provider_client_1 = require("../provider/provider.client");
const settings_service_1 = require("../settings/settings.service");
let SummaryController = class SummaryController {
    database;
    provider;
    settings;
    constructor(database, provider, settings) {
        this.database = database;
        this.provider = provider;
        this.settings = settings;
    }
    async get() {
        const [clientCount, contractCount, openInvoices, paidInvoices, receivable, runs, settings] = await Promise.all([
            this.database.invoice.groupBy({ by: ['clientId'] }),
            this.database.invoice.groupBy({ by: ['contractId'] }),
            this.database.invoice.count({ where: { status: 'open' } }),
            this.database.invoice.count({ where: { status: 'paid' } }),
            this.database.invoice.aggregate({ where: { status: 'open' }, _sum: { balance: true } }),
            this.database.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 5 }),
            this.settings.get(),
        ]);
        const metrics = { clients: clientCount.length, contracts: contractCount.length, openInvoices, paidInvoices, receivable: receivable._sum.balance ?? 0 };
        return { metrics, provider: await this.provider.getProviderIdentity(), automaticRun: { enabled: settings.automaticRunEnabled, time: settings.automaticRunTime }, recentRuns: runs.map((run) => ({ ...toSnakeCase(run), counters: JSON.parse(run.counters) })) };
    }
};
exports.SummaryController = SummaryController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SummaryController.prototype, "get", null);
exports.SummaryController = SummaryController = __decorate([
    (0, common_1.Controller)('summary'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [database_service_1.DatabaseService, provider_client_1.ProviderClient, settings_service_1.SettingsService])
], SummaryController);
function toSnakeCase(value) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item]));
}
