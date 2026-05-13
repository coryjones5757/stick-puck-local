import path from 'node:path'
import { fileURLToPath } from 'node:url'

import cors from 'cors'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import ical from 'node-ical'
import { PDFParse } from 'pdf-parse'

dayjs.extend(utc)
dayjs.extend(timezone)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const SCHEDULE_TIME_ZONE = process.env.SCHEDULE_TIME_ZONE || 'America/Denver'
const PORT = Number(process.env.PORT || process.env.SALTYPUCK_API_PORT || 8787)
const isProd = process.env.NODE_ENV === 'production'
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 15000)
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_SECONDS || 90) * 1000
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

/** @param {unknown} err */
function logConnectorError(scope, err) {
  console.error(`[connector ${scope}]`, err instanceof Error ? err.stack || err.message : err)
}

/**
 * @param {string} prefix  e.g. "Weber" or "Acord Ice Center"
 * @param {unknown} err
 */
function safeConnectorMessage(prefix, err) {
  logConnectorError(prefix, err)
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('abort') || err?.name === 'AbortError') {
    return `${prefix}: Source timed out — try again shortly.`
  }
  if (/^\d{3}\s/.test(msg) || lower.includes('fetch failed') || lower.includes('econnrefused')) {
    return `${prefix}: Source temporarily unavailable.`
  }
  if (lower.includes('timeout')) {
    return `${prefix}: Source timed out — try again shortly.`
  }
  return `${prefix}: Could not load schedule data.`
}

function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(t))
}

// Trust one hop of reverse proxy (nginx / Cloudflare) so express-rate-limit
// sees the real client IP rather than the proxy's IP.
app.set('trust proxy', 1)

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
)

app.use((req, res, next) => {
  cors({
    origin(origin, callback) {
      if (!isProd) {
        callback(null, true)
        return
      }
      if (allowedOrigins.length > 0) {
        callback(null, Boolean(origin && allowedOrigins.includes(origin)))
        return
      }
      if (!origin) {
        callback(null, true)
        return
      }
      try {
        const requestHost = req.headers.host?.split(':')[0]
        const o = new URL(origin)
        callback(null, Boolean(requestHost && o.hostname === requestHost))
      } catch {
        callback(null, false)
      }
    },
  })(req, res, next)
})

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() })
})

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 200),
  standardHeaders: true,
  legacyHeaders: false,
})

app.use('/api', apiLimiter)

const WEBER_CALENDARS = [
  'ij2irhmpcuc3cukj6lkv03a3hk@group.calendar.google.com',
  'p42ti0cvnajjhf2arev2caoe50@group.calendar.google.com',
]

/** Peaks Ice Arena embed uses this public Google Calendar (Public Skate, College Night, Broom Ball). */
const PEAKS_GOOGLE_CALENDAR_ID =
  '164152767ee3832a8d7b63ff9d8a3f9f09786f43ce23d00d3c2ed7b3a13b97df@group.calendar.google.com'

const PDF_SOURCES = [
  {
    id: 'acord',
    rink: 'Acord Ice Center',
    city: 'West Valley City',
    location: 'Acord Ice Center',
    sourceUrl:
      'https://www.quickscores.com/downloads/slchockey_Stick_and_Puck__Drop_In_Hockey__Schedule_May_2026R.pdf',
    pageUrl:
      'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=15150&OrgDir=slchockey',
  },
  {
    id: 'county',
    rink: 'County Ice Center',
    city: 'Murray',
    location: 'County Ice Center',
    sourceUrl:
      'https://www.quickscores.com/downloads/slchockey_County_Ice_Center_2026_May_SP__DI.pdf',
    pageUrl:
      'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=15151&OrgDir=slchockey',
  },
]

const SOURCE_STATUS = [
  {
    id: 'peaks',
    name: 'Peaks Ice Arena',
    status: 'live',
    detail:
      "Facility schedule from Peaks Ice Arena's embedded public Google Calendar. Sticktime/Youth Sticktime signup is handled in Dash/DaySmart and typically only appears here if the rink adds those blocks to this feed.",
    url: 'https://www.provo.gov/394/Peaks-Ice-Arena',
  },
  {
    id: 'weber',
    name: 'Weber County Ice Sheet',
    status: 'live',
    detail: 'Live parsed from public Google Calendar feeds',
    url: 'https://webercountyutah.gov/Ice_Sheet/calendar1.php',
  },
  {
    id: 'acord',
    name: 'Acord Ice Center',
    status: 'live',
    detail: 'Parsed from QuickScores monthly PDF',
    url: 'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=15150&OrgDir=slchockey',
  },
  {
    id: 'county',
    name: 'County Ice Center',
    status: 'live',
    detail: 'Parsed from QuickScores monthly PDF',
    url: 'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=15151&OrgDir=slchockey',
  },
  {
    id: 'sportscomplex',
    name: 'SLC Sports Complex',
    status: 'live',
    detail:
      'Adult league games parsed from the SL County master schedule PDF (SLC-E & SLC-W rinks). Stick & Puck / Drop-In sessions are auto-discovered from weekly PDFs on QuickScores when the facility uploads them.',
    url: SC_DOWNLOADS_PAGE,
  },
  {
    id: 'parkcity',
    name: 'Park City Ice Arena',
    status: 'manual',
    detail: 'Uses DaySmart/DASH flow; recommend official feed/export',
    url: 'https://apps.daysmartrecreation.com/dash/index.php?Action=Auth%2Flogin&company=parkcity',
  },
  {
    id: 'southdavis',
    name: 'South Davis / Bountiful',
    status: 'manual',
    detail: 'Posts schedule updates on website/social media (manual sync)',
    url: 'https://www.southdavisrecreation.gov/ice-rink',
  },
]

const PROGRAM_BY_CODE = {
  SP: 'Stick & Puck',
  DI: 'Drop In Hockey',
  PS: 'Public Skate',
  LG: 'Adult League Game',
}

/** Fallback URL if dynamic discovery fails (updated each season). */
const SC_LEAGUE_PDF_FALLBACK =
  'https://www.quickscores.com/downloads/slchockey_Master_SLCo_Adult_Summer_Hockey_Schedule_2026.pdf'
const SC_DOWNLOADS_PAGE = 'https://www.quickscores.com/Orgs/Downloads.php?OrgDir=slchockey'
const SC_SPDI_DOWNLOADS_PAGE = 'https://www.quickscores.com/Orgs/Downloads.php?OrgDir=sportscomplex'

function parseMonthYear(rawText, sourceUrl) {
  const monthMatch = rawText.match(
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i,
  )
  if (monthMatch) {
    const monthName = monthMatch[1]
    const year = Number(monthMatch[2])
    const month = new Date(`${monthName} 1, ${year}`).getMonth() + 1
    return { month, year }
  }

  const urlMatch = sourceUrl.match(/_(20\d{2})_([A-Za-z]+)/)
  if (urlMatch) {
    const year = Number(urlMatch[1])
    const month = new Date(`${urlMatch[2]} 1, ${year}`).getMonth() + 1
    if (!Number.isNaN(month) && month > 0) {
      return { month, year }
    }
  }

  const now = dayjs()
  return { month: now.month() + 1, year: now.year() }
}

function parseClock(time, period) {
  const [hourRaw, minuteRaw] = time.split(':').map(Number)
  let hour = hourRaw
  const minute = minuteRaw
  const lowerPeriod = period.toLowerCase()
  if (lowerPeriod === 'pm' && hour !== 12) {
    hour += 12
  }
  if (lowerPeriod === 'am' && hour === 12) {
    hour = 0
  }
  return { hour, minute }
}

/** When PDF omits am/pm on the first time (e.g. "11:45 - 1:15pm"), do not reuse "pm" for both. */
function inferStartPeriodWhenMissing(startTime, endTime, endPeriod) {
  const endLower = endPeriod.toLowerCase()
  if (endLower === 'am') {
    return 'am'
  }

  const endParsed = parseClock(endTime, endPeriod)
  const endMin = endParsed.hour * 60 + endParsed.minute
  const MAX_SESSION_MIN = 10 * 60

  let bestPeriod = null
  let bestDur = Infinity
  for (const p of ['am', 'pm']) {
    const s = parseClock(startTime, p)
    const sMin = s.hour * 60 + s.minute
    const dur = endMin - sMin
    if (dur <= 0 || dur > MAX_SESSION_MIN) {
      continue
    }
    if (dur < bestDur) {
      bestDur = dur
      bestPeriod = p
    }
  }

  return bestPeriod || endPeriod
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function scheduleDateTime(year, month, day, clock) {
  return dayjs.tz(
    `${year}-${pad2(month)}-${pad2(day)}T${pad2(clock.hour)}:${pad2(clock.minute)}:00`,
    SCHEDULE_TIME_ZONE,
  )
}

function parsePdfLine(line) {
  const timeRangePattern =
    /^([A-Z]{2})\s+(\d{1,2}:\d{2})(am|pm)?\s*-\s*(\d{1,2}:\d{2})(am|pm)$/i
  const match = line.match(timeRangePattern)
  if (!match) {
    return null
  }

  const [, codeRaw, startTime, startPeriodMaybe, endTime, endPeriod] = match
  const code = codeRaw.toUpperCase()
  const startPeriod = startPeriodMaybe
    ? startPeriodMaybe
    : inferStartPeriodWhenMissing(startTime, endTime, endPeriod)
  const start = parseClock(startTime, startPeriod)
  const end = parseClock(endTime, endPeriod)

  return {
    code,
    title: PROGRAM_BY_CODE[code] || code,
    start,
    end,
  }
}

async function parsePdfSource(source) {
  const response = await fetchWithTimeout(source.sourceUrl)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  await parser.destroy()

  const { month, year } = parseMonthYear(result.text, source.sourceUrl)
  const lines = result.text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const events = []
  let currentDay = null
  let hasStartedCurrentMonth = false

  for (const line of lines) {
    if (/^\d{1,2}$/.test(line)) {
      const day = Number(line)
      if (day === 1) {
        hasStartedCurrentMonth = true
      }
      if (hasStartedCurrentMonth) {
        currentDay = day
      }
      continue
    }

    if (!hasStartedCurrentMonth || currentDay === null) {
      continue
    }

    const parsed = parsePdfLine(line)
    if (!parsed) {
      continue
    }

    const start = scheduleDateTime(year, month, currentDay, parsed.start)
    let end = scheduleDateTime(year, month, currentDay, parsed.end)
    if (end.isBefore(start)) {
      end = end.add(1, 'day')
    }

    const id = `${source.id}-${start.valueOf()}-${parsed.code}`
    events.push({
      id,
      title: parsed.title,
      type: parsed.code,
      rink: source.rink,
      location: source.location,
      city: source.city,
      start: start.toISOString(),
      end: end.toISOString(),
      sourceUrl: source.pageUrl,
      sourceType: 'QuickScores PDF',
    })
  }

  // Deduplicate by event id (same rink + timestamp + type)
  const deduped = new Map()
  for (const event of events) {
    if (!deduped.has(event.id)) {
      deduped.set(event.id, event)
    }
  }
  return Array.from(deduped.values())
}

function peaksSessionType(summary) {
  const s = (summary || '').toLowerCase().trim()
  if (!s) {
    return null
  }
  if (
    /\bstick\s*time\b|\bsticktime\b|(?:sp|stick)\s*[&:x]\s*puck\b|puck\s*[&:x]\s*stick\b|stick\s*(?:session|skills)\b/.test(
      s,
    )
  ) {
    return 'SP'
  }
  if (/\badult\s+public\s+skate\b|\bpublic\s+skate\b/.test(s)) {
    return 'PS'
  }
  if (/\bbroom\s*ball\b|\bcollege\s+night\b|\bdrop\s*-?\s*in\b|\bopen\s+hockey\b/.test(s)) {
    return 'DI'
  }
  return null
}

async function loadIcsFromUrl(calendarUrl) {
  return ical.async.fromURL(calendarUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}

async function fetchPeaksIceArenaEvents() {
  const now = dayjs().subtract(2, 'day').toDate()
  const calendarUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(
    PEAKS_GOOGLE_CALENDAR_ID,
  )}/public/basic.ics`
  const data = await loadIcsFromUrl(calendarUrl)

  const allEvents = []
  for (const item of Object.values(data)) {
    if (!item || item.type !== 'VEVENT' || !(item.start instanceof Date)) {
      continue
    }

    const title = String(item.summary || '').trim()
    const mappedType = peaksSessionType(title)
    if (!mappedType || item.start < now) {
      continue
    }

    const end =
      item.end instanceof Date ? item.end : dayjs(item.start).add(1.5, 'hour').toDate()

    const loc = typeof item.location === 'string' && item.location.trim() ? item.location : 'Peaks Ice Arena'

    allEvents.push({
      id: `peaks-${item.uid || item.start.getTime()}-${title}-${mappedType}`,
      title,
      type: mappedType,
      rink: 'Peaks Ice Arena',
      location: loc,
      city: 'Provo',
      start: item.start.toISOString(),
      end: end.toISOString(),
      sourceUrl: 'https://www.provo.gov/394/Peaks-Ice-Arena',
      sourceType: 'Google Calendar · Peaks Ice Arena',
    })
  }

  const deduped = new Map()
  for (const event of allEvents) {
    const key = `${event.title}-${event.start}-${event.location}`
    if (!deduped.has(key)) {
      deduped.set(key, event)
    }
  }
  return Array.from(deduped.values())
}

async function fetchWeberEvents() {
  const now = dayjs().subtract(2, 'day').toDate()
  const allEvents = []

  for (const calendarId of WEBER_CALENDARS) {
    const calendarUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(
      calendarId,
    )}/public/basic.ics`
    const data = await loadIcsFromUrl(calendarUrl)

    for (const item of Object.values(data)) {
      if (!item || item.type !== 'VEVENT' || !(item.start instanceof Date)) {
        continue
      }

      const title = item.summary || ''
      if (!/stick|puck|drop in|open hockey/i.test(title)) {
        continue
      }
      if (item.start < now) {
        continue
      }

      const end = item.end instanceof Date ? item.end : dayjs(item.start).add(1, 'hour').toDate()

      allEvents.push({
        id: `weber-${item.uid || item.start.getTime()}-${title}`,
        title,
        type: /drop in/i.test(title) ? 'DI' : 'SP',
        rink: 'Weber County Ice Sheet',
        location: item.location || 'Weber County Ice Sheet',
        city: 'Ogden',
        start: item.start.toISOString(),
        end: end.toISOString(),
        sourceUrl: 'https://webercountyutah.gov/Ice_Sheet/calendar1.php',
        sourceType: 'Google Calendar',
      })
    }
  }

  const deduped = new Map()
  for (const event of allEvents) {
    const key = `${event.title}-${event.start}-${event.location}`
    if (!deduped.has(key)) {
      deduped.set(key, event)
    }
  }
  return Array.from(deduped.values())
}

/**
 * Fetch the QuickScores HTML downloads page and extract PDF hrefs whose URLs
 * match `urlSubstring`. Returns URLs in page order (newest-first on QS pages).
 *
 * @param {string} downloadsPageUrl
 * @param {string|RegExp} matcher  - tested against the absolute href
 * @param {number} [limit]
 */
async function scrapeQuickScoresPdfLinks(downloadsPageUrl, matcher, limit = 10) {
  const res = await fetchWithTimeout(downloadsPageUrl)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${downloadsPageUrl}`)
  const html = await res.text()

  // QuickScores renders hrefs as  href="https://www.quickscores.com/downloads/…"
  const HREF_RE = /href="(https?:\/\/www\.quickscores\.com\/downloads\/[^"]+\.pdf)"/gi
  const urls = []
  let m
  while ((m = HREF_RE.exec(html)) !== null && urls.length < limit) {
    if (typeof matcher === 'string' ? m[1].includes(matcher) : matcher.test(m[1])) {
      urls.push(m[1])
    }
  }
  return urls
}

/**
 * Parse the SL County adult-league master schedule PDF and return events
 * played at Sports Complex East (SLC-E) or West (SLC-W).
 *
 * PDF row format (space-separated, extracted by pdf-parse):
 *   DayName MonthName M/D/YYYY H:MM AM/PM RinkCode DivCode Teams…
 * e.g.  Monday May 5/4/2026 6:15 PM SLC-W D4 Flyers Buzz Light Beer
 */
async function fetchSportsComplexLeagueEvents() {
  // Dynamically find the current master schedule PDF from the downloads page.
  let pdfUrl = SC_LEAGUE_PDF_FALLBACK
  try {
    const found = await scrapeQuickScoresPdfLinks(
      SC_DOWNLOADS_PAGE,
      /Master.*Hockey.*Schedule.*\.pdf/i,
      1,
    )
    if (found.length > 0) pdfUrl = found[0]
  } catch {
    // fall through to fallback URL
  }

  const pdfRes = await fetchWithTimeout(pdfUrl)
  if (!pdfRes.ok) throw new Error(`HTTP ${pdfRes.status} fetching master schedule PDF`)

  const buffer = Buffer.from(await pdfRes.arrayBuffer())
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  await parser.destroy()

  const rawText = result.text

  // Match every game row that involves a Sports Complex rink.
  const GAME_RE =
    /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+\w+\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}:\d{2})\s+(AM|PM)\s+(SLC-E|SLC-W)\s+D\d+/gi

  const now = dayjs().subtract(2, 'day')
  const deduped = new Map()

  let m
  while ((m = GAME_RE.exec(rawText)) !== null) {
    const [, month, day, year, time, ampm, rinkCode] = m
    const clock = parseClock(time, ampm)
    const start = scheduleDateTime(Number(year), Number(month), Number(day), clock)
    if (start.isBefore(now)) continue

    const end = start.add(90, 'minute')
    const id = `sportscomplex-lg-${start.valueOf()}-${rinkCode}`
    if (deduped.has(id)) continue

    deduped.set(id, {
      id,
      title: 'Adult League Game',
      type: 'LG',
      rink: 'SLC Sports Complex',
      location: rinkCode === 'SLC-E' ? 'Sports Complex - East' : 'Sports Complex - West',
      city: 'Salt Lake City',
      start: start.toISOString(),
      end: end.toISOString(),
      sourceUrl: SC_DOWNLOADS_PAGE,
      sourceType: 'QuickScores League Schedule PDF',
    })
  }

  return Array.from(deduped.values())
}

/**
 * Discover the most-recent SPDI (Stick & Puck / Drop-In) weekly PDFs posted
 * by the Sports Complex on their own QuickScores org and parse them.  The
 * facility uploads these weekly; when they haven't uploaded recently the
 * connector simply returns an empty array rather than failing.
 */
async function fetchSportsComplexSpdiEvents() {
  let urls
  try {
    urls = await scrapeQuickScoresPdfLinks(SC_SPDI_DOWNLOADS_PAGE, /spdi|SPDI|sp_di/, 5)
  } catch (err) {
    logConnectorError('sportscomplex-spdi-discovery', err)
    return []
  }
  if (urls.length === 0) return []

  const allEvents = []
  for (const pdfUrl of urls) {
    try {
      const source = {
        id: 'sportscomplex-spdi',
        rink: 'SLC Sports Complex',
        city: 'Salt Lake City',
        location: 'SLC Sports Complex',
        sourceUrl: pdfUrl,
        pageUrl: SC_SPDI_DOWNLOADS_PAGE,
      }
      const events = await parsePdfSource(source)
      allEvents.push(...events)
    } catch (err) {
      logConnectorError(`sportscomplex-spdi ${pdfUrl}`, err)
    }
  }

  // Final dedup across all PDFs (different weeks may overlap)
  const deduped = new Map()
  for (const e of allEvents) {
    if (!deduped.has(e.id)) deduped.set(e.id, e)
  }
  return Array.from(deduped.values())
}

let eventsCache = { payload: null, expiresAt: 0 }

async function buildEventsPayload() {
  const connectorErrors = []

  const [weberResult, peaksResult, scLeagueResult, scSpdiResult, ...pdfResults] =
    await Promise.allSettled([
      fetchWeberEvents(),
      fetchPeaksIceArenaEvents(),
      fetchSportsComplexLeagueEvents(),
      fetchSportsComplexSpdiEvents(),
      ...PDF_SOURCES.map((source) => parsePdfSource(source)),
    ])

  let events = []
  if (weberResult.status === 'fulfilled') {
    events = events.concat(weberResult.value)
  } else {
    connectorErrors.push(safeConnectorMessage('Weber County Ice Sheet', weberResult.reason))
  }

  if (peaksResult.status === 'fulfilled') {
    events = events.concat(peaksResult.value)
  } else {
    connectorErrors.push(safeConnectorMessage('Peaks Ice Arena', peaksResult.reason))
  }

  if (scLeagueResult.status === 'fulfilled') {
    events = events.concat(scLeagueResult.value)
  } else {
    connectorErrors.push(safeConnectorMessage('SLC Sports Complex (league)', scLeagueResult.reason))
  }

  // SPDI connector is best-effort; silence individual PDF errors (already logged)
  if (scSpdiResult.status === 'fulfilled') {
    events = events.concat(scSpdiResult.value)
  }

  pdfResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      events = events.concat(result.value)
    } else {
      connectorErrors.push(safeConnectorMessage(PDF_SOURCES[index].rink, result.reason))
    }
  })

  events.sort((a, b) => new Date(a.start).valueOf() - new Date(b.start).valueOf())

  return {
    generatedAt: new Date().toISOString(),
    connectorErrors,
    sourceStatus: SOURCE_STATUS,
    events,
  }
}

app.get('/api/events', async (_req, res) => {
  try {
    const now = Date.now()
    if (eventsCache.payload && now < eventsCache.expiresAt) {
      res.set('X-Cache', 'HIT')
      res.json(eventsCache.payload)
      return
    }

    const payload = await buildEventsPayload()
    eventsCache = { payload, expiresAt: now + CACHE_TTL_MS }
    res.set('X-Cache', 'MISS')
    res.json(payload)
  } catch (err) {
    logConnectorError('api/events', err)
    res.status(500).json({
      error: 'Aggregation failed',
      message: 'Could not build schedule response.',
    })
  }
})

const distDir = path.join(__dirname, 'dist')
if (isProd) {
  // Long-cache for hashed Vite assets (filename contains content hash)
  app.use(
    '/assets',
    express.static(path.join(distDir, 'assets'), {
      immutable: true,
      maxAge: '1y',
    }),
  )
  // Everything else in dist — no cache (index.html must always revalidate)
  app.use(express.static(distDir, { maxAge: 0 }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    if (req.path.startsWith('/api')) {
      next()
      return
    }
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  const mode = isProd ? 'production (API + static)' : 'API only'
  console.log(`Server (${mode}) listening on http://localhost:${PORT}`)
})
