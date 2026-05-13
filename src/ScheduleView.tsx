import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventApi, EventClickArg, EventContentArg, EventMountArg } from '@fullcalendar/core'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'
import { RINK_COLORS, RINK_REGISTRY } from './rinkData'
import { useScheduleData } from './ScheduleDataContext'
import type { HockeyEvent } from './scheduleTypes'
import './App.css'

const CAL_EVENT_CLEANUP_KEY = '__stickPuckTooltipCleanup'
const SCHEDULE_TIME_ZONE = 'America/Denver'

/** Stable reference so FullCalendar does not treat `plugins` as changed every render. */
const FULL_CALENDAR_PLUGINS = [dayGridPlugin, timeGridPlugin, interactionPlugin]

/** Initial number of calendar-day groups in list view; rest load on demand. */
const LIST_DAY_GROUPS_PAGE = 18

type Density = 'comfortable' | 'compact'
type ScheduleViewMode = 'list' | 'week' | 'month'
type ListSort = 'time' | 'rink'

type TooltipState = {
  hockey: HockeyEvent
  anchor: DOMRect
}

function rinkColor(rink: string) {
  return RINK_COLORS[rink] ?? '#818cf8'
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function parseYmd(ymd: string): Date | null {
  if (!ymd) {
    return null
  }
  const [y, m, da] = ymd.split('-').map(Number)
  if (!y || !m || !da) {
    return null
  }
  return new Date(y, m - 1, da)
}

function toScheduleDateLabel(dateString: string) {
  return new Date(dateString).toLocaleString('en-US', {
    timeZone: SCHEDULE_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function toTimeRange(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  const a = s.toLocaleTimeString([], { timeZone: SCHEDULE_TIME_ZONE, hour: 'numeric', minute: '2-digit' })
  const b = e.toLocaleTimeString([], { timeZone: SCHEDULE_TIME_ZONE, hour: 'numeric', minute: '2-digit' })
  return `${a} – ${b}`
}

function ymdInDenver(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: SCHEDULE_TIME_ZONE })
}

/** Same calendar day in Denver + start at 5pm or later — “tonight” without implying capacity. */
function isTonightSession(startIso: string): boolean {
  const todayYmd = new Date().toLocaleDateString('en-CA', { timeZone: SCHEDULE_TIME_ZONE })
  if (ymdInDenver(startIso) !== todayYmd) {
    return false
  }
  const hour = Number(
    new Date(startIso).toLocaleString('en-US', {
      timeZone: SCHEDULE_TIME_ZONE,
      hour: 'numeric',
      hour12: false,
    }),
  )
  return !Number.isNaN(hour) && hour >= 17
}

function truncateUrl(url: string, max = 48) {
  if (url.length <= max) {
    return url
  }
  return `${url.slice(0, max - 3)}…`
}

/** Allow only http/https URLs in rendered anchors to prevent javascript: etc. */
function safeHref(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return url
    }
  } catch {
    // Invalid URL
  }
  return '#'
}

function rinkAbbrev(rinkFull: string) {
  const r = rinkFull.toLowerCase()
  if (r.includes('ice sheet') || r.includes('weber')) {
    return 'Ice Sheet'
  }
  if (r.includes('acord')) {
    return 'Acord'
  }
  if (r.includes('county ice')) {
    return 'County'
  }
  if (r.includes('peak')) {
    return 'Peaks'
  }
  if (r.includes('steiner')) {
    return 'Steiner'
  }
  const first = rinkFull.split(/\s+/)[0]
  return first && first.length <= 14 ? first : rinkFull.slice(0, 14)
}

function sessionTypeLabel(code: string) {
  if (code === 'DI') {
    return 'Drop-in'
  }
  if (code === 'PS') {
    return 'Public skate'
  }
  return 'Stick & Puck'
}

function sessionPillKind(code: string): 'di' | 'sp' | 'ps' {
  if (code === 'DI') {
    return 'di'
  }
  if (code === 'PS') {
    return 'ps'
  }
  return 'sp'
}

function calendarBlockTitle(event: HockeyEvent) {
  return `${event.title} · ${rinkAbbrev(event.rink)}`
}

function msStartOfLocalDayFromDate(input: Date): number {
  return startOfDay(input).getTime()
}

function ordinalDay(n: number): string {
  if (n >= 11 && n <= 13) {
    return `${n}th`
  }
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** e.g. "Refreshed May 13th" in Mountain calendar date of last API pull */
function formatRefreshedAt(iso: string) {
  const d = new Date(iso)
  const month = d.toLocaleString('en-US', { timeZone: SCHEDULE_TIME_ZONE, month: 'long' })
  const dom = Number(d.toLocaleString('en-US', { timeZone: SCHEDULE_TIME_ZONE, day: 'numeric' }))
  return `Refreshed ${month} ${ordinalDay(dom)}`
}

/** List section titles: "Today, May 12th" / "Tomorrow, May 13th" / "Thursday, May 15th" */
function formatListDayHeading(dayMs: number): string {
  const day = new Date(dayMs)
  const todayMs = msStartOfLocalDayFromDate(new Date())
  const tomorrow = new Date(todayMs)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowMs = tomorrow.getTime()

  const month = day.toLocaleString('en-US', { month: 'long' })
  const dom = day.getDate()
  const ord = ordinalDay(dom)

  if (dayMs === todayMs) {
    return `Today, ${month} ${ord}`
  }
  if (dayMs === tomorrowMs) {
    return `Tomorrow, ${month} ${ord}`
  }
  const weekday = day.toLocaleString('en-US', { weekday: 'long' })
  return `${weekday}, ${month} ${ord}`
}

function extractHockeyEvent(extendedProps: unknown): HockeyEvent | null {
  if (!extendedProps || typeof extendedProps !== 'object') {
    return null
  }
  const p = extendedProps as Partial<HockeyEvent>
  if (!p.id || !p.sourceUrl) {
    return null
  }
  return extendedProps as HockeyEvent
}

function EventChipContent({ arg }: { arg: EventContentArg }) {
  const hockey = extractHockeyEvent(arg.event.extendedProps)

  if (!hockey) {
    return (
      <div className="event-chip event-chip--fallback">
        <span className="event-chip__time">{arg.timeText}</span>
        <span className="event-chip__title">{arg.event.title}</span>
      </div>
    )
  }

  const color = rinkColor(hockey.rink)

  return (
    <div className="event-chip">
      <span className="event-chip__dot" style={{ backgroundColor: color }} aria-hidden />
      <div className="event-chip__body">
        <div className="event-chip__row">
          <span className="event-chip__time">{arg.timeText}</span>
          <span className={`event-chip__pill event-chip__pill--${sessionPillKind(hockey.type)}`}>
            {sessionTypeLabel(hockey.type)}
          </span>
        </div>
        <span className="event-chip__title">{hockey.title}</span>
        <span className="event-chip__rink">{rinkAbbrev(hockey.rink)}</span>
      </div>
    </div>
  )
}

function formatTooltipPlace(h: HockeyEvent): string {
  const city = h.city.trim()
  const loc = h.location.trim()
  const rink = h.rink.trim()
  if (loc && loc !== rink) {
    return city ? `${loc} · ${city}` : loc
  }
  return city || rink
}

function HockeyEventTooltip({
  tooltip,
  onMouseEnterPanel,
  onMouseLeavePanel,
}: {
  tooltip: TooltipState
  onMouseEnterPanel: () => void
  onMouseLeavePanel: () => void
}) {
  const { hockey, anchor } = tooltip
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const panelWidth = Math.min(300, vw - 24)
  const center = anchor.left + anchor.width / 2
  const leftPx = Math.max(12, Math.min(center - panelWidth / 2, vw - panelWidth - 12))

  let topPx = anchor.bottom + 10
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  if (topPx + 220 > vh) {
    topPx = Math.max(12, anchor.top - 210)
  }

  return createPortal(
    <div
      className="event-source-tooltip"
      style={{ width: panelWidth, left: leftPx, top: topPx }}
      role="tooltip"
      onMouseEnter={onMouseEnterPanel}
      onMouseLeave={onMouseLeavePanel}
    >
      <strong className="event-source-tooltip__title">{hockey.title}</strong>
      <span className="event-source-tooltip__muted">{hockey.rink}</span>
      <span className="event-source-tooltip__date">{toScheduleDateLabel(hockey.start)}</span>
      <span className="event-source-tooltip__time">{toTimeRange(hockey.start, hockey.end)}</span>
      <span className="event-source-tooltip__location">{formatTooltipPlace(hockey)}</span>
      <span className="event-source-tooltip__type">{hockey.sourceType}</span>
      <a href={safeHref(hockey.sourceUrl)} target="_blank" rel="noreferrer">
        Open official rink source
      </a>
      <span className="event-source-tooltip__url">{truncateUrl(hockey.sourceUrl)}</span>
    </div>,
    document.body,
  )
}

function ConnectorSourceAlert({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return null
  }
  return (
    <div className="schedule-source-alert" role="status">
      <div className="schedule-source-alert__title">Some rink feeds didn&apos;t load</div>
      <p className="schedule-source-alert__lede">
        Times below may be incomplete for those sources. <strong>Always confirm</strong> at the rink desk or official
        schedule before you travel.
      </p>
      <ul className="schedule-source-alert__list">
        {messages.map((msg) => (
          <li key={msg}>{msg}</li>
        ))}
      </ul>
    </div>
  )
}

export function ScheduleView() {
  const { data, loading, error } = useScheduleData()
  const calendarRef = useRef<FullCalendar>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [scheduleView, setScheduleView] = useState<ScheduleViewMode>('list')
  const [typesOn, setTypesOn] = useState<{ SP: boolean; DI: boolean; PS: boolean }>({
    SP: true,
    DI: true,
    PS: true,
  })
  const [rinksOn, setRinksOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(RINK_REGISTRY.map((r) => [r.id, true])),
  )
  const [listDayGroupLimit, setListDayGroupLimit] = useState(LIST_DAY_GROUPS_PAGE)
  const [density, setDensity] = useState<Density>('comfortable')
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [listSort, setListSort] = useState<ListSort>('time')
  const tooltipHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTooltipHideTimer() {
    if (tooltipHideTimer.current !== null) {
      clearTimeout(tooltipHideTimer.current)
      tooltipHideTimer.current = null
    }
  }

  function scheduleTooltipClose() {
    clearTooltipHideTimer()
    tooltipHideTimer.current = setTimeout(() => setTooltip(null), 180)
  }

  function showTooltip(hockey: HockeyEvent, anchor: DOMRect) {
    clearTooltipHideTimer()
    setTooltip({ hockey, anchor })
  }

  function toggleSessionType(which: keyof typeof typesOn) {
    setListDayGroupLimit(LIST_DAY_GROUPS_PAGE)
    setTypesOn((prev) => {
      const next = !prev[which]
      const keys: Array<keyof typeof prev> = ['SP', 'DI', 'PS']
      const projected = keys.map((k) => (k === which ? next : prev[k]))
      if (projected.every((on) => !on)) {
        return prev
      }
      return { ...prev, [which]: next }
    })
  }

  useEffect(() => {
    return () => clearTooltipHideTimer()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        clearTooltipHideTimer()
        setTooltip(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filteredEvents = useMemo(() => {
    const rs = parseYmd(rangeStart)
    const re = parseYmd(rangeEnd)
    const all = data?.events ?? []
    return all.filter((e) => {
      if (!rinksOn[e.rink]) {
        return false
      }

      const t = String(e.type)
      if (!(t === 'SP' || t === 'DI' || t === 'PS')) {
        return false
      }
      if (t === 'SP' && !typesOn.SP) {
        return false
      }
      if (t === 'DI' && !typesOn.DI) {
        return false
      }
      if (t === 'PS' && !typesOn.PS) {
        return false
      }

      const ed = startOfDay(new Date(e.start))
      if (!rs && !re) {
        /* no date constraint */
      } else if (rs && !re) {
        // Single calendar day only
        if (ed.getTime() !== startOfDay(rs).getTime()) {
          return false
        }
      } else if (rs && re) {
        const startD = Math.min(startOfDay(rs).getTime(), startOfDay(re).getTime())
        const endD = Math.max(startOfDay(rs).getTime(), startOfDay(re).getTime())
        const day = ed.getTime()
        if (day < startD || day > endD) {
          return false
        }
      } else if (!rs && re) {
        /* orphan end ignored */
      }

      return true
    })
  }, [data, rinksOn, typesOn, rangeStart, rangeEnd])

  const sessionsNextSevenDays = useMemo(() => {
    const lo = msStartOfLocalDayFromDate(new Date())
    const hi = lo + 7 * 24 * 60 * 60 * 1000
    return filteredEvents.filter((ev) => {
      const ms = new Date(ev.start).getTime()
      return ms >= lo && ms < hi
    }).length
  }, [filteredEvents])

  const effectiveSelectedId = useMemo(() => {
    if (filteredEvents.length === 0) {
      return null
    }
    if (selectedEventId && filteredEvents.some((e) => e.id === selectedEventId)) {
      return selectedEventId
    }
    return filteredEvents[0]?.id ?? null
  }, [filteredEvents, selectedEventId])

  const listViewEvents = useMemo(() => {
    const todayStart = msStartOfLocalDayFromDate(new Date())
    return filteredEvents.filter(
      (e) => msStartOfLocalDayFromDate(new Date(e.start)) >= todayStart,
    )
  }, [filteredEvents])

  const sortedListEvents = useMemo(() => {
    const copy = [...listViewEvents]
    const dayMs = (e: HockeyEvent) => msStartOfLocalDayFromDate(new Date(e.start))
    const t0 = (e: HockeyEvent) => new Date(e.start).getTime()
    copy.sort((a, b) => {
      const da = dayMs(a)
      const db = dayMs(b)
      if (da !== db) {
        return da - db
      }
      if (listSort === 'rink') {
        const r = a.rink.localeCompare(b.rink)
        if (r !== 0) {
          return r
        }
      }
      return t0(a) - t0(b)
    })
    return copy
  }, [listViewEvents, listSort])

  const listDayGroups = useMemo(() => {
    const groups: { dayStart: number; items: HockeyEvent[] }[] = []
    for (const evt of sortedListEvents) {
      const dayStart = msStartOfLocalDayFromDate(new Date(evt.start))
      const last = groups[groups.length - 1]
      if (!last || last.dayStart !== dayStart) {
        groups.push({ dayStart, items: [evt] })
      } else {
        last.items.push(evt)
      }
    }
    return groups
  }, [sortedListEvents])

  const visibleListDayGroups = useMemo(
    () => listDayGroups.slice(0, listDayGroupLimit),
    [listDayGroups, listDayGroupLimit],
  )

  const calendarEvents = useMemo(
    () =>
      filteredEvents.map((event) => ({
        id: event.id,
        title: calendarBlockTitle(event),
        start: event.start,
        end: event.end,
        allDay: false,
        backgroundColor: rinkColor(event.rink),
        borderColor: rinkColor(event.rink),
        extendedProps: event,
      })),
    [filteredEvents],
  )

  const renderCalendarEventContent = useCallback((arg: EventContentArg) => <EventChipContent arg={arg} />, [])

  const calendarEventClassNames = useCallback(
    (arg: { event: EventApi }) =>
      arg.event.id === effectiveSelectedId
        ? ['fc-event-surface', 'fc-event--selected']
        : ['fc-event-surface'],
    [effectiveSelectedId],
  )

  useEffect(() => {
    if (scheduleView === 'list') {
      return
    }
    const api = calendarRef.current?.getApi()
    api?.changeView(scheduleView === 'week' ? 'timeGridWeek' : 'dayGridMonth')
  }, [scheduleView])

  function toggleRink(id: string) {
    setListDayGroupLimit(LIST_DAY_GROUPS_PAGE)
    setRinksOn((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function resetFilters() {
    setListDayGroupLimit(LIST_DAY_GROUPS_PAGE)
    setTypesOn({ SP: true, DI: true, PS: true })
    setRinksOn(Object.fromEntries(RINK_REGISTRY.map((r) => [r.id, true])))
    setRangeStart('')
    setRangeEnd('')
  }

  function handleEventClick(info: EventClickArg) {
    setSelectedEventId(info.event.id)
    const hockey = extractHockeyEvent(info.event.extendedProps)
    if (hockey) {
      showTooltip(hockey, info.el.getBoundingClientRect())
    }
  }

  function attachCalendarEventTooltip(info: EventMountArg) {
    const hockey = extractHockeyEvent(info.event.extendedProps)
    if (!hockey) {
      return
    }
    const el = info.el
    const onEnter = () => showTooltip(hockey, el.getBoundingClientRect())
    const onLeave = () => scheduleTooltipClose()
    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', onLeave)
    const cleanup = () => {
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mouseleave', onLeave)
    }
    ;(el as HTMLElement & Record<string, () => void | undefined>)[CAL_EVENT_CLEANUP_KEY] = cleanup
  }

  function detachCalendarEventTooltip(info: EventMountArg) {
    const cleanup = (info.el as HTMLElement & Record<string, () => void | undefined>)[
      CAL_EVENT_CLEANUP_KEY
    ]
    cleanup?.()
  }

  function handleSidebarItemHover(event: HockeyEvent, anchor: HTMLElement | null) {
    if (!anchor) {
      return
    }
    showTooltip(event, anchor.getBoundingClientRect())
  }

  return (
    <div className="app-root">
      <SiteHeader />

      <main className={`page dashboard page--density-${density}`} id="top">
        <section className="hero-cinematic" aria-label="Salty Puck — Utah stick and puck schedule">
          <div className="hero-cinematic__media" aria-hidden>
            <img
              className="hero-cinematic__img"
              src="/hero-peaks-player-5-ai.png"
              alt=""
              width={1536}
              height={1024}
              loading="eager"
              decoding="async"
            />
            <div className="hero-cinematic__scrim" />
          </div>
          <div className="hero-cinematic__inner page-wrap">
            <h1 className="hero-title">
              Utah Stick &amp; Puck Sessions.
              <br />
              <span className="hero-title__accent">One Place.</span>
            </h1>
            <p className="hero-sub">Sessions from Ogden to Provo.</p>
            <p className="hero-disclaimer">
              This is an independent site not affiliated with any rink, so please confirm every session time and fee with
              the facility.
            </p>
          </div>
        </section>

        {loading && <div className="status page-wrap">Loading schedules…</div>}
        {error && (
          <div className="status error page-wrap" role="alert">
            {error}
            {import.meta.env.DEV && /\((502|503|504)\)/.test(error) ? (
              <p className="status__hint">
                <strong>502 Bad Gateway</strong> means Vite&apos;s proxy could not connect to the Node API (nothing
                listening on the target port — often <strong>8787</strong>, or whatever{' '}
                <kbd>SALTYPUCK_API_PORT</kbd> / <kbd>PORT</kbd> is in <kbd>.env</kbd>). Use{' '}
                <kbd>npm run dev</kbd> so the API auto-starts, or run <kbd>npm run server</kbd> in another terminal for{' '}
                <kbd>preview</kbd>. Free a stuck port with <kbd>lsof -i :8787</kbd> if needed.
              </p>
            ) : null}
          </div>
        )}

        {!loading && !error && data && (
          <div className="dashboard-layout page-wrap" id="schedule">
            <aside className="filter-panel panel dashboard-layout__filters" aria-label="Filters">
              <div className="filter-panel__head">
                <h2 className="filter-panel__title">Filters</h2>
                <button type="button" className="filter-clear" onClick={resetFilters}>
                  Reset
                </button>
              </div>

              <p className="filter-section-label">Rinks</p>
              <div className="filter-rink-pills" role="group" aria-label="Rinks">
                {RINK_REGISTRY.map((r) => {
                  const on = rinksOn[r.id]
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={on}
                      className={`filter-rink-pill ${on ? 'filter-rink-pill--active' : ''}`}
                      onClick={() => toggleRink(r.id)}
                      style={
                        { '--rink-pill-accent': rinkColor(r.id) } as CSSProperties
                      }
                    >
                      <span className="filter-rink-pill__dot" aria-hidden />
                      {r.abbrev}
                    </button>
                  )
                })}
              </div>

              <fieldset className="filter-fieldset">
                <legend>Session type</legend>
                <label className="filter-check">
                  <input type="checkbox" checked={typesOn.SP} onChange={() => toggleSessionType('SP')} />
                  <span>Stick &amp; Puck</span>
                </label>
                <label className="filter-check">
                  <input type="checkbox" checked={typesOn.DI} onChange={() => toggleSessionType('DI')} />
                  <span>Drop-in</span>
                </label>
                <label className="filter-check">
                  <input type="checkbox" checked={typesOn.PS} onChange={() => toggleSessionType('PS')} />
                  <span>Public skate</span>
                </label>
              </fieldset>

              <fieldset className="filter-fieldset filter-fieldset--date-bundle">
                <legend>Date</legend>
                <p className="filter-hint">One day: set start only. Range: set start then end.</p>
                <div className="filter-date-bundle">
                  <label className="filter-date-bundle__cell" htmlFor="filter-date-start">
                    Start
                    <input
                      id="filter-date-start"
                      type="date"
                      className="filter-input"
                      value={rangeStart}
                      onChange={(ev) => {
                        setListDayGroupLimit(LIST_DAY_GROUPS_PAGE)
                        setRangeStart(ev.target.value)
                      }}
                    />
                  </label>
                  <label className="filter-date-bundle__cell" htmlFor="filter-date-end">
                    End{' '}
                    <span className="filter-date-bundle__optional">(optional)</span>
                    <input
                      id="filter-date-end"
                      type="date"
                      className="filter-input"
                      value={rangeEnd}
                      onChange={(ev) => {
                        setListDayGroupLimit(LIST_DAY_GROUPS_PAGE)
                        setRangeEnd(ev.target.value)
                      }}
                    />
                  </label>
                </div>
              </fieldset>

              <div className="filter-field">
                <label htmlFor="age-level">Age / level</label>
                <select id="age-level" className="filter-select" disabled aria-disabled="true">
                  <option>All ages · coming soon</option>
                </select>
              </div>
            </aside>

            <div className="dashboard-layout__schedule dashboard-main">
              {data.connectorErrors.length > 0 ? <ConnectorSourceAlert messages={data.connectorErrors} /> : null}
              {filteredEvents.length > 0 ? (
                <>
                  <div className="results-toolbar">
                    <p className="results-toolbar__count">
                      <strong>{sessionsNextSevenDays}</strong>{' '}
                      <span className="results-toolbar__suffix">
                        sessions in the next <span className="results-toolbar__suffix-num">7</span> days
                      </span>
                      <span className="results-toolbar__refreshed" title={new Date(data.generatedAt).toISOString()}>
                        {' '}
                        ({formatRefreshedAt(data.generatedAt)})
                      </span>
                    </p>
                    <label className="results-toolbar__sort" htmlFor="sort-select">
                      Sort by
                      <select
                        id="sort-select"
                        className="filter-select filter-select--inline"
                        value={listSort}
                        onChange={(ev) => {
                          const v = ev.target.value
                          if (v === 'time' || v === 'rink') setListSort(v)
                        }}
                      >
                        <option value="time">Date &amp; Time</option>
                        <option value="rink">Rink</option>
                      </select>
                    </label>
                    <div className="view-toggle" role="group" aria-label="Schedule view">
                      {(['list', 'week', 'month'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={scheduleView === v}
                          className={`view-toggle__btn ${scheduleView === v ? 'view-toggle__btn--active' : ''}`}
                          onClick={() => setScheduleView(v)}
                        >
                          {v === 'list' ? 'List' : v === 'week' ? 'Week' : 'Month'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {scheduleView === 'list' && (
                    <>
                      {listViewEvents.length === 0 ? (
                        <section className="empty-state panel list-past-empty">
                          <p className="empty-state__text">
                            No sessions from today onward with these filters. List view only shows today and future
                            dates.
                          </p>
                        </section>
                      ) : (
                        <>
                          <ul className="session-list session-list--by-day">
                            {visibleListDayGroups.map((group) => (
                        <li key={group.dayStart} className="session-day-group">
                          <h3 className="session-list__day-heading" id={`schedule-day-${group.dayStart}`}>
                            {formatListDayHeading(group.dayStart)}
                          </h3>
                          <ul className="session-list__day-cards">
                            {group.items.map((evt) => (
                              <li key={evt.id}>
                                <button
                                  type="button"
                                  className={`session-card ${effectiveSelectedId === evt.id ? 'session-card--selected' : ''}`}
                                  style={
                                    { '--session-rink-accent': rinkColor(evt.rink) } as CSSProperties
                                  }
                                  onClick={() => setSelectedEventId(evt.id)}
                                  onMouseEnter={(e) => handleSidebarItemHover(evt, e.currentTarget)}
                                  onMouseLeave={() => scheduleTooltipClose()}
                                >
                                  <div className="session-card__head">
                                    <div className="session-card__time-block">
                                      <span className="session-card__time-range">{toTimeRange(evt.start, evt.end)}</span>
                                      {isTonightSession(evt.start) ? (
                                        <span className="session-card__badge-tonight">Tonight</span>
                                      ) : null}
                                    </div>
                                    <span className="session-card__abbr" aria-hidden>
                                      {rinkAbbrev(evt.rink).slice(0, 2).toUpperCase()}
                                    </span>
                                  </div>
                                  <strong className="session-card__rink">{evt.rink}</strong>
                                  <p className="session-card__city">{evt.city}</p>
                                  <div className="session-card__tags">
                                    <span className={`session-tag session-tag--${sessionPillKind(evt.type)}`}>
                                      {sessionTypeLabel(evt.type)}
                                    </span>
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </li>
                            ))}
                          </ul>
                          {listDayGroups.length > visibleListDayGroups.length ? (
                            <div className="list-load-more">
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setListDayGroupLimit((n) =>
                                    Math.min(n + LIST_DAY_GROUPS_PAGE, listDayGroups.length),
                                  )
                                }
                              >
                                Show more dates (
                                {listDayGroups.length - visibleListDayGroups.length} more)
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </>
                  )}

                  {(scheduleView === 'week' || scheduleView === 'month') && (
                    <div className={`calendar-shell calendar-shell--${density}`}>
                      <div className="calendar-card">
                        <div className="calendar-card__toolbar">
                          {scheduleView === 'week' ? (
                            <div className="density-inline" role="group" aria-label="Week row height">
                              <span className="density-inline__lab">Density</span>
                              {(['comfortable', 'compact'] as const).map((d) => (
                                <button
                                  key={d}
                                  type="button"
                                  className={`chip-small ${density === d ? 'chip-small--active' : ''}`}
                                  onClick={() => setDensity(d)}
                                >
                                  {d === 'comfortable' ? 'Comfort' : 'Compact'}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="calendar-card__toolbar-spacer" />
                          )}
                          <div className="legend-bar legend-bar--inline" aria-label="Rink colors">
                            {RINK_REGISTRY.map((r) => (
                              <span key={r.id} className="legend-bar__item">
                                <span className="legend-bar__swatch" style={{ background: rinkColor(r.id) }} />
                                {r.abbrev}
                              </span>
                            ))}
                          </div>
                        </div>
                        <FullCalendar
                          ref={calendarRef}
                          plugins={FULL_CALENDAR_PLUGINS}
                          initialView={scheduleView === 'week' ? 'timeGridWeek' : 'dayGridMonth'}
                          headerToolbar={{
                            left: 'prev,next today',
                            center: 'title',
                            right: '',
                          }}
                          height="auto"
                          timeZone={SCHEDULE_TIME_ZONE}
                          events={calendarEvents}
                          slotEventOverlap={false}
                          dayMaxEvents={4}
                          moreLinkHint="Additional sessions hidden — switch view or pick List."
                          eventContent={renderCalendarEventContent}
                          eventClassNames={calendarEventClassNames}
                          eventClick={handleEventClick}
                          nowIndicator
                          allDaySlot={false}
                          nextDayThreshold="09:00:00"
                          slotMinTime="04:00:00"
                          slotMaxTime="24:00:00"
                          eventDidMount={attachCalendarEventTooltip}
                          eventWillUnmount={detachCalendarEventTooltip}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (data?.events ?? []).length > 0 ? (
                <section className="empty-state panel">
                  <h2 className="empty-state__title">No sessions match your filters</h2>
                  <p className="empty-state__text">Widen your dates, turn session types back on, or select all rinks.</p>
                  <button type="button" className="btn btn--accent" onClick={resetFilters}>
                    Reset filters
                  </button>
                </section>
              ) : (
                <section className="empty-state panel">
                  <h2 className="empty-state__title">No upcoming sessions returned</h2>
                  <p className="empty-state__text">
                    The API responded successfully, but nothing matched our parsers yet—often because PDF URLs rotated,
                    calendars changed, or every slot is outside the window we keep.
                  </p>
                  {data.connectorErrors.length > 0 ? (
                    <p className="empty-state__text empty-state__text--dim">{data.connectorErrors.join(' · ')}</p>
                  ) : null}
                </section>
              )}
            </div>
          </div>
        )}

        <SiteFooter />
      </main>

      {tooltip && (
        <HockeyEventTooltip
          tooltip={tooltip}
          onMouseEnterPanel={() => clearTooltipHideTimer()}
          onMouseLeavePanel={() => scheduleTooltipClose()}
        />
      )}
    </div>
  )
}
