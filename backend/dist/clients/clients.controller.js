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
exports.cobrixInvoiceNumber = cobrixInvoiceNumber;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
const database_service_1 = require("../database/database.service");
const rules_1 = require("../common/rules");
const pagination_1 = require("../common/pagination");
const SORTS = { name: 'c.name', document: 'c.document', contracts: 'contracts', openInvoices: 'openInvoices', paidInvoices: 'paidInvoices', debt: 'debt', oldestDueDate: 'oldestDueDate' };
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
    (0, swagger_1.ApiPropertyOptional)({ enum: Object.keys(SORTS) }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(Object.keys(SORTS)),
    __metadata("design:type", Object)
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
    database;
    constructor(database) {
        this.database = database;
    }
    async list(query) {
        const { page, pageSize, skip } = (0, pagination_1.pageWindow)(query);
        const conditions = [];
        const term = query.search?.trim() ?? '';
        if (term) {
            const document = (0, rules_1.normalizeDocument)(term);
            const digits = term.replace(/\D/g, '').replace(/^0+/, '');
            const options = [client_1.Prisma.sql `c.name LIKE ${`%${term.toUpperCase()}%`}`];
            if (document)
                options.push(client_1.Prisma.sql `c.document LIKE ${`%${document}%`}`);
            if (digits.length >= 3)
                options.push(client_1.Prisma.sql `c.document LIKE ${`%${digits}%`}`);
            conditions.push(client_1.Prisma.sql `(${client_1.Prisma.join(options, ' OR ')})`);
        }
        if (query.type === 'juridica')
            conditions.push(client_1.Prisma.sql `(c.document LIKE 'J%' OR c.document LIKE 'G%')`);
        if (query.type === 'natural')
            conditions.push(client_1.Prisma.sql `(c.document NOT LIKE 'J%' AND c.document NOT LIKE 'G%')`);
        const where = conditions.length ? client_1.Prisma.sql `WHERE ${client_1.Prisma.join(conditions, ' AND ')}` : client_1.Prisma.empty;
        const having = query.debt === 'with' ? client_1.Prisma.sql `HAVING debt > 0.005` : query.debt === 'without' ? client_1.Prisma.sql `HAVING debt <= 0.005` : client_1.Prisma.empty;
        // Columna de orden de una lista cerrada; la dirección también. Nada del usuario entra crudo al SQL.
        const sort = client_1.Prisma.raw(SORTS[query.sort ?? 'name']);
        const direction = client_1.Prisma.raw(query.order === 'desc' ? 'DESC' : 'ASC');
        const nulls = client_1.Prisma.raw(query.sort === 'oldestDueDate' ? 'oldestDueDate IS NULL,' : '');
        const aggregate = client_1.Prisma.sql `
			SELECT c.document AS document, c.name AS name,
				(SELECT COUNT(*) FROM "Contract" k WHERE k.clientId = c.id) AS contracts,
				COUNT(CASE WHEN i.status = 'open' THEN 1 END) AS openInvoices,
				COUNT(CASE WHEN i.status = 'paid' THEN 1 END) AS paidInvoices,
				COALESCE(SUM(CASE WHEN i.status = 'open' THEN i.balance END), 0) AS debt,
				MIN(CASE WHEN i.status = 'open' THEN i.dueDate END) AS oldestDueDate
			FROM "Client" c LEFT JOIN "Invoice" i ON i.clientId = c.id
			${where}
			GROUP BY c.id
			${having}`;
        const [rows, [{ total }]] = await Promise.all([
            this.database.$queryRaw `${aggregate} ORDER BY ${nulls} ${sort} ${direction}, c.name ASC LIMIT ${pageSize} OFFSET ${skip}`,
            this.database.$queryRaw `SELECT COUNT(*) AS total FROM (${aggregate})`,
        ]);
        return (0, pagination_1.toPage)(rows.map((row) => ({
            document: row.document,
            name: row.name,
            personType: (0, rules_1.personType)(row.document),
            contracts: Number(row.contracts),
            openInvoices: Number(row.openInvoices),
            paidInvoices: Number(row.paidInvoices),
            debt: (0, rules_1.roundMoney)(Number(row.debt ?? 0)),
            oldestDueDate: row.oldestDueDate,
        })), Number(total), page, pageSize);
    }
    async record(rawDocument) {
        const client = await this.findClient(rawDocument);
        const [contracts, open, paid] = await Promise.all([
            this.database.contract.findMany({ where: { clientId: client.id }, orderBy: { providerId: 'asc' } }),
            this.database.invoice.aggregate({ where: { clientId: client.id, status: 'open' }, _count: true, _sum: { balance: true }, _min: { dueDate: true } }),
            this.database.invoice.count({ where: { clientId: client.id, status: 'paid' } }),
        ]);
        const { id: _id, ...data } = client;
        return {
            client: { ...data, personType: (0, rules_1.personType)(data.document) },
            totals: { debt: (0, rules_1.roundMoney)(open._sum.balance ?? 0), openInvoices: open._count, paidInvoices: paid, contracts: contracts.length, oldestOpenDueDate: open._min.dueDate },
            contracts: contracts.map((contract) => ({ providerId: contract.providerId, status: contract.status, plan: contract.plan, price: contract.price, currency: contract.currency ?? 'USD', branch: contract.branch, updatedAt: contract.updatedAt })),
        };
    }
    async invoices(rawDocument, query) {
        const client = await this.findClient(rawDocument);
        const { page, pageSize, skip } = (0, pagination_1.pageWindow)(query);
        const where = { clientId: client.id, ...(query.status ? { status: query.status } : {}) };
        const [rows, total] = await Promise.all([
            this.database.invoice.findMany({ where, include: { contract: { select: { providerId: true, plan: true } } }, orderBy: [{ dueDate: 'desc' }, { id: 'desc' }], skip, take: pageSize }),
            this.database.invoice.count({ where }),
        ]);
        return (0, pagination_1.toPage)(rows.map(({ contract, ...invoice }) => ({ id: invoice.id, number: cobrixInvoiceNumber(invoice.id), installmentId: invoice.externalId, contractId: contract.providerId, plan: contract.plan, period: invoice.period, dueDate: invoice.dueDate, cutoffDate: invoice.cutoffDate, amount: invoice.amount, balance: invoice.balance, providerBalance: invoice.providerBalance, status: invoice.status, importedAt: invoice.importedAt, paidAt: invoice.paidAt, paidByProviderInvoiceNumber: invoice.paidByProviderInvoiceNumber })), total, page, pageSize);
    }
    async events(rawDocument, query) {
        const client = await this.findClient(rawDocument);
        const { page, pageSize, skip } = (0, pagination_1.pageWindow)(query);
        const [rows, total] = await Promise.all([
            this.database.customerEvent.findMany({ where: { clientId: client.id }, orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }], skip, take: pageSize }),
            this.database.customerEvent.count({ where: { clientId: client.id } }),
        ]);
        return (0, pagination_1.toPage)(rows.map((event) => ({ id: event.id, type: event.type, occurredAt: event.occurredAt, description: event.description, reference: event.reference, invoiceNumber: event.invoiceId ? cobrixInvoiceNumber(event.invoiceId) : null })), total, page, pageSize);
    }
    async findClient(rawDocument) {
        const document = (0, rules_1.normalizeDocument)(rawDocument) ?? rawDocument;
        const client = await this.database.client.findUnique({ where: { document } });
        if (!client)
            throw new common_1.NotFoundException(`No hay un cliente con documento ${document}. Puede que aún no se haya importado.`);
        return client;
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
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], ClientsController);
/** Número propio de Cobrix, distinto del id de la cuota del administrador. */
function cobrixInvoiceNumber(id) {
    return `COB-${String(id).padStart(6, '0')}`;
}
