import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'
import { authenticatedRequest } from '../auth/api'
import {
	DOCUMENT_TYPES,
	IMPORTABLE_CONTRACT_STATUSES,
	IMPORT_WINDOWS,
	loadSettings,
	saveSettings,
	type DocumentType,
	type ImportWindow,
	type PanelSettings,
	validateSettings,
} from '../config/settings'

const apiUrl = import.meta.env.VITE_API_URL ?? ''

function formatExpiration(expiresAt: number): string {
	return new Intl.DateTimeFormat('es-VE', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'America/Caracas',
	}).format(expiresAt)
}

function optionalNumber(value: string): number | null {
	return value === '' ? null : Number(value)
}

export default function ConfigurationPage() {
	const { session, authenticate, disconnect } = useAuth()
	const [settings, setSettings] = useState<PanelSettings>(loadSettings)
	const [userName, setUserName] = useState('')
	const [password, setPassword] = useState('')
	const [error, setError] = useState('')
	const [success, setSuccess] = useState('')
	const [isSubmitting, setIsSubmitting] = useState(false)

	useEffect(() => {
		document.title = 'Configuración · Prueba de facturación'
	}, [])

	function updateSettings(patch: Partial<PanelSettings>) {
		setSettings((current) => ({ ...current, ...patch }))
	}

	function toggleStatus(status: PanelSettings['importableStatuses'][number]) {
		const selected = settings.importableStatuses.includes(status)
		const next = selected
			? settings.importableStatuses.filter((item) => item !== status)
			: [...settings.importableStatuses, status]
		updateSettings({ importableStatuses: next })
	}

	function toggleDocumentType(documentType: DocumentType) {
		const selected = settings.excludedDocumentTypes.includes(documentType)
		const next = selected
			? settings.excludedDocumentTypes.filter((item) => item !== documentType)
			: [...settings.excludedDocumentTypes, documentType]
		updateSettings({ excludedDocumentTypes: next })
	}

	async function handleSettingsSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setError('')
		setSuccess('')
		const validationError = validateSettings(settings)
		if (validationError) {
			setError(validationError)
			return
		}
		try {
			if (session) await authenticatedRequest('/settings', session.accessToken, { method: 'PATCH', body: JSON.stringify(settings) })
			saveSettings(settings)
			setSuccess('Configuración guardada correctamente.')
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo guardar la configuración.')
		}
	}

	async function handleConnectionSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setError('')
		setSuccess('')
		setIsSubmitting(true)
		try {
			await authenticate({ user_name: userName.trim(), password })
			setPassword('')
			setSuccess('Conexión configurada correctamente.')
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'No se pudo configurar la conexión.')
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<>
			<div className="head">
				<div>
					<h1>Configuración</h1>
					<p>Define la empresa, el proveedor y las reglas de importación.</p>
				</div>
			</div>

			<section className="min-w-0 rounded-[10px] border border-line bg-surface">
				<header className="border-b border-line px-4 py-3.5"><h2>Empresa</h2></header>
				<form className="grid gap-4 p-4 sm:grid-cols-2" onSubmit={handleSettingsSubmit}>
					<label className="field" htmlFor="company-name">Nombre de la empresa
						<input id="company-name" onChange={(event) => updateSettings({ companyName: event.target.value })} placeholder="Tu empresa" value={settings.companyName} />
					</label>
					<label className="field" htmlFor="company-rif">RIF
						<input id="company-rif" onChange={(event) => updateSettings({ companyRif: event.target.value })} placeholder="J-00000000-0" value={settings.companyRif} />
					</label>
					<label className="field sm:col-span-2" htmlFor="billing-email">Correo de cobranza
						<input id="billing-email" onChange={(event) => updateSettings({ billingEmail: event.target.value })} placeholder="cobranza@tuempresa.com" type="email" value={settings.billingEmail} />
					</label>
					<div className="sm:col-span-2"><button className="btn primary" type="submit">Guardar configuración</button></div>
				</form>
			</section>

			<section className="min-w-0 rounded-[10px] border border-line bg-surface">
				<header className="border-b border-line px-4 py-3.5"><h2>Proveedor</h2></header>
				<div className="grid gap-4 p-4">
					<p className="m-0 text-sm text-muted">Las credenciales solo se usan para obtener el token. La contraseña no se guarda en el navegador.</p>
					<label className="field" htmlFor="api-url">URL de la API
						<input className="bg-sunken text-muted" id="api-url" readOnly value={apiUrl} />
					</label>
					<form className="grid max-w-[720px] gap-4 sm:grid-cols-2" onSubmit={handleConnectionSubmit}>
						<label className="field" htmlFor="config-user-name">Usuario
							<input autoComplete="username" id="config-user-name" onChange={(event) => setUserName(event.target.value)} required value={userName} />
						</label>
						<label className="field" htmlFor="config-password">Contraseña
							<input autoComplete="current-password" id="config-password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
						</label>
						<div className="flex items-end gap-2 sm:col-span-2">
							<button className="btn primary" disabled={isSubmitting} type="submit">{isSubmitting ? 'Conectando…' : 'Probar conexión'}</button>
							{session && <button className="btn" onClick={disconnect} type="button">Desconectar</button>}
						</div>
					</form>
					{session && <div className="rounded-lg bg-sunken p-3 text-sm"><strong className="block">Conexión activa</strong><span className="text-muted">{session.usuario} · Token vigente hasta {formatExpiration(session.expiresAt)}</span></div>}
				</div>
			</section>

			<section className="min-w-0 rounded-[10px] border border-line bg-surface">
				<header className="border-b border-line px-4 py-3.5"><h2>Reglas de importación</h2></header>
				<form className="grid gap-5 p-4" onSubmit={handleSettingsSubmit}>
					<fieldset>
						<legend>Estados de contrato que se importan</legend>
						<small className="basis-full text-muted">Por defecto se importan ACTIVO y CORTADO. Marca otros estados solo si deseas incluirlos.</small>
						{IMPORTABLE_CONTRACT_STATUSES.map((status) => (
							<label key={status}><input checked={settings.importableStatuses.includes(status)} onChange={() => toggleStatus(status)} type="checkbox" /> {status}</label>
						))}
					</fieldset>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="field" htmlFor="import-window">Ventana de importación
							<select id="import-window" onChange={(event) => updateSettings({ importWindow: event.target.value as ImportWindow })} value={settings.importWindow}>
								<option value={IMPORT_WINDOWS[0]}>Sin ventana</option>
								<option value="3">Últimos 3 meses</option>
								<option value="6">Últimos 6 meses</option>
								<option value="9">Últimos 9 meses</option>
								<option value="12">Últimos 12 meses</option>
							</select>
							<small>Solo se consideran cuotas desde el mes actual menos la ventana seleccionada.</small>
						</label>
						<label className="field" htmlFor="recent-installments">Máximo de cuotas recientes por contrato
							<input id="recent-installments" max="60" min="1" onChange={(event) => updateSettings({ recentInstallmentsLimit: optionalNumber(event.target.value) })} type="number" value={settings.recentInstallmentsLimit ?? ''} />
							<small>Entre 1 y 60. Vacío significa todas.</small>
						</label>
						<label className="field" htmlFor="grace-days">Días de gracia
							<input id="grace-days" max="60" min="0" onChange={(event) => updateSettings({ graceDays: Number(event.target.value) })} type="number" value={settings.graceDays} />
							<small>Se suman a la fecha de vencimiento para calcular el corte.</small>
						</label>
					</div>
					<fieldset>
						<legend>Topes por corrida</legend>
						<label className="field min-w-[220px]" htmlFor="max-new-invoices">Máximo de facturas nuevas
							<input id="max-new-invoices" min="1" onChange={(event) => updateSettings({ maxNewInvoices: optionalNumber(event.target.value) })} type="number" value={settings.maxNewInvoices ?? ''} />
							<small>Vacío significa sin tope.</small>
						</label>
						<label className="field min-w-[220px]" htmlFor="max-new-amount">Máximo de monto nuevo (USD)
							<input id="max-new-amount" min="0" onChange={(event) => updateSettings({ maxNewAmount: optionalNumber(event.target.value) })} step="0.01" type="number" value={settings.maxNewAmount ?? ''} />
							<small>Lo que exceda queda frenado.</small>
						</label>
					</fieldset>
					<fieldset>
						<legend>Excluir titulares por tipo de documento</legend>
						{DOCUMENT_TYPES.map((documentType) => (
							<label key={documentType}><input checked={settings.excludedDocumentTypes.includes(documentType)} onChange={() => toggleDocumentType(documentType)} type="checkbox" /> {documentType}</label>
						))}
						<small className="basis-full text-muted">J y G corresponden a personas jurídicas; V, E y P a personas naturales.</small>
					</fieldset>
					<div><button className="btn primary" type="submit">Guardar reglas</button></div>
				</form>
			</section>

			<section className="min-w-0 rounded-[10px] border border-line bg-surface">
				<header className="border-b border-line px-4 py-3.5"><h2>Corrida automática</h2></header>
				<form className="grid gap-4 p-4 sm:grid-cols-[auto_180px_1fr] sm:items-end" onSubmit={handleSettingsSubmit}>
					<label className="inline-flex items-center gap-2 font-semibold" htmlFor="automatic-run">
						<input checked={settings.automaticRunEnabled} id="automatic-run" onChange={(event) => updateSettings({ automaticRunEnabled: event.target.checked })} type="checkbox" />
						Activar corrida diaria
					</label>
					<label className="field" htmlFor="automatic-run-time">Hora (America/Caracas)
						<input id="automatic-run-time" onChange={(event) => updateSettings({ automaticRunTime: event.target.value })} type="time" value={settings.automaticRunTime} />
					</label>
					<p className="m-0 text-sm text-muted">Ejecuta Importar y después Actualizar pagadas. Esta preferencia queda guardada para el orquestador de corridas.</p>
					<div><button className="btn primary" type="submit">Guardar programación</button></div>
				</form>
			</section>
			{error && <p className="flash bad" role="alert">{error}</p>}
			{success && <p className="flash ok" role="status">{success}</p>}
		</>
	)
}
