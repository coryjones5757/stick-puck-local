import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { EventApi, EventClickArg, EventContentArg, EventMountArg } from '@fullcalendar/core'
import { SiteFooter } from './components/SiteFooter'
import { SiteHeader } from './components/SiteHeader'
import { RINK_COLORS, RINK_REGISTRY, rinkPhotoFor, rinkThumbInitials } from './rinkData'
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

/** Source tooltips on hover: require a short dwell so scrolling past rows does not pop them open. */
const TOOLTIP_HOVER_DWELL_MS = 420

type ScheduleViewMode = 'list' | 'month' | 'rinks'

/** Time shortcuts — filter every schedule view without changing rink/type filters. */
type ListQuickFocus = 'all' | 'today' | 'tonight' | 'tomorrow' | 'weekend'

function sessionEndInFuture(e: HockeyEvent, nowMs: number) {
  return new Date(e.end).getTime() > nowMs
}

function groupEventsByDenverDay(events: readonly HockeyEvent[]) {
  const groups: { dayStart: number; items: HockeyEvent[] }[] = []
  for (const evt of events) {
    const dayStart = denverDayStartMs(evt.start)
    const last = groups[groups.length - 1]
    if (!last || last.dayStart !== dayStart) {
      groups.push({ dayStart, items: [evt] })
    } else {
      last.items.push(evt)
    }
  }
  return groups
}

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
  const [scheduleView, setScheduleView] = useState<ScheduleViewMode>('rinks')
  const [typesOn, setTypesOn] = useState<{ SP: boolean; DI: boolean; PS: boolean }>({
    SP: true,
    DI: true,
    PS: true,
  })
  const [rinksOn, setRinksOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(RINK_REGISTRY.map((r) => [r.id, true])),
  )
  const [listViewHorizonDays, setListViewHorizonDays] = useState(LIST_VIEW_HORIZON_DAYS_INITIAL)
  const [listQuickFocus, setListQuickFocus] = useState<ListQuickFocus>('all')
  /** Wall clock for hiding ended sessions in the list; ticks every minute and on fresh schedule data. */
  const [listActiveNowMs, setListActiveNowMs] = useState(() => Date.now())
  const [quickFocusScrollNonce, setQuickFocusScrollNonce] = useState(0)
  const [filterMenuOpen, setFilterMenuOpen] = useState<'types' | 'rinks' | null>(null)
  const typesMenuRef = useRef<HTMLDivElement>(null)
  const rinksMenuRef = useRef<HTMLDivElement>(null)
  const tooltipHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipShowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissTooltipFromScrollRef = useRef<() => void>(() => {})

  function clearTooltipShowTimer() {
    if (tooltipShowTimer.current !== null) {
      clearTimeout(tooltipShowTimer.current)
      tooltipShowTimer.current = null
    }
  }

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

  /** Close any visible tooltip and cancel a pending hover-open (e.g. user is scrolling). */
  function dismissTooltipFromScroll() {
    clearTooltipShowTimer()
    clearTooltipHideTimer()
    setTooltip(null)
  }

  useEffect(() => {
    dismissTooltipFromScrollRef.current = dismissTooltipFromScroll
  })

  useEffect(() => {
    const opts = { capture: true, passive: true } as const
    const onScrollLikeGesture = () => dismissTooltipFromScrollRef.current()
    window.addEventListener('wheel', onScrollLikeGesture, opts)
    window.addEventListener('touchmove', onScrollLikeGesture, opts)
    return () => {
      window.removeEventListener('wheel', onScrollLikeGesture, opts)
      window.removeEventListener('touchmove', onScrollLikeGesture, opts)
    }
  }, [])

  function showTooltip(hockey: HockeyEvent, anchor: DOMRect) {
    clearTooltipShowTimer()
    clearTooltipHideTimer()
    setTooltip({ hockey, anchor })
  }

  function queueTooltipHover(hockey: HockeyEvent, anchorEl: HTMLElement) {
    clearTooltipShowTimer()
    tooltipShowTimer.current = setTimeout(() => {
      tooltipShowTimer.current = null
      if (!anchorEl.isConnected) {
        return
      }
      showTooltip(hockey, anchorEl.getBoundingClientRect())
    }, TOOLTIP_HOVER_DWELL_MS)
  }

  function endTooltipHoverTarget() {
    clearTooltipShowTimer()
    scheduleTooltipClose()
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

  function selectAllSessionTypes() {
    setListViewHorizonDays(LIST_VIEW_HORIZON_DAYS_INITIAL)
    setTypesOn({ SP: true, DI: true, PS: true })
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setFilterMenuOpen(null)
        clearTooltipShowTimer()
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
    return () => {
      clearTooltipHideTimer()
      clearTooltipShowTimer()
    }
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setListActiveNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (data?.generatedAt == null) {
      return
    }
    const id = requestAnimationFrame(() => {
      setListActiveNowMs(Date.now())
    })
    return () => cancelAnimationFrame(id)
  }, [data?.generatedAt])

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

  const listCalendarFromToday = useMemo(() => {
    const todayStart = denverNowDayStartMs()
    return filteredEvents.filter((e) => denverDayStartMs(e.start) >= todayStart)
  }, [filteredEvents])

  const listFutureEvents = useMemo(
    () => listCalendarFromToday.filter((e) => sessionEndInFuture(e, listActiveNowMs)),
    [listCalendarFromToday, listActiveNowMs],
  )

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
      return t0(a) - t0(b)
    })
    return copy
  }, [listViewEvents])

  const intentFilteredSortedEvents = useMemo(() => {
    if (listQuickFocus === 'all') {
      return sortedListEvents
    }
    return sortedListEvents.filter((e) => matchesListQuickFocus(e, listQuickFocus))
  }, [sortedListEvents, listQuickFocus])

  /** Future sessions from today onward (not ended), for quick-focus counts — not limited to the list horizon. */
  const quickFocusCountPool = useMemo(() => {
    const copy = [...listFutureEvents]
    const dayMs = (e: HockeyEvent) => denverDayStartMs(e.start)
    const t0 = (e: HockeyEvent) => new Date(e.start).getTime()
    copy.sort((a, b) => {
      const da = dayMs(a)
      const db = dayMs(b)
      if (da !== db) {
        return da - db
      }
      return t0(a) - t0(b)
    })
    return copy
  }, [listFutureEvents])

  const quickFocusCounts = useMemo(() => {
    const today0 = denverNowDayStartMs()
    const tomorrow0 = addDenverCalendarDays(today0, 1)
    let all = 0
    let today = 0
    let tonight = 0
    let tomorrow = 0
    let weekend = 0
    for (const e of quickFocusCountPool) {
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
  }, [quickFocusCountPool])

  const listDayGroups = useMemo(
    () => groupEventsByDenverDay(intentFilteredSortedEvents),
    [intentFilteredSortedEvents],
  )

  const rinksGridRows = useMemo(() => {
    const sortedRinks = [...RINK_REGISTRY].sort((a, b) => a.id.localeCompare(b.id))
    const byId = new Map<string, HockeyEvent[]>()
    for (const r of RINK_REGISTRY) {
      byId.set(r.id, [])
    }
    for (const e of intentFilteredSortedEvents) {
      byId.get(e.rink)?.push(e)
    }
    return sortedRinks.map((rink) => ({
      rink,
      events: byId.get(rink.id) ?? [],
      dayGroups: groupEventsByDenverDay(byId.get(rink.id) ?? []),
    }))
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

  const calendarSourceEvents = useMemo(() => {
    if (listQuickFocus === 'all') {
      return filteredEvents
    }
    return filteredEvents.filter((e) => matchesListQuickFocus(e, listQuickFocus))
  }, [filteredEvents, listQuickFocus])

  const calendarEvents = useMemo(
    () =>
      calendarSourceEvents.map((event) => ({
        id: event.id,
        title: calendarBlockTitle(event),
        start: event.start,
        end: event.end,
        allDay: false,
        extendedProps: event,
      })),
    [calendarSourceEvents],
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
    if (scheduleView !== 'month') {
      return
    }
    const api = calendarRef.current?.getApi()
    api?.changeView('dayGridMonth')
  }, [scheduleView])

  function toggleRink(id: string) {
    setListViewHorizonDays(LIST_VIEW_HORIZON_DAYS_INITIAL)
    setRinksOn((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  function selectAllRinks() {
    setListViewHorizonDays(LIST_VIEW_HORIZON_DAYS_INITIAL)
    setRinksOn(Object.fromEntries(RINK_REGISTRY.map((r) => [r.id, true])))
  }

  function deselectAllRinks() {
    setListViewHorizonDays(LIST_VIEW_HORIZON_DAYS_INITIAL)
    setRinksOn(Object.fromEntries(RINK_REGISTRY.map((r) => [r.id, false])))
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
    setListQuickFocus(f)
    if (f !== 'all' && scheduleView === 'list') {
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
    const onEnter = () => queueTooltipHover(hockey, el)
    const onLeave = () => endTooltipHoverTarget()
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
    queueTooltipHover(event, anchor)
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
              All Utah Ice Sessions
              <br />
              <span className="hero-title__accent">One Place</span>
            </h1>
            <p className="hero-sub">Sessions from Logal to Provo.</p>
            <p className="hero-disclaimer">
              This site not affiliated with any rink or hockey organization.{`  `}Please confirm every session with the
              facility.
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
                      {(
                        [
                          { mode: 'rinks' as const, label: 'Rinks', ariaLabel: 'Rinks grid by venue' },
                          { mode: 'list' as const, label: 'List', ariaLabel: 'List view' },
                          { mode: 'month' as const, label: 'Month', ariaLabel: 'Month calendar' },
                        ] as const
                      ).map(({ mode, label, ariaLabel }) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={scheduleView === mode}
                          aria-label={ariaLabel}
                          className={`view-toggle__btn ${scheduleView === mode ? 'view-toggle__btn--active' : ''}`}
                          onClick={() => setScheduleView(mode)}
                        >
                          {label}
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
                            className="filter-ms__panel filter-ms__panel--types"
                            id="schedule-filter-types-panel"
                            role="group"
                            aria-labelledby="schedule-filter-types-trigger"
                            onMouseDown={preventFilterPanelMouseDownScroll}
                          >
                            <div className="filter-ms__panel--types-body">
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
                            <div className="filter-ms__panel-footer filter-ms__panel-footer--bulk">
                              <button
                                type="button"
                                className="filter-ms__bulk-link"
                                onClick={selectAllSessionTypes}
                                disabled={typesOn.SP && typesOn.DI && typesOn.PS}
                              >
                                Select all
                              </button>
                            </div>
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
                            <div className="filter-ms__panel--rinks-scroll">
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
                            <div className="filter-ms__panel-footer filter-ms__panel-footer--bulk">
                              <button
                                type="button"
                                className="filter-ms__bulk-link"
                                onClick={selectAllRinks}
                                disabled={RINK_REGISTRY.every((r) => rinksOn[r.id])}
                              >
                                Select all
                              </button>
                              <button
                                type="button"
                                className="filter-ms__bulk-link"
                                onClick={deselectAllRinks}
                                disabled={RINK_REGISTRY.every((r) => !rinksOn[r.id])}
                              >
                                Deselect all
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="schedule-toolbar__quick-focus quick-focus" role="group" aria-label="Time focus">
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
                            aria-label={`${label}: ${quickFocusCounts[id]} upcoming sessions from today onward (Mountain), matching rink and type filters`}
                            onClick={() => applyQuickFocus(id)}
                          >
                            <span className="quick-focus__chip-label">{label}</span>
                            {id !== 'all' && id !== 'today' ? (
                              <span className="quick-focus__chip-count">{quickFocusCounts[id]}</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="schedule-toolbar__actions">
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
                      {listCalendarFromToday.length === 0 ? (
                        <section className="empty-state panel list-past-empty">
                          <p className="empty-state__text">
                            No sessions from today onward with these filters. The list only shows today and future
                            dates.
                          </p>
                        </section>
                      ) : listFutureEvents.length === 0 ? (
                        <section className="empty-state panel list-past-empty">
                          <h2 className="empty-state__title">No more sessions today</h2>
                          <p className="empty-state__text">
                            Everything that was on the schedule from today onward has already ended, or the next
                            posted slot is still in the future. Check back later or adjust your filters.
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
                                        onMouseLeave={endTooltipHoverTarget}
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

                  {scheduleView === 'month' &&
                    (calendarSourceEvents.length === 0 && filteredEvents.length > 0 ? (
                      <section className="empty-state panel list-past-empty">
                        <h2 className="empty-state__title">No sessions for this time focus</h2>
                        <p className="empty-state__text">
                          Nothing matches{' '}
                          <strong>
                            {listQuickFocus === 'today'
                              ? 'today'
                              : listQuickFocus === 'tonight'
                                ? 'tonight (5pm onward, Mountain Time)'
                                : listQuickFocus === 'tomorrow'
                                  ? 'tomorrow'
                                  : listQuickFocus === 'weekend'
                                    ? 'Saturday or Sunday'
                                    : 'this filter'}
                          </strong>{' '}
                          with your current rink and session filters. Try another shortcut or reset filters.
                        </p>
                        <button type="button" className="btn btn--accent" onClick={() => applyQuickFocus('all')}>
                          Show all sessions
                        </button>
                      </section>
                    ) : (
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
                    ))}

                  {scheduleView === 'rinks' && (
                    <>
                      {listCalendarFromToday.length === 0 ? (
                        <section className="empty-state panel list-past-empty">
                          <p className="empty-state__text">
                            No sessions from today onward with these filters. The list only shows today and future
                            dates.
                          </p>
                        </section>
                      ) : listFutureEvents.length === 0 ? (
                        <section className="empty-state panel list-past-empty">
                          <h2 className="empty-state__title">No more sessions today</h2>
                          <p className="empty-state__text">
                            Everything on the schedule from today onward has already ended for these filters. Check
                            back later or try other rinks and session types.
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
                          <h2 className="empty-state__title">No sessions for this time focus</h2>
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
                          <section className="rink-schedule-grid-wrap panel" aria-label="Schedules by rink">
                            <p className="rink-schedule-grid-wrap__lede">
                              Next {listViewHorizonDays} calendar days (Mountain), same window as List. Time focus
                              (Today, Tonight, …) applies here too. Turn rinks on or off in the filter above.
                            </p>
                            <div className="rink-schedule-grid">
                              {rinksGridRows.map(({ rink, events, dayGroups }) => {
                                const rinkEnabled = rinksOn[rink.id]
                                const venuePhoto = rinkPhotoFor(rink.id)
                                return (
                                  <article
                                    key={rink.id}
                                    className={`rink-schedule-card ${!rinkEnabled ? 'rink-schedule-card--filtered-out' : ''}`}
                                    style={{ '--session-rink-accent': rinkColor(rink.id) } as CSSProperties}
                                  >
                                    <header className="rink-schedule-card__header">
                                      <div
                                        className={`rink-schedule-card__thumb ${venuePhoto ? '' : 'rink-schedule-card__thumb--placeholder'}`}
                                      >
                                        {venuePhoto ? (
                                          <img
                                            className="rink-schedule-card__thumb-img"
                                            src={venuePhoto.src}
                                            alt={venuePhoto.alt}
                                            loading="lazy"
                                            decoding="async"
                                          />
                                        ) : (
                                          <span className="rink-schedule-card__thumb-initials" aria-hidden>
                                            {rinkThumbInitials(rink.abbrev)}
                                          </span>
                                        )}
                                      </div>
                                      <div className="rink-schedule-card__head-main">
                                        <h2 className="rink-schedule-card__title">{rink.id}</h2>
                                        <p className="rink-schedule-card__city">{rink.city}</p>
                                        <p className="rink-schedule-card__meta">
                                          {!rinkEnabled ? (
                                            <span>Rink turned off in filters — enable it above to see sessions.</span>
                                          ) : events.length === 0 ? (
                                            <span>
                                              No sessions in the next {listViewHorizonDays} days with current type
                                              filters.
                                            </span>
                                          ) : (
                                            <span>
                                              <strong>{events.length}</strong>{' '}
                                              {events.length === 1 ? 'session' : 'sessions'} in the next{' '}
                                              {listViewHorizonDays} days
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    </header>
                                    <div className="rink-schedule-card__body">
                                      {!rinkEnabled ? (
                                        <p className="rink-schedule-card__muted">
                                          This rink is off in the Rinks filter. Turn it on to see sessions here.
                                        </p>
                                      ) : events.length === 0 ? (
                                        <p className="rink-schedule-card__muted">
                                          Expand session types or use <strong>Load more days</strong> below if the window is
                                          too short.
                                        </p>
                                      ) : (
                                        <ul className="rink-schedule-card__days">
                                          {dayGroups.map((group) => (
                                            <li key={group.dayStart} className="rink-schedule-card__day">
                                              <h3 className="rink-schedule-card__day-heading">
                                                {formatDenverListDayHeading(group.dayStart)}
                                              </h3>
                                              <ul className="rink-schedule-card__sessions">
                                                {group.items.map((evt) => (
                                                  <li key={evt.id}>
                                                    <button
                                                      type="button"
                                                      className={`rink-grid-session ${
                                                        effectiveSelectedId === evt.id ? 'rink-grid-session--selected' : ''
                                                      }`}
                                                      style={
                                                        { '--session-rink-accent': rinkColor(evt.rink) } as CSSProperties
                                                      }
                                                      onClick={() => setSelectedEventId(evt.id)}
                                                      onMouseEnter={(e) =>
                                                        handleSidebarItemHover(evt, e.currentTarget)
                                                      }
                                                      onMouseLeave={endTooltipHoverTarget}
                                                    >
                                                      <span className="rink-grid-session__row rink-grid-session__row--meta">
                                                        <span className="rink-grid-session__time">
                                                          {toTimeRange(evt.start, evt.end)}
                                                        </span>
                                                        <span className="rink-grid-session__badges">
                                                          {isTonightSession(evt.start) ? (
                                                            <span className="session-card__badge-tonight">
                                                              Tonight
                                                            </span>
                                                          ) : null}
                                                          {isStartingSoon(evt.start) ? (
                                                            <span className="session-card__badge-soon">Soon</span>
                                                          ) : null}
                                                          {evt.synthetic ? (
                                                            <span
                                                              className="session-card__badge-est"
                                                              title="Generated from published schedule — verify before traveling"
                                                            >
                                                              est.
                                                            </span>
                                                          ) : null}
                                                        </span>
                                                      </span>
                                                      <span className="rink-grid-session__row rink-grid-session__row--type">
                                                        <span
                                                          className={`session-tag session-tag--${sessionPillKind(evt.type)}`}
                                                        >
                                                          {sessionTypeLabel(evt.type)}
                                                        </span>
                                                      </span>
                                                    </button>
                                                  </li>
                                                ))}
                                              </ul>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  </article>
                                )
                              })}
                            </div>
                          </section>
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
          onMouseEnterPanel={() => {
            clearTooltipShowTimer()
            clearTooltipHideTimer()
          }}
          onMouseLeavePanel={endTooltipHoverTarget}
        />
      )}
    </div>
  )
}
