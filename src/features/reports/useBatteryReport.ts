import { useCallback, useEffect, useRef, useState } from 'react'
import { AbortedError } from '@/utils/concurrency'
import { useReportCache } from '@/store/reportCache'
import { fetchHourlyPrices, priceRequestCount } from '@/api/energyZero'
import { fetchAddressHourlyHistory, fetchQuarterHourlyNetPowerW, monthChunks, type HourlySlot } from './addressEnergyHistory'
import { recommendInverterKw } from './batterySizing'
import type { ReportStatus } from './useAddressReport'

export interface BatteryReportData {
  slots: HourlySlot[]
  /** Recommended inverter power from the 95th percentile of 15-min peaks. */
  inverterKw: number
  /** Hourly EUR/kWh (incl. BTW) as entries, keyed by UTC hour ISO. */
  priceEntries: Array<[string, number]>
  periodDays: number
  hasSmartMeter: boolean
  hasSolar: boolean
  fromIso: string
  toIso: string
}

/**
 * Data phase of the battery advice report: fetches a period of hourly energy
 * history, quarter-hourly peaks (inverter sizing), and EPEX hourly prices.
 * The simulation itself is pure and runs reactively on top of this data, so
 * tweaking strategy or rates does not refetch anything.
 */
export function useBatteryReport(addressUuid: string | null, months: number) {
  const cacheKey = addressUuid ? `batteryAdvice:${addressUuid}:${months}` : null
  const setEntry = useReportCache((s) => s.setEntry)
  const readCache = (key: string | null) =>
    key ? useReportCache.getState().getEntry<BatteryReportData>(key) : undefined

  const [status, setStatus] = useState<ReportStatus>(() => (readCache(cacheKey) ? 'done' : 'idle'))
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [data, setData] = useState<BatteryReportData | null>(() => readCache(cacheKey)?.data ?? null)
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
    if (!addressUuid || !cacheKey) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setStatus('running')
    setError(null)
    setData(null)
    setProgress({ done: 0, total: 0 })

    // Whole months ending at the start of the current hour.
    const to = new Date()
    to.setMinutes(0, 0, 0)
    const from = new Date(to)
    from.setMonth(from.getMonth() - months)

    const chunkCount = monthChunks(from, to).length
    // Initial estimate: history (assume 1 meter + 1 inverter) + peaks + prices.
    let total = chunkCount * 2 + chunkCount + priceRequestCount(from, to)
    let done = 0
    const bump = () => {
      done++
      setProgress({ done, total })
    }

    try {
      const history = await fetchAddressHourlyHistory(addressUuid, from, to, {
        signal,
        onRequestDone: bump,
        onPlan: (historyTotal) => {
          total = historyTotal + chunkCount + priceRequestCount(from, to)
          setProgress({ done, total })
        },
      })

      const [netPowerW, priceMap] = await Promise.all([
        fetchQuarterHourlyNetPowerW(addressUuid, from, to, { signal, onRequestDone: bump }),
        fetchHourlyPrices(from, to, { signal, onProgress: bump }),
      ])

      if (signal.aborted) {
        setStatus('cancelled')
        return
      }

      const periodDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000))
      const result: BatteryReportData = {
        slots: history.slots,
        inverterKw: recommendInverterKw(netPowerW),
        priceEntries: [...priceMap.entries()],
        periodDays,
        hasSmartMeter: history.hasSmartMeter,
        hasSolar: history.hasSolar,
        fromIso: from.toISOString(),
        toIso: to.toISOString(),
      }
      const stamp = new Date().toISOString()
      setData(result)
      setGeneratedAt(stamp)
      setStatus('done')
      setEntry<BatteryReportData>(cacheKey, result, stamp)
    } catch (err) {
      if (err instanceof AbortedError || signal.aborted) {
        setStatus('cancelled')
      } else {
        setError(err)
        setStatus('error')
      }
    }
  }, [addressUuid, cacheKey, months, setEntry])

  return { status, progress, data, generatedAt, error, run, cancel }
}
