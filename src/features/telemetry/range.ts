/**
 * UTC ISO bounds for the viewer's LOCAL day. Selecting "24 Jun" fetches the
 * local 24 Jun (00:00–24:00 in the browser's timezone), not the UTC day — so
 * the data lines up with the locally-displayed times.
 */
export function localDayRangeUTC(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0)
  const end = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999)
  return { fromDate: start.toISOString(), toDate: end.toISOString() }
}

/**
 * Whole local-day range params for the range-based energy endpoints.
 * Pass `limit = null` to fetch the full day without a record cap.
 */
export function dayRange(date: string, limit: number | null = 500) {
  return {
    ...localDayRangeUTC(date),
    sortBy: 'ASC' as const,
    ...(limit == null ? {} : { limit }),
  }
}

/** UTC ISO bounds for a local calendar month (value = "YYYY-MM"). */
export function localMonthRangeUTC(month: string) {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, (m ?? 1) - 1, 1, 0, 0, 0, 0)
  const end = new Date(y, m ?? 1, 0, 23, 59, 59, 999) // day 0 of next month = last day
  return { fromDate: start.toISOString(), toDate: end.toISOString() }
}

/** UTC ISO bounds for `yearsBack + 1` local calendar years ending at `year`. */
export function localYearRangeUTC(year: number, yearsBack = 0) {
  const start = new Date(year - yearsBack, 0, 1, 0, 0, 0, 0)
  const end = new Date(year, 11, 31, 23, 59, 59, 999)
  return { fromDate: start.toISOString(), toDate: end.toISOString() }
}
