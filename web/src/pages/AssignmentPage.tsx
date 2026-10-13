import { useEffect } from 'react'
import assignment from '../../../api/docs/ENUNCIADO.md?raw'

export default function AssignmentPage() {
	useEffect(() => {
		document.title = 'Enunciado · Prueba de facturación'
	}, [])

	return (
		<>
			<div className="head">
				<div>
					<h1>Enunciado</h1>
					<p>También en <span className="mono">docs/ENUNCIADO.md</span>.</p>
				</div>
			</div>
			<section className="min-w-0 rounded-[10px] border border-line bg-surface">
				<div className="p-4">
					<pre className="m-0 max-w-[110ch] whitespace-pre-wrap font-mono text-[13.5px] leading-relaxed text-fg">{assignment}</pre>
				</div>
			</section>
		</>
	)
}
