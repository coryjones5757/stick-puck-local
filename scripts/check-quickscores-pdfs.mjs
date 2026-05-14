#!/usr/bin/env node
/**
 * Calls GET /api/pdf-sources on a running Salty Puck API (local or prod).
 *
 * Usage:
 *   SALTYPUCK_API_BASE_URL=http://127.0.0.1:8787 node scripts/check-quickscores-pdfs.mjs
 *   node scripts/check-quickscores-pdfs.mjs --record   # requires token + state path on server
 *   node scripts/check-quickscores-pdfs.mjs --fail-on-new
 */

const base = (process.env.SALTYPUCK_API_BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const record = process.argv.includes('--record')
const failOnNew = process.argv.includes('--fail-on-new')
const token = (process.env.SALTYPUCK_PDF_CHECK_TOKEN || '').trim()

const qs = new URLSearchParams()
if (record) {
  qs.set('record', '1')
  if (token) {
    qs.set('token', token)
  }
}
const url = `${base}/api/pdf-sources${qs.toString() ? `?${qs}` : ''}`

const res = await fetch(url, {
  headers: token && record ? { 'X-Saltypuck-Pdf-Check-Token': token } : {},
})

let body
try {
  body = await res.json()
} catch {
  console.error(await res.text())
  process.exit(1)
}

if (!res.ok) {
  console.error(JSON.stringify(body, null, 2))
  process.exit(1)
}

console.log(JSON.stringify(body, null, 2))

for (const s of body.sources || []) {
  const label = s.selected?.calendarLabel || s.parseUsesUrl || s.fetchError
  const line = `[${s.id}] ${s.rink}: ${label}`
  if (s.urlChangedSinceRecord === true) {
    console.error(`\nNEW PDF (since last record): ${line}`)
    console.error(`  now:  ${s.parseUsesUrl}`)
    console.error(`  was:  ${s.lastRecordedUrl}`)
  } else if (s.urlChangedSinceRecord === null && body.statePathConfigured) {
    console.error(`\n(no baseline for ${s.id} — run once with --record after deploying SALTYPUCK_PDF_CHECK_STATE_PATH)`)
  }
}

if (body.recorded) {
  console.error('\nRecorded current PDF URLs to state file on server.')
}

if (failOnNew && body.hasNewPdfSinceRecord) {
  process.exit(2)
}
