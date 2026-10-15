import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createRunHistoryPdf } from '../src/lib/runHistoryPdf.ts'
import type { RunSummary } from '../src/interfaces/api.interfaces.ts'

const run: RunSummary = {
	id: 'run-1',
	type: 'import',
	simulation: false,
	trigger: 'manual',
	status: 'completed',
	startedAt: '2026-10-14T02:00:00.000Z',
	finishedAt: '2026-10-14T02:01:00.000Z',
	summary: 'Se importaron 42 facturas.',
	counters: {},
	error: null,
}

describe('PDF del historial de corridas', () => {
	it('genera un PDF válido con el filtro y las corridas solicitadas', () => {
		const pdf = new TextDecoder('latin1').decode(createRunHistoryPdf([run], 'import'))

		assert.match(pdf, /^%PDF-1\.4/)
		assert.match(pdf, /Filtro aplicado: Importacion/)
		assert.match(pdf, /Se importaron 42 facturas\./)
		assert.match(pdf, /%%EOF/)
	})
})
