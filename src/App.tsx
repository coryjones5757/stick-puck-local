import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventClickArg, EventContentArg, EventMountArg } from '@fullcalendar/core'
import './App.css'

const CAL_EVENT_CLEANUP_KEY = '__stickPuckTooltipCleanup'

const RINK_COLORS: Record<string, string> = {
  'Weber County Ice Sheet': '#3b82f6',
  'Acord Ice Center': '#06b6d4',
  'County Ice Center': '#10b981',
  'Peaks Ice Arena': '#eab308',
}

const RINK_REGISTRY = [
  { id: 'Weber County Ice Sheet', abbrev: 'Weber' },
  { id: 'Acord Ice Center', abbrev: 'Acord' },
  { id: 'County Ice Center', abbrev: 'County' },
  { id: 'Peaks Ice Arena', abbrev: 'Peaks' },
] as const

type Density = 'comfortable' | 'compact'
type ScheduleViewMode = 'list' | 'week' | 'month'
type ListSort = 'time' | 'rink'

type SourceStatus = {
  id: string
  name: string
  status: 'live' | 'partial' | 'manual'
  detail: string
  url: string
}

type HockeyEvent = {
  id: string
  title: string
  type: string
  rink: string
  location: string
  city: string
  start: string
  end: string
  sourceUrl: string
  sourceType: string
}

type ApiResponse = {
  generatedAt: string
  connectorErrors: string[]
  sourceStatus: SourceStatus[]
  events: HockeyEvent[]
}

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

function toNiceDate(dateString: string) {
  return new Date(dateString).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function toTimeRange(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  const a = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const b = e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${a} – ${b}`
}

function truncateUrl(url: string, max = 48) {
  if (url.length <= max) {
    return url
  }
  return `${url.slice(0, max - 3)}…`
}

function rinkAbbrev(rinkFull: string) {
  const r = rinkFull.toLowerCase()
  if (r.includes('weber')) {
    return 'Weber'
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
      <span>{toNiceDate(hockey.start)}</span>
      <span className="event-source-tooltip__time">{toTimeRange(hockey.start, hockey.end)}</span>
      <span className="event-source-tooltip__location">{hockey.city}</span>
      <span className="event-source-tooltip__type">{hockey.sourceType}</span>
      <a href={hockey.sourceUrl} target="_blank" rel="noreferrer">
        Official schedule source
      </a>
      <span className="event-source-tooltip__url">{truncateUrl(hockey.sourceUrl)}</span>
    </div>,
    document.body,
  )
}

function BrandMark() {
  return (
    <svg className="brand-icon" width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      <defs>
        <linearGradient id="bm" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect rx="10" width="36" height="36" fill="#0f2744" />
      <path
        fill="url(#bm)"
        d="M9 26 18 8 27 26h-3.2l-1.9-4H14l-1.9 4H9Zm7.35-10.8L13.9 21h7.15l-2.55-5.65-.15-.35-.15.35Z"
      />
    </svg>
  )
}

export default function App() {
  const calendarRef = useRef<FullCalendar>(null)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/events')
        if (!response.ok) {
          throw new Error(`Failed to load data (${response.status})`)
        }
        const payload: ApiResponse = await response.json()
        setData(payload)
        setSelectedEventId(payload.events[0]?.id || null)
      } catch (err) {
        if (err instanceof TypeError) {
          setError(
            import.meta.env.DEV
              ? `Network error: ${err.message}. If you ran vite alone, use npm run dev or start npm run server in another terminal.`
              : 'Could not load schedules — please check your connection and try again.',
          )
          return
        }
        setError(err instanceof Error ? err.message : 'Unexpected error')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const events = useMemo(() => data?.events ?? [], [data])

  const filteredEvents = useMemo(() => {
    const rs = parseYmd(rangeStart)
    const re = parseYmd(rangeEnd)
    return events.filter((e) => {
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
  }, [events, rinksOn, typesOn, rangeStart, rangeEnd])

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

  const sortedListEvents = useMemo(() => {
    const copy = [...filteredEvents]
    if (listSort === 'rink') {
      copy.sort((a, b) => {
        const r = a.rink.localeCompare(b.rink)
        if (r !== 0) {
          return r
        }
        return new Date(a.start).getTime() - new Date(b.start).getTime()
      })
    } else {
      copy.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    }
    return copy
  }, [filteredEvents, listSort])

  const calendarEvents = filteredEvents.map((event) => ({
    id: event.id,
    title: calendarBlockTitle(event),
    start: event.start,
    end: event.end,
    backgroundColor: rinkColor(event.rink),
    borderColor: rinkColor(event.rink),
    extendedProps: event,
  }))

  useEffect(() => {
    if (scheduleView === 'list') {
      return
    }
    const api = calendarRef.current?.getApi()
    api?.changeView(scheduleView === 'week' ? 'timeGridWeek' : 'dayGridMonth')
  }, [scheduleView])

  function toggleRink(id: string) {
    setRinksOn((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function resetFilters() {
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
      <header className="site-header">
        <div className="site-header__inner page-wrap">
          <a href="#top" className="brand">
            <BrandMark />
            <span className="brand__text">UTAH ICE TIME</span>
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#schedule" className="nav-links__link nav-links__link--active">
              Schedule
            </a>
            <a href="#schedule" className="nav-links__link">
              Rinks
            </a>
            <a href="#schedule" className="nav-links__link">
              Tryouts
            </a>
            <a href="#schedule" className="nav-links__link">
              Camps &amp; Clinics
            </a>
            <a href="#schedule" className="nav-links__link">
              Resources
            </a>
          </nav>
        </div>
      </header>

      <main className={`page dashboard page--density-${density}`} id="top">
        <section className="hero-cinematic" aria-label="Utah stick and puck schedule">
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
              Every Utah Stick &amp; Puck Session. <span className="hero-title__accent">One Place.</span>
            </h1>
            <p className="hero-sub">From Provo peaks to Weber County — sessions as soon as feeds update.</p>
          </div>
        </section>

        {loading && <div className="status page-wrap">Loading schedules…</div>}
        {error && (
          <div className="status error page-wrap" role="alert">
            {error}
            {import.meta.env.DEV && /\((502|503|504)\)/.test(error) ? (
              <p className="status__hint">
                The Vite proxy could not reach the API. Use <kbd>npm run dev</kbd> (starts API + web) or run{' '}
                <kbd>npm run server</kbd> in another terminal.
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
                      onChange={(ev) => setRangeStart(ev.target.value)}
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
                      onChange={(ev) => setRangeEnd(ev.target.value)}
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
              {filteredEvents.length > 0 ? (
                <>
                  <div className="results-toolbar">
                    <p className="results-toolbar__count">
                      <strong>{sessionsNextSevenDays}</strong>{' '}
                      <span className="results-toolbar__suffix">
                        sessions in the next <span className="results-toolbar__suffix-num">7</span> days
                      </span>
                    </p>
                    <label className="results-toolbar__sort">
                      <span>Sort by</span>
                      <select
                        className="filter-select filter-select--inline"
                        value={listSort}
                        onChange={(ev) => setListSort(ev.target.value as ListSort)}
                      >
                        <option value="time">Date &amp; Time</option>
                        <option value="rink">Rink</option>
                      </select>
                    </label>
                    <div className="view-toggle" role="tablist" aria-label="Schedule view">
                      {(['list', 'week', 'month'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          role="tab"
                          aria-selected={scheduleView === v}
                          className={`view-toggle__btn ${scheduleView === v ? 'view-toggle__btn--active' : ''}`}
                          onClick={() => setScheduleView(v)}
                        >
                          {v === 'list' ? 'List' : v === 'week' ? 'Week' : 'Month'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {scheduleView === 'list' && (
                    <ul className="session-list">
                      {sortedListEvents.map((evt) => (
                        <li key={evt.id}>
                          <button
                            type="button"
                            className={`session-card ${effectiveSelectedId === evt.id ? 'session-card--selected' : ''}`}
                            onClick={() => setSelectedEventId(evt.id)}
                            onMouseEnter={(e) => handleSidebarItemHover(evt, e.currentTarget)}
                            onMouseLeave={() => scheduleTooltipClose()}
                          >
                            <span className="session-card__logo" style={{ background: rinkColor(evt.rink) }} aria-hidden>
                              {rinkAbbrev(evt.rink).slice(0, 2).toUpperCase()}
                            </span>
                            <div className="session-card__main">
                              <strong className="session-card__rink">{evt.rink}</strong>
                              <p className="session-card__city">{evt.city}</p>
                              <div className="session-card__tags">
                                <span className={`session-tag session-tag--${sessionPillKind(evt.type)}`}>
                                  {sessionTypeLabel(evt.type)}
                                </span>
                              </div>
                            </div>
                            <div className="session-card__meta">
                              <span className="session-card__day">
                                {new Date(evt.start).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                              <strong className="session-card__time">{toTimeRange(evt.start, evt.end)}</strong>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
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
                          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                          initialView={scheduleView === 'week' ? 'timeGridWeek' : 'dayGridMonth'}
                          headerToolbar={{
                            left: 'prev,next today',
                            center: 'title',
                            right: '',
                          }}
                          height="auto"
                          events={calendarEvents}
                          slotEventOverlap={false}
                          dayMaxEvents={4}
                          moreLinkHint="Additional sessions hidden — switch view or pick List."
                          eventContent={(arg) => <EventChipContent arg={arg} />}
                          eventClassNames={(arg) =>
                            arg.event.id === effectiveSelectedId
                              ? ['fc-event-surface', 'fc-event--selected']
                              : ['fc-event-surface']
                          }
                          eventClick={handleEventClick}
                          nowIndicator
                          allDaySlot={false}
                          slotMinTime="06:00:00"
                          slotMaxTime="23:00:00"
                          eventDidMount={attachCalendarEventTooltip}
                          eventWillUnmount={detachCalendarEventTooltip}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : events.length > 0 ? (
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

        {!loading && !error && !!data?.connectorErrors.length && (
          <section className="status warning stagger-in page-wrap">
            <strong>Connector warnings:</strong> {data.connectorErrors.join(' | ')}
          </section>
        )}

        <footer className="value-strip page-wrap">
          <div className="value-strip__item">
            <span className="value-strip__icon value-strip__icon--accent" aria-hidden>
              📅
            </span>
            <div>
              <strong>Always up to date</strong>
              <p>Schedule data refreshes when you reload.</p>
            </div>
          </div>
          <div className="value-strip__item">
            <span className="value-strip__icon value-strip__icon--accent" aria-hidden>
              ↗
            </span>
            <div>
              <strong>More rinks coming</strong>
              <p>We&apos;ll add feeds as arenas publish them.</p>
            </div>
          </div>
        </footer>
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
