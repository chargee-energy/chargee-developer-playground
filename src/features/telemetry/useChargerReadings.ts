import { useCallback, useEffect, useRef, useState } from 'react'
import { chargerControllerListProductionEnergyV2 } from '@/api/generated/chargers/chargers'
import type { ChargerProductionReadingDto } from '@/api/generated/model'
import { pageReadings, READING_PAGE_LIMIT } from '@/utils/pageReadings'

// A day of ~10s charger data is ~9 pages, ~1s data ~86. Cap it so a wide range
// can't fire an unbounded number of requests — the UI flags the cut-off.
const MAX_PAGES = 30

export interface ChargerReading extends ChargerProductionReadingDto {
  /** Epoch ms of `time`, for the numeric chart axis. */
  t: number
}

interface CachedWindow {
  readings: ChargerReading[]
  truncated: boolean
}

/**
 * Raw charger readings for an arbitrary time window. The endpoint caps a page at
 * 1000 rows and ignores offset, so the window is paged by time (as the curtailment
 * report's block detail does). Changing the window aborts the running fetch;
 * completed windows are cached for the lifetime of the component.
 */
export function useChargerReadings(
  addressUuid: string,
  identifier: string,
  period: { fromMs: number; toMs: number } | null,
) {
  const [readings, setReadings] = useState<ChargerReading[]>([])
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [pages, setPages] = useState(0)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  const cache = useRef<Map<string, CachedWindow>>(new Map())

  const fromMs = period?.fromMs
  const toMs = period?.toMs

  useEffect(() => {
    setError(null)
    if (fromMs == null || toMs == null) {
      setReadings([])
      setTruncated(false)
      setLoading(false)
      return
    }
    const key = `${addressUuid}|${identifier}|${fromMs}|${toMs}`
    const cached = cache.current.get(key)
    if (cached) {
      setReadings(cached.readings)
      setTruncated(cached.truncated)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const { signal } = controller
    const collected: ChargerReading[] = []
    setReadings([])
    setTruncated(false)
    setPages(0)
    setLoading(true)

    pageReadings(
      fromMs,
      toMs,
      async (fromIso, toIso) => {
        const r = await chargerControllerListProductionEnergyV2(
          addressUuid,
          identifier,
          { fromDate: fromIso, toDate: toIso, sortBy: 'ASC', limit: READING_PAGE_LIMIT },
          undefined,
          signal,
        )
        return (r.results ?? []).map((row) => ({ ...row, t: new Date(row.time).getTime() }))
      },
      (row) => row.t,
      (rows) => collected.push(...rows),
      signal,
      { maxPages: MAX_PAGES, onPage: setPages },
    )
      .then((res) => {
        if (signal.aborted) return
        cache.current.set(key, { readings: collected, truncated: res.truncated })
        setReadings(collected)
        setTruncated(res.truncated)
      })
      .catch((err) => {
        if (!signal.aborted) setError(err)
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [addressUuid, identifier, fromMs, toMs, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  return { readings, truncated, loading, pages, error, retry }
}
