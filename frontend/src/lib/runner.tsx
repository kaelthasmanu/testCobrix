import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, errorText } from './api'
import { ConfirmDialog, ProgressBar } from '../components/ui'
import type { RunDetail, RunProgress, RunType } from '../interfaces/api.interfaces'
import { RUN_TYPE_LABELS } from './format'

interface PendingConfirmation { readonly type: RunType }

const CONFIRM_COPY: Record<RunType, { readonly title: string; readonly body: string; readonly action: string }> = {
	import: { title: '¿Importar clientes y facturas?', body: 'Se crearán en Cobrix los clientes y las facturas abiertas de las cuotas pendientes que cumplan las reglas. Lo ya importado no se duplica. Si quieres ver antes qué pasaría, usa «Simular».', action: 'Importar' },
	payments: { title: '¿Actualizar facturas pagadas?', body: 'Las facturas que el ISP cobró por completo se marcarán pagadas. Esto no se deshace desde el panel. Si quieres ver antes qué pasaría, usa «Simular».', action: 'Actualizar pagadas' },
}

/**
 * Ejecuta corridas desde cualquier pantalla: pide confirmación antes de escribir, muestra el progreso
 * en vivo (consultando /sync/current) y al terminar abre el detalle de la corrida.
 */
export function useSyncRunner() {
	const navigate = useNavigate()
	const [progress, setProgress] = useState<RunProgress | null>(null)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [pending, setPending] = useState<PendingConfirmation | null>(null)

	const poll = useCallback(async () => {
		try {
			const { progress: current } = await api<{ progress: RunProgress | null }>('/sync/current')
			setProgress(current)
		} catch {
			// El progreso es informativo: si una consulta falla, la siguiente lo intenta otra vez.
		}
	}, [])

	// Una corrida automática o de otra pestaña también se ve: se consulta al entrar y cada pocos segundos.
	useEffect(() => {
		void poll()
		const id = window.setInterval(() => void poll(), busy ? 400 : 4000)
		return () => window.clearInterval(id)
	}, [poll, busy])

	const execute = useCallback(async (type: RunType, simulation: boolean) => {
		setError('')
		setBusy(true)
		try {
			const run = await api<RunDetail>(`/sync/${type}?simulation=${simulation}`, { method: 'POST' })
			navigate(`/sincronizacion/${run.id}`)
		} catch (cause) {
			setError(errorText(cause, 'No se pudo iniciar la corrida.'))
		} finally {
			setBusy(false)
			setProgress(null)
		}
	}, [navigate])

	const request = useCallback((type: RunType, simulation: boolean) => {
		if (simulation) void execute(type, true)
		else setPending({ type })
	}, [execute])

	const running = busy || progress !== null
	const dialog = (
		<ConfirmDialog
			confirmLabel={pending ? CONFIRM_COPY[pending.type].action : ''}
			onCancel={() => setPending(null)}
			onConfirm={() => {
				const type = pending?.type
				setPending(null)
				if (type) void execute(type, false)
			}}
			open={pending !== null}
			title={pending ? CONFIRM_COPY[pending.type].title : ''}
		>
			{pending ? CONFIRM_COPY[pending.type].body : null}
		</ConfirmDialog>
	)
	const progressView = running ? (
		<div className="rounded-[10px] border border-line bg-surface p-4" aria-live="polite">
			<ProgressBar
				label={progress ? `${RUN_TYPE_LABELS[progress.type]}${progress.simulation ? ' (simulación)' : ''}${progress.trigger === 'automatic' ? ' automática' : ''} · ${progress.stage}` : 'Iniciando corrida…'}
				max={progress?.total ?? 0}
				value={progress?.processed ?? 0}
			/>
		</div>
	) : null

	return { request, running, error, dialog, progressView }
}
