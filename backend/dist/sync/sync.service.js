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
exports.SyncService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../database/database.service");
const provider_client_1 = require("../provider/provider.client");
const settings_service_1 = require("../settings/settings.service");
const rules_1 = require("../common/rules");
let SyncService = class SyncService {
    database;
    provider;
    settingsService;
    constructor(database, provider, settingsService) {
        this.database = database;
        this.provider = provider;
        this.settingsService = settingsService;
    }
    async import(simulation) {
        const settings = await this.settingsService.get();
        return this.runWithHistory('import', simulation, () => this.performImport(settings, simulation));
    }
    async updatePayments(simulation) {
        return this.runWithHistory('payments', simulation, async (items) => {
            const invoices = await this.database.invoice.findMany({ where: { status: 'open' } });
            const paymentsByContract = new Map();
            let paid = 0;
            for (const invoice of invoices) {
                const rows = paymentsByContract.get(invoice.contractId) ?? await this.provider.getPayments(invoice.contractId);
                paymentsByContract.set(invoice.contractId, rows);
                const result = (0, rules_1.evaluatePayment)(rows, invoice.contractId, invoice.externalId, invoice.balance);
                const item = { id: invoice.externalId, contractId: invoice.contractId, customerDocument: invoice.customerDocument, period: invoice.period, result, reason: result === 'paid' ? (simulation ? 'Se marcaría pagada; simulación sin escritura' : 'Factura marcada como pagada') : result === 'partial_payment' ? 'Existe un abono, pero la cuota conserva saldo' : 'No existe evidencia de pago completo', amount: invoice.amount };
                items.push(item);
                if (result === 'paid') {
                    paid += 1;
                    if (!simulation) {
                        await this.database.$transaction(async (tx) => {
                            await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'paid', balance: 0, paidAt: new Date().toISOString() } });
                            await tx.customerEvent.create({ data: { clientId: invoice.clientId, type: 'invoice_paid', occurredAt: new Date().toISOString(), description: 'Factura pagada en el ISP', invoiceId: invoice.id } });
                        });
                    }
                }
            }
            return { counters: { invoicesEvaluated: invoices.length, paidInvoices: paid, partialPayments: items.filter((item) => item.result === 'partial_payment').length, noEvidence: items.filter((item) => item.result === 'no_evidence').length }, summary: `${paid} factura${paid === 1 ? '' : 's'} ${simulation ? 'se marcarían como pagadas' : 'marcadas como pagadas'}` };
        });
    }
    async performImport(settings, simulation) {
        const items = [];
        const candidates = [];
        const ids = await this.provider.getContractIds();
        const knownInvoices = new Set((await this.database.invoice.findMany({ select: { externalId: true } })).map((row) => row.externalId));
        for (const contractId of ids) {
            const rows = (await this.provider.getPendingInstallments(contractId)).filter((row) => row.deuda_id !== '0');
            const invalidContract = rows.some((row) => row.contrato_id !== contractId) || new Set(rows.map((row) => row.deuda_id)).size !== rows.length;
            if (invalidContract) {
                rows.forEach((row) => items.push(this.item(row, 'invalid_contract', 'La respuesta contiene filas contradictorias o cuotas duplicadas')));
                continue;
            }
            const statuses = new Set(rows.map((row) => row.estado));
            if ([...statuses].some((status) => !status || !['ACTIVO', 'CORTADO', 'CORTESIA', 'RETIRADO', 'RECHAZADO', 'ANULADO'].includes(status))) {
                rows.forEach((row) => items.push(this.item(row, 'invalid_contract', 'Estado de contrato desconocido')));
                continue;
            }
            if ([...statuses].some((status) => !settings.importableStatuses.includes(status))) {
                rows.forEach((row) => items.push(this.item(row, 'excluded_status', `Estado ${row.estado ?? 'desconocido'} no importable`)));
                continue;
            }
            if (!(0, rules_1.isCurrencyCoherent)(rows)) {
                rows.forEach((row) => items.push(this.item(row, 'incoherent_currency', 'El contrato reporta una moneda o monto incoherente con el plan')));
                continue;
            }
            const contractCandidates = [];
            for (const row of rows.sort((a, b) => ((0, rules_1.monthFromDetail)(b.detalle_deuda) ?? '').localeCompare((0, rules_1.monthFromDetail)(a.detalle_deuda) ?? ''))) {
                const amount = Number(row.deuda) || 0;
                const document = (0, rules_1.normalizeDocument)(row.identificacion_contrato);
                const period = (0, rules_1.monthFromDetail)(row.detalle_deuda);
                if (amount < 0.01)
                    items.push(this.item(row, 'zero_balance', 'La cuota tiene saldo residual o deuda igual a cero'));
                else if (!document)
                    items.push(this.item(row, 'invalid_customer', 'Identificación del titular inválida'));
                else if (isExcludedDocument(document, settings))
                    items.push(this.item(row, 'excluded_document', `Tipo de documento excluido: ${document[0]}`));
                else if (!period || !(0, rules_1.isWithinWindow)(period, settings))
                    items.push(this.item(row, 'outside_window', 'La cuota está fuera de la ventana configurada'));
                else
                    contractCandidates.push({ row, document, period, amount });
            }
            const limited = settings.recentInstallmentsLimit === null ? contractCandidates : contractCandidates.slice(0, settings.recentInstallmentsLimit);
            contractCandidates.slice(limited.length).forEach((candidate) => items.push(this.item(candidate.row, 'limit_reached', 'Supera el máximo de cuotas recientes por contrato')));
            candidates.push(...limited);
        }
        let total = 0;
        let imported = 0;
        for (const candidate of candidates) {
            const externalId = candidate.row.deuda_id ?? '';
            if (knownInvoices.has(externalId)) {
                items.push(this.item(candidate.row, 'already_imported', 'La cuota ya fue importada'));
                continue;
            }
            if (settings.maxNewInvoices !== null && imported >= settings.maxNewInvoices) {
                items.push(this.item(candidate.row, 'limit_reached', 'Se alcanzó el tope de facturas nuevas'));
                continue;
            }
            if (settings.maxNewAmount !== null && total + candidate.amount > settings.maxNewAmount) {
                items.push(this.item(candidate.row, 'limit_reached', 'Se alcanzó el tope de monto nuevo'));
                continue;
            }
            if (!simulation)
                await this.persistInvoice(candidate, settings);
            knownInvoices.add(externalId);
            imported += 1;
            total += candidate.amount;
            items.push(this.item(candidate.row, 'imported', simulation ? 'Se importaría; simulación sin escritura' : 'Factura importada'));
        }
        return { items, counters: { contractsEvaluated: ids.length, invoicesNew: imported, amountNew: total, ...count(items) }, summary: `${imported} factura${imported === 1 ? '' : 's'} ${simulation ? 'se importarían' : 'importadas'}` };
    }
    async persistInvoice(candidate, settings) {
        const row = candidate.row;
        const document = candidate.document;
        const dueDate = `${candidate.period}-01`;
        await this.database.$transaction(async (tx) => {
            const client = await tx.client.upsert({
                where: { document },
                create: { document, name: row.nombre_contrato ?? 'Sin nombre', email: row.email ?? null, phone: row.telefono ?? null, origin: 'administrator', createdAt: new Date().toISOString() },
                update: { name: row.nombre_contrato ?? 'Sin nombre', email: row.email ?? null, phone: row.telefono ?? null },
            });
            const contract = await tx.contract.upsert({
                where: { providerId: row.contrato_id },
                create: { providerId: row.contrato_id, clientId: client.id, status: row.estado ?? 'UNKNOWN', plan: row.nombre_plan ?? null, price: Number(row.precio_servicio) || 0, branch: row.nombre_sucursal ?? row.sigla_sucursal ?? null, updatedAt: new Date().toISOString() },
                update: { clientId: client.id, status: row.estado ?? 'UNKNOWN', plan: row.nombre_plan ?? null, price: Number(row.precio_servicio) || 0, branch: row.nombre_sucursal ?? row.sigla_sucursal ?? null, updatedAt: new Date().toISOString() },
            });
            const invoice = await tx.invoice.create({ data: { externalId: row.deuda_id ?? '', contractId: contract.id, clientId: client.id, customerDocument: document, customerName: row.nombre_contrato ?? 'Sin nombre', period: candidate.period, dueDate, cutoffDate: (0, rules_1.addDays)(dueDate, settings.graceDays), amount: candidate.amount, balance: candidate.amount, status: 'open', importedAt: new Date().toISOString() } });
            await tx.customerEvent.create({ data: { clientId: client.id, type: 'invoice_imported', occurredAt: new Date().toISOString(), description: 'Factura importada desde el administrador', invoiceId: invoice.id } });
        });
    }
    item(row, result, reason) {
        return { id: `${row.contrato_id ?? 'unknown'}:${row.deuda_id ?? 'unknown'}`, contractId: row.contrato_id, customerDocument: (0, rules_1.normalizeDocument)(row.identificacion_contrato) ?? row.identificacion_contrato, period: (0, rules_1.monthFromDetail)(row.detalle_deuda) ?? undefined, result, reason, amount: Number(row.deuda) || 0 };
    }
    async runWithHistory(type, simulation, operation) {
        const id = (0, node_crypto_1.randomUUID)();
        const started = new Date().toISOString();
        const items = [];
        try {
            const result = await operation(items);
            const allItems = result.items ?? items;
            await this.saveRun(id, type, simulation, 'completed', started, result.summary, result.counters, allItems);
            return { id, type, simulation, status: 'completed', summary: result.summary, counters: result.counters, items: allItems };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Error desconocido';
            await this.saveRun(id, type, simulation, 'failed', started, 'La corrida falló', {}, items, message);
            throw error;
        }
    }
    async saveRun(id, type, simulation, status, started, summary, counters, items, error) {
        await this.database.$transaction(async (tx) => {
            await tx.syncRun.create({ data: { id, type, simulation, status, startedAt: started, finishedAt: new Date().toISOString(), summary, counters: JSON.stringify(counters), error: error ?? null, items: { create: items.map((item) => ({ externalId: item.id, contractId: item.contractId ?? null, customerDocument: item.customerDocument ?? null, period: item.period ?? null, result: item.result, reason: item.reason, amount: item.amount ?? null })) } } });
        });
    }
};
exports.SyncService = SyncService;
exports.SyncService = SyncService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        provider_client_1.ProviderClient,
        settings_service_1.SettingsService])
], SyncService);
function isExcludedDocument(document, settings) {
    return document.length > 0 && settings.excludedDocumentTypes.includes(document[0]);
}
function count(items) {
    return items.reduce((result, item) => ({ ...result, [item.result]: (result[item.result] ?? 0) + 1 }), {});
}
