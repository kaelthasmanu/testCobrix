import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// El panel solo habla con el backend de Cobrix (VITE_COBRIX_API_URL), nunca con la API del proveedor.
export default defineConfig({
	plugins: [react(), tailwindcss()],
})
