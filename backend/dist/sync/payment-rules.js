"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.needsPendingLookup = needsPendingLookup;
exports.evaluatePayment = evaluatePayment;
const rules_1 = require("../common/rules");
/** Indica si hace falta consultar el contrato para decidir sobre esta cuota. */
function needsPendingLookup(input) {
    return rowsFor(input).length === 0;
}
/**
 * Decide qué pasó con una cuota según el libro del administrador. Solo `paid` cierra la factura.
 * Ante cualquier duda (filas que no coinciden, sin rastro de la cuota) la factura sigue abierta.
 */
function evaluatePayment(input) {
    const rows = rowsFor(input);
    if (rows.length === 0)
        return evaluateWithoutLedger(input);
    if (rows.some((row) => row.detalle_pago?.id_contrato !== input.contractId || (row.id_contrato !== undefined && row.id_contrato !== 0 && row.id_contrato !== input.contractId))) {
        return { result: 'inconsistent_ledger', reason: 'El libro asigna la cuota a otro contrato: no se marca pagada' };
    }
    const values = rows.map((row) => ({
        saldo: Number(row.detalle_pago?.saldo_cuota),
        pagado: Number(row.detalle_pago?.valor_pago),
        tarifa: Number(row.detalle_pago?.tarifa),
        descuento: Number(row.detalle_pago?.descuento ?? 0),
        periodo: row.detalle_pago?.periodo_cuota,
    }));
    const first = values[0];
    if (values.some((value) => !Number.isFinite(value.saldo) || !Number.isFinite(value.pagado) || !Number.isFinite(value.tarifa) || !Number.isFinite(value.descuento))) {
        return { result: 'inconsistent_ledger', reason: 'El libro trae montos inválidos para la cuota' };
    }
    const consistent = values.every((value) => (0, rules_1.sameAmount)(value.saldo, first.saldo) && (0, rules_1.sameAmount)(value.pagado, first.pagado) && (0, rules_1.sameAmount)(value.tarifa, first.tarifa) && (0, rules_1.sameAmount)(value.descuento, first.descuento) && value.periodo === first.periodo);
    if (!consistent) {
        return { result: 'inconsistent_ledger', reason: `Las ${rows.length} filas del libro para la cuota no coinciden entre sí: no se adivina` };
    }
    const providerBalance = (0, rules_1.roundMoney)(first.saldo);
    if (first.saldo < 0)
        return { result: 'inconsistent_ledger', reason: 'El libro reporta un saldo negativo', providerBalance };
    if ((0, rules_1.sameAmount)(first.saldo, 0)) {
        if (first.pagado <= 0)
            return { result: 'exonerated', reason: 'Saldo 0 sin nada pagado (exonerada): no es un pago', providerBalance: 0 };
        const paidBy = lastCollection(rows);
        if (!paidBy)
            return { result: 'inconsistent_ledger', reason: 'Saldo 0 con pagos pero sin factura de cobro asociada', providerBalance: 0 };
        return { result: 'paid', reason: `Pagada en el ISP con la factura ${paidBy.number} del ${paidBy.issuedAt}`, providerBalance: 0, paidBy };
    }
    if (first.saldo < input.balance - 0.005) {
        return { result: 'partial_payment', reason: `Abono parcial: el ISP reporta saldo ${(0, rules_1.usd)(providerBalance)} de ${(0, rules_1.usd)(input.balance)}; sigue abierta`, providerBalance };
    }
    return { result: 'still_open', reason: first.pagado > 0 ? 'El ISP no registra cobros nuevos sobre el saldo importado' : 'El ISP no registra cobros para la cuota', providerBalance };
}
/** Filas del libro para la cuota, sin las fechadas después de hoy (cuotas futuras o del mes aún sin cerrar). */
function rowsFor(input) {
    const id = Number(input.installmentId);
    return input.ledger.filter((row) => row.detalle_pago?.id_cuota === id && (!row.fecha_emision || row.fecha_emision <= input.today));
}
function evaluateWithoutLedger(input) {
    const pending = input.pending?.filter((row) => row.deuda_id === input.installmentId) ?? [];
    if (pending.length === 1 && pending[0].contrato_id === input.contractId) {
        const debt = Number(pending[0].deuda);
        if (Number.isFinite(debt) && debt > 0) {
            const providerBalance = (0, rules_1.roundMoney)(debt);
            if (debt < input.balance - 0.005)
                return { result: 'partial_payment', reason: `Aún no figura en el libro; el contrato la lista con saldo ${(0, rules_1.usd)(providerBalance)} de ${(0, rules_1.usd)(input.balance)}`, providerBalance };
            return { result: 'still_open', reason: 'Aún no figura en el libro; el contrato la sigue listando como pendiente', providerBalance };
        }
    }
    return { result: 'no_evidence', reason: 'La cuota no aparece en el libro ni como pendiente: sin evidencia, no se marca pagada' };
}
/** La factura de cobro más reciente que tocó la cuota: la que la dejó en cero. */
function lastCollection(rows) {
    const collections = rows
        .filter((row) => typeof row.id_factura === 'number' && row.id_factura > 0)
        .sort((a, b) => (a.fecha_emision ?? '').localeCompare(b.fecha_emision ?? '') || (a.id_factura ?? 0) - (b.id_factura ?? 0));
    const last = collections.at(-1);
    if (!last?.id_factura)
        return null;
    return { id: last.id_factura, number: last.num_factura || String(last.id_factura), issuedAt: (last.fecha_emision ?? '').slice(0, 10) };
}
