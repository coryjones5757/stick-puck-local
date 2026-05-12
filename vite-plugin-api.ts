import type { Plugin } from 'vite'
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let spawnedChild: ChildProcess | null = null
let registeredShutdown = false

function shutdownApiChild() {
  if (spawnedChild) {
    spawnedChild.kill('SIGTERM')
    spawnedChild = null
  }
}

function registerProcessShutdown() {
  if (registeredShutdown) {
    return
  }
  registeredShutdown = true
  process.on('SIGINT', shutdownApiChild)
  process.on('SIGTERM', shutdownApiChild)
  process.on('exit', shutdownApiChild)
}

/** Start server.mjs in dev when nothing is listening on PORT (default 8787). */
export function saltypuckApiPlugin(): Plugin {
  return {
    name: 'saltypuck-api',
    apply: 'serve',
    async configureServer() {
      const port = Number(process.env.PORT || 8787)
      const base = `http://127.0.0.1:${port}`

      try {
        const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(800) })
        if (res.ok) {
          console.log(`\n[saltypuck] API already running at ${base}\n`)
          return () => {}
        }
      } catch {
        /* proceed to spawn */
      }

      const serverEntry = path.join(__dirname, 'server.mjs')
      spawnedChild = spawn(process.execPath, [serverEntry], {
        cwd: __dirname,
        stdio: 'inherit',
        env: { ...process.env, PORT: String(port) },
      })

      spawnedChild.on('error', (err) => {
        console.error('[saltypuck] Could not start API:', err)
      })

      console.log(`\n[saltypuck] Started API at ${base} (server.mjs)\n`)

      registerProcessShutdown()

      return () => {
        shutdownApiChild()
      }
    },
  }
}
