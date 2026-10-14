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
exports.SyncController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const database_service_1 = require("../database/database.service");
const sync_service_1 = require("./sync.service");
let SyncController = class SyncController {
    sync;
    database;
    constructor(sync, database) {
        this.sync = sync;
        this.database = database;
    }
    async import(simulation = 'false') {
        return this.sync.import(simulation === 'true');
    }
    async updatePayments(simulation = 'false') {
        return this.sync.updatePayments(simulation === 'true');
    }
    async listRuns() {
        const runs = await this.database.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 50 });
        return runs.map((run) => ({ ...toSnakeCase(run), simulation: run.simulation, counters: JSON.parse(run.counters) }));
    }
    async getRun(id) {
        const run = await this.database.syncRun.findUnique({ where: { id }, include: { items: { orderBy: { id: 'asc' } } } });
        if (!run)
            return null;
        const { items, ...runData } = run;
        return { ...toSnakeCase(runData), simulation: run.simulation, counters: JSON.parse(run.counters), items: items.map(toSnakeCase) };
    }
};
exports.SyncController = SyncController;
__decorate([
    (0, common_1.Post)('sync/import'),
    __param(0, (0, common_1.Query)('simulation')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "import", null);
__decorate([
    (0, common_1.Post)('sync/payments'),
    __param(0, (0, common_1.Query)('simulation')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "updatePayments", null);
__decorate([
    (0, common_1.Get)('sync/runs'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "listRuns", null);
__decorate([
    (0, common_1.Get)('sync/runs/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "getRun", null);
exports.SyncController = SyncController = __decorate([
    (0, common_1.Controller)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [sync_service_1.SyncService, database_service_1.DatabaseService])
], SyncController);
function toSnakeCase(value) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item]));
}
