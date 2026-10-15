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
var SyncService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const node_crypto_1 = require("node:crypto");
const database_service_1 = require("../database/database.service");
const provider_client_1 = require("../provider/provider.client");
const settings_service_1 = require("../settings/settings.service");
const rules_1 = require("../common/rules");
const import_rules_1 = require("./import-rules");
const payment_rules_1 = require("./payment-rules");
/** Un bloqueo más viejo que esto pertenece a un proceso que murió a mitad de corrida. */
const LOCK_TTL_MS = 30 * 60 * 1000;
let SyncService = SyncService_1 = class SyncService {
    database;
    provider;
    settingsService;
    logger = new common_1.Logger(SyncService_1.name);
    progress = null;
    constructor(database, provider, settingsService) {
        this.database = database;
        this.provider = provider;
        this.settingsService = settingsService;
    }
    /** Si el proceso se reinició a mitad de una corrida, esa corrida queda como fallida y se libera el bloqueo. */
    async onModuleInit() {
        const now = new Date().toISOString();
        await this.database.syncRun.updateMany({ where: { status: 'running' }, data: { status: 'failed', finishedAt: now, summary: 'La corrida se interrumpió', error: 'El servidor se reinició antes de terminar la corrida. Vuelve a ejecutarla: la importación y la actualización son idempotentes.' } });
        await this.database.syncLock.deleteMany({});
    }
    currentProgress() {
        return this.progress;
    }
    async import(simulation, trigger = 'manual') {
        return this.runWithHistory('import', simulation, trigger, (items, progress) => this.performImport(simulation, items, progress));
    }
    async updatePayments(simulation, trigger = 'manual') {
        return this.runWithHistory('payments', simulation, trigger, (items, progress) => this.performPaymentUpdate(simulation, items, progress));
    }
    // ------------------------------------------------------------------ importación
    async performImport(simulation, items, progress) {
        const settings = await this.settingsService.get();
        const today = await this.settingsService.today();
        progress.stage = 'Listando contratos';
        const contractIds = await this.provider.getContractIds();
        progress.total = contractIds.length;
        progress.stage = 'Leyendo cuotas pendientes';
        const outcomes = { eligible: 0, no_debt: 0, contradictory_response: 0, unknown_status: 0, excluded_status: 0, incoherent_currency: 0, invalid_customer: 0, excluded_document: 0, provider_error: 0 };
        const candidates = [];
        const contractRows = new Map();
        let installmentsSeen = 0;
        for (const contractId of contractIds) {
            try {
                const rows = await this.provider.getPendingInstallments(contractId);
                const classification = (0, import_rules_1.classifyContract)(contractId, rows, settings, today);
                outcomes[classification.outcome] += 1;
                installmentsSeen += rows.filter((row) => row.deuda_id !== '0').length;
                items.push(...classification.items);
                candidates.push(...classification.candidates);
                if (classification.outcome !== 'contradictory_response' && rows[0])
                    contractRows.set(contractId, rows[0]);
            }
            catch (error) {
                outcomes.provider_error += 1;
                items.push({ contractId, result: 'provider_error', reason: `No se pudieron leer las cuotas del contrato: ${errorMessage(error)}` });
            }
            progress.processed += 1;
        }
        progress.stage = simulation ? 'Calculando resultado' : 'Guardando facturas';
        const known = new Set((await this.database.invoice.findMany({ select: { externalId: true } })).map((invoice) => invoice.externalId));
        const capped = (0, import_rules_1.applyRunCaps)(candidates, known, settings);
        items.push(...capped.items);
        const existingClients = new Set((await this.database.client.findMany({ select: { document: true } })).map((client) => client.document));
        const newClients = new Set();
        let imported = 0;
        let amount = 0;
        for (const candidate of capped.accepted) {
            const isNewClient = !existingClients.has(candidate.document) && !newClients.has(candidate.document);
            if (!simulation) {
                const created = await this.persistInvoice(candidate, settings.graceDays);
                if (!created) {
                    items.push(this.candidateItem(candidate, 'already_imported', 'Otra corrida la importó al mismo tiempo'));
                    continue;
                }
            }
            if (isNewClient)
                newClients.add(candidate.document);
            imported += 1;
            amount += candidate.amount;
            items.push(this.candidateItem(candidate, 'imported', simulation ? 'Se importaría (simulación: no se escribió nada)' : 'Factura abierta creada en Cobrix'));
        }
        if (!simulation)
            await this.refreshKnownContracts(contractRows);
        amount = (0, rules_1.roundMoney)(amount);
        const counters = {
            contractsScanned: contractIds.length,
            contractsEligible: outcomes.eligible,
            contractsWithoutDebt: outcomes.no_debt,
            contractsExcludedStatus: outcomes.excluded_status,
            contractsIncoherentCurrency: outcomes.incoherent_currency,
            contractsContradictory: outcomes.contradictory_response,
            contractsUnknownStatus: outcomes.unknown_status,
            contractsInvalidCustomer: outcomes.invalid_customer,
            contractsExcludedDocument: outcomes.excluded_document,
            contractsWithErrors: outcomes.provider_error,
            installmentsSeen,
            newInvoices: imported,
            newAmount: amount,
            newClients: newClients.size,
            ...countResults(items),
        };
        const verb = simulation ? (imported === 1 ? 'se importaría' : 'se importarían') : (imported === 1 ? 'importada' : 'importadas');
        const warning = outcomes.provider_error > 0 ? ` · ${outcomes.provider_error} contrato(s) con error del administrador` : '';
        return { counters, summary: `${imported} factura${imported === 1 ? '' : 's'} ${verb} por ${(0, rules_1.usd)(amount)}${warning}` };
    }
    /** Crea cliente (si no existe), contrato y factura en una transacción. Devuelve false si la factura ya existía. */
    async persistInvoice(candidate, graceDays) {
        const { row, document } = candidate;
        const now = new Date().toISOString();
        const dueDate = `${candidate.period}-01`;
        try {
            await this.database.$transaction(async (tx) => {
                let client = await tx.client.findUnique({ where: { document } });
                if (!client) {
                    client = await tx.client.create({ data: { document, name: row.nombre_contrato?.trim() || 'Sin nombre', email: row.email?.trim().toLowerCase() || null, phone: row.telefono?.trim() || null, origin: 'Administrador de facturas', createdAt: now } });
                    await tx.customerEvent.create({ data: { clientId: client.id, type: 'client_created', occurredAt: now, description: `Cliente creado al importar el contrato ${candidate.contractId}` } });
                }
                const contractData = contractFields(row);
                const contract = await tx.contract.upsert({
                    where: { providerId: candidate.contractId },
                    create: { providerId: candidate.contractId, clientId: client.id, ...contractData, updatedAt: now },
                    update: { clientId: client.id, ...contractData, updatedAt: now },
                });
                const invoice = await tx.invoice.create({ data: { externalId: candidate.installmentId, contractId: contract.id, clientId: client.id, customerDocument: document, customerName: client.name, period: candidate.period, dueDate, cutoffDate: (0, rules_1.addDays)(dueDate, graceDays), amount: candidate.amount, balance: candidate.amount, status: 'open', importedAt: now } });
                await tx.customerEvent.create({ data: { clientId: client.id, type: 'invoice_imported', occurredAt: now, invoiceId: invoice.id, reference: candidate.installmentId, description: `Factura importada: cuota ${candidate.installmentId} del contrato ${candidate.contractId}, periodo ${candidate.period}, ${(0, rules_1.usd)(candidate.amount)}` } });
            });
            return true;
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
                return false;
            throw error;
        }
    }
    /** Mantiene al día estado, plan y sucursal de los contratos que Cobrix ya conoce. */
    async refreshKnownContracts(rows) {
        const known = await this.database.contract.findMany({ where: { providerId: { in: [...rows.keys()] } }, select: { providerId: true } });
        for (const { providerId } of known) {
            const row = rows.get(providerId);
            if (row)
                await this.database.contract.update({ where: { providerId }, data: { ...contractFields(row), updatedAt: new Date().toISOString() } });
        }
    }
    candidateItem(candidate, result, reason) {
        return { installmentId: candidate.installmentId, contractId: candidate.contractId, customerDocument: candidate.document, customerName: candidate.row.nombre_contrato, period: candidate.period, result, reason, amount: candidate.amount };
    }
    // ------------------------------------------------------------------ pagos
    async performPaymentUpdate(simulation, items, progress) {
        const today = await this.settingsService.today();
        const invoices = await this.database.invoice.findMany({ where: { status: 'open' }, include: { contract: { select: { providerId: true } } }, orderBy: [{ contractId: 'asc' }, { period: 'asc' }] });
        const byContract = new Map();
        for (const invoice of invoices)
            byContract.set(invoice.contract.providerId, [...(byContract.get(invoice.contract.providerId) ?? []), invoice]);
        progress.total = byContract.size;
        progress.stage = 'Revisando el libro de cuotas';
        let paidAmount = 0;
        for (const [contractId, contractInvoices] of byContract) {
            try {
                const ledger = await this.provider.getPaymentLedger(contractId, today);
                const needsLookup = contractInvoices.some((invoice) => (0, payment_rules_1.needsPendingLookup)({ contractId, installmentId: invoice.externalId, balance: invoice.balance, ledger, today }));
                const pending = needsLookup ? await this.provider.getPendingInstallments(contractId) : undefined;
                for (const invoice of contractInvoices) {
                    const evaluation = (0, payment_rules_1.evaluatePayment)({ contractId, installmentId: invoice.externalId, balance: invoice.balance, ledger, pending, today });
                    const item = { installmentId: invoice.externalId, contractId, customerDocument: invoice.customerDocument, customerName: invoice.customerName, period: invoice.period, result: evaluation.result, reason: evaluation.reason, amount: invoice.balance, detail: evaluation.paidBy ? `Factura ISP ${evaluation.paidBy.number}` : evaluation.providerBalance !== undefined ? `Saldo en el ISP: ${(0, rules_1.usd)(evaluation.providerBalance)}` : undefined };
                    if (evaluation.result === 'paid')
                        paidAmount += invoice.balance;
                    if (!simulation)
                        await this.applyPaymentEvaluation(invoice.id, invoice.clientId, invoice.externalId, evaluation);
                    items.push(simulation && evaluation.result === 'paid' ? { ...item, reason: `${item.reason} (simulación: no se marcó)` } : item);
                }
            }
            catch (error) {
                for (const invoice of contractInvoices) {
                    items.push({ installmentId: invoice.externalId, contractId, customerDocument: invoice.customerDocument, customerName: invoice.customerName, period: invoice.period, result: 'provider_error', reason: `No se pudo revisar el contrato: ${errorMessage(error)}. La factura sigue abierta.`, amount: invoice.balance });
                }
            }
            progress.processed += 1;
        }
        const results = countResults(items);
        const paid = results.paid ?? 0;
        const counters = { invoicesEvaluated: invoices.length, contractsChecked: byContract.size, paidInvoices: paid, paidAmount: (0, rules_1.roundMoney)(paidAmount), ...results };
        const verb = simulation ? (paid === 1 ? 'se marcaría pagada' : 'se marcarían pagadas') : (paid === 1 ? 'marcada pagada' : 'marcadas pagadas');
        const partial = results.partial_payment ? ` · ${results.partial_payment} abono(s) parcial(es)` : '';
        return { counters, summary: `${paid} factura${paid === 1 ? '' : 's'} ${verb}${partial}` };
    }
    async applyPaymentEvaluation(invoiceId, clientId, installmentId, evaluation) {
        if (evaluation.result === 'paid' && evaluation.paidBy) {
            const paidBy = evaluation.paidBy;
            await this.database.$transaction(async (tx) => {
                // `status: open` en el filtro hace la escritura idempotente aunque dos corridas se crucen.
                const updated = await tx.invoice.updateMany({ where: { id: invoiceId, status: 'open' }, data: { status: 'paid', balance: 0, providerBalance: 0, paidAt: paidBy.issuedAt, paidByProviderInvoiceId: paidBy.id, paidByProviderInvoiceNumber: paidBy.number } });
                if (updated.count === 0)
                    return;
                await tx.customerEvent.create({ data: { clientId, invoiceId, type: 'invoice_paid', occurredAt: new Date().toISOString(), reference: paidBy.number, description: `Cuota ${installmentId} pagada en el ISP con la factura ${paidBy.number} del ${paidBy.issuedAt}` } });
            });
            return;
        }
        if (evaluation.providerBalance !== undefined) {
            await this.database.invoice.updateMany({ where: { id: invoiceId, status: 'open' }, data: { providerBalance: evaluation.providerBalance } });
        }
    }
    // ------------------------------------------------------------------ historial
    async runWithHistory(type, simulation, trigger, operation) {
        const id = (0, node_crypto_1.randomUUID)();
        const startedAt = new Date().toISOString();
        await this.acquireLock(id, startedAt);
        const items = [];
        const progress = { runId: id, type, simulation, trigger, startedAt, total: 0, processed: 0, stage: 'Iniciando' };
        this.progress = progress;
        try {
            await this.database.syncRun.create({ data: { id, type, simulation, trigger, status: 'running', startedAt, finishedAt: startedAt, summary: 'Corrida en curso', counters: '{}' } });
            try {
                const result = await operation(items, progress);
                await this.finishRun(id, 'completed', result.summary, result.counters, items);
            }
            catch (error) {
                const message = errorMessage(error);
                this.logger.warn(`Corrida ${type} ${id} falló: ${message}`);
                await this.finishRun(id, 'failed', type === 'import' ? 'La importación falló' : 'La actualización de pagadas falló', countResults(items), items, message);
            }
            return this.getRun(id);
        }
        finally {
            this.progress = null;
            await this.database.syncLock.deleteMany({ where: { key: 'sync', runId: id } });
        }
    }
    async acquireLock(runId, acquiredAt) {
        await this.database.syncLock.deleteMany({ where: { key: 'sync', acquiredAt: { lt: new Date(Date.now() - LOCK_TTL_MS).toISOString() } } });
        try {
            await this.database.syncLock.create({ data: { key: 'sync', runId, acquiredAt } });
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                throw new common_1.ConflictException('Ya hay una corrida en curso. Espera a que termine; su progreso se ve en Sincronización.');
            }
            throw error;
        }
    }
    async finishRun(id, status, summary, counters, items, error) {
        await this.database.$transaction([
            this.database.syncRunItem.createMany({ data: items.map((item) => ({ runId: id, externalId: item.installmentId ?? null, contractId: item.contractId ?? null, customerDocument: item.customerDocument ?? null, customerName: item.customerName ?? null, period: item.period ?? null, result: item.result, reason: item.reason, amount: item.amount ?? null, detail: item.detail ?? null })) }),
            this.database.syncRun.update({ where: { id }, data: { status, finishedAt: new Date().toISOString(), summary, counters: JSON.stringify(counters), error: error ?? null } }),
        ]);
    }
    async listRuns(filter = {}) {
        const where = filter.type ? { type: filter.type } : {};
        const [runs, total] = await Promise.all([
            this.database.syncRun.findMany({ where, orderBy: { startedAt: 'desc' }, skip: filter.skip ?? 0, take: filter.take ?? 50 }),
            this.database.syncRun.count({ where }),
        ]);
        return { runs: runs.map((run) => ({ ...run, counters: parseCounters(run.counters) })), total };
    }
    /** Cabecera de la corrida: contadores y cuántas filas hay por resultado. Las filas se piden aparte, paginadas. */
    async getRun(id) {
        const run = await this.database.syncRun.findUnique({ where: { id } });
        if (!run)
            return null;
        const groups = await this.database.syncRunItem.groupBy({ by: ['result'], where: { runId: id }, _count: { _all: true } });
        const resultCounts = Object.fromEntries(groups.sort((a, b) => b._count._all - a._count._all).map((group) => [group.result, group._count._all]));
        return { ...run, counters: parseCounters(run.counters), resultCounts, itemCount: groups.reduce((sum, group) => sum + group._count._all, 0) };
    }
    async listRunItems(runId, filter) {
        const term = filter.search?.trim() ?? '';
        const normalized = term.toUpperCase().replace(/[\s.-]/g, '');
        const search = term
            ? { OR: [{ customerName: { contains: term.toUpperCase() } }, { customerDocument: { contains: normalized } }, { externalId: { contains: normalized } }, ...(/^\d+$/.test(normalized) ? [{ contractId: Number(normalized) }] : [])] }
            : {};
        const where = { runId, ...(filter.result ? { result: filter.result } : {}), ...search };
        const [items, total] = await Promise.all([
            this.database.syncRunItem.findMany({ where, orderBy: { id: 'asc' }, skip: filter.skip, take: filter.take }),
            this.database.syncRunItem.count({ where }),
        ]);
        return { items: items.map((item) => ({ installmentId: item.externalId, contractId: item.contractId, customerDocument: item.customerDocument, customerName: item.customerName, period: item.period, result: item.result, reason: item.reason, amount: item.amount, detail: item.detail })), total };
    }
};
exports.SyncService = SyncService;
exports.SyncService = SyncService = SyncService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(1, (0, common_1.Inject)(provider_client_1.ProviderClient)),
    __param(2, (0, common_1.Inject)(settings_service_1.SettingsService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        provider_client_1.ProviderClient,
        settings_service_1.SettingsService])
], SyncService);
function contractFields(row) {
    return { status: row.estado ?? 'DESCONOCIDO', plan: row.nombre_plan ?? null, price: Number(row.precio_servicio) || 0, currency: row.moneda_sigla ?? null, branch: row.nombre_sucursal ?? row.sigla_sucursal ?? null };
}
function countResults(items) {
    const counters = {};
    for (const item of items)
        counters[item.result] = (counters[item.result] ?? 0) + 1;
    return counters;
}
function parseCounters(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return {};
    }
}
function errorMessage(error) {
    if (error instanceof Error) {
        const response = error.getResponse?.();
        if (typeof response === 'object' && response !== null && 'message' in response)
            return String(response.message);
        return error.message;
    }
    return 'Error desconocido';
}
