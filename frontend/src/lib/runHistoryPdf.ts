import type { RunSummary, RunType } from '../interfaces/api.interfaces'
import { dateTime, RUN_TYPE_LABELS } from './format.ts'

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 48
const LINE_HEIGHT = 14
const MAX_LINES_PER_PAGE = 47

function pdfText(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
		.replace(/[\\()]/g, '\\$&')
}

function wrap(value: string, maxLength = 92): string[] {
	const words = value.split(/\s+/).filter(Boolean)
	const lines: string[] = []
	let line = ''
	for (const word of words) {
		if (!line) {
			line = word
		} else if (line.length + word.length + 1 <= maxLength) {
			line += ` ${word}`
		} else {
			lines.push(line)
			line = word
		}
	}
	if (line) lines.push(line)
	return lines.length > 0 ? lines : ['']
}

function statusLabel(run: RunSummary): string {
	return run.status === 'completed' ? 'Completada' : run.status === 'failed' ? 'Falló' : 'En curso'
}

function linesForRun(run: RunSummary): string[] {
	const mode = run.simulation ? 'Simulación' : 'Real'
	const trigger = run.trigger === 'automatic' ? 'automática' : 'manual'
	const lines = [
		`${RUN_TYPE_LABELS[run.type]} · ${dateTime(run.startedAt)} · ${mode} · ${trigger} · ${statusLabel(run)}`,
		...wrap(`Resumen: ${run.summary}`),
	]
	if (run.error) lines.push(...wrap(`Error: ${run.error}`))
	return lines
}

function splitPages(lines: readonly string[]): string[][] {
	const pages: string[][] = []
	for (let index = 0; index < lines.length; index += MAX_LINES_PER_PAGE) pages.push(lines.slice(index, index + MAX_LINES_PER_PAGE))
	return pages.length > 0 ? pages : [['No hay corridas para exportar.']]
}

function contentStream(lines: readonly string[], pageNumber: number, pageCount: number): string {
	const header = ['Historial de corridas · Cobrix', `Página ${pageNumber} de ${pageCount}`, '']
	const text = [...header, ...lines].map(pdfText)
	const commands = [
		'BT',
		'/F1 10 Tf',
		`${MARGIN} ${PAGE_HEIGHT - MARGIN} Td`,
		`${LINE_HEIGHT} TL`,
		...text.flatMap((line, index) => index === 0 ? [`(${line}) Tj`] : ['T*', `(${line}) Tj`]),
		'ET',
	]
	return commands.join('\n')
}

function encodePdf(value: string): Uint8Array {
	const bytes = new Uint8Array(value.length)
	for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff
	return bytes
}

/** Construye un PDF autocontenido, compatible con lectores estándar y sin servicios externos. */
export function createRunHistoryPdf(runs: readonly RunSummary[], filter: RunType | 'all'): Uint8Array {
	const filterLabel = filter === 'all' ? 'Todas las corridas' : RUN_TYPE_LABELS[filter]
	const lines = [
		`Filtro aplicado: ${filterLabel}`,
		`Generado: ${dateTime(new Date().toISOString())}`,
		`Total de corridas: ${runs.length.toLocaleString('es-VE')}`,
		'',
		...runs.flatMap(linesForRun),
	]
	const pages = splitPages(lines)
	const fontObject = 3 + pages.length * 2
	const objects = new Map<number, string>()
	objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>')
	objects.set(2, `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`)
	pages.forEach((page, index) => {
		const pageObject = 3 + index * 2
		const contentObject = pageObject + 1
		const content = contentStream(page, index + 1, pages.length)
		objects.set(pageObject, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`)
		objects.set(contentObject, `<< /Length ${encodePdf(content).length} >>\nstream\n${content}\nendstream`)
	})
	objects.set(fontObject, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')

	let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
	const offsets = [0]
	for (let objectNumber = 1; objectNumber <= fontObject; objectNumber += 1) {
		offsets[objectNumber] = encodePdf(pdf).length
		pdf += `${objectNumber} 0 obj\n${objects.get(objectNumber)}\nendobj\n`
	}
	const xrefOffset = encodePdf(pdf).length
	pdf += `xref\n0 ${fontObject + 1}\n0000000000 65535 f \n`
	for (let objectNumber = 1; objectNumber <= fontObject; objectNumber += 1) pdf += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`
	pdf += `trailer\n<< /Size ${fontObject + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
	return encodePdf(pdf)
}

export function downloadRunHistoryPdf(runs: readonly RunSummary[], filter: RunType | 'all'): void {
	const pdf = createRunHistoryPdf(runs, filter)
	const data = new Uint8Array(pdf.byteLength)
	data.set(pdf)
	const file = new Blob([data.buffer], { type: 'application/pdf' })
	const url = URL.createObjectURL(file)
	const link = document.createElement('a')
	link.href = url
	link.download = 'historial-de-corridas.pdf'
	link.click()
	URL.revokeObjectURL(url)
}
