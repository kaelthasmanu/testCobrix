import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CompanyTimeZoneProvider } from './lib/companyTimeZone'
import { ThemeProvider } from './lib/theme'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
	<React.StrictMode>
		<BrowserRouter>
			<ThemeProvider>
				<CompanyTimeZoneProvider>
					<App />
				</CompanyTimeZoneProvider>
			</ThemeProvider>
		</BrowserRouter>
	</React.StrictMode>,
)
