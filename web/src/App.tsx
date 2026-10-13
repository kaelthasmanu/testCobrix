import { useEffect } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { PanelLayout } from './components/PanelLayout'
import { ScreenPlaceholder } from './components/ScreenPlaceholder'
import { screens } from './data/screens'
import AssignmentPage from './pages/AssignmentPage'
import LoginPage from './pages/LoginPage'

function ScreenPage({ path }: { path: string }) {
	const screen = screens[path]
	useEffect(() => {
		document.title = `${screen?.title ?? 'No encontrado'} · Prueba de facturación`
	}, [screen])
	if (!screen) return <NotFoundPage />
	return <ScreenPlaceholder screen={screen} isHome={path === '/'} />
}

function CustomerRecordPage() {
	const { customerId } = useParams()
	return <ScreenPage path="/clientes/expediente" key={customerId} />
}

function NotFoundPage() {
	useEffect(() => {
		document.title = 'No encontrado · Prueba de facturación'
	}, [])
	return (
		<>
			<h1>No encontrado</h1>
			<p><Link to="/">Volver</Link></p>
		</>
	)
}

export default function App() {
	const { session, logout } = useAuth()
	const location = useLocation()

	return (
		<Routes>
			<Route path="/login" element={<LoginPage />} />
			<Route
				path="*"
				element={session
					? (
						<PanelLayout session={session} onLogout={logout}>
							<Routes>
								<Route path="/" element={<ScreenPage path="/" />} />
								<Route path="/clientes" element={<ScreenPage path="/clientes" />} />
								<Route path="/clientes/:customerId" element={<CustomerRecordPage />} />
								<Route path="/sincronizacion" element={<ScreenPage path="/sincronizacion" />} />
								<Route path="/configuracion" element={<ScreenPage path="/configuracion" />} />
								<Route path="/enunciado" element={<AssignmentPage />} />
								<Route path="*" element={<NotFoundPage />} />
							</Routes>
						</PanelLayout>
					)
					: <Navigate to="/login" replace state={{ from: location }} />}
			/>
		</Routes>
	)
}
