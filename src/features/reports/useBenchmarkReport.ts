import { useCallback, useEffect, useRef, useState } from 'react'
import { AbortedError, mapWithConcurrency } from '@/utils/concurrency'
import { useReportCache } from '@/store/reportCache'
import { fetchAddressHourlyHistory } from './addressEnergyHistory'
import { computeBenchmarkMetrics, type AddressBenchmarkMetrics } from './benchmarkMetrics'
import { loadAllAddresses, type ReportStatus } from './useAddressReport'

// Number of cohort addresses fetched in parallel (each runs 2 requests at a time).
const ADDRESS_CONCURRENCY = 3

export interface BenchmarkReportData {
  target: AddressBenchmarkMetrics | null
  targetHasSmartMeter: boolean
  cohort: AddressBenchmarkMetrics[]
  /** Sampled addresses that had to be skipped (no smart meter / no data). */
  skipped: number
  cohortRequested: number
  fromIso: string
  toIso: string
}

/** Fisher-Yates shuffle (copy). */
function shuffle<T>(items: T[]): T[] {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Benchmark engine: fetches hourly history for the target address plus a
 * random sample of other group addresses, and reduces each to comparable
 * metrics. Progress counts addresses completed (target included).
 */
export function useBenchmarkReport(
  groupUuid: string | null,
  addressUuid: string | null,
  cohortSize: number,
  months: number,
) {
  const cacheKey =
    groupUuid && addressUuid ? `benchmark:${groupUuid}:${addressUuid}:${months}:${cohortSize}` : null
  const setEntry = useReportCache((s) => s.setEntry)
  const readCache = (key: string | null) =>
    key ? useReportCache.getState().getEntry<BenchmarkReportData>(key) : undefined

  const [status, setStatus] = useState<ReportStatus>(() => (readCache(cacheKey) ? 'done' : 'idle'))
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [data, setData] = useState<BenchmarkReportData | null>(() => readCache(cacheKey)?.data ?? null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(() => readCache(cacheKey)?.generatedAt ?? null)
  const [error, setError] = useState<unknown>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const cached = readCache(cacheKey)
    setData(cached?.data ?? null)
    setGeneratedAt(cached?.generatedAt ?? null)
    setStatus(cached ? 'done' : 'idle')
    setProgress({ done: 0, total: 0 })
    setError(null)
  }, [cacheKey])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const run = useCallback(async () => {
    if (!groupUuid || !addressUuid || !cacheKey) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setStatus('running')
    setError(null)
    setData(null)
    setProgress({ done: 0, total: 0 })

    const to = new Date()
    to.setMinutes(0, 0, 0)
    const from = new Date(to)
    from.setMonth(from.getMonth() - months)

    try {
      const addresses = await loadAllAddresses(groupUuid, signal)
      const others = addresses.filter((a) => a.uuid !== addressUuid)
      const sample = shuffle(others).slice(0, cohortSize)

      const jobs = [addressUuid, ...sample.map((a) => a.uuid)]
      setProgress({ done: 0, total: jobs.length })

      let done = 0
      const results = await mapWithConcurrency(
        jobs,
        ADDRESS_CONCURRENCY,
        async (uuid) => {
          try {
            const history = await fetchAddressHourlyHistory(uuid, from, to, { signal })
            return { uuid, history }
          } catch (err) {
            // Cancellation must bubble up; a single failing address should not
            // sink the whole benchmark.
            if (err instanceof AbortedError || signal.aborted) throw err
            return { uuid, history: null }
          } finally {
            done++
            setProgress({ done, total: jobs.length })
          }
        },
        { signal },
      )

      if (signal.aborted) {
        setStatus('cancelled')
        return
      }

      const targetResult = results[0]
      const cohortResults = results.slice(1)

      const target =
        targetResult.history && targetResult.history.hasSmartMeter && targetResult.history.slots.length > 0
          ? computeBenchmarkMetrics(addressUuid, targetResult.history.slots, targetResult.history.hasSolar)
          : null

      const cohort: AddressBenchmarkMetrics[] = []
      let skipped = 0
      for (const r of cohortResults) {
        if (r.history && r.history.hasSmartMeter && r.history.slots.length > 0) {
          cohort.push(computeBenchmarkMetrics(r.uuid, r.history.slots, r.history.hasSolar))
        } else {
          skipped++
        }
      }

      const result: BenchmarkReportData = {
        target,
        targetHasSmartMeter: !!targetResult.history?.hasSmartMeter,
        cohort,
        skipped,
        cohortRequested: sample.length,
        fromIso: from.toISOString(),
        toIso: to.toISOString(),
      }
      const stamp = new Date().toISOString()
      setData(result)
      setGeneratedAt(stamp)
      setStatus('done')
      setEntry<BenchmarkReportData>(cacheKey, result, stamp)
    } catch (err) {
      if (err instanceof AbortedError || signal.aborted) {
        setStatus('cancelled')
      } else {
        setError(err)
        setStatus('error')
      }
    }
  }, [groupUuid, addressUuid, cacheKey, cohortSize, months, setEntry])

  return { status, progress, data, generatedAt, error, run, cancel }
}
