import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { saltypuckApiPlugin } from './vite-plugin-api.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), saltypuckApiPlugin()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
