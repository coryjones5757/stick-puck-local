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
 * @param {string} prefix  e.g. "Ice Sheet" or "Acord Ice Center"
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

/**
 * Ice Sheet hockey stick & puck / drop-in feeds (same two layers embedded on
 * https://webercountyutah.gov/Ice_Sheet/calendar1.php ). Other site embeds
 * cover figure skating, LTS, etc. and are omitted here.
 */
const WEBER_CALENDARS = [
  'ij2irhmpcuc3cukj6lkv03a3hk@group.calendar.google.com',
  'p42ti0cvnajjhf2arev2caoe50@group.calendar.google.com',
]

/** Peaks Ice Arena embed uses this public Google Calendar (Public Skate, College Night, Broom Ball). */
const PEAKS_GOOGLE_CALENDAR_ID =
  '164152767ee3832a8d7b63ff9d8a3f9f09786f43ce23d00d3c2ed7b3a13b97df@group.calendar.google.com'

/**
 * QuickScores monthly PDFs — URLs are discovered from `pageUrl` (no manual monthly edits).
 * Optional env overrides: ACORD_QUICKSCORES_PDF_URL, COUNTY_QUICKSCORES_PDF_URL
 */
const PDF_SOURCES = [
  {
    id: 'acord',
    rink: 'Acord Ice Center',
    city: 'West Valley City',
    location: 'Acord Ice Center',
    pageUrl:
      'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=15150&OrgDir=slchockey',
    /** Only follow schedule PDFs whose path contains this (avoids help/docs links on same page). */
    pdfHrefMustInclude: 'Stick_and_Puck__Drop_In_Hockey__Schedule',
    fixedPdfUrl: process.env.ACORD_QUICKSCORES_PDF_URL || '',
  },
  {
    id: 'county',
    rink: 'County Ice Center',
    city: 'Murray',
    location: 'County Ice Center',
    pageUrl:
      'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=15151&OrgDir=slchockey',
    pdfHrefMustInclude: 'County_Ice_Center',
    fixedPdfUrl: process.env.COUNTY_QUICKSCORES_PDF_URL || '',
  },
]

const QUICKSCORES_PDF_DISCOVERY_TTL_MS = Number(
  process.env.QUICKSCORES_PDF_DISCOVERY_TTL_MS || 60 * 60 * 1000,
)

/** @type {Map<string, { url: string, expiresAt: number }>} */
const quickscoresPdfUrlCache = new Map()

const MONTH_TOKEN_TO_NUM = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
}

function monthNumFromNameToken(token) {
  if (!token) {
    return null
  }
  const key = token.toLowerCase()
  return MONTH_TOKEN_TO_NUM[key] ?? MONTH_TOKEN_TO_NUM[key.slice(0, 3)] ?? null
}

/**
 * Infer calendar month/year from QuickScores download filenames (several naming styles).
 * @returns {{ month: number, year: number } | null}
 */
function calendarMonthYearFromPdfFilename(filename) {
  const base = (filename.split(/[/?#]/).pop() || filename).split('?')[0] || filename
  let m = base.match(/Schedule_([A-Za-z]+)_(20\d{2})/i)
  if (m) {
    const month = monthNumFromNameToken(m[1])
    const year = Number(m[2])
    if (month && year) {
      return { month, year }
    }
  }
  m = base.match(/_(20\d{2})_([A-Za-z]{3,12})(?:_|\.|$)/i)
  if (m) {
    const year = Number(m[1])
    const month = monthNumFromNameToken(m[2])
    if (month && year) {
      return { month, year }
    }
  }
  return null
}

function scoreCalendarMy(c) {
  return c.year * 12 + c.month
}

/**
 * @param {string} html
 * @param {string} pageUrl
 * @returns {string[]}
 */
function extractPdfHrefsFromHtml(html, pageUrl) {
  const out = new Set()
  const re = /\bhref\s*=\s*["']([^"']+\.pdf)["']/gi
  let m
  while ((m = re.exec(html)) !== null) {
    let href = m[1].trim()
    if (href.startsWith('/')) {
      try {
        href = new URL(href, new URL(pageUrl).origin).href
      } catch {
        continue
      }
    }
    if (!/^https?:\/\//i.test(href)) {
      continue
    }
    const lower = href.toLowerCase()
    if (!lower.includes('quickscores.com') || !lower.includes('/downloads/')) {
      continue
    }
    out.add(href.split('#')[0])
  }
  return [...out]
}

/**
 * @param {typeof PDF_SOURCES[number]} source
 * @returns {Promise<string>}
 */
async function discoverLatestQuickscoresPdfUrl(source) {
  const res = await fetchWithTimeout(source.pageUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (compatible; SaltyPuck/1.0; +https://saltypuck.com; schedule bot)',
    },
  })
  if (!res.ok) {
    throw new Error(`QuickScores page HTTP ${res.status}`)
  }
  const html = await res.text()
  const hrefs = extractPdfHrefsFromHtml(html, source.pageUrl)
  const needle = source.pdfHrefMustInclude.toLowerCase()
  const candidates = hrefs
    .filter((h) => h.toLowerCase().includes(needle))
    .map((url) => {
      const part = url.split('/').pop() || url
      const my = calendarMonthYearFromPdfFilename(part)
      return { url, my, sort: my ? scoreCalendarMy(my) : -1 }
    })
    .filter((c) => c.sort >= 0)

  if (candidates.length === 0) {
    throw new Error(`No schedule PDF links matched "${source.pdfHrefMustInclude}" on QuickScores page`)
  }
  candidates.sort((a, b) => b.sort - a.sort)
  return candidates[0].url
}

/**
 * @param {typeof PDF_SOURCES[number]} source
 */
async function resolveQuickscoresPdfUrl(source) {
  const fixed = source.fixedPdfUrl?.trim()
  if (fixed) {
    return fixed
  }
  const now = Date.now()
  const hit = quickscoresPdfUrlCache.get(source.id)
  if (hit && now < hit.expiresAt) {
    return hit.url
  }
  const url = await discoverLatestQuickscoresPdfUrl(source)
  quickscoresPdfUrlCache.set(source.id, { url, expiresAt: now + QUICKSCORES_PDF_DISCOVERY_TTL_MS })
  return url
}

/** County facility page URL used for "official source" links (Amilia embed + schedule). */
const SLCO_STEINER_PAGE =
  'https://www.saltlakecounty.gov/parks-recreation/facilities-and-golf/ice-centers/slc-sports-complex-ice/#activities'

const SLCO_AMILIA_PROXY_URL =
  process.env.SLCO_AMILIA_PROXY_URL ||
  'https://www.saltlakecounty.gov/api/proxy/AmiliaConnection/GetSchedulesByCenter'
const SLCO_AMILIA_CENTER_ID = process.env.SLCO_AMILIA_CENTER_ID || 'slc-sports-complex'
/** Location IDs from the county page embed (PRAmilia-Schedule.js / fetchSchedules). */
const SLCO_AMILIA_LOC_IDS = process.env.SLCO_AMILIA_LOC_IDS || '2451775,2451994'

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
    name: 'Ice Sheet',
    status: 'live',
    detail: 'Weber County Ice Sheet — live parsed from public Google Calendar feeds',
    url: 'https://webercountyutah.gov/Ice_Sheet/calendar1.php',
  },
  {
    id: 'acord',
    name: 'Acord Ice Center',
    status: 'live',
    detail:
      'Latest monthly PDF auto-picked from QuickScores (same links as the facility page); confirm on site before you travel.',
    url: 'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=15150&OrgDir=slchockey',
  },
  {
    id: 'county',
    name: 'County Ice Center',
    status: 'live',
    detail:
      'Latest monthly PDF auto-picked from QuickScores (same links as the facility page); confirm on site before you travel.',
    url: 'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=15151&OrgDir=slchockey',
  },
  {
    id: 'steiner',
    name: 'Steiner',
    status: 'live',
    detail:
      'Stick & Puck, Drop-In, and public skate from the county Amilia schedule API (same data as the facility page; skater/coach/goalie registration rows are merged per session).',
    url: SLCO_STEINER_PAGE,
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
}

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

/** QuickScores calendar grids often extract as "14 15" (two day columns on one row). */
function parsePdfMultiDayHeader(line) {
  const m = line.match(/^(\d{1,2})(?:\s+(\d{1,2}))+$/)
  if (!m) {
    return null
  }
  return line.trim().split(/\s+/).map(Number)
}

/**
 * QuickScores sometimes emits "14 15" then **all** session lines for the row in one column
 * (left cell empty in the PDF). An even 2+2 split wrongly puts morning SP on Thursday.
 * When the block matches the usual **Friday** shape (2× morning SP, evening SP, DI),
 * attach every line to the **second** day only.
 */
function shouldAssignTwoDayFourRowToLastDayOnly(days, rows) {
  if (days.length !== 2 || rows.length !== 4) {
    return false
  }
  if (days[1] !== days[0] + 1) {
    return false
  }
  const [a, b, c, d] = rows
  if (a.code !== 'SP' || b.code !== 'SP' || c.code !== 'SP' || d.code !== 'DI') {
    return false
  }
  // Third row is afternoon/evening (e.g. 6:30pm stick & puck), not another morning slot
  if (c.start.hour < 12) {
    return false
  }
  return true
}

/**
 * Split stacked session lines after a multi-day header across those days.
 * PDF column order is usually left column then right; equal splits map evenly when both
 * cells have similar line counts — see shouldAssignTwoDayFourRowToLastDayOnly for exceptions.
 */
function flushPdfMultiDayBuffer(multiDayBuffer, year, month, source, events) {
  if (!multiDayBuffer || multiDayBuffer.rows.length === 0) {
    return
  }
  const days = multiDayBuffer.days
  const rows = multiDayBuffer.rows
  const n = days.length
  const m = rows.length

  if (shouldAssignTwoDayFourRowToLastDayOnly(days, rows)) {
    for (const parsed of rows) {
      pushQuickscoresPdfEvent(events, source, year, month, days[1], parsed)
    }
    return
  }

  const chunkSizes = Array(n).fill(Math.floor(m / n))
  const rem = m % n
  for (let i = 0; i < rem; i++) {
    chunkSizes[n - 1 - i] += 1
  }
  let offset = 0
  for (let i = 0; i < n; i++) {
    const take = chunkSizes[i]
    for (const parsed of rows.slice(offset, offset + take)) {
      pushQuickscoresPdfEvent(events, source, year, month, days[i], parsed)
    }
    offset += take
  }
}

function pushQuickscoresPdfEvent(events, source, year, month, day, parsed) {
  const start = scheduleDateTime(year, month, day, parsed.start)
  let end = scheduleDateTime(year, month, day, parsed.end)
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

async function parsePdfSource(source) {
  const pdfUrl = await resolveQuickscoresPdfUrl(source)
  const response = await fetchWithTimeout(pdfUrl)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const parser = new PDFParse({ data: buffer })
  const result = await parser.getText()
  await parser.destroy()

  const { month, year } = parseMonthYear(result.text, pdfUrl)
  const lines = result.text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const events = []
  let currentDay = null
  let hasStartedCurrentMonth = false
  /** @type {{ days: number[], rows: ReturnType<typeof parsePdfLine>[] } | null} */
  let multiDayBuffer = null

  for (const line of lines) {
    if (/^\d{1,2}$/.test(line)) {
      flushPdfMultiDayBuffer(multiDayBuffer, year, month, source, events)
      multiDayBuffer = null
      const day = Number(line)
      if (day === 1) {
        hasStartedCurrentMonth = true
      }
      if (hasStartedCurrentMonth) {
        currentDay = day
      }
      continue
    }

    const multiDays = parsePdfMultiDayHeader(line)
    if (multiDays) {
      flushPdfMultiDayBuffer(multiDayBuffer, year, month, source, events)
      multiDayBuffer = { days: multiDays, rows: [] }
      continue
    }

    const parsed = parsePdfLine(line)
    if (parsed) {
      if (multiDayBuffer) {
        multiDayBuffer.rows.push(parsed)
      } else if (hasStartedCurrentMonth && currentDay !== null) {
        pushQuickscoresPdfEvent(events, source, year, month, currentDay, parsed)
      }
      continue
    }

    flushPdfMultiDayBuffer(multiDayBuffer, year, month, source, events)
    multiDayBuffer = null
  }

  flushPdfMultiDayBuffer(multiDayBuffer, year, month, source, events)

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
    /\bstick\s*time\b|\bsticktime\b|\bstick\s+and\s+puck\b|(?:sp|stick)\s*[&:x]\s*puck\b|puck\s*[&:x]\s*stick\b|stick\s*(?:session|skills)\b|\bs\s*&\s*p\b/.test(
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

/** DATE-only / all-day ICS rows — if ingested as timed, they span whole days in week view. */
function isIcsDateOnlyVevent(item) {
  return item.datetype === 'date' || Boolean(item.start?.dateOnly)
}

/**
 * Clamp impossible durations from upstream calendars/PDFs so time-grid bars match real sessions.
 * @param {Record<string, unknown>} ev
 */
function sanitizeHockeyEventBounds(ev) {
  const start = dayjs(ev.start)
  if (!start.isValid()) {
    return ev
  }
  let end = dayjs(ev.end)
  if (!end.isValid()) {
    const hours = ev.type === 'PS' ? 2 : 1.5
    return { ...ev, end: start.add(hours, 'hour').toISOString() }
  }
  const durMin = end.diff(start, 'minute')
  if (durMin <= 0) {
    const hours = ev.type === 'PS' ? 2 : 1.25
    return { ...ev, end: start.add(hours, 'hour').toISOString() }
  }
  const maxMinutesByType =
    ev.type === 'PS'
      ? 12 * 60
      : ev.type === 'SP' || ev.type === 'DI'
        ? 6 * 60
        : 10 * 60
  if (durMin > maxMinutesByType) {
    return { ...ev, end: start.add(maxMinutesByType, 'minute').toISOString() }
  }
  return ev
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
    if (isIcsDateOnlyVevent(item)) {
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

  const calendarResults = await Promise.all(
    WEBER_CALENDARS.map((calendarId) => {
      const calendarUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(
        calendarId,
      )}/public/basic.ics`
      return loadIcsFromUrl(calendarUrl)
    }),
  )

  for (const data of calendarResults) {
    for (const item of Object.values(data)) {
      if (!item || item.type !== 'VEVENT' || !(item.start instanceof Date)) {
        continue
      }
      if (isIcsDateOnlyVevent(item)) {
        continue
      }

      const title = String(item.summary || '').trim()
      const mappedType = peaksSessionType(title)
      if (!mappedType || mappedType === 'PS' || item.start < now) {
        continue
      }

      const end =
        item.end instanceof Date ? item.end : dayjs(item.start).add(1.5, 'hour').toDate()

      allEvents.push({
        id: `weber-${item.uid || item.start.getTime()}-${title}`,
        title,
        type: mappedType,
        rink: 'Ice Sheet',
        location: item.location || 'Ice Sheet',
        city: 'Ogden',
        start: item.start.toISOString(),
        end: end.toISOString(),
        sourceUrl: 'https://webercountyutah.gov/Ice_Sheet/calendar1.php',
        sourceType: 'Google Calendar · Ice Sheet',
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
 * Map Amilia schedule rows from the county proxy to SP / DI / PS, or null to skip.
 * @param {Record<string, unknown>} item
 * @returns {'SP' | 'DI' | 'PS' | null}
 */
function classifySportsComplexAmiliaSession(item) {
  const type = String(item.Type || '')
  if (type === 'RentalContract') {
    return null
  }
  const cat = String(item.Category || '')
  const sub = String(item.SubCategory || '')
  const title = String(item.Title || '')
  if (cat === 'Public Skate') {
    return 'PS'
  }
  if (sub.includes('Drop In Hockey') || title.includes('Drop In Hockey')) {
    return 'DI'
  }
  if (title.includes('Stick & Puck')) {
    return 'SP'
  }
  return null
}

/**
 * Public skate / stick & puck / drop-in for Steiner from the same
 * Salt Lake County → Amilia JSON proxy the facility page uses (see
 * PRAmilia-Schedule.js: GetSchedulesByCenter with Filter "").
 */
async function fetchSportsComplexCommunityIceEvents() {
  const response = await fetchWithTimeout(SLCO_AMILIA_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      ID: SLCO_AMILIA_CENTER_ID,
      LocId: SLCO_AMILIA_LOC_IDS,
      SelectDate: '',
      Filter: '',
    }),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const data = await response.json()
  if (!Array.isArray(data)) {
    throw new Error('Unexpected Amilia schedule response')
  }

  const now = dayjs().subtract(2, 'day')
  const deduped = new Map()

  for (const item of data) {
    const code = classifySportsComplexAmiliaSession(item)
    if (!code) {
      continue
    }

    const start = new Date(item.StartTime)
    const end = new Date(item.EndTime)
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) {
      continue
    }
    if (!(end instanceof Date) || Number.isNaN(end.getTime())) {
      continue
    }
    if (start < now.toDate()) {
      continue
    }

    const slotKey = `${code}-${start.toISOString()}-${end.toISOString()}`
    if (deduped.has(slotKey)) {
      continue
    }

    const loc =
      typeof item.Location === 'string' && item.Location.trim()
        ? item.Location.trim()
        : 'Steiner'

    deduped.set(slotKey, {
      id: `steiner-amilia-${code}-${start.getTime()}`,
      title: PROGRAM_BY_CODE[code] || code,
      type: code,
      rink: 'Steiner',
      location: loc,
      city: 'Salt Lake City',
      start: start.toISOString(),
      end: end.toISOString(),
      sourceUrl: SLCO_STEINER_PAGE,
      sourceType: 'Salt Lake County · Amilia schedule',
    })
  }

  return Array.from(deduped.values())
}

let eventsCache = { payload: null, expiresAt: 0 }

async function buildEventsPayload() {
  const connectorErrors = []

  const [weberResult, peaksResult, scCommunityResult, ...pdfResults] = await Promise.allSettled([
    fetchWeberEvents(),
    fetchPeaksIceArenaEvents(),
    fetchSportsComplexCommunityIceEvents(),
    ...PDF_SOURCES.map((source) => parsePdfSource(source)),
  ])

  let events = []
  if (weberResult.status === 'fulfilled') {
    events = events.concat(weberResult.value)
  } else {
    connectorErrors.push(safeConnectorMessage('Ice Sheet', weberResult.reason))
  }

  if (peaksResult.status === 'fulfilled') {
    events = events.concat(peaksResult.value)
  } else {
    connectorErrors.push(safeConnectorMessage('Peaks Ice Arena', peaksResult.reason))
  }

  if (scCommunityResult.status === 'fulfilled') {
    events = events.concat(scCommunityResult.value)
  } else {
    connectorErrors.push(safeConnectorMessage('Steiner', scCommunityResult.reason))
  }

  pdfResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      events = events.concat(result.value)
    } else {
      connectorErrors.push(safeConnectorMessage(PDF_SOURCES[index].rink, result.reason))
    }
  })

  events = events.map(sanitizeHockeyEventBounds)
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
