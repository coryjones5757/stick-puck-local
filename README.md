# Salty Puck

Independent Utah stick & puck / drop-in session finder. Aggregates **public** rink calendars and PDF schedules into one view.

**Not affiliated** with any rink or QuickScores — always confirm times and fees with the facility (see in-app Terms).

## Run locally (development)

Requires Node 20+ (uses `fetch`, `AbortSignal.timeout`).

```bash
npm install
npm run dev
```

This starts Vite on **5173** and **automatically starts** the Express API on **8787** (or `SALTYPUCK_API_PORT` / `API_PORT` / `PORT` from `.env`) when nothing is already listening there. `/api` is proxied to the API.

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

Optional environment variables are documented in [`.env.example`](.env.example).

## Deploy notes

1. Run behind HTTPS termination (reverse proxy, load balancer, or PaaS).
2. Production SEO URLs use **`VITE_SITE_URL`** from [`.env.production`](.env.production) (`https://saltypuck.com`). Override in CI if needed. For a one-off build: `VITE_SITE_URL=https://saltypuck.com npm run build`.
3. Set `ALLOWED_ORIGINS` if the browser loads the SPA from a **different origin** than the API.
4. After launch, submit `https://saltypuck.com/sitemap.xml` in Google Search Console.
5. **QuickScores (Acord / County)** — the server **discovers the newest monthly PDF** from each facility’s QuickScores message page; you do not need to edit URLs each month unless QuickScores changes page structure (then adjust `pdfHrefMustInclude` / discovery logic in `server.mjs`).

## Legal

Copy in `/terms` and `/privacy` is informational; have a qualified attorney review before counting on it for liability protection.

## License

Add your license (e.g. MIT) if you open-source the project.
