import { format, parseISO, formatDistanceToNow } from 'date-fns'

// The generated `DateTime` type is an opaque object, but values are ISO
// strings at runtime — accept anything and coerce.
type DateLike = string | number | null | undefined | Record<string, unknown>

function asString(value: DateLike): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

const TZ_RE = /(?:Z|[+-]\d{2}:?\d{2})$/

// Parse an API timestamp. Strings that carry a zone (Z / ±hh:mm) are converted
// to the viewer's local timezone by date-fns; zone-less strings are taken
// at face value (they are already local).
function parseInstant(s: string): Date {
  return parseISO(s)
}

// For endpoints that return UTC times without a zone designator: treat a
// zone-less datetime as UTC (append Z) so it renders in the viewer's local
// timezone. Date-only and already-zoned strings are left as-is.
function parseUtcInstant(s: string): Date {
  return parseISO(!s.includes('T') || TZ_RE.test(s) ? s : `${s}Z`)
}

// For data already in the provider's timezone (e.g. P4): drop any zone
// designator and show the wall-clock exactly as written — no conversion.
function parseRawInstant(s: string): Date {
  return parseISO(s.replace(TZ_RE, ''))
}

export type TimeMode = 'local' | 'utc' | 'raw'

export function fmtDate(value?: DateLike, pattern = 'd MMM yyyy'): string {
  const s = asString(value)
  if (!s) return '—'
  try {
    return format(parseInstant(s), pattern)
  } catch {
    return s
  }
}

export function fmtDateTime(value?: DateLike): string {
  return fmtDate(value, 'd MMM yyyy HH:mm')
}

export function fmtDateTimeSec(value?: DateLike): string {
  return fmtDate(value, 'd MMM yyyy HH:mm:ss')
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T/
export const isIsoString = (v: unknown): v is string => typeof v === 'string' && ISO_RE.test(v)

export function fmtTime(value?: DateLike): string {
  return fmtDate(value, 'HH:mm:ss')
}

/**
 * X-axis labels for a time series: shows time-only within a day, but prefixes
 * the date on the first point of each new day — so a 48h range shows 2 dates.
 * `mode`: 'local' converts to the viewer's timezone, 'utc' treats zone-less
 * times as UTC then converts, 'raw' shows the wall-clock as written (no shift).
 */
export function timeAxisLabels(values: DateLike[], mode: TimeMode = 'local'): string[] {
  const parse = mode === 'utc' ? parseUtcInstant : mode === 'raw' ? parseRawInstant : parseInstant
  let prevDay = ''
  return values.map((v) => {
    const s = asString(v)
    if (!s) return '—'
    try {
      const d = parse(s)
      const day = format(d, 'yyyy-MM-dd')
      const label = day !== prevDay ? format(d, 'd MMM HH:mm') : format(d, 'HH:mm')
      prevDay = day
      return label
    } catch {
      return s
    }
  })
}

export function fmtAgo(value?: DateLike): string {
  const s = asString(value)
  if (!s) return '—'
  try {
    return formatDistanceToNow(parseInstant(s), { addSuffix: true })
  } catch {
    return '—'
  }
}

/** Today's date as YYYY-MM-DD (default date param for telemetry queries). */
export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/** Current month as YYYY-MM. */
export function thisMonth(): string {
  return format(new Date(), 'yyyy-MM')
}

/** Current calendar year. */
export function thisYear(): number {
  return new Date().getFullYear()
}

export function fmtNumber(value?: number | null, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return value.toLocaleString(undefined, { maximumFractionDigits: digits })
}

/** Short, readable UUID for chips/labels. */
export function shortId(uuid?: string | null): string {
  if (!uuid) return '—'
  return uuid.length > 12 ? `${uuid.slice(0, 8)}…${uuid.slice(-4)}` : uuid
}
