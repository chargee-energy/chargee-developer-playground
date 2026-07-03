import { useCallback, useEffect, useRef, useState } from 'react'
import { groupControllerGetGroupSparkiesV2 } from '@/api/generated/groups/groups'
import type { GroupAddressDto } from '@/api/generated/model'
import { AbortedError, mapWithConcurrency } from '@/utils/concurrency'
import { useReportCache } from '@/store/reportCache'

// Throttle knobs — tuned in one place to keep backend load reasonable.
const ADDRESS_PAGE = 1000
const MAX_ADDRESS_PAGES = 20 // up to 20k addresses
const FETCH_CONCURRENCY = 4 // simultaneous per-address device calls
const FETCH_STAGGER_MS = 60 // small delay between a worker's requests

export type ReportStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled'

export interface ReportTotals {
  /** Number of addresses scanned in the group. */
  addresses: number
  /** Number of addresses that have at least one matching device. */
  addressesWithData: number
}

interface CachedReport<TRow> {
  rows: TRow[]
  totals: ReportTotals
}

const EMPTY_TOTALS: ReportTotals = { addresses: 0, addressesWithData: 0 }

/** Fetch every address in a group by paging through the offset/limit endpoint. */
async function loadAllAddresses(groupUuid: string, signal: AbortSignal): Promise<GroupAddressDto[]> {
  const first = await groupControllerGetGroupSparkiesV2(groupUuid, { limit: ADDRESS_PAGE, offset: 0 }, undefined, signal)
  const total = first.meta?.total ?? 0
  const pages = Math.min(Math.ceil(total / ADDRESS_PAGE), MAX_ADDRESS_PAGES)
  const offsets = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => (i + 1) * ADDRESS_PAGE)

  const rest = await mapWithConcurrency(
    offsets,
    FETCH_CONCURRENCY,
    (offset) =>
      groupControllerGetGroupSparkiesV2(groupUuid, { limit: ADDRESS_PAGE, offset }, undefined, signal).then(
        (r) => r.results ?? [],
      ),
    { signal },
  )

  return [...(first.results ?? []), ...rest.flat()]
}

/**
 * Generic engine behind every group-wide report: pages all addresses, then runs
 * `fetchRows` per address through a throttled worker pool and flattens the
 * result into one array of rows. Handles progress, cancellation, and caching
 * (keyed by `<cacheKeyPrefix>:<groupUuid>`) so results survive navigation.
 *
 * `fetchRows` receives each address (so it can attach sparky/flint info) and
 * returns zero or more rows for that address.
 */
export function useAddressReport<TRow>(
  groupUuid: string | null,
  cacheKeyPrefix: string,
  fetchRows: (address: GroupAddressDto, signal: AbortSignal) => Promise<TRow[]>,
) {
  const cacheKey = groupUuid ? `${cacheKeyPrefix}:${groupUuid}` : null
  const setEntry = useReportCache((s) => s.setEntry)

  // Keep the latest fetcher without forcing `run` to change identity.
  const fetchRef = useRef(fetchRows)
  fetchRef.current = fetchRows

  const readCache = (key: string | null) =>
    key ? useReportCache.getState().getEntry<CachedReport<TRow>>(key) : undefined

  // Seed straight from the cache so returning to the report shows the last
  // generated result without a flash of the empty state.
  const [status, setStatus] = useState<ReportStatus>(() => (readCache(cacheKey) ? 'done' : 'idle'))
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [rows, setRows] = useState<TRow[]>(() => readCache(cacheKey)?.data.rows ?? [])
  const [totals, setTotals] = useState<ReportTotals>(() => readCache(cacheKey)?.data.totals ?? EMPTY_TOTALS)
  const [generatedAt, setGeneratedAt] = useState<string | null>(() => readCache(cacheKey)?.generatedAt ?? null)
  const [error, setError] = useState<unknown>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Re-hydrate when the group (and therefore the cache key) changes.
  useEffect(() => {
    const cached = readCache(cacheKey)
    if (cached) {
      setRows(cached.data.rows)
      setTotals(cached.data.totals)
      setGeneratedAt(cached.generatedAt)
      setStatus('done')
    } else {
      setRows([])
      setTotals(EMPTY_TOTALS)
      setGeneratedAt(null)
      setStatus('idle')
    }
    setProgress({ done: 0, total: 0 })
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const run = useCallback(async () => {
    if (!groupUuid || !cacheKey) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setStatus('running')
    setError(null)
    setRows([])
    setTotals(EMPTY_TOTALS)
    setProgress({ done: 0, total: 0 })

    try {
      const addresses = await loadAllAddresses(groupUuid, signal)
      if (signal.aborted) {
        setStatus('cancelled')
        return
      }
      setProgress({ done: 0, total: addresses.length })

      const perAddress = await mapWithConcurrency(
        addresses,
        FETCH_CONCURRENCY,
        (address) => fetchRef.current(address, signal),
        {
          signal,
          minDelayMs: FETCH_STAGGER_MS,
          onProgress: (done, total) => setProgress({ done, total }),
        },
      )

      const flatRows = perAddress.flat()
      const nextTotals: ReportTotals = {
        addresses: addresses.length,
        addressesWithData: perAddress.filter((r) => r.length > 0).length,
      }
      const stamp = new Date().toISOString()

      setRows(flatRows)
      setTotals(nextTotals)
      setGeneratedAt(stamp)
      setStatus('done')
      setEntry<CachedReport<TRow>>(cacheKey, { rows: flatRows, totals: nextTotals }, stamp)
    } catch (err) {
      if (err instanceof AbortedError || signal.aborted) {
        setStatus('cancelled')
      } else {
        setError(err)
        setStatus('error')
      }
    }
  }, [groupUuid, cacheKey, setEntry])

  return { status, progress, rows, totals, generatedAt, error, run, cancel }
}
