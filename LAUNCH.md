# Salty Puck — launch checklist

Use this before pointing a real domain at production traffic. Legal wording is informational only; have counsel review for your situation.

## Build and hosting

- [ ] **HTTPS** in front of the Node process (reverse proxy, LB, or PaaS).
- [ ] **`NODE_ENV=production`** for `npm start`.
- [ ] **Build with the public site URL**: `VITE_SITE_URL=https://your-domain.example` (no trailing slash) so canonical URLs, Open Graph tags, and `sitemap.xml` match production. See [README.md](README.md).
- [ ] **`ALLOWED_ORIGINS`** if the SPA is ever served from a different origin than the API (see [`.env.example`](.env.example)).
- [ ] **`VITE_CONTACT_EMAIL`** set at build time so the footer and Terms/Privacy show a working contact link.
- [ ] **Port env**: prefer `SALTYPUCK_API_PORT` locally so host `PORT` does not break the dev API (README).

## Data sources (`server.mjs` + env)

- [ ] Confirm **every rink feed** you rely on in production: QuickScores PDF pins (if discovery fails), ICS calendar IDs, SLC Amilia proxy defaults, Mammoth BondSports URL, etc. Optional vars are listed in [`.env.example`](.env.example).
- [ ] **`GET /health`** wired into uptime monitoring.
- [ ] **Logs / alerts** for upstream PDF and ICS failures after deploy.

- [ ] **Utah Olympic Oval** — optional `OLYMPIC_OVAL_PUBLIC_SKATE_PDF_URL` if you need to pin a specific monthly public skate PDF; otherwise the server tries current and nearby months on utaholympiclegacy.org.

## SEO and sharing

- [ ] Submit **`/sitemap.xml`** in Google Search Console after DNS is live.
- [ ] Spot-check **Open Graph / Twitter** previews (raster image: `/hero-outdoor-rink-ai.png`). Consider compressing or a dedicated 1200×630 asset if previews load slowly.

## Legal and trust

- [ ] **Attorney review** of `/terms` and `/privacy` copy.
- [ ] **Rink photos**: keep `sourceUrl` / usage aligned with each venue’s terms where it matters to you.

## Optional later

- [ ] Error tracking (e.g. Sentry) for client and server.
- [ ] Analytics only with updated Privacy copy and any required consent flows.
- [ ] **LICENSE** file if the repo is public open source (README).
