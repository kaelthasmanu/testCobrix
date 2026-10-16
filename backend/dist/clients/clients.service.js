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
exports.ClientsService = void 0;
exports.cobrixInvoiceNumber = cobrixInvoiceNumber;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const rules_1 = require("../common/rules");
const pagination_1 = require("../common/pagination");
let ClientsService = class ClientsService {
    database;
    constructor(database) {
        this.database = database;
    }
    async list(query) {
        const { page, pageSize, skip } = (0, pagination_1.pageWindow)(query);
        const term = query.search?.trim() ?? '';
        const document = (0, rules_1.normalizeDocument)(term);
        const digits = term.replace(/\D/g, '').replace(/^0+/, '');
        const where = {
            AND: [
                ...(term ? [{
                        OR: [
                            { name: { contains: term.toUpperCase() } },
                            ...(document ? [{ document: { contains: document } }] : []),
                            ...(digits.length >= 3 ? [{ document: { contains: digits } }] : []),
                        ],
                    }] : []),
                ...(query.type === 'juridica' ? [{ OR: [{ document: { startsWith: 'J' } }, { document: { startsWith: 'G' } }] }] : []),
                ...(query.type === 'natural' ? [{ NOT: [{ document: { startsWith: 'J' } }, { document: { startsWith: 'G' } }] }] : []),
            ],
        };
        const clients = await this.database.client.findMany({
            where,
            select: {
                id: true,
                document: true,
                name: true,
                _count: { select: { contracts: true } },
                invoices: { select: { status: true, balance: true, dueDate: true } },
            },
        });
        const rows = clients
            .map((client) => {
            const openInvoices = client.invoices.filter((invoice) => invoice.status === 'open');
            const paidInvoices = client.invoices.filter((invoice) => invoice.status === 'paid');
            const debt = openInvoices.reduce((sum, invoice) => sum + invoice.balance, 0);
            return {
                document: client.document,
                name: client.name,
                personType: (0, rules_1.personType)(client.document),
                contracts: client._count.contracts,
                openInvoices: openInvoices.length,
                paidInvoices: paidInvoices.length,
                debt: (0, rules_1.roundMoney)(debt),
                oldestDueDate: openInvoices.reduce((oldest, invoice) => !oldest || invoice.dueDate < oldest ? invoice.dueDate : oldest, null),
            };
        })
            .filter((client) => query.debt === 'with' ? client.debt > 0.005 : query.debt === 'without' ? client.debt <= 0.005 : true);
        rows.sort((left, right) => {
            const direction = query.order === 'desc' ? -1 : 1;
            if (query.sort === 'oldestDueDate') {
                const leftNull = left.oldestDueDate === null;
                const rightNull = right.oldestDueDate === null;
                if (leftNull !== rightNull)
                    return leftNull ? -1 : 1;
            }
            const leftValue = left[query.sort ?? 'name'];
            const rightValue = right[query.sort ?? 'name'];
            if (leftValue === null || rightValue === null) {
                if (leftValue === rightValue)
                    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
                return leftValue === null ? -1 : 1;
            }
            if (leftValue < rightValue)
                return -1 * direction;
            if (leftValue > rightValue)
                return 1 * direction;
            return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
        });
        return (0, pagination_1.toPage)(rows.slice(skip, skip + pageSize), rows.length, page, pageSize);
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
exports.ClientsService = ClientsService;
exports.ClientsService = ClientsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], ClientsService);
/** Número propio de Cobrix, distinto del id de la cuota del administrador. */
function cobrixInvoiceNumber(id) {
    return `COB-${String(id).padStart(6, '0')}`;
}
