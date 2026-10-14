import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Screen } from '../data/screens'

const simulatorUrl = import.meta.env.VITE_SIMULATOR_URL ?? 'http://127.0.0.1:4310'

function Card({ children, title, link }: { children: ReactNode; title?: string; link?: ReactNode }) {
	return (
		<section className="min-w-0 rounded-[10px] border border-line bg-surface">
			{title && (
				<header className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line px-4 py-3.5">
					<h2>{title}</h2>
					{link}
				</header>
			)}
			<div className="grid gap-3.5 p-4">{children}</div>
		</section>
	)
}

export function ScreenPlaceholder({ screen, isHome = false }: { screen: Screen; isHome?: boolean }) {
	return (
		<>
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h1 className="flex flex-wrap items-center gap-2">{screen.title} <span className="pill warn">Por implementar</span></h1>
					<p className="mb-0 mt-1 max-w-[80ch] text-muted">{screen.purpose}</p>
				</div>
			</div>
			<Card
				title="Qué debe hacer esta pantalla"
				link={<Link to="/enunciado">Enunciado §{screen.section}</Link>}
			>
				<ul className="m-0 grid max-w-[90ch] list-disc gap-1.5 pl-5">
					{screen.todo.map((item) => <li key={item}>{item}</li>)}
				</ul>
			</Card>
			{isHome && (
				<Card title="Cómo empezar">
					<ol className="m-0 grid max-w-[90ch] list-decimal gap-1.5 pl-5">
						<li>Lee el <Link to="/enunciado">enunciado</Link>: qué construir, reglas y criterios de aceptación.</li>
						<li>Explora la API en <a href={`${simulatorUrl}/docs`} target="_blank" rel="noopener">Swagger</a> (usuario <span className="mono">cobrix</span>, contraseña <span className="mono">cobrix-sandbox</span>).</li>
						<li>Para crear pagos del lado del ISP y probar tu «Actualizar pagadas», usa la sección <strong>Simulador</strong> del Swagger (<span className="mono">POST /__sim/pagar</span>).</li>
						<li>Implementa las pantallas de este menú.</li>
					</ol>
				</Card>
			)}
		</>
	)
}
