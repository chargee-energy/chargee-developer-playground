import { useCallback, useEffect, useRef, useState } from 'react'
import {
  groupFlexScheduleControllerListV2,
  groupFlexAggregationControllerListAggregatesV2,
} from '@/api/generated/groups/groups'
import type { GroupFlexScheduleDto, FlexAggregateDto } from '@/api/generated/model'
import { AbortedError } from '@/utils/concurrency'
import { useReportCache } from '@/store/reportCache'
import type { ReportStatus } from './useAddressReport'
import {
  loadGroupProductionMinutes,
  loadGroupProductionRaw,
  loadSteerableInverters,
  refKey,
  type FlexAggregateMinute,
  type FlexAggregateRaw,
  type InverterCoverage,
  type InverterRef,
  type SteerableScan,
} from './groupProduction'
import {
  buildStepPeriods,
  describeFlexTarget,
  isLiveSchedule,
  loadIndividualCurtailment,
  mergeSpans,
  splitCurtailmentSpans,
  type CurtailmentSource,
  type CurtailmentTargetType,
  type IndividualCurtailmentResult,
  type Span,
} from './individualCurtailment'

export type { CurtailmentSource, CurtailmentTargetType }
export type { FlexAggregateMinute, FlexAggregateRaw, InverterCoverage }

/** Where the power timeline came from. */
export type TelemetrySource = 'aggregation' | 'inverters'

/**
 * Counts at each narrowing step from "in the group" to "the curtailment is
 * provable". Each stage is a subset of the one above it, so the drop between two
 * stages is the number of inverters lost there.
 */
export interface CurtailmentFunnel {
  addresses: number
  addressesWithSparky: number
  /** Every inverter in the group, before the steerable filter. */
  invertersFound: number
  steerable: number
  /** Steerable inverters under a curtailment command overlapping the window. */
  commanded: number
  /** Steerable inverters that returned production data (0 if telemetry is off). */
  reporting: number
  /** Commanded *and* reporting — the only set whose effect can be measured. */
  provable: number
  /** Whether telemetry ran; without it the last two stages are unknown. */
  hasTelemetry: boolean
}

// Flex schedules aren't date-filterable server-side, so we page through them all
// (capped) and derive the active periods client-side.
const SCHEDULE_PAGE = 1000
const MAX_SCHEDULE_PAGES = 10
// Baseline context fetched around the curtailment span (clamped to the day).
const CONTEXT_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const AGG_PAGE = 1000 // server max per page
// Aggregation is ~1s resolution, so a page (1000 rows) covers ~16 min.
const PAGE_SPAN_MS = 16 * 60 * 1000
// Hard ceiling on sequential requests; the per-run cap is derived from the window
// (a full day needs ~90 pages), so short windows stay cheap and a whole-day window
// still completes instead of stopping ~16h in. Each page is folded into per-minute
// buckets on arrival, so memory stays flat regardless of page count.
const MAX_AGG_PAGES = 150
const PAGE_SLACK = 8 // extra pages for gaps / repeated boundary samples
const DAY_MS = 24 * 60 * 60 * 1000
// The aggregation endpoint rejects requests spanning more than 1 day; stay just under.
const CHUNK_MS = DAY_MS - 60 * 1000

export interface CurtailmentPeriodRow {
  /** Group rows: the flex schedule uuid. Individual rows: a synthetic cluster key. */
  scheduleUuid: string
  source: CurtailmentSource
  /** Individual rows: how many inverters/addresses got this command at once (null for group rows). */
  inverters: number | null
  addresses: number | null
  start: string
  end: string | null
  durationMinutes: number | null
  targetType: CurtailmentTargetType
  targetValue: number | null
  target: string
  isCurtailment: boolean
}

export interface CurtailmentTotals {
  /** Group flex schedules read (whole history, not windowed). */
  schedules: number
  /** Individual (per-inverter) schedules read; 0 when the scan is off. */
  individualSchedules: number
  periodsInWindow: number
  /** Minutes covered by actual curtailment commands (standing limits excluded). */
  curtailedMinutes: number
  /** Minutes covered by limits already in effect before the window opened. */
  standingMinutes: number
  addressesScanned: number
  invertersScanned: number
}

export interface CurtailmentRange {
  from: string
  to: string
}

export interface IsoSpan {
  start: string
  end: string
}

const EMPTY_TOTALS: CurtailmentTotals = {
  schedules: 0,
  individualSchedules: 0,
  periodsInWindow: 0,
  curtailedMinutes: 0,
  standingMinutes: 0,
  addressesScanned: 0,
  invertersScanned: 0,
}

interface CachedReport {
  rows: CurtailmentPeriodRow[]
  totals: CurtailmentTotals
  minutes: FlexAggregateMinute[]
  curtailSpan: IsoSpan | null
  fetchWindow: IsoSpan | null
  /** Shaded curtailment windows, split by scope so the chart can distinguish them. */
  groupBands: IsoSpan[]
  individualBands: IsoSpan[]
  standingBands: IsoSpan[]
  truncated: boolean
  telemetrySource: TelemetrySource | null
  /** Steerable inverters, kept so block detail can reuse them after a cache hit. */
  refs: InverterRef[]
  coverage: InverterCoverage[]
  funnel: CurtailmentFunnel | null
}

const toIsoSpans = (spans: Span[]): IsoSpan[] =>
  spans.map((s) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() }))

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const num0 = (v: unknown): number => num(v) ?? 0
const tOf = (dto: FlexAggregateDto): number => new Date(dto.time as unknown as string).getTime()

function dayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
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

/** Resolve the group's own flex schedules into rows + curtailment spans. */
function buildGroupPeriods(schedules: GroupFlexScheduleDto[], windowStart: number, windowEnd: number) {
  const periods = buildStepPeriods<GroupFlexScheduleDto>(
    schedules,
    (s) => new Date(s.time as unknown as string).getTime(),
    describeFlexTarget,
    windowStart,
    windowEnd,
  )

  const rows: CurtailmentPeriodRow[] = []

  for (const p of periods) {
    rows.push({
      scheduleUuid: p.item.uuid,
      source: 'group',
      inverters: null,
      addresses: null,
      start: new Date(p.start).toISOString(),
      end: p.end != null ? new Date(p.end).toISOString() : null,
      durationMinutes: p.end != null ? Math.round((p.end - p.start) / 60000) : null,
      targetType: p.desc.type,
      targetValue: p.desc.value,
      target: p.desc.label,
      isCurtailment: p.desc.isCurtailment,
    })
  }

  const { events, standing } = splitCurtailmentSpans(periods, windowStart, windowEnd)
  return { rows, bands: mergeSpans(events), standingBands: mergeSpans(standing) }
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
  // Size the page budget to the window instead of a flat cap, so a wide window
  // isn't cut off partway through the day.
  const pageCap = Math.min(MAX_AGG_PAGES, Math.max(1, Math.ceil((toMs - fromMs) / PAGE_SPAN_MS)) + PAGE_SLACK)
  const estTotal = pageCap
  let cursorMs = fromMs
  let lastMs = Number.NEGATIVE_INFINITY
  let pages = 0
  // The endpoint rejects any request spanning more than 1 day, so each request
  // uses a sliding ≤1-day window [cursor, cursor+CHUNK]. A full page means more
  // data remains in the window (continue from the last row); a short page means
  // the window is exhausted (jump to its end, which also skips night gaps).
  while (cursorMs < toMs && pages < pageCap) {
    if (signal.aborted) break
    const chunkTo = Math.min(cursorMs + CHUNK_MS, toMs)
    const res = await groupFlexAggregationControllerListAggregatesV2(
      groupUuid,
      { fromDate: new Date(cursorMs).toISOString(), toDate: new Date(chunkTo).toISOString(), sortBy: 'ASC', limit: AGG_PAGE },
      undefined,
      signal,
    )
    pages++
    const batch = res.results ?? []
    const fresh = batch.filter((b) => tOf(b) > lastMs)
    if (fresh.length > 0) {
      onBatch(fresh)
      lastMs = tOf(fresh[fresh.length - 1])
    }
    onProgress(pages, Math.max(estTotal, pages))
    // Continue within the window only while pages come back full and advancing.
    cursorMs = batch.length >= AGG_PAGE && fresh.length > 0 && lastMs > cursorMs ? lastMs : chunkTo
  }
  return { truncated: cursorMs < toMs && pages >= pageCap }
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

/** Which fetch stage `run` is in, so the caller can label the progress bar. */
export type CurtailmentPhase =
  | 'schedules'
  | 'individualAddresses'
  | 'individualInverters'
  | 'aggregation'
  | 'production'
  | null

export interface GroupCurtailmentOptions {
  /** Scan every steerable inverter for individually addressed curtailment. */
  includeIndividual?: boolean
  /**
   * Fetch the power timeline. Off by default — it is by far the expensive part,
   * and skipping it makes wide date ranges practical: schedules aren't
   * date-filterable server-side, so resolving curtailment periods costs the same
   * whether the range is one day or three months.
   */
  showTelemetry?: boolean
}

/**
 * Group-level curtailment report. Resolves the group's flex schedules into
 * curtailment periods for the selected day/range, then loads a flex-aggregation
 * overview (per-minute avg + solar min/max) for the curtailment span ±1h. Detail
 * (raw 1s) for a 15-min block is fetched on demand via `loadDetail`.
 *
 * Some pools are steered per inverter instead of pool-wide — individual schedules
 * issued to every inverter at the same moment. Those are invisible to the group
 * flex schedule endpoint, so `includeIndividual` opts into a per-inverter scan
 * (see `loadIndividualCurtailment`) whose commands are folded back into
 * group-level rows and shaded as a second band set.
 */
export function useGroupCurtailmentReport(
  groupUuid: string | null,
  range: CurtailmentRange,
  options: GroupCurtailmentOptions = {},
) {
  const { includeIndividual = false, showTelemetry = false } = options
  const cacheKey = groupUuid
    ? `curtailment:${groupUuid}:${range.from}:${range.to}${includeIndividual ? ':ind' : ''}${showTelemetry ? ':tel' : ''}`
    : null
  const setEntry = useReportCache((s) => s.setEntry)

  const readCache = (key: string | null) =>
    key ? useReportCache.getState().getEntry<CachedReport>(key) : undefined

  const [status, setStatus] = useState<ReportStatus>(() => (readCache(cacheKey) ? 'done' : 'idle'))
  const [rows, setRows] = useState<CurtailmentPeriodRow[]>(() => readCache(cacheKey)?.data.rows ?? [])
  const [totals, setTotals] = useState<CurtailmentTotals>(() => readCache(cacheKey)?.data.totals ?? EMPTY_TOTALS)
  const [minutes, setMinutes] = useState<FlexAggregateMinute[]>(() => readCache(cacheKey)?.data.minutes ?? [])
  const [curtailSpan, setCurtailSpan] = useState<IsoSpan | null>(() => readCache(cacheKey)?.data.curtailSpan ?? null)
  const [fetchWindow, setFetchWindow] = useState<IsoSpan | null>(() => readCache(cacheKey)?.data.fetchWindow ?? null)
  const [groupBands, setGroupBands] = useState<IsoSpan[]>(() => readCache(cacheKey)?.data.groupBands ?? [])
  const [individualBands, setIndividualBands] = useState<IsoSpan[]>(
    () => readCache(cacheKey)?.data.individualBands ?? [],
  )
  const [standingBands, setStandingBands] = useState<IsoSpan[]>(() => readCache(cacheKey)?.data.standingBands ?? [])
  const [truncated, setTruncated] = useState(() => readCache(cacheKey)?.data.truncated ?? false)
  const [telemetrySource, setTelemetrySource] = useState<TelemetrySource | null>(
    () => readCache(cacheKey)?.data.telemetrySource ?? null,
  )
  const [coverage, setCoverage] = useState<InverterCoverage[]>(() => readCache(cacheKey)?.data.coverage ?? [])
  const [funnel, setFunnel] = useState<CurtailmentFunnel | null>(() => readCache(cacheKey)?.data.funnel ?? null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(() => readCache(cacheKey)?.generatedAt ?? null)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [phase, setPhase] = useState<CurtailmentPhase>(null)
  const [error, setError] = useState<unknown>(null)
  const abortRef = useRef<AbortController | null>(null)

  // On-demand detail (raw 1s for a 15-min block ±15 min), cached per window key.
  const [detail, setDetail] = useState<FlexAggregateRaw[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const detailCache = useRef<Map<string, FlexAggregateRaw[]>>(new Map())
  const detailAbortRef = useRef<AbortController | null>(null)
  const [detailProgress, setDetailProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  // Kept in refs so loadDetail stays stable (it only depends on groupUuid).
  const refsRef = useRef<InverterRef[]>([])
  const sourceRef = useRef<TelemetrySource | null>(null)

  useEffect(() => {
    const cached = readCache(cacheKey)
    if (cached) {
      setRows(cached.data.rows)
      setTotals(cached.data.totals)
      setMinutes(cached.data.minutes)
      setCurtailSpan(cached.data.curtailSpan)
      setFetchWindow(cached.data.fetchWindow)
      setGroupBands(cached.data.groupBands ?? [])
      setIndividualBands(cached.data.individualBands ?? [])
      setStandingBands(cached.data.standingBands ?? [])
      setTelemetrySource(cached.data.telemetrySource ?? null)
      setCoverage(cached.data.coverage ?? [])
      setFunnel(cached.data.funnel ?? null)
      sourceRef.current = cached.data.telemetrySource ?? null
      refsRef.current = cached.data.refs ?? []
      setTruncated(cached.data.truncated)
      setGeneratedAt(cached.generatedAt)
      setStatus('done')
    } else {
      setRows([])
      setTotals(EMPTY_TOTALS)
      setMinutes([])
      setCurtailSpan(null)
      setFetchWindow(null)
      setGroupBands([])
      setIndividualBands([])
      setStandingBands([])
      setTelemetrySource(null)
      setCoverage([])
      setFunnel(null)
      sourceRef.current = null
      refsRef.current = []
      setTruncated(false)
      setGeneratedAt(null)
      setStatus('idle')
    }
    setError(null)
    setPhase(null)
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
    setGroupBands([])
    setIndividualBands([])
    setStandingBands([])
    setTelemetrySource(null)
    setCoverage([])
    setFunnel(null)
    sourceRef.current = null
    refsRef.current = []
    setTruncated(false)
    setProgress({ done: 0, total: 0 })
    setPhase('schedules')
    setDetail([])
    detailCache.current.clear()

    const windowStart = dayStart(range.from).getTime()
    const windowEnd = dayStart(range.to).getTime() + DAY_MS

    try {
      const schedules = (await loadAllSchedules(groupUuid, signal)).filter(isLiveSchedule)
      if (signal.aborted) return setStatus('cancelled')
      const {
        rows: groupRows,
        bands: nextGroupBands,
        standingBands: groupStanding,
      } = buildGroupPeriods(schedules, windowStart, windowEnd)

      let individual: IndividualCurtailmentResult | null = null
      if (includeIndividual) {
        setPhase('individualAddresses')
        individual = await loadIndividualCurtailment(
          groupUuid,
          windowStart,
          windowEnd,
          (done, total, stage) => {
            setPhase(stage === 'addresses' ? 'individualAddresses' : 'individualInverters')
            setProgress({ done, total })
          },
          signal,
        )
        if (signal.aborted) return setStatus('cancelled')
      }

      const individualRows: CurtailmentPeriodRow[] = (individual?.clusters ?? []).map((c) => ({
        scheduleUuid: c.key,
        source: c.source,
        inverters: c.inverters,
        addresses: c.addresses,
        start: new Date(c.start).toISOString(),
        end: c.end != null ? new Date(c.end).toISOString() : null,
        durationMinutes: c.end != null ? Math.round((c.end - c.start) / 60000) : null,
        targetType: c.desc.type,
        targetValue: c.desc.value,
        target: c.desc.label,
        isCurtailment: c.desc.isCurtailment,
      }))

      const nextRows = [...groupRows, ...individualRows].sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      )

      // Group and individual curtailment can overlap, so durations come from merged
      // unions rather than the sum of the parts. Events and standing limits are
      // measured separately: a limit left on one inverter since last month spans the
      // whole window, and folding it into "time curtailed" would report a full day
      // when the group was actually curtailed for minutes.
      const nextIndividualBands = individual?.bands ?? []
      const nextStandingBands = mergeSpans([...groupStanding, ...(individual?.standingBands ?? [])])
      const events = mergeSpans([...nextGroupBands, ...nextIndividualBands])
      const minutesOf = (spans: Span[]) =>
        spans.reduce((sum, s) => sum + Math.round((s.end - s.start) / 60000), 0)
      const curtailedMinutes = minutesOf(events)
      const standingMinutes = minutesOf(nextStandingBands)

      // Anchor the telemetry window on actual commands, falling back to standing
      // limits only when there is nothing else to look at.
      const union = mergeSpans([...events, ...nextStandingBands])
      const anchor = events.length > 0 ? events : union
      const spanMs = anchor.length > 0 ? { start: anchor[0].start, end: anchor[anchor.length - 1].end } : null

      const nextTotals: CurtailmentTotals = {
        schedules: schedules.length,
        individualSchedules: individual?.schedules ?? 0,
        periodsInWindow: nextRows.length,
        curtailedMinutes,
        standingMinutes,
        addressesScanned: individual?.addressesScanned ?? 0,
        invertersScanned: individual?.invertersScanned ?? 0,
      }

      let nextMinutes: FlexAggregateMinute[] = []
      let nextSpan: IsoSpan | null = null
      let nextWindow: IsoSpan | null = null
      let nextTruncated = false
      let nextSource: TelemetrySource | null = null
      let nextCoverage: InverterCoverage[] = []
      let nextScan: SteerableScan | null = individual?.scan ?? null
      let nextRefs: InverterRef[] = individual?.refs ?? []
      if (spanMs) {
        const fromMs = Math.max(spanMs.start - CONTEXT_MS, windowStart)
        const toMs = Math.min(spanMs.end + CONTEXT_MS, windowEnd)
        nextSpan = { start: new Date(spanMs.start).toISOString(), end: new Date(spanMs.end).toISOString() }
        nextWindow = { start: new Date(fromMs).toISOString(), end: new Date(toMs).toISOString() }
      }
      if (spanMs && nextWindow && showTelemetry) {
        setPhase('aggregation')
        setProgress({ done: 0, total: 0 })
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
        if (nextMinutes.length > 0) nextSource = 'aggregation'

        // The flex aggregation is only populated for groups the flex engine
        // steers, so it comes back empty for anything that isn't a curtailment
        // pool. Fall back to summing the inverters themselves.
        if (nextMinutes.length === 0) {
          setPhase('production')
          setProgress({ done: 0, total: 0 })
          if (nextRefs.length === 0) {
            const scan = await loadSteerableInverters(
              groupUuid,
              (done, total) => setProgress({ done, total }),
              signal,
            )
            nextRefs = scan.refs
            nextScan = scan
          }
          if (signal.aborted) return setStatus('cancelled')
          const prod = await loadGroupProductionMinutes(
            nextRefs,
            nextWindow.start,
            nextWindow.end,
            (done, total) => setProgress({ done, total }),
            signal,
          )
          if (signal.aborted) return setStatus('cancelled')
          nextMinutes = prod.minutes
          // Mark the inverters that were actually commanded, so "curtailed but
          // silent" can be separated from inverters that were never steered.
          const curtailedKeys = new Set(individual?.curtailedInverterKeys ?? [])
          nextCoverage = prod.coverage.map((c) => ({ ...c, curtailed: curtailedKeys.has(refKey(c.ref)) }))
          nextTruncated = false
          if (nextMinutes.length > 0) nextSource = 'inverters'
        }
      }

      // Funnel: each stage narrows the one above it, so the gaps are the losses.
      const commandedKeys = new Set(individual?.curtailedInverterKeys ?? [])
      const nextFunnel: CurtailmentFunnel | null = nextScan
        ? {
            addresses: nextScan.addresses,
            addressesWithSparky: nextScan.addressesWithSparky,
            invertersFound: nextScan.invertersFound,
            steerable: nextScan.refs.length,
            commanded: commandedKeys.size,
            reporting: nextCoverage.filter((c) => c.intervals > 0).length,
            provable: nextCoverage.filter((c) => c.intervals > 0 && c.curtailed).length,
            hasTelemetry: nextCoverage.length > 0,
          }
        : null

      const groupIso = toIsoSpans(nextGroupBands)
      const individualIso = toIsoSpans(nextIndividualBands)
      const standingIso = toIsoSpans(nextStandingBands)
      const stamp = new Date().toISOString()
      setRows(nextRows)
      setTotals(nextTotals)
      setMinutes(nextMinutes)
      setCurtailSpan(nextSpan)
      setFetchWindow(nextWindow)
      setGroupBands(groupIso)
      setIndividualBands(individualIso)
      setStandingBands(standingIso)
      setTelemetrySource(nextSource)
      setCoverage(nextCoverage)
      setFunnel(nextFunnel)
      sourceRef.current = nextSource
      refsRef.current = nextRefs
      setTruncated(nextTruncated)
      setGeneratedAt(stamp)
      setPhase(null)
      setStatus('done')
      setEntry<CachedReport>(
        cacheKey,
        {
          rows: nextRows,
          totals: nextTotals,
          minutes: nextMinutes,
          curtailSpan: nextSpan,
          fetchWindow: nextWindow,
          groupBands: groupIso,
          individualBands: individualIso,
          standingBands: standingIso,
          truncated: nextTruncated,
          telemetrySource: nextSource,
          refs: nextRefs,
          coverage: nextCoverage,
          funnel: nextFunnel,
        },
        stamp,
      )
    } catch (err) {
      setPhase(null)
      if (err instanceof AbortedError || signal.aborted) setStatus('cancelled')
      else {
        setError(err)
        setStatus('error')
      }
    }
  }, [groupUuid, cacheKey, range, includeIndividual, showTelemetry, setEntry])

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
      setDetailProgress({ done: 0, total: 0 })
      setDetail([])
      try {
        // Below the interval endpoint's 15-min floor the only option is raw
        // per-inverter readings, which is why this path is on demand only.
        const raw =
          sourceRef.current === 'inverters'
            ? await loadGroupProductionRaw(
                refsRef.current,
                fromMs,
                toMs,
                (done, total) => setDetailProgress({ done, total }),
                controller.signal,
              )
            : await fetchRaw(groupUuid, from, to, controller.signal)
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
    phase,
    truncated,
    rows,
    totals,
    minutes,
    curtailSpan,
    fetchWindow,
    groupBands,
    individualBands,
    standingBands,
    generatedAt,
    error,
    run,
    cancel,
    telemetrySource,
    coverage,
    funnel,
    detail,
    detailLoading,
    detailProgress,
    loadDetail,
  }
}
