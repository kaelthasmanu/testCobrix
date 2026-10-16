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
const swagger_1 = require("@nestjs/swagger");
const sync_service_1 = require("./sync.service");
const sync_dto_1 = require("./sync.dto");
const pagination_1 = require("../common/pagination");
let SyncController = class SyncController {
    sync;
    constructor(sync) {
        this.sync = sync;
    }
    import(query) {
        return this.sync.import(query.simulation === 'true');
    }
    updatePayments(query) {
        return this.sync.updatePayments(query.simulation === 'true');
    }
    current() {
        return { progress: this.sync.currentProgress() };
    }
    async listRuns(query) {
        const { page, pageSize, skip } = (0, pagination_1.pageWindow)(query);
        const { runs, total } = await this.sync.listRuns({ type: query.type, skip, take: pageSize });
        return (0, pagination_1.toPage)(runs, total, page, pageSize);
    }
    async getRun(id) {
        const run = await this.sync.getRun(id);
        if (!run)
            throw new common_1.NotFoundException('La corrida no existe. Puede que la base se haya reiniciado.');
        return run;
    }
    async listRunItems(id, query) {
        const { page, pageSize, skip } = (0, pagination_1.pageWindow)(query);
        const { items, total } = await this.sync.listRunItems(id, { result: query.result, search: query.search, skip, take: pageSize });
        return (0, pagination_1.toPage)(items, total, page, pageSize);
    }
};
exports.SyncController = SyncController;
__decorate([
    (0, common_1.Post)('import'),
    (0, swagger_1.ApiOperation)({ summary: 'Importar clientes y facturas (o simularlo con simulation=true)' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Corrida registrada; si falló, viene con status «failed» y el error.' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Ya hay una corrida en curso.' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [sync_dto_1.SyncQueryDto]),
    __metadata("design:returntype", void 0)
], SyncController.prototype, "import", null);
__decorate([
    (0, common_1.Post)('payments'),
    (0, swagger_1.ApiOperation)({ summary: 'Actualizar facturas pagadas (o simularlo con simulation=true)' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: 'Ya hay una corrida en curso.' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [sync_dto_1.SyncQueryDto]),
    __metadata("design:returntype", void 0)
], SyncController.prototype, "updatePayments", null);
__decorate([
    (0, common_1.Get)('current'),
    (0, swagger_1.ApiOperation)({ summary: 'Progreso de la corrida en curso, o null' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SyncController.prototype, "current", null);
__decorate([
    (0, common_1.Get)('runs'),
    (0, swagger_1.ApiOperation)({ summary: 'Historial de corridas, paginado, de la más reciente a la más vieja' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [sync_dto_1.RunQueryDto]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "listRuns", null);
__decorate([
    (0, common_1.Get)('runs/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Detalle de una corrida: contadores y cuántas filas hay por resultado' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'La corrida no existe.' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "getRun", null);
__decorate([
    (0, common_1.Get)('runs/:id/items'),
    (0, swagger_1.ApiOperation)({ summary: 'Filas de una corrida (una por cuota), paginadas, con filtro por resultado y búsqueda' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, sync_dto_1.RunItemQueryDto]),
    __metadata("design:returntype", Promise)
], SyncController.prototype, "listRunItems", null);
exports.SyncController = SyncController = __decorate([
    (0, common_1.Controller)('sync'),
    (0, swagger_1.ApiTags)('Sincronización'),
    __param(0, (0, common_1.Inject)(sync_service_1.SyncService)),
    __metadata("design:paramtypes", [sync_service_1.SyncService])
], SyncController);
