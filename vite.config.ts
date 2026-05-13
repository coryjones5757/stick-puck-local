import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { saltypuckApiPlugin } from './vite-plugin-api.ts'
import { saltypuckSeoPlugin } from './vite-plugin-saltypuck-seo.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = (env.VITE_SITE_URL || 'http://localhost:5173').trim() || 'http://localhost:5173'
  // Prefer SALTYPUCK_API_PORT so .env PORT (e.g. hosting defaults) doesn’t silently move the API.
  const rawPort = env.SALTYPUCK_API_PORT || env.API_PORT || env.PORT || '8787'
  const apiPort = Number(rawPort)
  if (Number.isNaN(apiPort) || apiPort <= 0) {
    throw new Error(`Invalid API port in env (SALTYPUCK_API_PORT / API_PORT / PORT): ${rawPort}`)
  }
  const apiTarget = `http://127.0.0.1:${apiPort}`

  return {
    plugins: [react(), saltypuckSeoPlugin(siteUrl), saltypuckApiPlugin(apiPort)],
    server: {
      // 127.0.0.1 avoids macOS localhost → ::1 mismatch with IPv4-only listeners
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
