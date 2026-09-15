/** Server max rows per page on the raw device-reading endpoints. */
export const READING_PAGE_LIMIT = 1000

interface PageOptions {
  /** Rows requested per page (the endpoint's cap). */
  limit?: number
  /** Stop after this many pages even if the window isn't exhausted. */
  maxPages?: number
  /** Called after each page with the number of pages fetched so far. */
  onPage?: (pages: number) => void
}

/**
 * Page a raw-reading endpoint by time. These endpoints ignore `offset` and cap at
 * `limit` rows (~16 min of ~1s data), so we advance `fromDate` past the last
 * returned row each page (dropping the repeated boundary sample) until a short
 * page signals the window is exhausted. `onRows` receives each page's fresh rows.
 * Resolves `truncated: true` when `maxPages` cut the window off before its end.
 */
export async function pageReadings<T>(
  fromMs: number,
  toMs: number,
  fetchPage: (fromIso: string, toIso: string) => Promise<T[]>,
  timeOf: (row: T) => number,
  onRows: (rows: T[]) => void,
  signal: AbortSignal,
  { limit = READING_PAGE_LIMIT, maxPages = 12, onPage }: PageOptions = {},
): Promise<{ pages: number; truncated: boolean }> {
  const toIso = new Date(toMs).toISOString()
  let cursorMs = fromMs
  let lastMs = Number.NEGATIVE_INFINITY
  let pages = 0
  while (cursorMs < toMs) {
    if (signal.aborted) break
    if (pages >= maxPages) return { pages, truncated: true }
    const rows = await fetchPage(new Date(cursorMs).toISOString(), toIso)
    pages++
    onPage?.(pages)
    const fresh = rows.filter((r) => {
      const t = timeOf(r)
      return Number.isFinite(t) && t > lastMs
    })
    if (fresh.length > 0) {
      onRows(fresh)
      lastMs = timeOf(fresh[fresh.length - 1])
    }
    // Full page & advancing → more data remains; otherwise the window is done.
    if (rows.length >= limit && fresh.length > 0 && lastMs > cursorMs) cursorMs = lastMs
    else break
  }
  return { pages, truncated: false }
}
