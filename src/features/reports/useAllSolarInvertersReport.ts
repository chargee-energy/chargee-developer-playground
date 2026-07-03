import { useCallback, useEffect, useRef, useState } from 'react'
import { groupControllerGetGroupSparkiesV2 } from '@/api/generated/groups/groups'
import { solarInvertersControllerListV2 } from '@/api/generated/solar-inverters/solar-inverters'
import type { GroupAddressDto, SolarInverterDto } from '@/api/generated/model'
import { AbortedError, mapWithConcurrency } from '@/utils/concurrency'
import { useReportCache } from '@/store/reportCache'
import {
  deriveConnectionType,
  deriveProductionStatus,
  type ConnectionType,
  type ProductionStatus,
} from './reportSolarStatus'

// Throttle knobs — tuned in one place to keep backend load reasonable.
const ADDRESS_PAGE = 1000
const MAX_ADDRESS_PAGES = 20 // up to 20k addresses
const SOLAR_CONCURRENCY = 4 // simultaneous per-address solar calls
const SOLAR_STAGGER_MS = 60 // small delay between a worker's requests

export type ReportStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled'

export interface SolarInverterReportRow {
  addressUuid: string
  sparkySerial: string | null
  flintSerial: string | null
  identifier: string
  brand: string
  model: string | null
  connectionType: ConnectionType
  productionStatus: ProductionStatus
  lastProductionTime: string | null
  isProducing: boolean | null
  productionRateWh: number | null
}

function buildRows(address: GroupAddressDto, inverters: SolarInverterDto[]): SolarInverterReportRow[] {
  return inverters.map((inv) => {
    const info: any = inv.info ?? {}
    const ps: any = inv.lastProductionState ?? null
    return {
      addressUuid: address.uuid,
      sparkySerial: address.sparky?.serialNumber ?? null,
      flintSerial: address.flint?.serialNumber ?? null,
      identifier: inv.identifier,
      brand: info.brand ?? '',
      model: info.model ?? null,
      connectionType: deriveConnectionType(info),
      productionStatus: deriveProductionStatus(ps, info.isSteerable),
      lastProductionTime: ps?.time ?? null,
      isProducing: ps ? ps.isProducing ?? null : null,
      productionRateWh: ps ? ps.productionRate ?? null : null,
    }
  })
}

async function loadAllAddresses(groupUuid: string, signal: AbortSignal): Promise<GroupAddressDto[]> {
  const first = await groupControllerGetGroupSparkiesV2(groupUuid, { limit: ADDRESS_PAGE, offset: 0 }, undefined, signal)
  const total = first.meta?.total ?? 0
  const pages = Math.min(Math.ceil(total / ADDRESS_PAGE), MAX_ADDRESS_PAGES)
  const offsets = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => (i + 1) * ADDRESS_PAGE)

  const rest = await mapWithConcurrency(
    offsets,
    SOLAR_CONCURRENCY,
    (offset) =>
      groupControllerGetGroupSparkiesV2(groupUuid, { limit: ADDRESS_PAGE, offset }, undefined, signal).then(
        (r) => r.results ?? [],
      ),
    { signal },
  )

  return [...(first.results ?? []), ...rest.flat()]
}

/**
 * Imperative runner for the "All Solar Inverters" report. Pages every address in
 * the group, then fetches solar inverters per address with a throttled worker
 * pool, flattening the result into one row per inverter. Reports progress across
 * the per-address phase and can be cancelled mid-run.
 */
export interface ReportTotals {
  /** Number of addresses scanned in the group. */
  addresses: number
  /** Number of addresses that have at least one solar inverter. */
  addressesWithInverters: number
}

/** The shape persisted in the report cache so it can be restored on return. */
interface CachedSolarReport {
  rows: SolarInverterReportRow[]
  totals: ReportTotals
}

const EMPTY_TOTALS: ReportTotals = { addresses: 0, addressesWithInverters: 0 }

const cacheKeyFor = (groupUuid: string | null) => (groupUuid ? `allSolarInverters:${groupUuid}` : null)

const readCache = (key: string | null) =>
  key ? useReportCache.getState().getEntry<CachedSolarReport>(key) : undefined

export function useAllSolarInvertersReport(groupUuid: string | null) {
  const cacheKey = cacheKeyFor(groupUuid)
  const setEntry = useReportCache((s) => s.setEntry)

  // Seed straight from the cache so returning to the report shows the last
  // generated result without a flash of the empty state.
  const [status, setStatus] = useState<ReportStatus>(() => (readCache(cacheKey) ? 'done' : 'idle'))
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [rows, setRows] = useState<SolarInverterReportRow[]>(() => readCache(cacheKey)?.data.rows ?? [])
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
        SOLAR_CONCURRENCY,
        async (address) => {
          const res = await solarInvertersControllerListV2(address.uuid, undefined, signal)
          return buildRows(address, res.results ?? [])
        },
        {
          signal,
          minDelayMs: SOLAR_STAGGER_MS,
          onProgress: (done, total) => setProgress({ done, total }),
        },
      )

      const flatRows = perAddress.flat()
      const nextTotals: ReportTotals = {
        addresses: addresses.length,
        addressesWithInverters: perAddress.filter((r) => r.length > 0).length,
      }
      const stamp = new Date().toISOString()

      setRows(flatRows)
      setTotals(nextTotals)
      setGeneratedAt(stamp)
      setStatus('done')
      setEntry<CachedSolarReport>(cacheKey, { rows: flatRows, totals: nextTotals }, stamp)
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
