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

async function waitForApiReady(base: string, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(600) })
      if (res.ok) {
        return
      }
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 120))
  }
  throw new Error(`API did not become ready at ${base} within ${timeoutMs}ms`)
}

async function ensureApiRunning(apiPort: number): Promise<() => void> {
  const base = `http://127.0.0.1:${apiPort}`

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
    env: { ...process.env, PORT: String(apiPort) },
  })

  spawnedChild.on('error', (err) => {
    console.error('[saltypuck] Could not start API:', err)
  })

  console.log(`\n[saltypuck] Starting API at ${base} (server.mjs)…`)

  try {
    await waitForApiReady(base)
    console.log(`[saltypuck] API ready — proxy /api → ${base}\n`)
  } catch (err) {
    console.error(
      `[saltypuck] ${err instanceof Error ? err.message : err}\n` +
        `  Fix: free port ${apiPort} or run \`npm run server\` in another terminal.\n`,
    )
  }

  registerProcessShutdown()

  return () => {
    shutdownApiChild()
  }
}

/**
 * Start server.mjs for local dev and vite preview when nothing is listening on the API port.
 * Hooks both configureServer (vite dev) and configurePreviewServer (vite preview) — they are
 * mutually exclusive per run, but preview does NOT call configureServer, so both are required.
 */
export function saltypuckApiPlugin(apiPort = 8787): Plugin {
  return {
    name: 'saltypuck-api',
    apply: 'serve',
    configureServer() {
      return ensureApiRunning(apiPort)
    },
    configurePreviewServer() {
      return ensureApiRunning(apiPort)
    },
  }
}
