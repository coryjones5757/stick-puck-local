/**
 * All schedule bucketing, list horizons, and date filters use America/Denver
 * so list / week / month stay aligned regardless of the visitor's OS timezone.
 */
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'

dayjs.extend(utc)
dayjs.extend(timezone)

export const SCHEDULE_TIME_ZONE = 'America/Denver'

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

/** Start of calendar day in Denver for an instant (ISO string, Date, or epoch ms). */
export function denverDayStartMs(input: string | Date | number): number {
  return dayjs(input).tz(SCHEDULE_TIME_ZONE).startOf('day').valueOf()
}

export function denverNowDayStartMs(): number {
  return dayjs().tz(SCHEDULE_TIME_ZONE).startOf('day').valueOf()
}

/** Today's calendar date in Denver as `YYYY-MM-DD` (FullCalendar `initialDate` / `gotoDate`). */
export function denverTodayYmd(): string {
  return dayjs().tz(SCHEDULE_TIME_ZONE).format('YYYY-MM-DD')
}

/** Saturday or Sunday in America/Denver (session start instant). */
export function isDenverWeekendDay(iso: string): boolean {
  const wd = dayjs(iso).tz(SCHEDULE_TIME_ZONE).day()
  return wd === 6 || wd === 0
}

/** Same Denver calendar day as “now”, and hour ≥ 17 (5pm Mountain). */
export function isTonightInDenver(startIso: string): boolean {
  const d = dayjs(startIso).tz(SCHEDULE_TIME_ZONE)
  if (!d.isValid()) {
    return false
  }
  const nowDay = denverNowDayStartMs()
  if (denverDayStartMs(startIso) !== nowDay) {
    return false
  }
  return d.hour() >= 17
}

/** Add whole calendar days to a Denver day-start instant (returns new day-start ms). */
export function addDenverCalendarDays(dayStartMs: number, deltaDays: number): number {
  return dayjs(dayStartMs).tz(SCHEDULE_TIME_ZONE).add(deltaDays, 'day').startOf('day').valueOf()
}

/**
 * Interpret `YYYY-MM-DD` as that calendar date in Denver (not the browser's local date).
 * Returns start-of-day ms in Denver, or null if invalid.
 */
export function parseYmdToDenverDayStartMs(ymd: string): number | null {
  if (!ymd) {
    return null
  }
  const d = dayjs.tz(ymd, 'YYYY-MM-DD', SCHEDULE_TIME_ZONE)
  if (!d.isValid()) {
    return null
  }
  return d.startOf('day').valueOf()
}

/** List section titles: "Today, May 12th" / "Tomorrow, …" / weekday — all in Denver. */
export function formatDenverListDayHeading(dayStartMs: number): string {
  const day = dayjs(dayStartMs).tz(SCHEDULE_TIME_ZONE)
  const today0 = dayjs().tz(SCHEDULE_TIME_ZONE).startOf('day')
  const tomorrow0 = today0.add(1, 'day')
  const month = day.format('MMMM')
  const ord = ordinalDay(day.date())

  if (day.isSame(today0, 'day')) {
    return `Today, ${month} ${ord}`
  }
  if (day.isSame(tomorrow0, 'day')) {
    return `Tomorrow, ${month} ${ord}`
  }
  return `${day.format('dddd')}, ${month} ${ord}`
}

/**
 * Clamp an ISO end string so it never crosses into a different Denver calendar
 * day than `startIso`. Late-night sessions (e.g. 11:15 PM + 1.5 h = 12:45 AM)
 * would otherwise span two columns in FullCalendar's month grid.
 */
export function clampEndToDenverDay(startIso: string, endIso: string): string {
  const start = dayjs(startIso).tz(SCHEDULE_TIME_ZONE)
  const end = dayjs(endIso).tz(SCHEDULE_TIME_ZONE)
  if (!start.isValid() || !end.isValid()) {
    return endIso
  }
  const startDayEnd = start.endOf('day')
  if (end.isAfter(startDayEnd)) {
    return startDayEnd.toISOString()
  }
  return endIso
}

/** e.g. "Refreshed May 13th" — calendar date of last API pull in Denver */
export function formatRefreshedAtInDenver(iso: string): string {
  const d = dayjs(iso).tz(SCHEDULE_TIME_ZONE)
  return `Refreshed ${d.format('MMMM')} ${ordinalDay(d.date())}`
}

/**
 * Count events whose session **start** falls on one of the first `calendarDayCount`
 * inclusive Denver calendar days starting from today (days 0 … count-1).
 */
export function countSessionsInFirstDenverCalendarDays(
  events: { start: string }[],
  calendarDayCount: number,
): number {
  if (calendarDayCount < 1) {
    return 0
  }
  const t0 = denverNowDayStartMs()
  const tLast = addDenverCalendarDays(t0, calendarDayCount - 1)
  return events.filter((ev) => {
    const ed = denverDayStartMs(ev.start)
    return ed >= t0 && ed <= tLast
  }).length
}
