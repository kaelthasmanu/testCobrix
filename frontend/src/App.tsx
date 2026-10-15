import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import { PanelLayout } from './components/PanelLayout'
import { ButtonLink, EmptyState } from './components/ui'
import ClientsPage from './pages/ClientsPage'
import ConfigurationPage from './pages/ConfigurationPage'
import CustomerRecordPage from './pages/CustomerRecordPage'
import RunDetailPage from './pages/RunDetailPage'
import SummaryPage from './pages/SummaryPage'
import SynchronizationPage from './pages/SynchronizationPage'

function NotFoundPage() {
	useEffect(() => {
		document.title = 'No encontrado · Cobrix'
	}, [])
	return <EmptyState action={<ButtonLink primary to="/">Ir al resumen</ButtonLink>} title="Esta página no existe">Revisa la dirección o vuelve al resumen.</EmptyState>
}

export default function App() {
	return (
		<PanelLayout>
			<Routes>
				<Route path="/" element={<SummaryPage />} />
				<Route path="/clientes" element={<ClientsPage />} />
				<Route path="/clientes/:document" element={<CustomerRecordPage />} />
				<Route path="/sincronizacion" element={<SynchronizationPage />} />
				<Route path="/sincronizacion/:runId" element={<RunDetailPage />} />
				<Route path="/configuracion" element={<ConfigurationPage />} />
				<Route path="*" element={<NotFoundPage />} />
			</Routes>
		</PanelLayout>
	)
}
