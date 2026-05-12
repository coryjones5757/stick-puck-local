import cors from 'cors'
import dayjs from 'dayjs'
import express from 'express'
import ical from 'node-ical'
import { PDFParse } from 'pdf-parse'

const app = express()
const PORT = 8787

app.use(cors())

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
      'Facility schedule from Peaks Ice Arena\'s embedded public Google Calendar. Sticktime/Youth Sticktime signup is handled in Dash/DaySmart and typically only appears here if the rink adds those blocks to this feed.',
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
    name: 'Salt Lake City Sports Complex / Steiner',
    status: 'partial',
    detail: 'Public page exists, but stick-and-puck times are not structured',
    url: 'https://www.quickscores.com/Orgs/ExtraMsg.php?ExtraMsgID=14779&OrgDir=sportscomplex',
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

function parsePdfLine(line) {
  const timeRangePattern =
    /^([A-Z]{2})\s+(\d{1,2}:\d{2})(am|pm)?\s*-\s*(\d{1,2}:\d{2})(am|pm)$/i
  const match = line.match(timeRangePattern)
  if (!match) {
    return null
  }

  const [, codeRaw, startTime, startPeriodMaybe, endTime, endPeriod] = match
  const code = codeRaw.toUpperCase()
  const startPeriod = startPeriodMaybe || endPeriod
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
  const response = await fetch(source.sourceUrl)
  if (!response.ok) {
    throw new Error(`Failed PDF fetch (${response.status})`)
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

    const start = dayjs()
      .year(year)
      .month(month - 1)
      .date(currentDay)
      .hour(parsed.start.hour)
      .minute(parsed.start.minute)
      .second(0)
      .millisecond(0)

    const end = dayjs()
      .year(year)
      .month(month - 1)
      .date(currentDay)
      .hour(parsed.end.hour)
      .minute(parsed.end.minute)
      .second(0)
      .millisecond(0)

    events.push({
      id: `${source.id}-${start.valueOf()}-${parsed.code}`,
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

  return events
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
  if (/\bbroom\s*ball\b|\bcollege\s*night\b|\bdrop\s*-?\s*in\b|\bopen\s+hockey\b/.test(s)) {
    return 'DI'
  }
  return null
}

async function fetchPeaksIceArenaEvents() {
  const now = dayjs().subtract(2, 'day').toDate()
  const calendarUrl = `https://calendar.google.com/calendar/ical/${encodeURIComponent(
    PEAKS_GOOGLE_CALENDAR_ID,
  )}/public/basic.ics`
  const data = await ical.async.fromURL(calendarUrl)

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
    const data = await ical.async.fromURL(calendarUrl)

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

app.get('/api/events', async (_req, res) => {
  const connectorErrors = []

  const [weberResult, peaksResult, ...pdfResults] = await Promise.allSettled([
    fetchWeberEvents(),
    fetchPeaksIceArenaEvents(),
    ...PDF_SOURCES.map((source) => parsePdfSource(source)),
  ])

  let events = []
  if (weberResult.status === 'fulfilled') {
    events = events.concat(weberResult.value)
  } else {
    connectorErrors.push(`Weber: ${weberResult.reason.message}`)
  }

  if (peaksResult.status === 'fulfilled') {
    events = events.concat(peaksResult.value)
  } else {
    connectorErrors.push(`Peaks Ice Arena: ${peaksResult.reason.message}`)
  }

  pdfResults.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      events = events.concat(result.value)
    } else {
      connectorErrors.push(`${PDF_SOURCES[index].rink}: ${result.reason.message}`)
    }
  })

  events.sort((a, b) => new Date(a.start).valueOf() - new Date(b.start).valueOf())
  res.json({
    generatedAt: new Date().toISOString(),
    connectorErrors,
    sourceStatus: SOURCE_STATUS,
    events,
  })
})

app.listen(PORT, () => {
  console.log(`Local data API running at http://localhost:${PORT}`)
})
