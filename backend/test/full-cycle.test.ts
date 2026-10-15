/**
 * Ciclo completo de los criterios de aceptación (sección 5 del enunciado), de punta a punta y por HTTP:
 * levanta la API del administrador entregada (base nueva, fecha 2026-10-13) y el backend compilado
 * con una base SQLite temporal; importa, paga y anula en la caja del ISP y actualiza pagadas.
 *
 * Requiere `npm run build` (lo hace `npm test`) y la carpeta `../api` del repositorio.
 */
import assert from 'node:assert/strict'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'

const BACKEND = resolve(__dirname, '..')
const API = resolve(BACKEND, '..', 'api')

let dir: string
let apiProcess: ChildProcess
let backendProcess: ChildProcess
let apiBase: string
let backendBase: string

describe('ciclo completo: importar → pagar en la caja → actualizar pagadas', () => {
	before(async () => {
		dir = mkdtempSync(join(tmpdir(), 'cobrix-ciclo-'))
		const [apiPort, panelPort, backendPort] = await Promise.all([freePort(), freePort(), freePort()])
		apiBase = `http://127.0.0.1:${apiPort}`
		backendBase = `http://127.0.0.1:${backendPort}`

		apiProcess = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/main.ts'], {
			cwd: API,
			env: { ...process.env, SANDBOX_TODAY: '2026-10-13', BILLING_API_DB: join(dir, 'billing-api.sqlite'), BILLING_API_PORT: String(apiPort), PORT: String(panelPort) },
			stdio: 'ignore',
		})
		await waitFor(`${apiBase}/__sim/salud`)

		const env = { ...process.env, DATABASE_URL: `file:${join(dir, 'cobrix.sqlite')}`, PORT: String(backendPort), HOST: '127.0.0.1', ADMIN_API_URL: `${apiBase}/api/v1`, BUSINESS_DATE: '2026-10-13', ENCRYPTION_KEY: 'test-encryption-key' }
		execFileSync(join(BACKEND, 'node_modules', '.bin', 'prisma'), ['migrate', 'deploy', '--schema', 'prisma/schema.prisma'], { cwd: BACKEND, env, stdio: 'ignore' })
		backendProcess = spawn(process.execPath, ['dist/main.js'], { cwd: BACKEND, env, stdio: 'ignore' })
		await waitFor(`${backendBase}/health`)
	})

	after(() => {
		backendProcess?.kill()
		apiProcess?.kill()
		rmSync(dir, { recursive: true, force: true })
	})

	it('sin proveedor configurado, la corrida queda registrada como fallida y con el error', async () => {
		const run = await call<Run>('POST', '/sync/import')
		assert.equal(run.status, 'failed')
		assert.match(run.error ?? '', /Configura las credenciales del administrador/)
	})

	it('guarda el proveedor solo si sus credenciales inician sesión, y nunca devuelve la contraseña', async () => {
		const bad = await fetch(`${backendBase}/settings/provider`, { method: 'PUT', headers: headers(), body: JSON.stringify({ baseUrl: `${apiBase}/api/v1`, username: 'cobrix', password: 'mala' }) })
		assert.equal(bad.status, 422)
		assert.match((await bad.json() as { message: string }).message, /Contraseña Incorrecta/)
		const saved = await call<Record<string, unknown>>('PUT', '/settings/provider', { baseUrl: `${apiBase}/api/v1`, username: 'cobrix', password: 'cobrix-sandbox' })
		assert.deepEqual(saved, { baseUrl: `${apiBase}/api/v1`, username: 'cobrix', hasPassword: true })
		const settings = await call<Record<string, unknown>>('GET', '/settings')
		assert.ok(!JSON.stringify(settings).includes('cobrix-sandbox'))
	})

	it('la zona horaria de la empresa se valida, se guarda y la usa la corrida automática', async () => {
		const invalid = await fetch(`${backendBase}/settings`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ timeZone: 'America/Atlantis' }) })
		assert.equal(invalid.status, 400)
		assert.match(JSON.stringify(await invalid.json()), /zona horaria no es válida/)

		await call('PATCH', '/settings', { timeZone: 'Europe/Madrid', automaticRunEnabled: true, automaticRunTime: '06:00' })
		const stored = await call<{ timeZone: string; importableStatuses: string[]; graceDays: number }>('GET', '/settings')
		assert.equal(stored.timeZone, 'Europe/Madrid')
		assert.deepEqual(stored.importableStatuses, ['ACTIVO', 'CORTADO'], 'un guardado parcial no borra el resto de la configuración')
		assert.equal(stored.graceDays, 0)
		const { automaticRun } = await call<{ automaticRun: { timeZone: string; nextRunAt: string } }>('GET', '/summary')
		assert.equal(automaticRun.timeZone, 'Europe/Madrid')
		const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(automaticRun.nextRunAt))
		assert.equal(local, '06:00', 'la próxima corrida es a las 06:00 de Madrid')

		await call('PATCH', '/settings', { timeZone: 'America/Caracas', automaticRunEnabled: false })
	})

	it('probar conexión inicia sesión y dice cuántos contratos hay', async () => {
		const result = await call<{ contracts: number; usuario: string }>('POST', '/settings/provider/test', {})
		assert.equal(result.usuario, 'cobrix')
		assert.equal(result.contracts, 27)
	})

	it('simular importación: 42 cuotas se importarían y no se crea nada', async () => {
		const run = await call<Run>('POST', '/sync/import?simulation=true')
		assert.equal(run.status, 'completed')
		assert.equal(run.simulation, true)
		assert.equal(run.counters.newInvoices, 42)
		assert.equal(run.counters.newAmount, 1235)
		const summary = await call<Summary>('GET', '/summary')
		assert.equal(summary.metrics.clients, 0)
		assert.equal(summary.metrics.openInvoices, 0)
	})

	it('importar: 20 clientes y 42 facturas abiertas por USD 1.235,00, con las exclusiones esperadas', async () => {
		const run = await call<Run>('POST', '/sync/import')
		assert.equal(run.status, 'completed')
		assert.equal(run.counters.newInvoices, 42)
		assert.equal(run.counters.excluded_status, 9, '9 cuotas excluidas por estado del contrato')
		assert.equal(run.counters.contractsIncoherentCurrency, 1, '1 contrato por moneda incoherente')
		assert.equal(run.counters.zero_balance, 1, '1 saldo residual')
		assert.equal(run.resultCounts.imported, 42)

		const summary = await call<Summary>('GET', '/summary')
		assert.deepEqual(summary.metrics, { clients: 20, contracts: 21, openInvoices: 42, paidInvoices: 0, receivable: 1235 })
	})

	it('importar otra vez: 0 facturas nuevas', async () => {
		const run = await call<Run>('POST', '/sync/import')
		assert.equal(run.counters.newInvoices, 0)
		assert.equal(run.counters.already_imported, 42)
		assert.equal((await call<Summary>('GET', '/summary')).metrics.openInvoices, 42)
	})

	it('agrupa por titular y normaliza la identificación', async () => {
		const clients = (await call<Page<ClientRow>>('GET', '/clients?pageSize=100')).items
		const names = clients.map((client) => client.name)
		assert.equal(clients.find((client) => client.name === 'LUIS GOMEZ')?.contracts, 2)
		assert.equal(clients.find((client) => client.name === 'ELENA RUIZ')?.document, '9000123')
		assert.equal(clients.find((client) => client.name === 'COMERCIAL EL FARO, C.A.')?.personType, 'juridica')
		for (const excluded of ['CARLOS ROJAS', 'ROSA DIAZ', 'PEDRO LEON', 'ANDRES VARGAS', 'LAURA MENDEZ', 'JORGE CASTILLO']) assert.ok(!names.includes(excluded), excluded)
		const search = await call<Page<ClientRow>>('GET', '/clients?search=V-12345678')
		assert.deepEqual(search.items.map((client) => client.name), ['ANA PEREZ'])
	})

	it('pagos en la caja del ISP y actualización de pagadas: 8 pagadas y 34 abiertas por USD 955,00', async () => {
		await sim('/__sim/pagar', { id_contrato: 900101 })
		await sim('/__sim/pagar', { id_contrato: 900103, monto: 25 })
		await sim('/__sim/pagar', { id_contrato: 900104 })
		await sim('/__sim/pagar', { id_contrato: 900114, monto: 70 })
		const elena = await sim<{ id_factura: number }>('/__sim/pagar', { id_contrato: 900113 })
		await sim('/__sim/anular', { id_factura: elena.id_factura })

		const simulated = await call<Run>('POST', '/sync/payments?simulation=true')
		assert.equal(simulated.counters.paidInvoices, 8)
		assert.equal((await call<Summary>('GET', '/summary')).metrics.paidInvoices, 0, 'la simulación no escribe')

		const run = await call<Run>('POST', '/sync/payments')
		assert.equal(run.status, 'completed')
		assert.equal(run.counters.paidInvoices, 8)
		assert.equal(run.counters.partial_payment, 1)
		assert.equal(run.counters.no_evidence ?? 0, 0)
		const summary = await call<Summary>('GET', '/summary')
		assert.equal(summary.metrics.paidInvoices, 8)
		assert.equal(summary.metrics.openInvoices, 34)
		assert.equal(summary.metrics.receivable, 955)
	})

	it('cada caso de la caja termina como dice el enunciado', async () => {
		const record = async (document: string): Promise<RecordResponse> => ({
			invoices: (await call<Page<RecordResponse['invoices'][number]>>('GET', `/clients/${document}/invoices?pageSize=100`)).items,
			events: (await call<Page<RecordResponse['events'][number]>>('GET', `/clients/${document}/events?pageSize=100`)).items,
		})
		const ana = await record('V12345678')
		assert.deepEqual(ana.invoices.map((invoice) => invoice.status), ['paid', 'paid', 'paid'])
		assert.ok(ana.invoices.every((invoice) => invoice.paidAt === '2026-10-13' && invoice.paidByProviderInvoiceNumber))
		assert.ok(ana.events.some((event) => event.type === 'invoice_paid' && event.reference === ana.invoices[0].paidByProviderInvoiceNumber))
		assert.ok(ana.events.some((event) => event.type === 'client_created'))

		const luis = await record('V9876543')
		const cut = luis.invoices.filter((invoice) => invoice.contractId === 900103).sort((a, b) => a.period.localeCompare(b.period))
		assert.deepEqual(cut.map((invoice) => invoice.status), ['paid', 'open', 'open', 'open'])
		assert.equal(cut[1].providerBalance, 15, 'el abono parcial queda informado')
		assert.equal(cut[1].balance, 20, 'y la factura sigue abierta por su saldo')

		assert.deepEqual((await record('J401234567')).invoices.map((invoice) => invoice.status), ['paid', 'paid'])
		const miguel = (await record('V23999000')).invoices.sort((a, b) => a.period.localeCompare(b.period))
		assert.deepEqual(miguel.map((invoice) => invoice.status), ['paid', 'paid', 'open', 'open', 'open', 'open', 'open', 'open'])
		assert.deepEqual((await record('9000123')).invoices.map((invoice) => invoice.status), ['open', 'open'])
	})

	it('repetir la actualización no cambia nada', async () => {
		const run = await call<Run>('POST', '/sync/payments')
		assert.equal(run.counters.paidInvoices, 0)
		assert.deepEqual((await call<Summary>('GET', '/summary')).metrics, { clients: 20, contracts: 21, openInvoices: 34, paidInvoices: 8, receivable: 955 })
	})

	it('el historial guarda cada corrida con una fila por cuota', async () => {
		const runs = (await call<Page<Run>>('GET', '/sync/runs')).items
		assert.deepEqual(runs.map((run) => `${run.type}:${run.simulation}:${run.status}`).reverse(), ['import:false:failed', 'import:true:completed', 'import:false:completed', 'import:false:completed', 'payments:true:completed', 'payments:false:completed', 'payments:false:completed'])
		const detail = await call<Page<{ result: string }>>('GET', `/sync/runs/${runs[0].id}/items?pageSize=100`)
		assert.equal(detail.total, 34, 'una fila por factura abierta evaluada')
	})

	it('pagina en el servidor clientes, historial y filas de corrida, con filtros y orden', async () => {
		const second = await call<Page<ClientRow>>('GET', '/clients?pageSize=5&page=2')
		assert.deepEqual([second.total, second.page, second.pageSize, second.pageCount, second.items.length], [20, 2, 5, 4, 5])
		const all = (await call<Page<ClientRow>>('GET', '/clients?pageSize=100')).items.map((client) => client.name)
		assert.deepEqual(second.items.map((client) => client.name), all.slice(5, 10), 'la página 2 continúa el orden por nombre')

		const byDebt = (await call<Page<ClientRow & { debt: number }>>('GET', '/clients?sort=debt&order=desc&pageSize=100')).items
		assert.deepEqual(byDebt.map((client) => client.debt), [...byDebt.map((client) => client.debt)].sort((a, b) => b - a))
		assert.deepEqual((await call<Page<ClientRow>>('GET', '/clients?type=juridica')).items.map((client) => client.name), ['COMERCIAL EL FARO, C.A.'])
		assert.deepEqual((await call<Page<ClientRow>>('GET', '/clients?debt=without')).items.map((client) => client.name), ['ANA PEREZ', 'COMERCIAL EL FARO, C.A.'])

		const tooBig = await fetch(`${backendBase}/clients?pageSize=500`)
		assert.equal(tooBig.status, 400, 'nunca más de 100 filas por página')

		const runs = await call<Page<Run>>('GET', '/sync/runs?pageSize=2')
		assert.deepEqual([runs.items.length, runs.total], [2, 7])
		const payments = (await call<Page<Run>>('GET', '/sync/runs?type=payments&pageSize=100')).items
		const firstPayments = payments[payments.length - 1]
		const header = await call<Run>('GET', `/sync/runs/${firstPayments.id}`)
		assert.equal(header.resultCounts.paid, 8)
		const partial = await call<Page<{ customerName: string }>>('GET', `/sync/runs/${firstPayments.id}/items?result=partial_payment`)
		assert.deepEqual(partial.items.map((item) => item.customerName), ['LUIS GOMEZ'])
		const ana = await call<Page<{ result: string }>>('GET', `/sync/runs/${firstPayments.id}/items?search=V-12345678`)
		assert.deepEqual(ana.items.map((item) => item.result), ['paid', 'paid', 'paid'])
	})

	it('si el administrador no responde, la corrida queda fallida con un error claro', async () => {
		apiProcess.kill()
		await new Promise((done) => apiProcess.once('exit', done))
		const run = await call<Run>('POST', '/sync/import')
		assert.equal(run.status, 'failed')
		assert.match(run.error ?? '', /no está disponible/)
	})
})

interface Run { id: string; type: string; simulation: boolean; status: string; error?: string; counters: Record<string, number>; resultCounts: Record<string, number> }
interface Page<T> { items: T[]; total: number; page: number; pageSize: number; pageCount: number }
interface Summary { metrics: { clients: number; contracts: number; openInvoices: number; paidInvoices: number; receivable: number } }
interface ClientRow { name: string; document: string; contracts: number; personType: string }
interface RecordResponse { invoices: Array<{ status: string; period: string; contractId: number; balance: number; providerBalance: number | null; paidAt: string | null; paidByProviderInvoiceNumber: string | null }>; events: Array<{ type: string; reference: string | null }> }

function headers(): Record<string, string> {
	return { 'content-type': 'application/json' }
}

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
	const response = await fetch(`${backendBase}${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) })
	const payload = await response.json() as T
	if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${JSON.stringify(payload)}`)
	return payload
}

async function sim<T = unknown>(path: string, body: unknown): Promise<T> {
	const response = await fetch(`${apiBase}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
	assert.ok(response.ok, `${path} ${JSON.stringify(body)} → ${response.status}`)
	return response.json() as Promise<T>
}

function freePort(): Promise<number> {
	return new Promise((done, fail) => {
		const server = createServer()
		server.unref()
		server.on('error', fail)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			server.close(() => done(typeof address === 'object' && address ? address.port : 0))
		})
	})
}

async function waitFor(url: string, timeoutMs = 20_000): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		try {
			if ((await fetch(url)).ok) return
		} catch {
			// todavía arrancando
		}
		await new Promise((done) => setTimeout(done, 200))
	}
	throw new Error(`${url} no respondió a tiempo`)
}
