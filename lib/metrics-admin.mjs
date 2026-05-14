import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'
import express from 'express'
import rateLimit from 'express-rate-limit'
import session from 'express-session'

const RETENTION_MS = Number(process.env.SALTYPUCK_METRICS_RETENTION_DAYS || 90) * 24 * 60 * 60 * 1000

/**
 * @param {import('express').Express} app
 * @param {{ isProd: boolean; __dirname: string }} opts
 */
export function attachAdminMetrics(app, opts) {
  const { isProd, __dirname } = opts
  const adminPassword = (process.env.SALTYPUCK_ADMIN_PASSWORD || '').trim()
  const sessionSecret = (process.env.SALTYPUCK_ADMIN_SESSION_SECRET || '').trim()
  const dbPathRaw = process.env.SALTYPUCK_METRICS_DB_PATH?.trim()
  const dbPath = dbPathRaw || path.join(__dirname, 'data', 'metrics.sqlite')

  if (!adminPassword) {
    console.log('[metrics] Admin dashboard disabled — set SALTYPUCK_ADMIN_PASSWORD (and SALTYPUCK_ADMIN_SESSION_SECRET) to enable.')
    return
  }
  if (sessionSecret.length < 16) {
    console.warn('[metrics] SALTYPUCK_ADMIN_SESSION_SECRET must be at least 16 characters. Admin dashboard disabled.')
    return
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  initSchema(db)
  pruneOld(db)
  const pruneTimer = setInterval(() => pruneOld(db), 60 * 60 * 1000)
  if (typeof pruneTimer.unref === 'function') pruneTimer.unref()

  const pepper = (
    process.env.SALTYPUCK_METRICS_IP_PEPPER ||
    sessionSecret ||
    'saltypuck-metrics'
  ).slice(0, 128)

  /** @param {import('express').Request} req */
  function clientIp(req) {
    const xf = req.headers['x-forwarded-for']
    if (typeof xf === 'string' && xf.length > 0) {
      return xf.split(',')[0].trim()
    }
    return req.socket?.remoteAddress || ''
  }

  function hashIp(ip) {
    return crypto.createHash('sha256').update(`${pepper}|${ip}`).digest('hex').slice(0, 20)
  }

  function shouldSkipLog(req) {
    const p = req.path || ''
    if (p === '/health') return true
    if (p.startsWith('/admin')) return true
    if (p.startsWith('/assets/')) return true
    if (p === '/favicon.ico' || p === '/robots.txt' || p === '/sitemap.xml') return true
    if (p === '/saltypuck.svg' || p === '/favicon-32.png') return true
    if (p.startsWith('/fonts/')) return true
    return false
  }

  const insertRequest = db.prepare(
    `INSERT INTO request_log (ts, method, path, status, duration_ms, ip_hash, ua_snippet, cache)
     VALUES (@ts, @method, @path, @status, @duration_ms, @ip_hash, @ua_snippet, @cache)`,
  )

  app.use((req, res, next) => {
    if (req.method === 'OPTIONS' || shouldSkipLog(req)) {
      next()
      return
    }
    const start = Date.now()
    res.on('finish', () => {
      try {
        const duration = Date.now() - start
        const ip = clientIp(req)
        const ua = String(req.headers['user-agent'] || '').slice(0, 160)
        const p = req.path || req.url?.split('?')[0] || ''
        const cache =
          p === '/api/events' ? String(res.getHeader('x-cache') || '').toUpperCase() || null : null
        const status = res.statusCode || 0
        insertRequest.run({
          ts: Date.now(),
          method: req.method,
          path: p.slice(0, 512),
          status,
          duration_ms: duration,
          ip_hash: ip ? hashIp(ip) : '',
          ua_snippet: ua,
          cache,
        })
      } catch (err) {
        console.error('[metrics] log insert failed', err)
      }
    })
    next()
  })

  app.use(
    '/admin',
    session({
      name: 'saltypuck.admin',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/admin',
      },
    }),
  )

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.SALTYPUCK_ADMIN_LOGIN_MAX || 40),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts — try again later.' },
  })

  const adminRouter = express.Router()
  adminRouter.use(express.urlencoded({ extended: false }))
  adminRouter.use(express.json({ limit: '8kb' }))

  /** @param {import('express').Request} req */
  function isAuthed(req) {
    return Boolean(req.session && req.session.metricsAuth === true)
  }

  adminRouter.use((req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    next()
  })

  adminRouter.get('/', (req, res) => {
    if (isAuthed(req)) {
      res.type('html').send(dashboardHtml())
      return
    }
    const err = String(req.query.error || '')
    const hint = err === '1' ? '<p class="err">Incorrect password.</p>' : ''
    res.type('html').send(loginHtml(hint))
  })

  adminRouter.post('/login', loginLimiter, (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const pw = typeof body.password === 'string' ? body.password : ''
    if (timingSafeEqualString(pw, adminPassword)) {
      req.session.metricsAuth = true
      res.redirect(303, '/admin/')
      return
    }
    res.redirect(303, '/admin/?error=1')
  })

  adminRouter.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect(303, '/admin/')
    })
  })

  adminRouter.get('/api/summary', (req, res) => {
    if (!isAuthed(req)) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 14))
    const since = Date.now() - days * 24 * 60 * 60 * 1000

    const byDay =
      db
        .prepare(
          `SELECT
             strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime') AS day,
             COUNT(*) AS requests,
             COUNT(DISTINCT ip_hash) AS approx_visitors
           FROM request_log
           WHERE ts >= ?
           GROUP BY day
           ORDER BY day ASC`,
        )
        .all(since) || []

    const topPaths =
      db
        .prepare(
          `SELECT path, COUNT(*) AS c
           FROM request_log
           WHERE ts >= ?
           GROUP BY path
           ORDER BY c DESC
           LIMIT 25`,
        )
        .all(since) || []

    const statusBreakdown =
      db
        .prepare(
          `SELECT status, COUNT(*) AS c
           FROM request_log
           WHERE ts >= ?
           GROUP BY status
           ORDER BY c DESC`,
        )
        .all(since) || []

    const apiCache =
      db
        .prepare(
          `SELECT cache, COUNT(*) AS c
           FROM request_log
           WHERE ts >= ? AND path = '/api/events' AND cache IS NOT NULL AND cache != ''
           GROUP BY cache`,
        )
        .all(since) || []

    const methodBreakdown =
      db
        .prepare(
          `SELECT method, COUNT(*) AS c
           FROM request_log
           WHERE ts >= ?
           GROUP BY method`,
        )
        .all(since) || []

    const total = db.prepare(`SELECT COUNT(*) AS n FROM request_log WHERE ts >= ?`).get(since)?.n ?? 0

    const durations = db
      .prepare(`SELECT duration_ms FROM request_log WHERE ts >= ? AND path = '/api/events' ORDER BY duration_ms ASC`)
      .all(since)
      .map((r) => r.duration_ms)
    const apiEventsP95Ms = percentileFromSorted(durations, 0.95)

    res.json({
      ok: true,
      days,
      since: new Date(since).toISOString(),
      totalRequests: total,
      byDay,
      topPaths,
      statusBreakdown,
      apiEventsCache: apiCache,
      methodBreakdown,
      apiEventsP95Ms,
      dbPath: dbPathRaw ? '(custom SALTYPUCK_METRICS_DB_PATH)' : path.relative(process.cwd(), dbPath),
    })
  })

  app.use('/admin', adminRouter)
  console.log('[metrics] Admin dashboard at /admin/ (password + session secret configured).')
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS request_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      ip_hash TEXT NOT NULL,
      ua_snippet TEXT NOT NULL DEFAULT '',
      cache TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_request_log_ts ON request_log(ts);
    CREATE INDEX IF NOT EXISTS idx_request_log_path ON request_log(path);
  `)
}

function pruneOld(db) {
  const cutoff = Date.now() - RETENTION_MS
  const r = db.prepare(`DELETE FROM request_log WHERE ts < ?`).run(cutoff)
  if (r.changes > 0) {
    console.log(`[metrics] pruned ${r.changes} request_log rows older than retention`)
  }
}

/** @param {number[]} sortedAsc */
function percentileFromSorted(sortedAsc, p) {
  if (!sortedAsc.length) return null
  const idx = Math.min(sortedAsc.length - 1, Math.floor((sortedAsc.length - 1) * p))
  return sortedAsc[idx]
}

function timingSafeEqualString(a, b) {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) {
    return crypto.timingSafeEqual(
      crypto.createHash('sha256').update(ab).digest(),
      crypto.createHash('sha256').update(bb).digest(),
    )
  }
  return crypto.timingSafeEqual(ab, bb)
}

function loginHtml(errorBlock) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex,nofollow"/>
  <title>Salty Puck · Metrics login</title>
  <style>
    :root { color-scheme: dark; --bg:#0b1120; --card:#111827; --border:#1f2937; --text:#e5e7eb; --muted:#94a3b8; --accent:#60a5fa; }
    * { box-sizing: border-box; }
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
      font-family: system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 24px; }
    .card { width:100%; max-width: 380px; background: var(--card); border:1px solid var(--border); border-radius:14px; padding: 28px; }
    h1 { margin:0 0 6px; font-size:1.15rem; }
    p.sub { margin:0 0 20px; color: var(--muted); font-size:0.88rem; }
    label { display:block; font-size:0.78rem; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color: var(--muted); margin-bottom:6px; }
    input { width:100%; padding:11px 12px; border-radius:8px; border:1px solid var(--border); background:#0f172a; color:var(--text); font-size:1rem; }
    button { margin-top:16px; width:100%; padding:11px; border-radius:8px; border:none; background:var(--accent); color:#0b1120; font-weight:700; cursor:pointer; font-size:0.95rem; }
    button:hover { filter: brightness(1.08); }
    .err { color:#fca5a5; font-size:0.86rem; margin:0 0 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Traffic metrics</h1>
    <p class="sub">Salty Puck · sign in to view server logs (stored locally on this machine).</p>
    ${errorBlock}
    <form method="post" action="/admin/login" autocomplete="current-password">
      <label for="pw">Password</label>
      <input id="pw" name="password" type="password" required autocomplete="current-password" autofocus/>
      <button type="submit">Sign in</button>
    </form>
  </div>
</body>
</html>`
}

function dashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex,nofollow"/>
  <title>Salty Puck · Metrics</title>
  <style>
    :root { color-scheme: dark; --bg:#0b1120; --card:#111827; --border:#1f2937; --text:#e5e7eb; --muted:#94a3b8; --accent:#60a5fa; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--text); padding: 20px 22px 40px; }
    header { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin-bottom:20px; }
    h1 { margin:0; font-size:1.2rem; }
    .muted { color: var(--muted); font-size:0.85rem; }
    form.inline { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
    select, button { padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:#0f172a; color:var(--text); }
    button.primary { background: var(--accent); color:#0b1120; border:none; font-weight:600; cursor:pointer; }
    .grid { display:grid; gap:16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    section { background: var(--card); border:1px solid var(--border); border-radius:12px; padding:16px 18px; }
    section h2 { margin:0 0 12px; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.1em; color: var(--muted); }
    table { width:100%; border-collapse:collapse; font-size:0.86rem; }
    th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--border); }
    th { color: var(--muted); font-weight:600; font-size:0.75rem; }
    .num { text-align:right; font-variant-numeric: tabular-nums; }
    .big { font-size:1.6rem; font-weight:800; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Traffic &amp; API metrics</h1>
      <p class="muted" id="meta">Loading…</p>
    </div>
    <div style="display:flex; gap:10px; align-items:center;">
      <form class="inline" onsubmit="return false">
        <label class="muted" for="days">Range</label>
        <select id="days" aria-label="Days">
          <option value="7">7 days</option>
          <option value="14" selected>14 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
        </select>
        <button type="button" class="primary" id="reload">Refresh</button>
      </form>
      <form method="post" action="/admin/logout"><button type="submit">Log out</button></form>
    </div>
  </header>
  <div class="grid">
    <section><h2>Total requests</h2><div class="big" id="total">—</div><p class="muted">In selected window · excludes /health, /assets, /admin, static tiny files</p></section>
    <section><h2>/api/events latency (p95)</h2><div class="big" id="p95">—</div><p class="muted">Milliseconds · server time until response sent</p></section>
    <section><h2>/api/events cache</h2><table id="cache"><thead><tr><th>Cache</th><th class="num">Count</th></tr></thead><tbody></tbody></table></section>
    <section><h2>HTTP status</h2><table id="status"><thead><tr><th>Code</th><th class="num">Count</th></tr></thead><tbody></tbody></table></section>
    <section><h2>Methods</h2><table id="methods"><thead><tr><th>Method</th><th class="num">Count</th></tr></thead><tbody></tbody></table></section>
    <section style="grid-column: 1 / -1;"><h2>Requests per day</h2><table id="byday"><thead><tr><th>Day</th><th class="num">Requests</th><th class="num">Approx. visitors</th></tr></thead><tbody></tbody></table></section>
    <section style="grid-column: 1 / -1;"><h2>Top paths</h2><table id="paths"><thead><tr><th>Path</th><th class="num">Hits</th></tr></thead><tbody></tbody></table></section>
  </div>
  <script>
    async function load() {
      const days = document.getElementById('days').value;
      const r = await fetch('/admin/api/summary?days=' + encodeURIComponent(days), { credentials: 'same-origin' });
      if (r.status === 401) { window.location.href = '/admin/'; return; }
      const j = await r.json();
      document.getElementById('meta').textContent = 'Window: ' + j.days + ' days · DB: ' + j.dbPath;
      document.getElementById('total').textContent = j.totalRequests.toLocaleString();
      document.getElementById('p95').textContent = j.apiEventsP95Ms == null ? '—' : j.apiEventsP95Ms + ' ms';
      function fillTable(id, rows, k1, k2) {
        const tb = document.querySelector('#' + id + ' tbody');
        tb.innerHTML = '';
        for (const row of rows) {
          const tr = document.createElement('tr');
          tr.innerHTML = '<td>' + escape(row[k1]) + '</td><td class="num">' + Number(row[k2]).toLocaleString() + '</td>';
          tb.appendChild(tr);
        }
      }
      function escape(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
      }
      fillTable('cache', j.apiEventsCache, 'cache', 'c');
      fillTable('status', j.statusBreakdown, 'status', 'c');
      fillTable('methods', j.methodBreakdown, 'method', 'c');
      const bd = document.querySelector('#byday tbody');
      bd.innerHTML = '';
      for (const row of j.byDay) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td>' + row.day + '</td><td class="num">' + Number(row.requests).toLocaleString() + '</td><td class="num">' + Number(row.approx_visitors).toLocaleString() + '</td>';
        bd.appendChild(tr);
      }
      const pt = document.querySelector('#paths tbody');
      pt.innerHTML = '';
      for (const row of j.topPaths) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td><code>' + escape(row.path) + '</code></td><td class="num">' + Number(row.c).toLocaleString() + '</td>';
        pt.appendChild(tr);
      }
    }
    document.getElementById('reload').addEventListener('click', load);
    document.getElementById('days').addEventListener('change', load);
    load();
  </script>
</body>
</html>`
}
