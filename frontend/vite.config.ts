import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '')
	const apiUrl = new URL(env.VITE_API_URL ?? 'http://127.0.0.1:4310/api/v1')
	const apiPath = apiUrl.pathname.replace(/\/+$/, '')

	return {
		plugins: [react(), tailwindcss()],
		server: {
			proxy: {
				[apiPath]: {
					target: apiUrl.origin,
					changeOrigin: true,
				},
			},
		},
	}
})
