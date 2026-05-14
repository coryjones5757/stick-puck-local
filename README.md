# Salty Puck

Independent Utah stick & puck / drop-in session finder. Aggregates **public** rink calendars and PDF schedules into one view.

**Not affiliated** with any rink or QuickScores — always confirm times and fees with the facility (see in-app Terms).

## Run locally (development)

Requires Node 20+ (uses `fetch`, `AbortSignal.timeout`).

```bash
npm install
npm run dev
```

This starts Vite on **5173** and **automatically starts** the Express API on **8787** (or `SALTYPUCK_API_PORT` / `API_PORT` / `PORT` from `.env`) when nothing is already listening there. **`/api`** and **`/admin`** are proxied to the API.

- API only (e.g. debugging): `npm run server`
- `npm run vite` alone also starts the API the same way (via the dev plugin).
- **`npm run preview`** uses the same proxy and **auto-starts the API** like dev (via `configurePreviewServer`). If you still see **502**, nothing is listening on the API port — free it or run `npm run server` in another terminal.

If the UI shows **network / 502** errors toward the API: stop other processes on **8787** or **5173** (`lsof -i :8787`). Avoid putting a random `PORT=` in `.env` unless it’s your intended API port; prefer **`SALTYPUCK_API_PORT=8787`** in `.env` so deploy/host `PORT` values don’t break local proxy targets.

## Production build (single Node process)

```bash
npm run build
npm start
```

Set `NODE_ENV=production`. The server serves static files from `dist/` and exposes:

- `GET /health` — liveness
- `GET /api/events` — aggregated events (cached, rate-limited)
- **`GET /admin/`** — optional password-protected traffic dashboard (disabled until env is set; see below)

Optional environment variables are documented in [`.env.example`](.env.example).

### Admin traffic metrics (`/admin/`)

When **`SALTYPUCK_ADMIN_PASSWORD`** and **`SALTYPUCK_ADMIN_SESSION_SECRET`** (≥16 characters) are set, the server logs anonymized requests (path, status, duration, hashed IP, short user-agent snippet, and **`X-Cache`** for `/api/events`) into **`data/metrics.sqlite`** (override with **`SALTYPUCK_METRICS_DB_PATH`**). Sign in at **`/admin/`** (e.g. `https://saltypuck.com/admin/` in production, or `http://localhost:5173/admin/` during dev). Rows older than **`SALTYPUCK_METRICS_RETENTION_DAYS`** (default 90) are deleted automatically. The SQLite file is gitignored; back it up on the host if you want long-term archives.

## Deploy notes

1. Run behind HTTPS termination (reverse proxy, load balancer, or PaaS).
2. Production SEO URLs use **`VITE_SITE_URL`** from [`.env.production`](.env.production) (`https://saltypuck.com`). Override in CI if needed. For a one-off build: `VITE_SITE_URL=https://saltypuck.com npm run build`.
3. Set **`VITE_CONTACT_EMAIL`** at build time so the footer and Terms/Privacy show a mailto link (see [`.env.example`](.env.example)).
4. Set `ALLOWED_ORIGINS` if the browser loads the SPA from a **different origin** than the API.
5. After launch, submit `https://saltypuck.com/sitemap.xml` in Google Search Console.
6. **QuickScores (Acord / County)** — the server **discovers the newest monthly PDF** from each facility’s QuickScores message page; you do not need to edit URLs each month unless QuickScores changes page structure (then adjust `pdfHrefMustInclude` / discovery logic in `server.mjs`).
7. **Utah Olympic Oval** — public skate sessions load from the venue’s **`MONTH-PUBLIC-SKATE-CALENDAR.pdf`** on utaholympiclegacy.org (current and adjacent months; optional **`OLYMPIC_OVAL_PUBLIC_SKATE_PDF_URL`** to pin). Optional Oval ICS env only merges **public skate** rows (`onlySessionTypes: ['PS']` in `server.mjs`).

See **[LAUNCH.md](LAUNCH.md)** for a fuller pre-go-live checklist.

## Legal

Copy in `/terms` and `/privacy` is informational; have a qualified attorney review before counting on it for liability protection.

## License

Add your license (e.g. MIT) if you open-source the project.
