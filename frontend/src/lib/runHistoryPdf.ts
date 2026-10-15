import type { RunSummary, RunType } from '../interfaces/api.interfaces'
import { dateTime, RUN_TYPE_LABELS } from './format.ts'

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN = 48
const TABLE_TOP = 650
const TABLE_BOTTOM = 54
const TABLE_HEADER_HEIGHT = 26
const ROW_HEIGHT = 42
const TABLE_WIDTH = PAGE_WIDTH - MARGIN * 2
const COLUMN_WIDTHS = [72, 96, 72, 70, 68, TABLE_WIDTH - 72 - 96 - 72 - 70 - 68]
const CELL_PADDING = 5

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

function runRow(run: RunSummary): string[] {
	const mode = run.simulation ? 'Simulación' : 'Real'
	const trigger = run.trigger === 'automatic' ? 'automática' : 'manual'
	const summary = run.error ? `${run.summary} Error: ${run.error}` : run.summary
	return [RUN_TYPE_LABELS[run.type], dateTime(run.startedAt), mode, trigger, statusLabel(run), summary]
}

function tableRowHeight(row: readonly string[]): number {
	const summaryLines = wrap(row[5], 34).slice(0, 3)
	return Math.max(ROW_HEIGHT, summaryLines.length * 11 + CELL_PADDING * 2)
}

function splitPages(rows: readonly string[][]): string[][][] {
	const pages: string[][][] = []
	let page: string[][] = []
	let height = TABLE_TOP - TABLE_BOTTOM - TABLE_HEADER_HEIGHT
	for (const row of rows) {
		const rowHeight = tableRowHeight(row)
		if (page.length > 0 && height + rowHeight > TABLE_TOP - TABLE_BOTTOM - TABLE_HEADER_HEIGHT) {
			pages.push(page)
			page = []
			height = TABLE_TOP - TABLE_BOTTOM - TABLE_HEADER_HEIGHT
		}
		page.push(row)
		height -= rowHeight
	}
	if (page.length > 0) pages.push(page)
	return pages.length > 0 ? pages : [[]]
}

function textCommand(value: string, x: number, y: number, font = '/F1', size = 9): string {
	return `BT\n${font} ${size} Tf\n${x} ${y} Td\n(${pdfText(value)}) Tj\nET`
}

function contentStream(rows: readonly string[][], pageNumber: number, pageCount: number, totalCount: number, filterLabel: string, generatedAt: string): string {
	const commands = [
		'0.12 0.16 0.22 rg',
		textCommand('Historial de corridas', MARGIN, 736, '/F2', 20),
		'0.35 0.39 0.46 rg',
		textCommand('Cobrix · Exportación de ejecuciones', MARGIN, 716, '/F1', 10),
		textCommand(`Página ${pageNumber} de ${pageCount}`, PAGE_WIDTH - MARGIN - 65, 736, '/F1', 9),
		'0.94 0.96 0.98 rg',
		`${MARGIN} 674 ${TABLE_WIDTH} 28 re f`,
		'0.35 0.39 0.46 rg',
		textCommand(`Filtro aplicado: ${filterLabel}`, MARGIN + 8, 685, '/F1', 9),
		textCommand(`Generado: ${generatedAt}`, MARGIN + 185, 685, '/F1', 9),
		textCommand(`Total: ${totalCount} ${totalCount === 1 ? 'corrida' : 'corridas'}`, MARGIN + 420, 685, '/F1', 9),
		'0.12 0.16 0.22 rg',
	]

	const headers = ['Tipo', 'Inicio', 'Modo', 'Disparador', 'Estado', 'Resumen']
	let x = MARGIN
	for (let index = 0; index < headers.length; index += 1) {
		commands.push(textCommand(headers[index], x + CELL_PADDING, TABLE_TOP - 17, '/F2', 8))
		x += COLUMN_WIDTHS[index]
	}
	commands.push(`0.12 0.16 0.22 RG`, `${MARGIN} ${TABLE_TOP - TABLE_HEADER_HEIGHT} ${TABLE_WIDTH} ${TABLE_HEADER_HEIGHT} re S`)

	let y = TABLE_TOP - TABLE_HEADER_HEIGHT
	rows.forEach((row, rowIndex) => {
		const height = tableRowHeight(row)
		y -= height
		if (rowIndex % 2 === 0) {
			commands.push('0.97 0.98 0.99 rg', `${MARGIN} ${y} ${TABLE_WIDTH} ${height} re f`)
		}
		commands.push('0.82 0.84 0.88 RG', `${MARGIN} ${y} ${TABLE_WIDTH} ${height} re S`)
		commands.push('0.12 0.16 0.22 rg')
		let cellX = MARGIN
		row.forEach((value, columnIndex) => {
			const maxLength = columnIndex === 5 ? 34 : columnIndex === 1 ? 17 : 14
			const lines = wrap(value, maxLength).slice(0, 3)
			lines.forEach((line, lineIndex) => {
				commands.push(textCommand(line, cellX + CELL_PADDING, y + height - CELL_PADDING - 9 - lineIndex * 11, '/F1', 8))
			})
			cellX += COLUMN_WIDTHS[columnIndex]
			if (columnIndex < row.length - 1) commands.push(`${cellX} ${y} m ${cellX} ${y + height} l S`)
		})
	})
	commands.push('0.35 0.39 0.46 rg', textCommand('Documento generado automáticamente por Cobrix', MARGIN, 32, '/F1', 8))
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
	const generatedAt = dateTime(new Date().toISOString())
	const rows = runs.map(runRow)
	const pages = splitPages(rows)
	const fontObject = 3 + pages.length * 2
	const objects = new Map<number, string>()
	objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>')
	objects.set(2, `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`)
	pages.forEach((page, index) => {
		const pageObject = 3 + index * 2
		const contentObject = pageObject + 1
		const content = contentStream(page, index + 1, pages.length, runs.length, filterLabel, generatedAt)
		objects.set(pageObject, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObject} 0 R /F2 ${fontObject + 1} 0 R >> >> /Contents ${contentObject} 0 R >>`)
		objects.set(contentObject, `<< /Length ${encodePdf(content).length} >>\nstream\n${content}\nendstream`)
	})
	objects.set(fontObject, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
	objects.set(fontObject + 1, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')

	let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
	const offsets = [0]
	for (let objectNumber = 1; objectNumber <= fontObject + 1; objectNumber += 1) {
		offsets[objectNumber] = encodePdf(pdf).length
		pdf += `${objectNumber} 0 obj\n${objects.get(objectNumber)}\nendobj\n`
	}
	const xrefOffset = encodePdf(pdf).length
	pdf += `xref\n0 ${fontObject + 2}\n0000000000 65535 f \n`
	for (let objectNumber = 1; objectNumber <= fontObject + 1; objectNumber += 1) pdf += `${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`
	pdf += `trailer\n<< /Size ${fontObject + 2} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
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
