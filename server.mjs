import path from 'node:path'
import fs from 'node:fs'
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

/**
 * When `process.env[envKey]` is a non-empty Google Calendar ID (…@group.calendar.google.com),
 * that feed is merged using the same ICS path as Peaks/Weber. Empty env → skipped (no error).
 * @type {ReadonlyArray<{
 *   envKey: string
 *   rink: string
 *   city: string
 *   locationDefault: string
 *   sourceUrl: string
 *   sourceTypeLabel: string
 *   idPrefix: string
 *   skipPublicSkate?: boolean
 *   compactEventIds?: boolean
 *   useExpandedTitleMatching?: boolean
 * }>}
 */
const OPTIONAL_ICS_SOURCES = [
  {
    envKey: 'SALTYPUCK_PARKCITY_ICS_CALENDAR_ID',
    rink: 'Park City Ice Arena',
    city: 'Park City',
    locationDefault: 'Park City Ice Arena',
    sourceUrl: 'https://www.parkcity.org/departments/recreation/park-city-ice-arena',
    sourceTypeLabel: 'Google Calendar · Park City Ice Arena',
    idPrefix: 'parkcity',
    skipPublicSkate: false,
    compactEventIds: false,
    useExpandedTitleMatching: true,
  },
  {
    envKey: 'SALTYPUCK_UTAH_OLYMPIC_OVAL_ICS_CALENDAR_ID',
    rink: 'Utah Olympic Oval',
    city: 'Kearns',
    locationDefault: 'Utah Olympic Oval',
    sourceUrl: 'https://utaholympiclegacy.org/oval/',
    sourceTypeLabel: 'Google Calendar · Utah Olympic Oval',
    idPrefix: 'oval',
    skipPublicSkate: false,
    compactEventIds: false,
    useExpandedTitleMatching: true,
  },
  {
    envKey: 'SALTYPUCK_ECCLES_ICS_CALENDAR_ID',
    rink: 'Eccles Ice Center',
    city: 'Logan',
    locationDefault: 'George S. Eccles Ice Center',
    sourceUrl: 'https://www.ecclesice.com/',
    sourceTypeLabel: 'Google Calendar · Eccles Ice Center',
    idPrefix: 'eccles',
    skipPublicSkate: false,
    compactEventIds: false,
    useExpandedTitleMatching: true,
  },
  {
    envKey: 'SALTYPUCK_UTAH_MAMMOTH_ICS_CALENDAR_ID',
    rink: 'Utah Mammoth Ice Center',
    city: 'Sandy',
    locationDefault: 'Utah Mammoth Ice Center',
    sourceUrl: 'https://www.mammothicecenter.com/',
    sourceTypeLabel: 'Google Calendar · Utah Mammoth Ice Center',
    idPrefix: 'mammoth',
    skipPublicSkate: false,
    compactEventIds: false,
    useExpandedTitleMatching: true,
  },
  {
    envKey: 'SALTYPUCK_COTTONWOOD_HEIGHTS_ICS_CALENDAR_ID',
    rink: 'Cottonwood Heights Ice Arena',
    city: 'Cottonwood Heights',
    locationDefault: 'Cottonwood Heights Ice Arena',
    sourceUrl: 'https://www.chparksandrecut.gov/ice-arena',
    sourceTypeLabel: 'Google Calendar · Cottonwood Heights Ice Arena',
    idPrefix: 'cottonwood',
    skipPublicSkate: false,
    compactEventIds: false,
    useExpandedTitleMatching: true,
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

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function formatCalendarMonthYear(month, year) {
  if (!month || !year || month < 1 || month > 12) {
    return null
  }
  return `${MONTH_NAMES[month - 1]} ${year}`
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

const PDF_CHECK_STATE_PATH = (process.env.SALTYPUCK_PDF_CHECK_STATE_PATH || '').trim()
const PDF_CHECK_TOKEN = (process.env.SALTYPUCK_PDF_CHECK_TOKEN || '').trim()

/**
 * All QuickScores schedule PDF links matching this source (newest calendar month first).
 * @param {typeof PDF_SOURCES[number]} source
 * @returns {Promise<Array<{ url: string, filename: string, calendarMonth: number, calendarYear: number, sort: number }>>}
 */
async function listQuickscoresPdfCandidates(source) {
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
      const filename = url.split('/').pop() || url
      const my = calendarMonthYearFromPdfFilename(filename)
      return {
        url,
        filename,
        calendarMonth: my?.month ?? null,
        calendarYear: my?.year ?? null,
        sort: my ? scoreCalendarMy(my) : -1,
      }
    })
    .filter((c) => c.sort >= 0 && c.calendarMonth != null && c.calendarYear != null)

  candidates.sort((a, b) => b.sort - a.sort)
  return candidates
}

/**
 * @param {typeof PDF_SOURCES[number]} source
 * @returns {Promise<string>}
 */
async function discoverLatestQuickscoresPdfUrl(source) {
  const candidates = await listQuickscoresPdfCandidates(source)
  if (candidates.length === 0) {
    throw new Error(`No schedule PDF links matched "${source.pdfHrefMustInclude}" on QuickScores page`)
  }
  return candidates[0].url
}

function readPdfCheckState() {
  if (!PDF_CHECK_STATE_PATH) {
    return {}
  }
  try {
    if (!fs.existsSync(PDF_CHECK_STATE_PATH)) {
      return {}
    }
    const raw = fs.readFileSync(PDF_CHECK_STATE_PATH, 'utf8')
    const data = JSON.parse(raw)
    return data && typeof data === 'object' ? data : {}
  } catch (err) {
    logConnectorError('pdf-check-state read', err)
    return {}
  }
}

function writePdfCheckState(state) {
  if (!PDF_CHECK_STATE_PATH) {
    return
  }
  const dir = path.dirname(PDF_CHECK_STATE_PATH)
  if (dir && dir !== '.') {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(PDF_CHECK_STATE_PATH, JSON.stringify(state, null, 2), 'utf8')
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

/** BondSports public schedule API for Utah Mammoth Ice Center (Sandy). */
const MAMMOTH_BONDSPORTS_URL =
  process.env.MAMMOTH_BONDSPORTS_URL ||
  'https://schedule.bondsports.co/api/schedule/utah-mammoth-schedule'

/**
 * Classify a BondSports slot title / programName into SP | DI | PS, or null to skip.
 * @param {string} title
 * @param {string} programName
 * @returns {'SP' | 'DI' | 'PS' | null}
 */
function classifyMammothSlot(title, programName) {
  const combined = `${title} ${programName}`.toLowerCase()
  if (/\bstick\s*[&n']\s*puck\b|\bsticktime\b|\bstick\s+time\b/.test(combined)) {
    return 'SP'
  }
  if (/\bdrop[\s-]?in\b|\bopen\s+hockey\b/.test(combined)) {
    return 'DI'
  }
  if (/\bpublic\s+skat|\bpublic\s+session\b|\bopen\s+skat/.test(combined)) {
    return 'PS'
  }
  return null
}

/**
 * Fetch stick & puck / drop-in / public skate from the Utah Mammoth BondSports schedule API.
 * The endpoint is the same JSON that powers the iframe on mammothicecenter.com/our-calendar.
 */
async function fetchMammothEvents() {
  const response = await fetchWithTimeout(MAMMOTH_BONDSPORTS_URL, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  const data = await response.json()
  const slots = Array.isArray(data.slots) ? data.slots : []
  const now = dayjs().subtract(2, 'day').toDate()
  const events = []

  for (const slot of slots) {
    if (slot.slotType === 'maintenance') continue
    if (slot.event?.private === true) continue

    const code = classifyMammothSlot(String(slot.title || ''), String(slot.programName || ''))
    if (!code) continue

    // event.startDate / endDate are UTC ISO strings from the API
    const start = slot.event?.startDate ? new Date(slot.event.startDate) : null
    const end = slot.event?.endDate ? new Date(slot.event.endDate) : null
    if (!start || Number.isNaN(start.getTime())) continue
    if (start < now) continue

    const endDate = end && !Number.isNaN(end.getTime()) ? end : dayjs(start).add(code === 'PS' ? 2 : 1.5, 'hour').toDate()
    const spaceName = typeof slot.spaceName === 'string' && slot.spaceName.trim()
      ? slot.spaceName.trim()
      : 'Utah Mammoth Ice Center'

    events.push({
      id: `mammoth-bs-${slot.id}`,
      title: String(slot.title || slot.programName || '').trim(),
      type: code,
      rink: 'Utah Mammoth Ice Center',
      location: spaceName,
      city: 'Sandy',
      start: start.toISOString(),
      end: endDate.toISOString(),
      sourceUrl: 'https://www.mammothicecenter.com/our-calendar',
      sourceType: 'BondSports · Utah Mammoth Ice Center',
    })
  }

  return events
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
    id: 'cottonwoodHeights',
    name: 'Cottonwood Heights Ice Arena',
    status: 'partial',
    detail:
      'Events are generated from the published school-year recurring schedule (Mon/Wed 5:30 AM, Tue 11:30 AM & 12:30 PM). No live API — times are marked "est." in the app. Always verify at chparksandrecut.gov/stick-n-puck before you travel.',
    url: 'https://www.chparksandrecut.gov/stick-n-puck',
  },
  {
    id: 'eccles',
    name: 'Eccles Ice Center',
    status: 'partial',
    detail:
      'USU Logan facility — listed on the map and filters. Wire optional Google Calendar ICS via env if you publish or embed a feed.',
    url: 'https://www.ecclesice.com/',
  },
  {
    id: 'weber',
    name: 'Ice Sheet',
    status: 'live',
    detail:
      'Weber County Ice Sheet — stick & puck / drop-in parsed from public Google Calendar feeds used on the facility calendar page.',
    url: 'https://webercountyutah.gov/Ice_Sheet/calendar1.php',
  },
  {
    id: 'parkcity',
    name: 'Park City Ice Arena',
    status: 'manual',
    detail:
      'Facility runs on DaySmart/DASH; no simple public ICS discovered. Optional env can supply a Google Calendar group ID if you mirror events.',
    url: 'https://www.parkcity.org/departments/recreation/park-city-ice-arena',
  },
  {
    id: 'peaks',
    name: 'Peaks Ice Arena',
    status: 'live',
    detail:
      "Facility schedule from Peaks Ice Arena's embedded public Google Calendar. Stick-time blocks may only appear if the rink adds them to this feed.",
    url: 'https://www.provo.gov/394/Peaks-Ice-Arena',
  },
  {
    id: 'slcSportsComplex',
    name: 'SLC Sports Complex',
    status: 'live',
    detail:
      'Stick & puck, drop-in, and public skate from the Salt Lake County Amilia schedule API (same data as the facility page; merged registration rows per session).',
    url: SLCO_STEINER_PAGE,
  },
  {
    id: 'southdavis',
    name: 'South Davis / Bountiful',
    status: 'manual',
    detail: 'Posts schedule updates on website and social — check the official rink page before you travel.',
    url: 'https://www.southdavisrecreation.gov/ice-rink',
  },
  {
    id: 'utahMammoth',
    name: 'Utah Mammoth Ice Center',
    status: 'live',
    detail:
      'Stick & Puck, Drop-In, and Public Skate from the BondSports schedule API that powers mammothicecenter.com/our-calendar.',
    url: 'https://www.mammothicecenter.com/our-calendar',
  },
  {
    id: 'utahOlympicOval',
    name: 'Utah Olympic Oval',
    status: 'partial',
    detail:
      'Kearns Oval — listed on the map and filters. Complex programming mix; optional ICS env supported when you have a calendar mirror.',
    url: 'https://utaholympiclegacy.org/oval/',
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

/** Extra title patterns for optional ICS feeds (Dash exports, local wording). */
function expandedSessionType(summary) {
  const base = peaksSessionType(summary)
  if (base) {
    return base
  }
  const s = (summary || '').toLowerCase().trim()
  // Eccles / local wording: "Stick 'n Shoot", "Stick-n-Shoot", "Stick and Shoot", etc.
  if (
    /\bstick(?:\s*['']?\s*n|\s+n|-\s*n|\s+and)[-\s]+shoot\b|\bshoot\s*&\s*puck\b|\bhockey\s+stick\b|\bstick\s+puck\b/.test(
      s,
    )
  ) {
    return 'SP'
  }
  if (/\bpublic\s+session\b|\bopen\s+skate\b|\bfamily\s+skate\b|\bpublic\s+skating\b/.test(s)) {
    return 'PS'
  }
  return null
}

/**
 * @param {Record<string, import('node-ical').CalendarComponent>} data
 * @param {{
 *   rink: string
 *   city: string
 *   locationDefault: string
 *   sourceUrl: string
 *   sourceTypeLabel: string
 *   idPrefix: string
 *   skipPublicSkate?: boolean
 *   compactEventIds?: boolean
 *   useExpandedTitleMatching?: boolean
 * }} opts
 * @param {Date} nowCutoff
 */
function hockeyEventsFromIcsData(data, opts, nowCutoff) {
  const {
    rink,
    city,
    locationDefault,
    sourceUrl,
    sourceTypeLabel,
    idPrefix,
    skipPublicSkate = false,
    compactEventIds = false,
    useExpandedTitleMatching = false,
  } = opts
  const classify = useExpandedTitleMatching ? expandedSessionType : peaksSessionType
  const allEvents = []

  for (const item of Object.values(data)) {
    if (!item || item.type !== 'VEVENT' || !(item.start instanceof Date)) {
      continue
    }
    if (isIcsDateOnlyVevent(item)) {
      continue
    }

    const title = String(item.summary || '').trim()
    const mappedType = classify(title)
    if (!mappedType || item.start < nowCutoff) {
      continue
    }
    if (skipPublicSkate && mappedType === 'PS') {
      continue
    }

    const end =
      item.end instanceof Date ? item.end : dayjs(item.start).add(mappedType === 'PS' ? 2 : 1.5, 'hour').toDate()

    const loc =
      typeof item.location === 'string' && item.location.trim() ? item.location.trim() : locationDefault

    const id = compactEventIds
      ? `${idPrefix}-${item.uid || item.start.getTime()}-${title}`
      : `${idPrefix}-${item.uid || item.start.getTime()}-${title}-${mappedType}`

    allEvents.push({
      id,
      title,
      type: mappedType,
      rink,
      location: loc,
      city,
      start: item.start.toISOString(),
      end: end.toISOString(),
      sourceUrl,
      sourceType: sourceTypeLabel,
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

async function loadIcsFromUrl(calendarUrl) {
  return ical.async.fromURL(calendarUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
}

/**
 * @param {(typeof OPTIONAL_ICS_SOURCES)[number]} spec
 */
async function fetchOptionalIcsSource(spec) {
  const { envKey, ...opts } = spec
  const raw = process.env[envKey]
  const calendarId = typeof raw === 'string' ? raw.trim() : ''
  if (!calendarId) {
    return []
  }
  const calendarUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`
  const data = await loadIcsFromUrl(calendarUrl)
  const now = dayjs().subtract(2, 'day').toDate()
  return hockeyEventsFromIcsData(data, opts, now)
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
  return hockeyEventsFromIcsData(
    data,
    {
      rink: 'Peaks Ice Arena',
      city: 'Provo',
      locationDefault: 'Peaks Ice Arena',
      sourceUrl: 'https://www.provo.gov/394/Peaks-Ice-Arena',
      sourceTypeLabel: 'Google Calendar · Peaks Ice Arena',
      idPrefix: 'peaks',
      skipPublicSkate: false,
      compactEventIds: false,
      useExpandedTitleMatching: false,
    },
    now,
  )
}

async function fetchWeberEvents() {
  const now = dayjs().subtract(2, 'day').toDate()
  const merged = []

  const calendarResults = await Promise.all(
    WEBER_CALENDARS.map((calendarId) => {
      const calendarUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(
        calendarId,
      )}/public/basic.ics`
      return loadIcsFromUrl(calendarUrl)
    }),
  )

  for (const data of calendarResults) {
    merged.push(
      ...hockeyEventsFromIcsData(
        data,
        {
          rink: 'Ice Sheet',
          city: 'Ogden',
          locationDefault: 'Ice Sheet',
          sourceUrl: 'https://webercountyutah.gov/Ice_Sheet/calendar1.php',
          sourceTypeLabel: 'Google Calendar · Ice Sheet',
          idPrefix: 'weber',
          skipPublicSkate: true,
          compactEventIds: true,
          useExpandedTitleMatching: false,
        },
        now,
      ),
    )
  }

  const deduped = new Map()
  for (const event of merged) {
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
 * Public skate / stick & puck / drop-in for SLC Sports Complex ice sheets from the same
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
        : 'SLC Sports Complex'

    deduped.set(slotKey, {
      id: `slc-amilia-${code}-${start.getTime()}`,
      title: PROGRAM_BY_CODE[code] || code,
      type: code,
      rink: 'SLC Sports Complex',
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

/**
 * Generate Stick 'n Puck events for Cottonwood Heights Ice Arena from their
 * published recurring school-year schedule (approx. Sept 1 – June 1).
 *
 * Because this is derived from a static schedule page rather than a live API,
 * every event is marked `synthetic: true` so the UI can display a warning badge.
 *
 * Published schedule: https://www.chparksandrecut.gov/stick-n-puck
 * Mon  5:30–6:30 AM  (all school-year months)
 * Tue 11:30–12:30 PM (skip March)
 * Tue 12:30–1:30 PM  (skip March)
 * Wed  5:30–6:30 AM  (all school-year months)
 *
 * School year months: Sep–Dec + Jan–May  (summer Jun–Aug = no sessions)
 */
function generateCottonwoodEvents() {
  const tz = 'America/Denver'
  const SCHOOL_YEAR_MONTHS = new Set([1, 2, 3, 4, 5, 9, 10, 11, 12])

  /** { dow: 0=Sun…6=Sat, hour, minute, durationMin, skipMonths } */
  const SLOTS = [
    { dow: 1, hour: 5, minute: 30, durationMin: 60, skipMonths: new Set([]) },
    { dow: 2, hour: 11, minute: 30, durationMin: 60, skipMonths: new Set([3]) },
    { dow: 2, hour: 12, minute: 30, durationMin: 60, skipMonths: new Set([3]) },
    { dow: 3, hour: 5, minute: 30, durationMin: 60, skipMonths: new Set([]) },
  ]

  const windowStart = dayjs().tz(tz).subtract(2, 'day').startOf('day')
  const windowEnd = dayjs().tz(tz).add(8, 'week')

  const events = []
  let cursor = windowStart

  while (cursor.isBefore(windowEnd)) {
    const month = cursor.month() + 1 // dayjs: 0-indexed
    if (SCHOOL_YEAR_MONTHS.has(month)) {
      const dow = cursor.day()
      for (const slot of SLOTS) {
        if (slot.dow !== dow) continue
        if (slot.skipMonths.has(month)) continue

        const start = cursor.hour(slot.hour).minute(slot.minute).second(0).millisecond(0)
        if (start.isBefore(windowStart)) continue

        const end = start.add(slot.durationMin, 'minute')
        events.push({
          id: `cottonwood-synth-${start.toISOString()}`,
          title: "Stick 'n Puck",
          type: 'SP',
          rink: 'Cottonwood Heights Ice Arena',
          location: 'Cottonwood Heights Ice Arena',
          city: 'Cottonwood Heights',
          start: start.toISOString(),
          end: end.toISOString(),
          sourceUrl: 'https://www.chparksandrecut.gov/stick-n-puck',
          sourceType: 'Published schedule · Cottonwood Heights Parks & Rec',
          synthetic: true,
        })
      }
    }
    cursor = cursor.add(1, 'day')
  }

  return events
}

let eventsCache = { payload: null, expiresAt: 0 }

async function buildEventsPayload() {
  const connectorErrors = []

  const configuredOptional = OPTIONAL_ICS_SOURCES.filter((spec) => {
    const raw = process.env[spec.envKey]
    return typeof raw === 'string' && raw.trim().length > 0
  })

  const cottonwoodEvents = generateCottonwoodEvents()

  const [baseResults, optionalResults] = await Promise.all([
    Promise.allSettled([
      fetchWeberEvents(),
      fetchPeaksIceArenaEvents(),
      fetchSportsComplexCommunityIceEvents(),
      fetchMammothEvents(),
      ...PDF_SOURCES.map((source) => parsePdfSource(source)),
    ]),
    Promise.allSettled(configuredOptional.map((spec) => fetchOptionalIcsSource(spec))),
  ])

  const [weberResult, peaksResult, scCommunityResult, mammothResult, ...pdfResults] = baseResults

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
    connectorErrors.push(safeConnectorMessage('SLC Sports Complex', scCommunityResult.reason))
  }

  if (mammothResult.status === 'fulfilled') {
    events = events.concat(mammothResult.value)
  } else {
    connectorErrors.push(safeConnectorMessage('Utah Mammoth Ice Center', mammothResult.reason))
  }

  pdfResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      events = events.concat(result.value)
    } else {
      connectorErrors.push(safeConnectorMessage(PDF_SOURCES[index].rink, result.reason))
    }
  })

  optionalResults.forEach((result, index) => {
    const spec = configuredOptional[index]
    if (result.status === 'fulfilled') {
      events = events.concat(result.value)
    } else {
      connectorErrors.push(safeConnectorMessage(spec.rink, result.reason))
    }
  })

  events = events.concat(cottonwoodEvents)

  events = events.map(sanitizeHockeyEventBounds)
  events.sort((a, b) => new Date(a.start).valueOf() - new Date(b.start).valueOf())

  return {
    generatedAt: new Date().toISOString(),
    connectorErrors,
    sourceStatus: SOURCE_STATUS,
    events,
  }
}

app.get('/api/pdf-sources', async (req, res) => {
  try {
    const wantRecord = req.query.record === '1' || req.query.record === 'true'
    const supplied = String(req.query.token ?? req.get('x-saltypuck-pdf-check-token') ?? '').trim()
    if (wantRecord) {
      if (!PDF_CHECK_TOKEN) {
        res.status(503).json({
          error: 'Not configured',
          message: 'Set SALTYPUCK_PDF_CHECK_TOKEN to allow recording PDF check snapshots.',
        })
        return
      }
      if (supplied !== PDF_CHECK_TOKEN) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Invalid or missing token. Pass ?token=… or header X-Saltypuck-Pdf-Check-Token.',
        })
        return
      }
      if (!PDF_CHECK_STATE_PATH) {
        res.status(503).json({
          error: 'Not configured',
          message: 'Set SALTYPUCK_PDF_CHECK_STATE_PATH to a writable JSON file path before recording.',
        })
        return
      }
    }

    const checkedAt = new Date().toISOString()
    const prevState = readPdfCheckState()
    /** @type {Array<Record<string, unknown>>} */
    const sources = []

    for (const source of PDF_SOURCES) {
      const fixed = source.fixedPdfUrl?.trim()
      if (fixed) {
        const filename = fixed.split(/[/?#]/).pop() || fixed
        const my = calendarMonthYearFromPdfFilename(filename)
        const sort = my ? scoreCalendarMy(my) : -1
        const candidate = {
          url: fixed,
          filename,
          calendarMonth: my?.month ?? null,
          calendarYear: my?.year ?? null,
          sort,
          calendarLabel: my ? formatCalendarMonthYear(my.month, my.year) : null,
        }
        const last = prevState[source.id]
        const urlChangedSinceRecord = PDF_CHECK_STATE_PATH
          ? !last?.parseUsesUrl
            ? null
            : last.parseUsesUrl !== fixed
          : undefined
        sources.push({
          id: source.id,
          rink: source.rink,
          pageUrl: source.pageUrl,
          resolutionMode: 'fixed_env',
          fetchError: null,
          parseUsesUrl: fixed,
          selectedSort: sort >= 0 ? sort : null,
          candidates: [candidate],
          selected: sort >= 0 ? candidate : null,
          lastRecordedUrl: last?.parseUsesUrl ?? null,
          lastRecordedAt: last?.recordedAt ?? null,
          urlChangedSinceRecord,
        })
        continue
      }

      try {
        const raw = await listQuickscoresPdfCandidates(source)
        const candidates = raw.map((c) => ({
          ...c,
          calendarLabel: formatCalendarMonthYear(c.calendarMonth, c.calendarYear),
        }))
        const selected = candidates[0] ?? null
        const parseUsesUrl = selected?.url ?? null
        const last = prevState[source.id]
        const urlChangedSinceRecord = PDF_CHECK_STATE_PATH
          ? !parseUsesUrl || !last?.parseUsesUrl
            ? null
            : last.parseUsesUrl !== parseUsesUrl
          : undefined
        sources.push({
          id: source.id,
          rink: source.rink,
          pageUrl: source.pageUrl,
          resolutionMode: 'discovered',
          fetchError: null,
          parseUsesUrl,
          selectedSort: selected?.sort ?? null,
          candidates,
          selected,
          lastRecordedUrl: last?.parseUsesUrl ?? null,
          lastRecordedAt: last?.recordedAt ?? null,
          urlChangedSinceRecord,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        sources.push({
          id: source.id,
          rink: source.rink,
          pageUrl: source.pageUrl,
          resolutionMode: 'discovered',
          fetchError: message,
          parseUsesUrl: null,
          selectedSort: null,
          candidates: [],
          selected: null,
          lastRecordedUrl: prevState[source.id]?.parseUsesUrl ?? null,
          lastRecordedAt: prevState[source.id]?.recordedAt ?? null,
          urlChangedSinceRecord: PDF_CHECK_STATE_PATH ? null : undefined,
        })
      }
    }

    let recorded = false
    if (wantRecord && PDF_CHECK_TOKEN && PDF_CHECK_STATE_PATH) {
      const next = { _meta: { updatedAt: checkedAt } }
      for (const row of sources) {
        const id = row.id
        const parseUsesUrl = row.parseUsesUrl
        if (typeof id === 'string' && typeof parseUsesUrl === 'string' && parseUsesUrl.length > 0) {
          next[id] = { parseUsesUrl, recordedAt: checkedAt }
        }
      }
      writePdfCheckState(next)
      recorded = true
    }

    const hasNewPdfSinceRecord = sources.some((s) => s.urlChangedSinceRecord === true)

    res.json({
      checkedAt,
      recorded,
      statePathConfigured: Boolean(PDF_CHECK_STATE_PATH),
      tokenConfigured: Boolean(PDF_CHECK_TOKEN),
      hasNewPdfSinceRecord,
      hint:
        'Each QuickScores page is scraped for .pdf links; filenames are parsed for calendar month/year. The parser always uses the newest month. Set SALTYPUCK_PDF_CHECK_STATE_PATH and hit ?record=1&token=… once per venue row to remember the current PDF URL; later calls set hasNewPdfSinceRecord when QuickScores posts a newer file.',
      sources,
    })
  } catch (err) {
    logConnectorError('api/pdf-sources', err)
    res.status(500).json({
      error: 'PDF source check failed',
      message: err instanceof Error ? err.message : String(err),
    })
  }
})

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
  try {
    const assetsDir = path.join(distDir, 'assets')
    const files = fs.readdirSync(assetsDir)
    console.log(`[static] serving ${files.length} hashed files from dist/assets`)
    if (files.length === 0) {
      console.warn('[static] dist/assets is empty — did `npm run build` run before deploy?')
    }
  } catch (err) {
    console.warn(
      '[static] cannot read dist/assets — run `npm run build` before start:',
      err instanceof Error ? err.message : err,
    )
  }

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
    if (req.path.startsWith('/assets/')) {
      const ext = path.extname(req.path).toLowerCase()
      if (ext === '.css') {
        res.status(404).type('text/css; charset=utf-8').send('/* asset not found — redeploy or hard-refresh */')
        return
      }
      if (ext === '.js' || ext === '.mjs') {
        res.status(404).type('application/javascript; charset=utf-8').send('export {};')
        return
      }
      res.status(404).type('text/plain; charset=utf-8').send('Asset not found')
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
