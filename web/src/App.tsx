import { useEffect } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { PanelLayout } from './components/PanelLayout'
import AssignmentPage from './pages/AssignmentPage'
import ClientsPage from './pages/ClientsPage'
import ConfigurationPage from './pages/ConfigurationPage'
import CustomerRecordPage from './pages/CustomerRecordPage'
import SynchronizationPage from './pages/SynchronizationPage'
import SummaryPage from './pages/SummaryPage'

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
	const { session } = useAuth()

	return (
		<PanelLayout session={session}>
			<Routes>
				<Route path="/" element={<SummaryPage />} />
				<Route path="/clientes" element={<ClientsPage />} />
				<Route path="/clientes/:customerId" element={<CustomerRecordPage />} />
				<Route path="/sincronizacion" element={<SynchronizationPage />} />
				<Route path="/configuracion" element={<ConfigurationPage />} />
				<Route path="/enunciado" element={<AssignmentPage />} />
				<Route path="*" element={<NotFoundPage />} />
			</Routes>
		</PanelLayout>
	)
}
