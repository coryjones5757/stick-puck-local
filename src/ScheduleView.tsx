import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventApi, EventClickArg, EventContentArg, EventMountArg } from '@fullcalendar/core'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'
import { RINK_COLORS, RINK_REGISTRY } from './rinkData'
import { useScheduleData } from './ScheduleDataContext'
import type { HockeyEvent } from './scheduleTypes'
import {
  SCHEDULE_TIME_ZONE,
  addDenverCalendarDays,
  denverDayStartMs,
  denverNowDayStartMs,
  formatDenverListDayHeading,
  isDenverWeekendDay,
} from './scheduleTime'
import './App.css'

const CAL_EVENT_CLEANUP_KEY = '__stickPuckTooltipCleanup'

/** Stable reference so FullCalendar does not treat `plugins` as changed every render. */
const FULL_CALENDAR_PLUGINS = [dayGridPlugin, interactionPlugin]

/** List view default window: this many calendar days from today (inclusive) until user loads more. */
const LIST_VIEW_HORIZON_DAYS_INITIAL = 14
const LIST_VIEW_HORIZON_DAYS_STEP = 14

type ScheduleViewMode = 'list' | 'month'
type ListSort = 'time' | 'rink'

/** Agenda shortcuts — filter the list without changing rink/type filters. */
type ListQuickFocus = 'all' | 'today' | 'tonight' | 'tomorrow' | 'weekend'

function matchesListQuickFocus(e: HockeyEvent, focus: ListQuickFocus): boolean {
  if (focus === 'all') {
    return true
  }
  const today0 = denverNowDayStartMs()
  const dayStart = denverDayStartMs(e.start)
  if (focus === 'today') {
    return dayStart === today0
  }
  if (focus === 'tonight') {
    return isTonightSession(e.start)
  }
  if (focus === 'tomorrow') {
    return dayStart === addDenverCalendarDays(today0, 1)
  }
  if (focus === 'weekend') {
    return isDenverWeekendDay(e.start)
  }
  return true
}

type TooltipState = {
  hockey: HockeyEvent
  anchor: DOMRect
}

function rinkColor(rink: string) {
  return RINK_COLORS[rink] ?? '#818cf8'
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

const STARTING_SOON_MS = 75 * 60 * 1000

/** Session begins within the next ~75 minutes (has not started yet). */
function isStartingSoon(startIso: string): boolean {
  const start = new Date(startIso).getTime()
  const now = Date.now()
  return start > now && start - now <= STARTING_SOON_MS
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
  if (r.includes('park city')) {
    return 'Park City'
  }
  if (r.includes('olympic oval') || /\boval\b/.test(r)) {
    return 'Oval'
  }
  if (r.includes('eccles')) {
    return 'Eccles'
  }
  if (r.includes('mammoth')) {
    return 'Mammoth'
  }
  if (r.includes('cottonwood')) {
    return 'Cottonwood'
  }
  if (r.includes('slc sports') || r.includes('sports complex') || r.includes('steiner')) {
    return 'SLC SC'
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
      {hockey.synthetic ? (
        <span className="event-source-tooltip__synthetic-note">
          ⚠ Generated from published schedule — verify at the rink before traveling
        </span>
      ) : null}
      <a href={safeHref(hockey.sourceUrl)} target="_blank" rel="noreferrer">
        Open official rink source
      </a>
      <span className="event-source-tooltip__url">{truncateUrl(hockey.sourceUrl)}</span>
    </div>,
    document.body,
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
  const [listViewHorizonDays, setListViewHorizonDays] = useState(LIST_VIEW_HORIZON_DAYS_INITIAL)
  const [listSort, setListSort] = useState<ListSort>('time')
  const [listQuickFocus, setListQuickFocus] = useState<ListQuickFocus>('all')
  const [quickFocusScrollNonce, setQuickFocusScrollNonce] = useState(0)
  const [filterMenuOpen, setFilterMenuOpen] = useState<'types' | 'rinks' | null>(null)
  const typesMenuRef = useRef<HTMLDivElement>(null)
  const rinksMenuRef = useRef<HTMLDivElement>(null)
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
    setListViewHorizonDays(LIST_VIEW_HORIZON_DAYS_INITIAL)
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
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setFilterMenuOpen(null)
        clearTooltipHideTimer()
        setTooltip(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (filterMenuOpen === null) {
      return
    }
    function handlePointerDown(e: PointerEvent) {
      const t = e.target as Node
      if (typesMenuRef.current?.contains(t)) {
        return
      }
      if (rinksMenuRef.current?.contains(t)) {
        return
      }
      setFilterMenuOpen(null)
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [filterMenuOpen])

  useEffect(() => {
    return () => clearTooltipHideTimer()
  }, [])

  const filteredEvents = useMemo(() => {
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

      return true
    })
  }, [data, rinksOn, typesOn])

  const effectiveSelectedId = useMemo(() => {
    if (filteredEvents.length === 0) {
      return null
    }
    if (selectedEventId && filteredEvents.some((e) => e.id === selectedEventId)) {
      return selectedEventId
    }
    return filteredEvents[0]?.id ?? null
  }, [filteredEvents, selectedEventId])

  const listFutureEvents = useMemo(() => {
    const todayStart = denverNowDayStartMs()
    return filteredEvents.filter((e) => denverDayStartMs(e.start) >= todayStart)
  }, [filteredEvents])

  const listViewHorizonLastDayStart = useMemo(() => {
    const todayStart = denverNowDayStartMs()
    return addDenverCalendarDays(todayStart, listViewHorizonDays - 1)
  }, [listViewHorizonDays])

  const listViewEvents = useMemo(() => {
    return listFutureEvents.filter((e) => {
      const evDay = denverDayStartMs(e.start)
      return evDay <= listViewHorizonLastDayStart
    })
  }, [listFutureEvents, listViewHorizonLastDayStart])

  const sessionsBeyondListHorizon = useMemo(() => {
    return listFutureEvents.filter((e) => denverDayStartMs(e.start) > listViewHorizonLastDayStart).length
  }, [listFutureEvents, listViewHorizonLastDayStart])

  const hasMoreListSessions = sessionsBeyondListHorizon > 0

  const typesFilterSummary = useMemo(() => {
    const n = (['SP', 'DI', 'PS'] as const).filter((k) => typesOn[k]).length
    if (n === 3) {
      return 'All types'
    }
    const parts: string[] = []
    if (typesOn.SP) {
      parts.push('S&P')
    }
    if (typesOn.DI) {
      parts.push('Drop-in')
    }
    if (typesOn.PS) {
      parts.push('PS')
    }
    return parts.join(', ') || 'None'
  }, [typesOn])

  const rinksFilterSummary = useMemo(() => {
    const total = RINK_REGISTRY.length
    const n = RINK_REGISTRY.filter((r) => rinksOn[r.id]).length
    if (n === total) {
      return 'All rinks'
    }
    if (n === 0) {
      return 'None'
    }
    return `${n} of ${total}`
  }, [rinksOn])

  const sortedListEvents = useMemo(() => {
    const copy = [...listViewEvents]
    const dayMs = (e: HockeyEvent) => denverDayStartMs(e.start)
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

  const intentFilteredSortedEvents = useMemo(() => {
    if (listQuickFocus === 'all') {
      return sortedListEvents
    }
    return sortedListEvents.filter((e) => matchesListQuickFocus(e, listQuickFocus))
  }, [sortedListEvents, listQuickFocus])

  const quickFocusCounts = useMemo(() => {
    const today0 = denverNowDayStartMs()
    const tomorrow0 = addDenverCalendarDays(today0, 1)
    let all = 0
    let today = 0
    let tonight = 0
    let tomorrow = 0
    let weekend = 0
    for (const e of sortedListEvents) {
      all += 1
      const ds = denverDayStartMs(e.start)
      if (ds === today0) {
        today += 1
      }
      if (isTonightSession(e.start)) {
        tonight += 1
      }
      if (ds === tomorrow0) {
        tomorrow += 1
      }
      if (isDenverWeekendDay(e.start)) {
        weekend += 1
      }
    }
    return { all, today, tonight, tomorrow, weekend }
  }, [sortedListEvents])

  const listDayGroups = useMemo(() => {
    const groups: { dayStart: number; items: HockeyEvent[] }[] = []
    for (const evt of intentFilteredSortedEvents) {
      const dayStart = denverDayStartMs(evt.start)
      const last = groups[groups.length - 1]
      if (!last || last.dayStart !== dayStart) {
        groups.push({ dayStart, items: [evt] })
      } else {
        last.items.push(evt)
      }
    }
    return groups
  }, [intentFilteredSortedEvents])

  const listDayGroupsRef = useRef<{ dayStart: number; items: HockeyEvent[] }[]>([])

  useEffect(() => {
    listDayGroupsRef.current = listDayGroups
  }, [listDayGroups])

  /** List row highlight: stay in sync with visible list without forcing `selectedEventId` in an effect. */
  const listRowSelectedId = useMemo(() => {
    if (scheduleView !== 'list') {
      return null
    }
    const ids = new Set(intentFilteredSortedEvents.map((e) => e.id))
    if (selectedEventId !== null && ids.has(selectedEventId)) {
      return selectedEventId
    }
    return intentFilteredSortedEvents[0]?.id ?? null
  }, [scheduleView, intentFilteredSortedEvents, selectedEventId])

  useEffect(() => {
    if (scheduleView !== 'list' || quickFocusScrollNonce === 0) {
      return
    }
    const first = listDayGroupsRef.current[0]?.dayStart
    if (first == null) {
      return
    }
    const id = `schedule-day-${first}`
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      })
    })
  }, [quickFocusScrollNonce, scheduleView])

  const calendarEvents = useMemo(
    () =>
      filteredEvents.map((event) => ({
        id: event.id,
        title: calendarBlockTitle(event),
        start: event.start,
        end: event.end,
        allDay: false,
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
    api?.changeView('dayGridMonth')
  }, [scheduleView])

  function toggleRink(id: string) {
    setListViewHorizonDays(LIST_VIEW_HORIZON_DAYS_INITIAL)
    setRinksOn((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function resetFilters() {
    setListViewHorizonDays(LIST_VIEW_HORIZON_DAYS_INITIAL)
    setTypesOn({ SP: true, DI: true, PS: true })
    setRinksOn(Object.fromEntries(RINK_REGISTRY.map((r) => [r.id, true])))
    setListQuickFocus('all')
    setFilterMenuOpen(null)
  }

  /** Avoid viewport jump when toggling checkboxes in anchored filter panels (browser scrolls focused controls). */
  function preventFilterPanelMouseDownScroll(e: MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) {
      return
    }
    const el = e.target as HTMLElement
    if (el.closest('label.filter-ms__check')) {
      e.preventDefault()
    }
  }

  function applyQuickFocus(f: ListQuickFocus) {
    setScheduleView('list')
    setListQuickFocus(f)
    if (f !== 'all') {
      setQuickFocusScrollNonce((n) => n + 1)
    }
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
    const el = info.el
    if (hockey) {
      el.style.setProperty('--rink-accent', rinkColor(hockey.rink))
    }
    if (!hockey) {
      return
    }
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
      <a href="#schedule" className="skip-link">
        Skip to schedule
      </a>

      <main className="page dashboard" id="top">
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

        {loading && (
          <div className="schedule-skeleton page-wrap" aria-busy="true" aria-live="polite">
            <span className="visually-hidden">Loading schedules</span>
            <div className="schedule-skeleton__layout">
              <div className="schedule-skeleton__main">
                <div className="schedule-skeleton__toolbar">
                  <div className="schedule-skeleton__shine schedule-skeleton__line schedule-skeleton__line--tiny" />
                  <div className="schedule-skeleton__shine schedule-skeleton__line schedule-skeleton__line--long" />
                </div>
                <div className="schedule-skeleton__chip-row">
                  <span className="schedule-skeleton__shine schedule-skeleton__chip" />
                  <span className="schedule-skeleton__shine schedule-skeleton__chip" />
                  <span className="schedule-skeleton__shine schedule-skeleton__chip" />
                  <span className="schedule-skeleton__shine schedule-skeleton__chip" />
                </div>
                <div className="schedule-skeleton__shine schedule-skeleton__line schedule-skeleton__line--full" />
                <div className="schedule-skeleton__shine schedule-skeleton__line schedule-skeleton__line--med" />
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="schedule-skeleton__shine schedule-skeleton__card" />
                ))}
              </div>
            </div>
          </div>
        )}
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
          <div className="dashboard-layout dashboard-layout--stack page-wrap" id="schedule">
            <div className="dashboard-main dashboard-main--full">
              <section className="schedule-toolbar panel" aria-label="Schedule filters">
                <div className="schedule-toolbar__bar">
                  <div className="schedule-toolbar__bar-main">
                    <div className="view-toggle" role="group" aria-label="Schedule view">
                      {(['list', 'month'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={scheduleView === v}
                          aria-label={v === 'list' ? 'Agenda view' : 'Month calendar'}
                          className={`view-toggle__btn ${scheduleView === v ? 'view-toggle__btn--active' : ''}`}
                          onClick={() => setScheduleView(v)}
                        >
                          {v === 'list' ? 'Agenda' : 'Month'}
                        </button>
                      ))}
                    </div>

                    <div className="schedule-toolbar__dropdowns">
                      <div className="filter-ms" ref={typesMenuRef}>
                        <button
                          type="button"
                          className="filter-ms__trigger filter-ms__trigger--compact"
                          aria-expanded={filterMenuOpen === 'types'}
                          aria-controls="schedule-filter-types-panel"
                          id="schedule-filter-types-trigger"
                          aria-label={`Session types: ${typesFilterSummary}`}
                          onClick={() => setFilterMenuOpen((o) => (o === 'types' ? null : 'types'))}
                        >
                          <span className="filter-ms__trigger-summary">{typesFilterSummary}</span>
                          <span className="filter-ms__chev" aria-hidden>
                            ▾
                          </span>
                        </button>
                        {filterMenuOpen === 'types' ? (
                          <div
                            className="filter-ms__panel"
                            id="schedule-filter-types-panel"
                            role="group"
                            aria-labelledby="schedule-filter-types-trigger"
                            onMouseDown={preventFilterPanelMouseDownScroll}
                          >
                            <label className="filter-ms__check">
                              <input
                                type="checkbox"
                                checked={typesOn.SP}
                                onChange={() => toggleSessionType('SP')}
                              />
                              <span>Stick &amp; Puck</span>
                            </label>
                            <label className="filter-ms__check">
                              <input
                                type="checkbox"
                                checked={typesOn.DI}
                                onChange={() => toggleSessionType('DI')}
                              />
                              <span>Drop-in</span>
                            </label>
                            <label className="filter-ms__check">
                              <input
                                type="checkbox"
                                checked={typesOn.PS}
                                onChange={() => toggleSessionType('PS')}
                              />
                              <span>Public skate</span>
                            </label>
                          </div>
                        ) : null}
                      </div>

                      <div className="filter-ms" ref={rinksMenuRef}>
                        <button
                          type="button"
                          className="filter-ms__trigger filter-ms__trigger--compact"
                          aria-expanded={filterMenuOpen === 'rinks'}
                          aria-controls="schedule-filter-rinks-panel"
                          id="schedule-filter-rinks-trigger"
                          aria-label={`Rinks: ${rinksFilterSummary}`}
                          onClick={() => setFilterMenuOpen((o) => (o === 'rinks' ? null : 'rinks'))}
                        >
                          <span className="filter-ms__trigger-summary">{rinksFilterSummary}</span>
                          <span className="filter-ms__chev" aria-hidden>
                            ▾
                          </span>
                        </button>
                        {filterMenuOpen === 'rinks' ? (
                          <div
                            className="filter-ms__panel filter-ms__panel--rinks"
                            id="schedule-filter-rinks-panel"
                            role="group"
                            aria-labelledby="schedule-filter-rinks-trigger"
                            onMouseDown={preventFilterPanelMouseDownScroll}
                          >
                            {RINK_REGISTRY.map((r) => {
                              const on = rinksOn[r.id]
                              return (
                                <label key={r.id} className="filter-ms__check filter-ms__check--rink">
                                  <input
                                    type="checkbox"
                                    checked={on}
                                    onChange={() => toggleRink(r.id)}
                                  />
                                  <span
                                    className="filter-ms__rink-dot"
                                    style={
                                      { '--rink-dot': rinkColor(r.id) } as CSSProperties
                                    }
                                    aria-hidden
                                  />
                                  <span className="filter-ms__rink-line">
                                    <span className="filter-ms__rink-abbrev">{r.abbrev}</span>
                                    <span className="filter-ms__rink-full">{r.id}</span>
                                  </span>
                                </label>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>

                      {scheduleView === 'list' ? (
                        <div className="schedule-toolbar__quick-focus quick-focus" role="group" aria-label="Quick focus">
                          {(
                            [
                              { id: 'all' as const, label: 'All' },
                              { id: 'today' as const, label: 'Today' },
                              { id: 'tonight' as const, label: 'Tonight' },
                              { id: 'tomorrow' as const, label: 'Tomorrow' },
                              { id: 'weekend' as const, label: 'Weekend' },
                            ] as const
                          ).map(({ id, label }) => (
                            <button
                              key={id}
                              type="button"
                              className={`quick-focus__chip ${listQuickFocus === id ? 'quick-focus__chip--active' : ''}`}
                              aria-pressed={listQuickFocus === id}
                              aria-label={`${label}: ${quickFocusCounts[id]} sessions in the agenda window`}
                              onClick={() => applyQuickFocus(id)}
                            >
                              <span className="quick-focus__chip-label">{label}</span>
                              {id !== 'all' && id !== 'today' ? (
                                <span className="quick-focus__chip-count">{quickFocusCounts[id]}</span>
                              ) : null}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="schedule-toolbar__actions">
                      {scheduleView === 'list' ? (
                        <label className="schedule-toolbar__sort" htmlFor="sort-select">
                          <span className="schedule-toolbar__sort-label">Sort</span>
                          <select
                            id="sort-select"
                            className="filter-select schedule-toolbar__sort-select"
                            value={listSort}
                            onChange={(ev) => {
                              const v = ev.target.value
                              if (v === 'time' || v === 'rink') setListSort(v)
                            }}
                          >
                            <option value="time">Date</option>
                            <option value="rink">Rink</option>
                          </select>
                        </label>
                      ) : null}
                      <button
                        type="button"
                        className="schedule-toolbar__reset-link"
                        onClick={resetFilters}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {filteredEvents.length > 0 ? (
                <>
                  {scheduleView === 'list' && (
                    <>
                      {listFutureEvents.length === 0 ? (
                        <section className="empty-state panel list-past-empty">
                          <p className="empty-state__text">
                            No sessions from today onward with these filters. The agenda only shows today and future
                            dates.
                          </p>
                        </section>
                      ) : listViewEvents.length === 0 ? (
                        <section className="empty-state panel list-past-empty">
                          <p className="empty-state__text">
                            Nothing in the next {listViewHorizonDays} calendar days with these filters. Later dates are
                            hidden until you load more.
                          </p>
                          {hasMoreListSessions ? (
                            <div className="list-load-more list-load-more--after-empty">
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setListViewHorizonDays((d) => d + LIST_VIEW_HORIZON_DAYS_STEP)
                                }
                              >
                                Load next {LIST_VIEW_HORIZON_DAYS_STEP} days (
                                {sessionsBeyondListHorizon} more session{sessionsBeyondListHorizon === 1 ? '' : 's'})
                              </button>
                            </div>
                          ) : null}
                        </section>
                      ) : sortedListEvents.length > 0 && intentFilteredSortedEvents.length === 0 ? (
                        <section className="empty-state panel list-past-empty">
                          <h2 className="empty-state__title">No sessions for this shortcut</h2>
                          <p className="empty-state__text">
                            Nothing for{' '}
                            <strong>
                              {listQuickFocus === 'today'
                                ? 'today'
                                : listQuickFocus === 'tonight'
                                  ? 'tonight (5pm onward, Mountain Time)'
                                  : listQuickFocus === 'tomorrow'
                                    ? 'tomorrow'
                                    : 'Saturday or Sunday'}
                            </strong>{' '}
                            in the next {listViewHorizonDays} days with your current rink and session filters.
                          </p>
                          <button type="button" className="btn btn--accent" onClick={() => applyQuickFocus('all')}>
                            Show all upcoming
                          </button>
                          {hasMoreListSessions ? (
                            <div className="list-load-more list-load-more--after-empty">
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setListViewHorizonDays((d) => d + LIST_VIEW_HORIZON_DAYS_STEP)
                                }
                              >
                                Load next {LIST_VIEW_HORIZON_DAYS_STEP} days (
                                {sessionsBeyondListHorizon} more session{sessionsBeyondListHorizon === 1 ? '' : 's'})
                              </button>
                            </div>
                          ) : null}
                        </section>
                      ) : (
                        <>
                          <ul className="session-list session-list--by-day">
                            {listDayGroups.map((group) => (
                              <li key={group.dayStart} className="session-day-group">
                                <h3
                                  className="session-list__day-heading"
                                  id={`schedule-day-${group.dayStart}`}
                                >
                                  {formatDenverListDayHeading(group.dayStart)}
                                </h3>
                                <ul className="session-list__day-cards">
                                  {group.items.map((evt) => (
                                    <li key={evt.id}>
                                      <button
                                        type="button"
                                        className={`session-card ${listRowSelectedId === evt.id ? 'session-card--selected' : ''}`}
                                        style={
                                          { '--session-rink-accent': rinkColor(evt.rink) } as CSSProperties
                                        }
                                        onClick={() => setSelectedEventId(evt.id)}
                                        onMouseEnter={(e) => handleSidebarItemHover(evt, e.currentTarget)}
                                        onMouseLeave={() => scheduleTooltipClose()}
                                      >
                                        <div className="session-card__meta-row">
                                          <div className="session-card__time-block">
                                            <span className="session-card__time-range">
                                              {toTimeRange(evt.start, evt.end)}
                                            </span>
                                            {isTonightSession(evt.start) ? (
                                              <span className="session-card__badge-tonight">Tonight</span>
                                            ) : null}
                                            {isStartingSoon(evt.start) ? (
                                              <span className="session-card__badge-soon">Soon</span>
                                            ) : null}
                                            {evt.synthetic ? (
                                              <span className="session-card__badge-est" title="Generated from published schedule — verify before traveling">
                                                est.
                                              </span>
                                            ) : null}
                                          </div>
                                          <span className="session-card__meta-sep" aria-hidden>
                                            ·
                                          </span>
                                          <span className="session-card__rink-inline">{evt.rink}</span>
                                          <span className="session-card__meta-sep" aria-hidden>
                                            ·
                                          </span>
                                          <span className="session-card__city-inline">{evt.city}</span>
                                          <span className="session-card__meta-sep" aria-hidden>
                                            ·
                                          </span>
                                          <span
                                            className={`session-tag session-tag--${sessionPillKind(evt.type)}`}
                                          >
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
                          {hasMoreListSessions ? (
                            <div className="list-load-more">
                              <button
                                type="button"
                                className="btn"
                                onClick={() =>
                                  setListViewHorizonDays((d) => d + LIST_VIEW_HORIZON_DAYS_STEP)
                                }
                              >
                                Load next {LIST_VIEW_HORIZON_DAYS_STEP} days (
                                {sessionsBeyondListHorizon} more session{sessionsBeyondListHorizon === 1 ? '' : 's'})
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </>
                  )}

                  {scheduleView === 'month' && (
                    <div className="calendar-shell">
                      <div className="calendar-card">
                        <div className="calendar-card__toolbar">
                          <span className="calendar-card__toolbar-spacer" />
                          <div className="legend-bar legend-bar--inline" aria-label="Rink colors">
                            {RINK_REGISTRY.map((r) => (
                              <span key={r.id} className="legend-bar__item">
                                <span className="legend-bar__swatch" style={{ background: rinkColor(r.id) }} />
                                {r.abbrev}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="calendar-card__viewport">
                          <FullCalendar
                            key={`schedule-fc-${data.generatedAt}`}
                            ref={calendarRef}
                            plugins={FULL_CALENDAR_PLUGINS}
                            initialView="dayGridMonth"
                            headerToolbar={{
                              left: 'prev,next today',
                              center: 'title',
                              right: '',
                            }}
                            height="auto"
                            timeZone={SCHEDULE_TIME_ZONE}
                            events={calendarEvents}
                            dayMaxEvents={false}
                            eventContent={renderCalendarEventContent}
                            eventClassNames={calendarEventClassNames}
                            eventClick={handleEventClick}
                            eventDidMount={attachCalendarEventTooltip}
                            eventWillUnmount={detachCalendarEventTooltip}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (data?.events ?? []).length > 0 ? (
                <section className="empty-state panel">
                  <h2 className="empty-state__title">No sessions match your filters</h2>
                  <p className="empty-state__text">
                    Turn session types back on or include more rinks using the filters above.
                  </p>
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
