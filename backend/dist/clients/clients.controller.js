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
exports.ClientsController = exports.RecordPageQueryDto = exports.ClientListQueryDto = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const pagination_1 = require("../common/pagination");
const clients_service_1 = require("./clients.service");
class ClientListQueryDto extends pagination_1.PageQueryDto {
    search;
    type;
    debt;
    sort;
    order;
}
exports.ClientListQueryDto = ClientListQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Nombre, o documento con o sin guiones (V-12345678, 12345678).' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(80),
    __metadata("design:type", String)
], ClientListQueryDto.prototype, "search", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['natural', 'juridica'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['natural', 'juridica']),
    __metadata("design:type", String)
], ClientListQueryDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['with', 'without'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['with', 'without']),
    __metadata("design:type", String)
], ClientListQueryDto.prototype, "debt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['name', 'document', 'contracts', 'openInvoices', 'paidInvoices', 'debt', 'oldestDueDate'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['name', 'document', 'contracts', 'openInvoices', 'paidInvoices', 'debt', 'oldestDueDate']),
    __metadata("design:type", String)
], ClientListQueryDto.prototype, "sort", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['asc', 'desc'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['asc', 'desc']),
    __metadata("design:type", String)
], ClientListQueryDto.prototype, "order", void 0);
class RecordPageQueryDto extends pagination_1.PageQueryDto {
    status;
}
exports.RecordPageQueryDto = RecordPageQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['open', 'paid'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['open', 'paid']),
    __metadata("design:type", String)
], RecordPageQueryDto.prototype, "status", void 0);
let ClientsController = class ClientsController {
    clients;
    constructor(clients) {
        this.clients = clients;
    }
    async list(query) {
        return this.clients.list(query);
    }
    async record(rawDocument) {
        return this.clients.record(rawDocument);
    }
    async invoices(rawDocument, query) {
        return this.clients.invoices(rawDocument, query);
    }
    async events(rawDocument, query) {
        return this.clients.events(rawDocument, query);
    }
};
exports.ClientsController = ClientsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Clientes importados, paginados, con búsqueda por nombre, cédula o RIF, filtros y orden' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ClientListQueryDto]),
    __metadata("design:returntype", Promise)
], ClientsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':document'),
    (0, swagger_1.ApiOperation)({ summary: 'Expediente: datos, totales y contratos. Facturas e historial van paginados en sus propias rutas.' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Cliente no encontrado.' }),
    __param(0, (0, common_1.Param)('document')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientsController.prototype, "record", null);
__decorate([
    (0, common_1.Get)(':document/invoices'),
    (0, swagger_1.ApiOperation)({ summary: 'Facturas del cliente, paginadas, de la más reciente a la más vieja' }),
    __param(0, (0, common_1.Param)('document')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, RecordPageQueryDto]),
    __metadata("design:returntype", Promise)
], ClientsController.prototype, "invoices", null);
__decorate([
    (0, common_1.Get)(':document/events'),
    (0, swagger_1.ApiOperation)({ summary: 'Historial del cliente, paginado, del más reciente al más viejo' }),
    __param(0, (0, common_1.Param)('document')),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, pagination_1.PageQueryDto]),
    __metadata("design:returntype", Promise)
], ClientsController.prototype, "events", null);
exports.ClientsController = ClientsController = __decorate([
    (0, common_1.Controller)('clients'),
    (0, swagger_1.ApiTags)('Clientes'),
    __param(0, (0, common_1.Inject)(clients_service_1.ClientsService)),
    __metadata("design:paramtypes", [clients_service_1.ClientsService])
], ClientsController);
