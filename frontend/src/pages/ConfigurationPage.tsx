import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, errorText } from '../lib/api'
import { Card, ErrorNotice, Loading, PageHead } from '../components/ui'
import type { ImportWindow, PanelSettings, ProviderTestResult, ProviderView, SettingsResponse } from '../interfaces/api.interfaces'
import { CONTRACT_STATUSES, DOCUMENT_TYPES, civilDate, timeZoneOptions } from '../lib/format'
import { useCompanyTimeZone } from '../lib/companyTimeZone'
import { useResource } from '../lib/useResource'

type Feedback = { readonly tone: 'ok' | 'bad'; readonly text: string } | null

const COMPANY_FIELDS = ['companyName', 'companyRif', 'billingEmail', 'timeZone'] as const
const RULE_FIELDS = ['importableStatuses', 'importWindow', 'recentInstallmentsLimit', 'graceDays', 'maxNewInvoices', 'maxNewAmount', 'excludedDocumentTypes'] as const
const SCHEDULE_FIELDS = ['automaticRunEnabled', 'automaticRunTime'] as const

function optionalNumber(value: string): number | null {
	return value.trim() === '' ? null : Number(value)
}

/** Las mismas reglas que valida el backend, para avisar antes de enviar. */
export function validateSettings(settings: PanelSettings): string | null {
	if (settings.billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.billingEmail)) return 'El correo de cobranza no es válido.'
	if (settings.companyRif && !/^[VEJGP]-?\d{6,9}-?\d?$/i.test(settings.companyRif)) return 'El RIF debe tener la forma J-12345678-9.'
	if (settings.importableStatuses.length === 0) return 'Selecciona al menos un estado de contrato para importar.'
	if (settings.recentInstallmentsLimit !== null && (!Number.isInteger(settings.recentInstallmentsLimit) || settings.recentInstallmentsLimit < 1 || settings.recentInstallmentsLimit > 60)) return 'El máximo de cuotas recientes debe ser un entero entre 1 y 60, o quedar vacío.'
	if (!Number.isInteger(settings.graceDays) || settings.graceDays < 0 || settings.graceDays > 60) return 'Los días de gracia deben ser un entero entre 0 y 60.'
	if (settings.maxNewInvoices !== null && (!Number.isInteger(settings.maxNewInvoices) || settings.maxNewInvoices < 1)) return 'El tope de facturas nuevas debe ser un entero mayor que cero, o quedar vacío.'
	if (settings.maxNewAmount !== null && (!Number.isFinite(settings.maxNewAmount) || settings.maxNewAmount < 0)) return 'El tope de monto nuevo no puede ser negativo.'
	if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.automaticRunTime)) return 'La hora de la corrida automática no es válida.'
	return null
}

export default function ConfigurationPage() {
	const { data, error, loading, reload } = useResource<SettingsResponse>('/settings')

	useEffect(() => {
		document.title = 'Configuración · Cobrix'
	}, [])

	if (loading && !data) return <Loading label="Cargando configuración…" />
	if (error || !data) return <ErrorNotice message={error || 'Sin datos.'} onRetry={reload} title="No se pudo cargar la configuración" />
	return <ConfigurationForm initial={data} />
}

function ConfigurationForm({ initial }: { readonly initial: SettingsResponse }) {
	const [settings, setSettings] = useState<PanelSettings>(initial)
	const companyTimeZone = useCompanyTimeZone()
	const [feedback, setFeedback] = useState<Record<string, Feedback>>(() => (companyTimeZone.notice ? { company: { tone: 'ok', text: companyTimeZone.notice } } : {}) as Record<string, Feedback>)
	const update = (patch: Partial<PanelSettings>) => setSettings((current) => ({ ...current, ...patch }))
	const toggle = (key: 'importableStatuses' | 'excludedDocumentTypes', value: string) => update({ [key]: settings[key].includes(value) ? settings[key].filter((item) => item !== value) : [...settings[key], value] })

	async function save(section: string, fields: readonly (keyof PanelSettings)[], event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		const invalid = validateSettings(settings)
		if (invalid) return setFeedback({ [section]: { tone: 'bad', text: invalid } })
		try {
			const patch = Object.fromEntries(fields.map((field) => [field, settings[field]]))
			await api('/settings', { method: 'PATCH', body: JSON.stringify(patch) })
			// Al cambiar la zona, todo el panel se vuelve a montar con ella para que ninguna fecha quede en la zona vieja.
			if (section === 'company' && settings.timeZone !== companyTimeZone.timeZone) return companyTimeZone.setTimeZone(settings.timeZone, `Guardado. Las fechas, «hoy» y la corrida automática usan ahora ${settings.timeZone}.`)
			setFeedback({ [section]: { tone: 'ok', text: 'Guardado. Se aplica desde la próxima corrida.' } })
		} catch (cause) {
			setFeedback({ [section]: { tone: 'bad', text: errorText(cause, 'No se pudo guardar.') } })
		}
	}

	return (
		<>
			<PageHead description={<>Datos de la empresa, conexión con el proveedor y reglas de importación. Fecha de negocio: {civilDate(initial.businessDate)} ({initial.timeZone}).</>} title="Configuración" />

			<div className="grid gap-5">
				<Card title="Empresa">
					<form className="grid gap-4 p-4 sm:grid-cols-2 sm:items-start lg:grid-cols-3" onSubmit={(event) => void save('company', COMPANY_FIELDS, event)}>
						<label className="field" htmlFor="company-name">Nombre
							<input id="company-name" maxLength={120} onChange={(event) => update({ companyName: event.target.value })} placeholder="Cobrix, C.A." value={settings.companyName} />
						</label>
						<label className="field" htmlFor="company-rif">RIF
							<input id="company-rif" onChange={(event) => update({ companyRif: event.target.value.toUpperCase() })} placeholder="J-12345678-9" value={settings.companyRif} />
						</label>
						<label className="field" htmlFor="billing-email">Correo de cobranza
							<input id="billing-email" onChange={(event) => update({ billingEmail: event.target.value })} placeholder="cobranza@empresa.com" type="email" value={settings.billingEmail} />
						</label>
						<label className="field" htmlFor="company-time-zone">Zona horaria
							<select id="company-time-zone" onChange={(event) => update({ timeZone: event.target.value })} value={settings.timeZone}>
								{timeZoneOptions(settings.timeZone).map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)}
							</select>
							<small>Define «hoy», la ventana de importación, la hora de la corrida automática y cómo se muestran las fechas. Moneda: USD.</small>
						</label>
						<div className="sm:col-span-2 lg:col-span-3"><FormFooter feedback={feedback.company} label="Guardar empresa" /></div>
					</form>
				</Card>
				<ProviderCard initial={initial.provider} />
			</div>

			<Card detail="Se aplican en cada importación, también en la simulación." title="Reglas de importación">
				<form className="grid gap-5 p-4" onSubmit={(event) => void save('rules', RULE_FIELDS, event)}>
					<fieldset>
						<legend>Estados de contrato que se importan</legend>
						{CONTRACT_STATUSES.map((status) => <label key={status}><input checked={settings.importableStatuses.includes(status)} onChange={() => toggle('importableStatuses', status)} type="checkbox" /> {status}</label>)}
						<small className="basis-full text-muted">Por defecto ACTIVO y CORTADO. Un estado que la API no documenta deja el contrato fuera siempre.</small>
					</fieldset>
					<div className="grid gap-4 sm:grid-cols-3">
						<label className="field" htmlFor="import-window">Ventana de importación
							<select id="import-window" onChange={(event) => update({ importWindow: event.target.value as ImportWindow })} value={settings.importWindow}>
								<option value="none">Sin ventana</option>
								{['3', '6', '9', '12'].map((months) => <option key={months} value={months}>Mes actual menos {months} meses</option>)}
							</select>
							<small>Cuotas más viejas quedan fuera.</small>
						</label>
						<label className="field" htmlFor="recent-installments">Máximo de cuotas recientes por contrato
							<input id="recent-installments" inputMode="numeric" max={60} min={1} onChange={(event) => update({ recentInstallmentsLimit: optionalNumber(event.target.value) })} placeholder="Todas" type="number" value={settings.recentInstallmentsLimit ?? ''} />
							<small>1 a 60. Vacío = todas. Se conservan las más recientes.</small>
						</label>
						<label className="field" htmlFor="grace-days">Días de gracia
							<input id="grace-days" inputMode="numeric" max={60} min={0} onChange={(event) => update({ graceDays: Number(event.target.value) })} type="number" value={settings.graceDays} />
							<small>0 a 60. Corte = vencimiento + días de gracia.</small>
						</label>
					</div>
					<fieldset>
						<legend>Topes por corrida</legend>
						<div className="grid w-full gap-4 sm:grid-cols-2">
							<label className="field" htmlFor="max-new-invoices">Máximo de facturas nuevas
								<input id="max-new-invoices" inputMode="numeric" min={1} onChange={(event) => update({ maxNewInvoices: optionalNumber(event.target.value) })} placeholder="Sin tope" type="number" value={settings.maxNewInvoices ?? ''} />
							</label>
							<label className="field" htmlFor="max-new-amount">Máximo de monto nuevo (USD)
								<input id="max-new-amount" inputMode="decimal" min={0} onChange={(event) => update({ maxNewAmount: optionalNumber(event.target.value) })} placeholder="Sin tope" step="0.01" type="number" value={settings.maxNewAmount ?? ''} />
							</label>
						</div>
						<small className="basis-full text-muted">Lo que exceda queda frenado, no se importa, y se intenta otra vez en la próxima corrida.</small>
					</fieldset>
					<fieldset>
						<legend>Excluir titulares por tipo de documento</legend>
						{DOCUMENT_TYPES.map((type) => <label key={type}><input checked={settings.excludedDocumentTypes.includes(type)} onChange={() => toggle('excludedDocumentTypes', type)} type="checkbox" /> {type}</label>)}
						<small className="basis-full text-muted">J y G son personas jurídicas; V, E y P, naturales.</small>
					</fieldset>
					<FormFooter feedback={feedback.rules} label="Guardar reglas" />
				</form>
			</Card>

			<Card title={<span id="corrida-automatica">Corrida automática</span>}>
				<form className="grid gap-4 p-4 sm:grid-cols-[auto_180px_minmax(0,1fr)] sm:items-end" onSubmit={(event) => void save('schedule', SCHEDULE_FIELDS, event)}>
					<label className="inline-flex items-center gap-2 font-semibold" htmlFor="automatic-run">
						<input checked={settings.automaticRunEnabled} id="automatic-run" onChange={(event) => update({ automaticRunEnabled: event.target.checked })} type="checkbox" />
						Correr todos los días
					</label>
					<label className="field" htmlFor="automatic-run-time">Hora ({settings.timeZone})
						<input disabled={!settings.automaticRunEnabled} id="automatic-run-time" onChange={(event) => update({ automaticRunTime: event.target.value })} type="time" value={settings.automaticRunTime} />
					</label>
					<p className="m-0 text-sm text-muted">El backend importa y después actualiza pagadas. Si estaba apagado a esa hora, se pone al día en las dos horas siguientes.</p>
					<div className="sm:col-span-3"><FormFooter feedback={feedback.schedule} label="Guardar programación" /></div>
				</form>
			</Card>
		</>
	)
}

function ProviderCard({ initial }: { readonly initial: ProviderView }) {
	const [baseUrl, setBaseUrl] = useState(initial.baseUrl)
	const [username, setUsername] = useState(initial.username)
	const [password, setPassword] = useState('')
	const [hasPassword, setHasPassword] = useState(initial.hasPassword)
	const [busy, setBusy] = useState<'test' | 'save' | null>(null)
	const [feedback, setFeedback] = useState<Feedback>(null)

	async function run(action: 'test' | 'save') {
		setBusy(action)
		setFeedback(null)
		const body = JSON.stringify({ baseUrl: baseUrl.trim(), username: username.trim(), ...(password ? { password } : {}) })
		try {
			if (action === 'test') {
				const result = await api<ProviderTestResult>('/settings/provider/test', { method: 'POST', body })
				setFeedback({ tone: 'ok', text: `Conexión correcta como ${result.usuario}: el administrador tiene ${result.contracts} contratos.` })
			} else {
				const saved = await api<ProviderView>('/settings/provider', { method: 'PUT', body })
				setPassword('')
				setHasPassword(saved.hasPassword)
				setFeedback({ tone: 'ok', text: 'Proveedor guardado. Las próximas corridas usarán estos datos.' })
			}
		} catch (cause) {
			setFeedback({ tone: 'bad', text: errorText(cause, 'No se pudo conectar con el administrador.') })
		} finally {
			setBusy(null)
		}
	}

	return (
		<Card detail="El administrador de facturas del ISP" title="Proveedor">
			<form className="grid gap-4 p-4" onSubmit={(event) => { event.preventDefault(); void run('save') }}>
				<div className="grid gap-4 sm:grid-cols-2 sm:items-start lg:grid-cols-3">
					<label className="field sm:col-span-2 lg:col-span-1" htmlFor="provider-url">URL de la API
						<input id="provider-url" onChange={(event) => setBaseUrl(event.target.value)} placeholder="http://127.0.0.1:4310/api/v1" required type="url" value={baseUrl} />
					</label>
					<label className="field" htmlFor="provider-user">Usuario
						<input autoComplete="off" id="provider-user" onChange={(event) => setUsername(event.target.value)} placeholder="cobrix" required value={username} />
					</label>
					<label className="field" htmlFor="provider-password">Contraseña
						<input autoComplete="new-password" id="provider-password" onChange={(event) => setPassword(event.target.value)} placeholder={hasPassword ? '•••••••• (guardada)' : ''} type="password" value={password} />
						<small>{hasPassword ? 'No se muestra. Déjala vacía para conservarla.' : 'Obligatoria la primera vez.'}</small>
					</label>
				</div>
				<div className="grid gap-3">
					<div className="flex flex-wrap gap-2">
						<button className="btn" disabled={busy !== null} onClick={() => void run('test')} type="button">{busy === 'test' ? 'Probando…' : 'Probar conexión'}</button>
						<button className="btn primary" disabled={busy !== null} type="submit">{busy === 'save' ? 'Verificando…' : 'Guardar proveedor'}</button>
					</div>
					{feedback && <FeedbackMessage feedback={feedback} />}
				</div>
			</form>
		</Card>
	)
}

function FormFooter({ feedback, label }: { readonly feedback: Feedback | undefined; readonly label: string }): ReactNode {
	return (
		<div className="grid gap-3">
			<div><button className="btn primary" type="submit">{label}</button></div>
			{feedback && <FeedbackMessage feedback={feedback} />}
		</div>
	)
}

function FeedbackMessage({ feedback }: { readonly feedback: NonNullable<Feedback> }) {
	return <p className={`flash ${feedback.tone} m-0`} role={feedback.tone === 'bad' ? 'alert' : 'status'}>{feedback.text}</p>
}
