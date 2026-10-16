import { Controller, Get, Inject } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { DatabaseService } from '../database/database.service'
import { ProviderClient } from '../provider/provider.client'
import { SettingsService } from '../settings/settings.service'
import { SyncService } from '../sync/sync.service'
import { addDays, roundMoney, usd, zonedParts, zonedTimeToUtc } from '../common/rules'
import { cobrixInvoiceNumber } from '../clients/clients.service'

type Severity = 'bad' | 'warn' | 'info'
interface Alert { readonly id: string; readonly severity: Severity; readonly title: string; readonly detail: string; readonly link?: string; readonly items?: readonly string[] }

const AGING_BUCKETS = [
	{ key: 'current', label: 'Del mes / por vencer', max: 0 },
	{ key: 'd30', label: '1 a 30 días', max: 30 },
	{ key: 'd60', label: '31 a 60 días', max: 60 },
	{ key: 'd90', label: '61 a 90 días', max: 90 },
	{ key: 'd90plus', label: 'Más de 90 días', max: Number.POSITIVE_INFINITY },
] as const

@Controller('summary')
@ApiTags('Resumen')
export class SummaryController {
	constructor(
		@Inject(DatabaseService) private readonly database: DatabaseService,
		@Inject(ProviderClient) private readonly provider: ProviderClient,
		@Inject(SettingsService) private readonly settings: SettingsService,
		@Inject(SyncService) private readonly sync: SyncService,
	) {}

	@Get()
	@ApiOperation({ summary: 'Totales, proveedor, corrida automática, últimas corridas, antigüedad de la deuda y alertas' })
	async get() {
		const today = await this.settings.today()
		const [clients, contracts, invoices, recentRuns, settings, provider, lastAutomatic] = await Promise.all([
			this.database.client.count(),
			this.database.contract.count({ where: { invoices: { some: {} } } }),
			this.database.invoice.findMany({ select: { id: true, status: true, balance: true, providerBalance: true, dueDate: true, cutoffDate: true, customerName: true, customerDocument: true, externalId: true } }),
			this.sync.listRuns({ take: 6 }).then((result) => result.runs),
			this.settings.get(),
			this.provider.getSettingsView(),
			this.database.syncRun.findFirst({ where: { trigger: 'automatic' }, orderBy: { startedAt: 'desc' } }),
		])
		const open = invoices.filter((invoice) => invoice.status === 'open')
		const metrics = { clients, contracts, openInvoices: open.length, paidInvoices: invoices.length - open.length, receivable: roundMoney(open.reduce((sum, invoice) => sum + invoice.balance, 0)) }

		const aging = AGING_BUCKETS.map((bucket) => ({ key: bucket.key, label: bucket.label, count: 0, amount: 0 }))
		for (const invoice of open) {
			const days = daysBetween(invoice.dueDate, today)
			const index = AGING_BUCKETS.findIndex((bucket) => days <= bucket.max)
			aging[index].count += 1
			aging[index].amount = roundMoney(aging[index].amount + invoice.balance)
		}

		return {
			today,
			metrics,
			aging,
			provider: { ...provider, configured: Boolean(provider.username && provider.hasPassword) },
			automaticRun: {
				enabled: settings.automaticRunEnabled,
				time: settings.automaticRunTime,
				timeZone: settings.timeZone,
				nextRunAt: settings.automaticRunEnabled ? nextRun(settings.automaticRunTime, settings.timeZone) : null,
				last: lastAutomatic ? { id: lastAutomatic.id, type: lastAutomatic.type, status: lastAutomatic.status, startedAt: lastAutomatic.startedAt, summary: lastAutomatic.summary } : null,
			},
			recentRuns,
			alerts: await this.alerts(today, open, provider.username !== '', recentRuns),
		}
	}

	/** Lo que el operador debería mirar hoy, ordenado por gravedad. */
	private async alerts(today: string, open: ReadonlyArray<{ id: number; balance: number; providerBalance: number | null; cutoffDate: string; customerName: string; customerDocument: string; externalId: string }>, providerConfigured: boolean, recentRuns: Awaited<ReturnType<SyncService['listRuns']>>['runs']): Promise<Alert[]> {
		const alerts: Alert[] = []
		if (!providerConfigured) alerts.push({ id: 'provider', severity: 'bad', title: 'Proveedor sin configurar', detail: 'Guarda la URL y las credenciales del administrador para poder sincronizar.', link: '/configuracion' })

		const lastRun = recentRuns[0]
		if (lastRun?.status === 'failed') alerts.push({ id: `failed-${lastRun.id}`, severity: 'bad', title: 'La última corrida falló', detail: lastRun.error ?? lastRun.summary, link: `/sincronizacion/${lastRun.id}` })

		const pastCutoff = open.filter((invoice) => invoice.cutoffDate < today)
		if (pastCutoff.length > 0) {
			const amount = roundMoney(pastCutoff.reduce((sum, invoice) => sum + invoice.balance, 0))
			const holders = new Set(pastCutoff.map((invoice) => invoice.customerDocument)).size
			alerts.push({ id: 'past-cutoff', severity: 'warn', title: `${pastCutoff.length} facturas pasaron la fecha de corte`, detail: `${usd(amount)} de ${holders} cliente(s): candidatas a gestión de cobro o corte de servicio.`, link: '/clientes' })
		}

		const partial = open.filter((invoice) => invoice.providerBalance !== null && invoice.providerBalance > 0 && invoice.providerBalance < invoice.balance - 0.005)
		if (partial.length > 0) {
			alerts.push({ id: 'partial', severity: 'info', title: `${partial.length} abono(s) parcial(es) en el ISP`, detail: 'El cliente pagó una parte; la factura sigue abierta por el saldo importado.', link: '/clientes', items: partial.slice(0, 5).map((invoice) => `${invoice.customerName} · ${cobrixInvoiceNumber(invoice.id)} (cuota ${invoice.externalId}): queda ${usd(invoice.providerBalance ?? 0)} de ${usd(invoice.balance)}`) })
		}

		const lastImport = recentRuns.find((run) => run.type === 'import' && run.status === 'completed')
		if (lastImport) {
			const detail = await this.database.syncRunItem.findMany({ where: { runId: lastImport.id, result: { in: ['contradictory_response', 'unknown_status', 'invalid_customer', 'provider_error'] } } })
			const contracts = [...new Map(detail.map((item) => [item.contractId, item])).values()]
			if (contracts.length > 0) {
				alerts.push({ id: `review-${lastImport.id}`, severity: 'warn', title: `${contracts.length} contrato(s) quedaron fuera por respuestas dudosas`, detail: 'Cobrix no adivina: revisa estos contratos con el ISP.', link: `/sincronizacion/${lastImport.id}`, items: contracts.slice(0, 5).map((item) => `Contrato ${item.contractId ?? '—'} · ${item.customerName ?? item.customerDocument ?? ''}: ${item.reason}`) })
			}
		}

		const lastPayments = recentRuns.find((run) => run.type === 'payments' && run.status === 'completed')
		const doubtful = (lastPayments?.counters.no_evidence ?? 0) + (lastPayments?.counters.inconsistent_ledger ?? 0) + (lastPayments?.counters.provider_error ?? 0)
		if (lastPayments && doubtful > 0) {
			alerts.push({ id: `evidence-${lastPayments.id}`, severity: 'warn', title: `${doubtful} factura(s) sin evidencia clara de pago`, detail: 'No aparecen en el libro del ISP o sus filas no coinciden. Siguen abiertas.', link: `/sincronizacion/${lastPayments.id}` })
		}
		return alerts
	}
}

function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Próxima ejecución de la corrida automática, como instante UTC, según la zona de la empresa. */
function nextRun(time: string, timeZone: string): string {
	const now = zonedParts(timeZone)
	const day = now.time < time ? now.date : addDays(now.date, 1)
	return zonedTimeToUtc(day, time, timeZone).toISOString()
}
