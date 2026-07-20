import { useCallback, useEffect, useRef, useState } from 'react'
import {
  groupFlexScheduleControllerListV2,
  groupFlexAggregationControllerListAggregatesV2,
} from '@/api/generated/groups/groups'
import type { GroupFlexScheduleDto, FlexAggregateDto } from '@/api/generated/model'
import { AbortedError } from '@/utils/concurrency'
import { useReportCache } from '@/store/reportCache'
import type { ReportStatus } from './useAddressReport'

// Flex schedules aren't date-filterable server-side, so we page through them all
// (capped) and derive the active periods client-side.
const SCHEDULE_PAGE = 1000
const MAX_SCHEDULE_PAGES = 10
// Baseline context fetched around the curtailment span (clamped to the day).
const CONTEXT_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const AGG_PAGE = 1000 // server max per page
// Aggregation is ~1s resolution, so a page (1000 rows) covers ~16 min. Cap high
// enough that curtailment ±1h completes; we fold each page into per-minute
// buckets on arrival so memory stays small regardless.
const MAX_AGG_PAGES = 60
const DAY_MS = 24 * 60 * 60 * 1000

export type CurtailmentTargetType = 'group' | 'address' | 'inverter' | 'none'

export interface CurtailmentPeriodRow {
  scheduleUuid: string
  start: string
  end: string | null
  durationMinutes: number | null
  targetType: CurtailmentTargetType
  targetValue: number | null
  target: string
  isCurtailment: boolean
}

/** Per-minute overview point: averaged power series + solar min/max band. */
export interface FlexAggregateMinute {
  t: number // minute-start epoch ms
  return: number
  delivery: number
  steerablePowerZeroExport: number
  solarProduction: number
  solarBand: [number, number] // solar production [min, max] within the minute
  solarInverterCount: number
  smartMeterCount: number
}

/** Raw 1-second sample for the on-demand detail view. */
export interface FlexAggregateRaw {
  t: number
  return: number
  delivery: number
  steerablePowerZeroExport: number
  solarProduction: number
}

export interface CurtailmentTotals {
  schedules: number
  periodsInWindow: number
  curtailedMinutes: number
}

export interface CurtailmentRange {
  from: string
  to: string
}

export interface IsoSpan {
  start: string
  end: string
}

const EMPTY_TOTALS: CurtailmentTotals = { schedules: 0, periodsInWindow: 0, curtailedMinutes: 0 }

interface CachedReport {
  rows: CurtailmentPeriodRow[]
  totals: CurtailmentTotals
  minutes: FlexAggregateMinute[]
  curtailSpan: IsoSpan | null
  fetchWindow: IsoSpan | null
  truncated: boolean
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const num0 = (v: unknown): number => num(v) ?? 0
const tOf = (dto: FlexAggregateDto): number => new Date(dto.time as unknown as string).getTime()

function dayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

function describeTarget(s: GroupFlexScheduleDto): {
  type: CurtailmentTargetType
  value: number | null
  label: string
  isCurtailment: boolean
} {
  const kw = num(s.groupGridTargetKw as unknown)
  if (kw != null) return { type: 'group', value: kw, label: `${kw} kW`, isCurtailment: true }
  const w = num(s.addressGridTargetW as unknown)
  if (w != null) return { type: 'address', value: w, label: `${w} W`, isCurtailment: true }
  const pctVal = num(s.solarInverterCapacityPercentage as unknown)
  // Inverters running at 100% is the default (full production) — not curtailment.
  if (pctVal != null) return { type: 'inverter', value: pctVal, label: `${pctVal} %`, isCurtailment: pctVal < 100 }
  return { type: 'none', value: null, label: '—', isCurtailment: false }
}

async function loadAllSchedules(groupUuid: string, signal: AbortSignal): Promise<GroupFlexScheduleDto[]> {
  const first = await groupFlexScheduleControllerListV2(groupUuid, { limit: SCHEDULE_PAGE, offset: 0 }, undefined, signal)
  const all = [...(first.results ?? [])]
  const total = first.meta?.total ?? all.length
  const pages = Math.min(Math.ceil(total / SCHEDULE_PAGE), MAX_SCHEDULE_PAGES)
  for (let p = 1; p < pages; p++) {
    if (signal.aborted) break
    const next = await groupFlexScheduleControllerListV2(
      groupUuid,
      { limit: SCHEDULE_PAGE, offset: p * SCHEDULE_PAGE },
      undefined,
      signal,
    )
    all.push(...(next.results ?? []))
  }
  return all
}

function buildPeriods(schedules: GroupFlexScheduleDto[], range: CurtailmentRange) {
  const windowStart = dayStart(range.from).getTime()
  const windowEnd = dayStart(range.to).getTime() + DAY_MS

  const sorted = schedules
    .map((s) => ({ s, t: new Date(s.time as unknown as string).getTime() }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t)

  const rows: CurtailmentPeriodRow[] = []
  let curtailedMinutes = 0
  let spanStart = Number.POSITIVE_INFINITY
  let spanEnd = Number.NEGATIVE_INFINITY

  for (let i = 0; i < sorted.length; i++) {
    const { s, t } = sorted[i]
    const nextT = i + 1 < sorted.length ? sorted[i + 1].t : null
    const periodEnd = nextT ?? Number.POSITIVE_INFINITY
    if (periodEnd <= windowStart || t >= windowEnd) continue

    const { type, value, label, isCurtailment } = describeTarget(s)
    const durationMinutes = nextT != null ? Math.round((nextT - t) / 60000) : null

    if (isCurtailment) {
      const clampedStart = Math.max(t, windowStart)
      const clampedEnd = Math.min(periodEnd, windowEnd)
      curtailedMinutes += Math.max(0, Math.round((clampedEnd - clampedStart) / 60000))
      spanStart = Math.min(spanStart, clampedStart)
      spanEnd = Math.max(spanEnd, clampedEnd)
    }

    rows.push({
      scheduleUuid: s.uuid,
      start: new Date(t).toISOString(),
      end: nextT != null ? new Date(nextT).toISOString() : null,
      durationMinutes,
      targetType: type,
      targetValue: value,
      target: label,
      isCurtailment,
    })
  }

  const totals: CurtailmentTotals = { schedules: schedules.length, periodsInWindow: rows.length, curtailedMinutes }
  const curtailSpan = spanStart <= spanEnd ? { start: spanStart, end: spanEnd } : null
  return { rows, totals, curtailSpan, windowStart, windowEnd }
}

/**
 * Core time-window pager. The endpoint ignores `offset` and serves ~1s data, so
 * we page by time: advance `fromDate` past the last row each page (as a clean ISO
 * string — the raw API timestamp isn't reliably accepted) and drop the repeated
 * boundary sample. `onBatch` receives each page's fresh rows so callers can fold
 * them incrementally instead of holding the whole raw series.
 */
async function pageAggregation(
  groupUuid: string,
  fromDate: string,
  toDate: string,
  onBatch: (rows: FlexAggregateDto[]) => void,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ truncated: boolean }> {
  const fromMs = new Date(fromDate).getTime()
  const toMs = new Date(toDate).getTime()
  let cursor = fromDate
  let lastMs = Number.NEGATIVE_INFINITY
  let estTotal = 1
  let truncated = false
  for (let page = 0; page < MAX_AGG_PAGES; page++) {
    if (signal.aborted) break
    const res = await groupFlexAggregationControllerListAggregatesV2(
      groupUuid,
      { fromDate: cursor, toDate, sortBy: 'ASC', limit: AGG_PAGE },
      undefined,
      signal,
    )
    const batch = res.results ?? []
    if (batch.length === 0) break
    const fresh = batch.filter((b) => tOf(b) > lastMs)
    if (fresh.length === 0) break
    onBatch(fresh)
    const newMs = tOf(fresh[fresh.length - 1])
    if (!Number.isFinite(newMs) || newMs <= lastMs) break
    if (page === 0) {
      const span = Math.max(1, newMs - fromMs)
      estTotal = Math.min(MAX_AGG_PAGES, Math.max(1, Math.ceil((toMs - fromMs) / span)))
    }
    lastMs = newMs
    onProgress(page + 1, Math.max(estTotal, page + 1))
    if (page === MAX_AGG_PAGES - 1 && newMs < toMs) truncated = true
    cursor = new Date(newMs).toISOString()
  }
  return { truncated }
}

interface MinuteAcc {
  n: number
  ret: number
  del: number
  steer: number
  solar: number
  solarMin: number
  solarMax: number
  invMax: number
  meterMax: number
}

/** Fetch the window and fold it into per-minute avg + solar min/max buckets. */
async function fetchMinutes(
  groupUuid: string,
  fromDate: string,
  toDate: string,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ minutes: FlexAggregateMinute[]; truncated: boolean }> {
  const map = new Map<number, MinuteAcc>()
  const { truncated } = await pageAggregation(
    groupUuid,
    fromDate,
    toDate,
    (rows) => {
      for (const dto of rows) {
        const t = tOf(dto)
        if (!Number.isFinite(t)) continue
        const m = Math.floor(t / MINUTE_MS) * MINUTE_MS
        const solar = num0(dto.solarProduction)
        const a = map.get(m)
        if (!a) {
          map.set(m, {
            n: 1,
            ret: num0(dto.return),
            del: num0(dto.delivery),
            steer: num0(dto.steerablePowerZeroExport),
            solar,
            solarMin: solar,
            solarMax: solar,
            invMax: num0(dto.solarInverterCount),
            meterMax: num0(dto.smartMeterCount),
          })
        } else {
          a.n += 1
          a.ret += num0(dto.return)
          a.del += num0(dto.delivery)
          a.steer += num0(dto.steerablePowerZeroExport)
          a.solar += solar
          a.solarMin = Math.min(a.solarMin, solar)
          a.solarMax = Math.max(a.solarMax, solar)
          a.invMax = Math.max(a.invMax, num0(dto.solarInverterCount))
          a.meterMax = Math.max(a.meterMax, num0(dto.smartMeterCount))
        }
      }
    },
    onProgress,
    signal,
  )

  const minutes = [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, a]) => ({
      t,
      return: a.ret / a.n,
      delivery: a.del / a.n,
      steerablePowerZeroExport: a.steer / a.n,
      solarProduction: a.solar / a.n,
      solarBand: [a.solarMin, a.solarMax] as [number, number],
      solarInverterCount: a.invMax,
      smartMeterCount: a.meterMax,
    }))
  return { minutes, truncated }
}

/** Fetch raw 1s samples for a detail window (small, ~45 min). */
async function fetchRaw(groupUuid: string, fromDate: string, toDate: string, signal: AbortSignal): Promise<FlexAggregateRaw[]> {
  const out: FlexAggregateRaw[] = []
  await pageAggregation(
    groupUuid,
    fromDate,
    toDate,
    (rows) => {
      for (const dto of rows) {
        const t = tOf(dto)
        if (!Number.isFinite(t)) continue
        out.push({
          t,
          return: num0(dto.return),
          delivery: num0(dto.delivery),
          steerablePowerZeroExport: num0(dto.steerablePowerZeroExport),
          solarProduction: num0(dto.solarProduction),
        })
      }
    },
    () => {},
    signal,
  )
  return out
}

/**
 * Group-level curtailment report. Resolves the group's flex schedules into
 * curtailment periods for the selected day/range, then loads a flex-aggregation
 * overview (per-minute avg + solar min/max) for the curtailment span ±1h. Detail
 * (raw 1s) for a 15-min block is fetched on demand via `loadDetail`.
 */
export function useGroupCurtailmentReport(groupUuid: string | null, range: CurtailmentRange) {
  const cacheKey = groupUuid ? `curtailment:${groupUuid}:${range.from}:${range.to}` : null
  const setEntry = useReportCache((s) => s.setEntry)

  const readCache = (key: string | null) =>
    key ? useReportCache.getState().getEntry<CachedReport>(key) : undefined

  const [status, setStatus] = useState<ReportStatus>(() => (readCache(cacheKey) ? 'done' : 'idle'))
  const [rows, setRows] = useState<CurtailmentPeriodRow[]>(() => readCache(cacheKey)?.data.rows ?? [])
  const [totals, setTotals] = useState<CurtailmentTotals>(() => readCache(cacheKey)?.data.totals ?? EMPTY_TOTALS)
  const [minutes, setMinutes] = useState<FlexAggregateMinute[]>(() => readCache(cacheKey)?.data.minutes ?? [])
  const [curtailSpan, setCurtailSpan] = useState<IsoSpan | null>(() => readCache(cacheKey)?.data.curtailSpan ?? null)
  const [fetchWindow, setFetchWindow] = useState<IsoSpan | null>(() => readCache(cacheKey)?.data.fetchWindow ?? null)
  const [truncated, setTruncated] = useState(() => readCache(cacheKey)?.data.truncated ?? false)
  const [generatedAt, setGeneratedAt] = useState<string | null>(() => readCache(cacheKey)?.generatedAt ?? null)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [error, setError] = useState<unknown>(null)
  const abortRef = useRef<AbortController | null>(null)

  // On-demand detail (raw 1s for a 15-min block ±15 min), cached per window key.
  const [detail, setDetail] = useState<FlexAggregateRaw[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const detailCache = useRef<Map<string, FlexAggregateRaw[]>>(new Map())
  const detailAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const cached = readCache(cacheKey)
    if (cached) {
      setRows(cached.data.rows)
      setTotals(cached.data.totals)
      setMinutes(cached.data.minutes)
      setCurtailSpan(cached.data.curtailSpan)
      setFetchWindow(cached.data.fetchWindow)
      setTruncated(cached.data.truncated)
      setGeneratedAt(cached.generatedAt)
      setStatus('done')
    } else {
      setRows([])
      setTotals(EMPTY_TOTALS)
      setMinutes([])
      setCurtailSpan(null)
      setFetchWindow(null)
      setTruncated(false)
      setGeneratedAt(null)
      setStatus('idle')
    }
    setError(null)
    setDetail([])
    detailCache.current.clear()
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
    setMinutes([])
    setCurtailSpan(null)
    setFetchWindow(null)
    setTruncated(false)
    setProgress({ done: 0, total: 0 })
    setDetail([])
    detailCache.current.clear()

    try {
      const schedules = await loadAllSchedules(groupUuid, signal)
      if (signal.aborted) return setStatus('cancelled')
      const { rows: nextRows, totals: nextTotals, curtailSpan: spanMs, windowStart, windowEnd } = buildPeriods(
        schedules,
        range,
      )

      let nextMinutes: FlexAggregateMinute[] = []
      let nextSpan: IsoSpan | null = null
      let nextWindow: IsoSpan | null = null
      let nextTruncated = false
      if (spanMs) {
        const fromMs = Math.max(spanMs.start - CONTEXT_MS, windowStart)
        const toMs = Math.min(spanMs.end + CONTEXT_MS, windowEnd)
        nextSpan = { start: new Date(spanMs.start).toISOString(), end: new Date(spanMs.end).toISOString() }
        nextWindow = { start: new Date(fromMs).toISOString(), end: new Date(toMs).toISOString() }
        const res = await fetchMinutes(
          groupUuid,
          nextWindow.start,
          nextWindow.end,
          (done, total) => setProgress({ done, total }),
          signal,
        )
        if (signal.aborted) return setStatus('cancelled')
        nextMinutes = res.minutes
        nextTruncated = res.truncated
      }

      const stamp = new Date().toISOString()
      setRows(nextRows)
      setTotals(nextTotals)
      setMinutes(nextMinutes)
      setCurtailSpan(nextSpan)
      setFetchWindow(nextWindow)
      setTruncated(nextTruncated)
      setGeneratedAt(stamp)
      setStatus('done')
      setEntry<CachedReport>(
        cacheKey,
        { rows: nextRows, totals: nextTotals, minutes: nextMinutes, curtailSpan: nextSpan, fetchWindow: nextWindow, truncated: nextTruncated },
        stamp,
      )
    } catch (err) {
      if (err instanceof AbortedError || signal.aborted) setStatus('cancelled')
      else {
        setError(err)
        setStatus('error')
      }
    }
  }, [groupUuid, cacheKey, range, setEntry])

  const loadDetail = useCallback(
    async (fromMs: number, toMs: number) => {
      if (!groupUuid) return
      const from = new Date(fromMs).toISOString()
      const to = new Date(toMs).toISOString()
      const key = `${from}|${to}`
      const cached = detailCache.current.get(key)
      if (cached) {
        setDetail(cached)
        setDetailLoading(false)
        return
      }
      detailAbortRef.current?.abort()
      const controller = new AbortController()
      detailAbortRef.current = controller
      setDetailLoading(true)
      setDetail([])
      try {
        const raw = await fetchRaw(groupUuid, from, to, controller.signal)
        if (controller.signal.aborted) return
        detailCache.current.set(key, raw)
        setDetail(raw)
      } catch {
        if (!controller.signal.aborted) setDetail([])
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false)
      }
    },
    [groupUuid],
  )

  return {
    status,
    progress,
    truncated,
    rows,
    totals,
    minutes,
    curtailSpan,
    fetchWindow,
    generatedAt,
    error,
    run,
    cancel,
    detail,
    detailLoading,
    loadDetail,
  }
}
