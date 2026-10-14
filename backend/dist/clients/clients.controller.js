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
exports.ClientsController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../auth/auth.guard");
const database_service_1 = require("../database/database.service");
let ClientsController = class ClientsController {
    database;
    constructor(database) {
        this.database = database;
    }
    async list(search = '') {
        const clients = await this.database.client.findMany({
            where: { OR: [{ name: { contains: search } }, { document: { contains: search } }, { email: { contains: search } }] },
            include: { contracts: true, invoices: true },
            orderBy: { name: 'asc' },
        });
        return clients.map(({ contracts, invoices, ...client }) => ({
            ...toSnakeCase(client),
            contracts: contracts.length,
            openInvoices: invoices.filter((invoice) => invoice.status === 'open').length,
            paidInvoices: invoices.filter((invoice) => invoice.status === 'paid').length,
            debt: invoices.filter((invoice) => invoice.status === 'open').reduce((sum, invoice) => sum + invoice.balance, 0),
            oldestDueDate: invoices.filter((invoice) => invoice.status === 'open').map((invoice) => invoice.dueDate).sort()[0] ?? null,
        }));
    }
    async record(document) {
        const client = await this.database.client.findUnique({ where: { document }, include: { contracts: true, invoices: true, events: true } });
        if (!client)
            throw new common_1.NotFoundException('Cliente no encontrado.');
        const { contracts, invoices, events, ...clientData } = client;
        return {
            client: toSnakeCase(clientData),
            contracts: contracts.sort((a, b) => a.providerId - b.providerId).map(toSnakeCase),
            invoices: invoices.sort((a, b) => b.dueDate.localeCompare(a.dueDate)).map(toSnakeCase),
            events: events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map(toSnakeCase),
        };
    }
};
exports.ClientsController = ClientsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ClientsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)(':document'),
    __param(0, (0, common_1.Param)('document')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ClientsController.prototype, "record", null);
exports.ClientsController = ClientsController = __decorate([
    (0, common_1.Controller)('clients'),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], ClientsController);
function toSnakeCase(value) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item]));
}
