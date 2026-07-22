import { useCallback, useEffect, useRef, useState } from 'react'
import {
  solarInvertersControllerListV2,
  solarInverterFlexScheduleControllerListV2,
  solarInverterScheduleControllerListV2,
  solarInverterForecastControllerGetProductionForecastForSolarInverterV2,
  solarInverterAggregationControllerGetProductionIntervalsV2,
} from '@/api/generated/solar-inverters/solar-inverters'
import {
  smartMetersControllerGetSmartMetersForAddressV2,
  smartMetersAggregationControllerGetElectricityIntervalsV2,
} from '@/api/generated/smart-meters/smart-meters'
import type { SolarInverterFlexScheduleDto, ScheduleDto } from '@/api/generated/model'
import { AbortedError, mapWithConcurrency } from '@/utils/concurrency'
import { useReportCache } from '@/store/reportCache'
import type { ReportStatus } from './useAddressReport'

const SCHEDULE_PAGE = 1000
const SLOT_MS = 15 * 60 * 1000 // 15-minute buckets (native resolution here)
const DAY_MS = 24 * 60 * 60 * 1000
const FETCH_CONCURRENCY = 4
// The 15-min solar hindcast — the counterfactual "what production would have been".
// The endpoint returns it as rolling ~1h chunks; we combine them across the day.
const HINDCAST_TYPE = 'solar_hindcast_15min_900'

export type CurtailmentSource = 'group' | 'inverter'
export type CurtailmentTargetType = 'group' | 'address' | 'inverter' | 'zeroExport' | 'none'

interface TargetDesc {
  type: CurtailmentTargetType
  label: string
  isCurtailment: boolean
}

export interface AddressCurtailmentPeriodRow {
  key: string
  source: CurtailmentSource
  inverter: string | null
  start: string
  end: string | null
  durationMinutes: number | null
  targetType: CurtailmentTargetType
  target: string
  isCurtailment: boolean
}

/** 15-min timeline point: production (actual/hindcast) + grid flows, summed for the address (W). */
export interface ProductionPoint {
  t: number
  actual: number
  hindcast: number
  delivery: number
  return: number
}

export interface InverterImpactRow {
  identifier: string
  producedKwh: number
  potentialKwh: number
  curtailedKwh: number
  curtailedPct: number
}

export interface AddressCurtailmentImpact {
  producedKwh: number
  potentialKwh: number
  curtailedKwh: number
  curtailedPct: number
  /** Whole-day grid delivery / return for the address (kWh). */
  deliveryKwh: number
  returnKwh: number
  forecastQuality: number | null
}

export interface CurtailmentRange {
  from: string
  to: string
}

interface Band {
  start: number
  end: number
}

const EMPTY_IMPACT: AddressCurtailmentImpact = {
  producedKwh: 0,
  potentialKwh: 0,
  curtailedKwh: 0,
  curtailedPct: 0,
  deliveryKwh: 0,
  returnKwh: 0,
  forecastQuality: null,
}

interface CachedReport {
  inverters: string[]
  rows: AddressCurtailmentPeriodRow[]
  timeline: ProductionPoint[]
  groupBands: Band[]
  inverterBands: Band[]
  impact: AddressCurtailmentImpact
  perInverter: InverterImpactRow[]
  forecastTags: string[]
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const slotOf = (ms: number) => Math.floor(ms / SLOT_MS) * SLOT_MS

function dayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

function eachDay(range: CurtailmentRange): string[] {
  const days: string[] = []
  const end = dayStart(range.to).getTime()
  for (let t = dayStart(range.from).getTime(); t <= end; t += DAY_MS) {
    const d = new Date(t)
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }
  return days
}

/** Group/pool flex target (addressGridTargetW 0 = curtailment, capacity 100 = release). */
function describeFlex(s: SolarInverterFlexScheduleDto): TargetDesc {
  const kw = num(s.groupGridTargetKw as unknown)
  if (kw != null) return { type: 'group', label: `${kw} kW`, isCurtailment: true }
  const w = num(s.addressGridTargetW as unknown)
  if (w != null) return { type: 'address', label: `${w} W`, isCurtailment: true }
  const pct = num(s.solarInverterCapacityPercentage as unknown)
  if (pct != null) return { type: 'inverter', label: `${pct} %`, isCurtailment: pct < 100 }
  return { type: 'none', label: '—', isCurtailment: false }
}

/** Inverter's own schedule: zero-export or a sub-100% power limit is curtailment. */
function describeSchedule(s: ScheduleDto): TargetDesc {
  if (s.zeroExport === true) return { type: 'zeroExport', label: '', isCurtailment: true }
  const pl = num(s.powerlimit)
  if (pl != null && pl < 100) return { type: 'inverter', label: `${pl} %`, isCurtailment: true }
  return { type: 'none', label: '—', isCurtailment: false }
}

interface Period {
  start: number
  end: number | null
  desc: TargetDesc
}

/** Resolve schedules into step-function periods over [windowStart, windowEnd]. */
function buildPeriods<T extends { time?: unknown }>(
  schedules: T[],
  describe: (s: T) => TargetDesc,
  windowStart: number,
  windowEnd: number,
): Period[] {
  const sorted = schedules
    .map((s) => ({ s, t: new Date((s as { time?: unknown }).time as string).getTime() }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t)
  const periods: Period[] = []
  for (let i = 0; i < sorted.length; i++) {
    const { s, t } = sorted[i]
    const nextT = i + 1 < sorted.length ? sorted[i + 1].t : null
    const periodEnd = nextT ?? Number.POSITIVE_INFINITY
    if (periodEnd <= windowStart || t >= windowEnd) continue
    periods.push({ start: t, end: nextT, desc: describe(s) })
  }
  return periods
}

function curtailmentBands(periods: Period[], windowStart: number, windowEnd: number): Band[] {
  return periods
    .filter((p) => p.desc.isCurtailment)
    .map((p) => ({ start: Math.max(p.start, windowStart), end: Math.min(p.end ?? windowEnd, windowEnd) }))
    .filter((b) => b.end > b.start)
}

const inBands = (t: number, bands: Band[]) => bands.some((b) => t >= b.start && t < b.end)

async function loadFlexSchedules(addressUuid: string, invId: string, signal: AbortSignal): Promise<SolarInverterFlexScheduleDto[]> {
  const res = await solarInverterFlexScheduleControllerListV2(addressUuid, invId, { limit: SCHEDULE_PAGE }, undefined, signal)
  return res.results ?? []
}

async function loadInverterSchedules(addressUuid: string, invId: string, signal: AbortSignal): Promise<ScheduleDto[]> {
  const res = await solarInverterScheduleControllerListV2(addressUuid, invId, { limit: SCHEDULE_PAGE }, undefined, signal)
  return res.results ?? []
}

/**
 * Address-level solar-curtailment report for steerable inverters. Curtailment
 * comes from two inverter-level sources — the group/pool flex schedule
 * (`/flex/schedules`) and the inverter's own schedule (`/schedules`). Curtailed
 * energy is measured as the 15-min production hindcast minus actual production;
 * the hindcast is combined from the rolling `solar_hindcast_15min_900` forecasts.
 */
export function useAddressCurtailmentReport(addressUuid: string | null, range: CurtailmentRange) {
  const cacheKey = addressUuid ? `addr-curtailment:${addressUuid}:${range.from}:${range.to}` : null
  const setEntry = useReportCache((s) => s.setEntry)
  const readCache = (key: string | null) => (key ? useReportCache.getState().getEntry<CachedReport>(key) : undefined)

  const seed = readCache(cacheKey)
  const [status, setStatus] = useState<ReportStatus>(() => (seed ? 'done' : 'idle'))
  const [inverters, setInverters] = useState<string[]>(() => seed?.data.inverters ?? [])
  const [rows, setRows] = useState<AddressCurtailmentPeriodRow[]>(() => seed?.data.rows ?? [])
  const [timeline, setTimeline] = useState<ProductionPoint[]>(() => seed?.data.timeline ?? [])
  const [groupBands, setGroupBands] = useState<Band[]>(() => seed?.data.groupBands ?? [])
  const [inverterBands, setInverterBands] = useState<Band[]>(() => seed?.data.inverterBands ?? [])
  const [impact, setImpact] = useState<AddressCurtailmentImpact>(() => seed?.data.impact ?? EMPTY_IMPACT)
  const [perInverter, setPerInverter] = useState<InverterImpactRow[]>(() => seed?.data.perInverter ?? [])
  const [forecastTags, setForecastTags] = useState<string[]>(() => seed?.data.forecastTags ?? [])
  const [generatedAt, setGeneratedAt] = useState<string | null>(() => seed?.generatedAt ?? null)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [error, setError] = useState<unknown>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const cached = readCache(cacheKey)
    if (cached) {
      setInverters(cached.data.inverters)
      setRows(cached.data.rows)
      setTimeline(cached.data.timeline)
      setGroupBands(cached.data.groupBands)
      setInverterBands(cached.data.inverterBands)
      setImpact(cached.data.impact)
      setPerInverter(cached.data.perInverter)
      setForecastTags(cached.data.forecastTags)
      setGeneratedAt(cached.generatedAt)
      setStatus('done')
    } else {
      setInverters([])
      setRows([])
      setTimeline([])
      setGroupBands([])
      setInverterBands([])
      setImpact(EMPTY_IMPACT)
      setPerInverter([])
      setForecastTags([])
      setGeneratedAt(null)
      setStatus('idle')
    }
    setError(null)
  }, [cacheKey])

  const cancel = useCallback(() => abortRef.current?.abort(), [])

  const run = useCallback(async () => {
    if (!addressUuid || !cacheKey) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setStatus('running')
    setError(null)
    setProgress({ done: 0, total: 0 })

    const windowStart = dayStart(range.from).getTime()
    const windowEnd = dayStart(range.to).getTime() + DAY_MS
    const fromIso = new Date(windowStart).toISOString()
    const toIso = new Date(windowEnd).toISOString()
    const days = eachDay(range)

    try {
      const [invRes, smRes] = await Promise.all([
        solarInvertersControllerListV2(addressUuid, undefined, signal),
        smartMetersControllerGetSmartMetersForAddressV2(addressUuid, undefined, signal),
      ])
      if (signal.aborted) return setStatus('cancelled')
      const steerable = (invRes.results ?? [])
        .filter((i) => (i.info as { isSteerable?: boolean } | undefined)?.isSteerable === true)
        .map((i) => i.identifier)
      const meters = (smRes.results ?? []).map((m) => m.identifier)

      const total = steerable.length * (days.length + 3) + meters.length
      let done = 0
      const tick = () => setProgress({ done: (done += 1), total })

      // Address grid flows (delivery/return) from the smart meter(s), summed per 15-min slot.
      const grid = new Map<number, { delivery: number; return: number }>()
      await mapWithConcurrency(
        meters,
        FETCH_CONCURRENCY,
        async (smId) => {
          const r = await smartMetersAggregationControllerGetElectricityIntervalsV2(
            addressUuid,
            smId,
            { resolution: 'quarter_hourly', fromDate: fromIso, toDate: toIso },
            undefined,
            signal,
          )
          tick()
          for (const iv of r.results ?? []) {
            const t = slotOf(new Date(iv.time as unknown as string).getTime())
            const g = grid.get(t) ?? { delivery: 0, return: 0 }
            g.delivery += num(iv.delivery) ?? 0
            g.return += num(iv.return) ?? 0
            grid.set(t, g)
          }
        },
        { signal },
      )
      if (signal.aborted) return setStatus('cancelled')

      const perInv = await mapWithConcurrency(
        steerable,
        FETCH_CONCURRENCY,
        async (invId) => {
          const flex = await loadFlexSchedules(addressUuid, invId, signal)
          tick()
          const flexPeriods = buildPeriods(flex, describeFlex, windowStart, windowEnd)

          const sched = await loadInverterSchedules(addressUuid, invId, signal)
          tick()
          const invPeriods = buildPeriods(sched, describeSchedule, windowStart, windowEnd)

          const actualRes = await solarInverterAggregationControllerGetProductionIntervalsV2(
            addressUuid,
            invId,
            { resolution: 'quarter_hourly', fromDate: fromIso, toDate: toIso },
            undefined,
            signal,
          )
          tick()
          const actual = new Map<number, number>()
          for (const iv of actualRes.results ?? []) {
            const t = slotOf(new Date(iv.time as unknown as string).getTime())
            actual.set(t, (actual.get(t) ?? 0) + (num(iv.production) ?? 0))
          }

          // Combine all 15-min hindcast chunks for the day(s); latest processed wins per slot.
          const hindcast = new Map<number, number>()
          const tags = new Set<string>()
          let qSum = 0
          let qN = 0
          for (const day of days) {
            if (signal.aborted) break
            const fc = await solarInverterForecastControllerGetProductionForecastForSolarInverterV2(addressUuid, invId, { date: day }, undefined, signal)
            tick()
            const chunks = (fc.results ?? [])
              .filter((r) => r.forecastType === HINDCAST_TYPE)
              .sort((a, b) => new Date((a.processedTime as unknown as string) ?? 0).getTime() - new Date((b.processedTime as unknown as string) ?? 0).getTime())
            for (const r of chunks) {
              for (const tag of r.forecastTags ?? []) tags.add(tag)
              const q = num(r.forecastQuality)
              if (q != null) {
                qSum += q
                qN += 1
              }
              for (const iv of r.intervals ?? []) {
                const t = slotOf(new Date(iv.start as unknown as string).getTime())
                hindcast.set(t, num(iv.whSum) ?? 0)
              }
            }
          }

          return { invId, flexPeriods, invPeriods, actual, hindcast, tags: [...tags], quality: qN ? qSum / qN : null }
        },
        { signal },
      )
      if (signal.aborted) return setStatus('cancelled')

      // Group flex is pool-wide (same per inverter) — dedupe rows by signature.
      const periodRows: AddressCurtailmentPeriodRow[] = []
      const groupSeen = new Set<string>()
      const groupBandsAll: Band[] = []
      const inverterBandsAll: Band[] = []
      const pushRow = (p: Period, source: CurtailmentSource, inv: string | null) => {
        periodRows.push({
          key: `${source}-${inv ?? ''}-${p.start}-${p.desc.type}`,
          source,
          inverter: inv,
          start: new Date(p.start).toISOString(),
          end: p.end != null ? new Date(p.end).toISOString() : null,
          durationMinutes: p.end != null ? Math.round((p.end - p.start) / 60000) : null,
          targetType: p.desc.type,
          target: p.desc.label,
          isCurtailment: p.desc.isCurtailment,
        })
      }
      // Show each curtailment period plus the command immediately before it (prior
      // state) and after it (release) — but not stale no-limit spans between events.
      const keep = (periods: Period[], i: number) =>
        periods[i].desc.isCurtailment ||
        (i > 0 && periods[i - 1].desc.isCurtailment) ||
        (i < periods.length - 1 && periods[i + 1].desc.isCurtailment)
      for (const p of perInv) {
        p.flexPeriods.forEach((period, i) => {
          if (!keep(p.flexPeriods, i)) return
          const sig = `${period.start}|${period.end}|${period.desc.type}|${period.desc.label}`
          if (groupSeen.has(sig)) return
          groupSeen.add(sig)
          pushRow(period, 'group', null)
        })
        p.invPeriods.forEach((period, i) => {
          if (keep(p.invPeriods, i)) pushRow(period, 'inverter', p.invId)
        })
        groupBandsAll.push(...curtailmentBands(p.flexPeriods, windowStart, windowEnd))
        inverterBandsAll.push(...curtailmentBands(p.invPeriods, windowStart, windowEnd))
      }
      periodRows.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

      // Combined 15-min timeline (W) + per-inverter/total impact (curtailment = group ∪ inverter).
      const slots = new Set<number>()
      for (const p of perInv) {
        for (const t of p.actual.keys()) slots.add(t)
        for (const t of p.hindcast.keys()) slots.add(t)
      }
      for (const t of grid.keys()) slots.add(t)
      const timelineMap = new Map<number, ProductionPoint>()
      for (const t of slots) timelineMap.set(t, { t, actual: 0, hindcast: 0, delivery: 0, return: 0 })

      const perInverterRows: InverterImpactRow[] = []
      const tagSet = new Set<string>()
      let totalProduced = 0
      let totalPotential = 0
      let totalCurtailed = 0
      let qSum = 0
      let qN = 0

      for (const p of perInv) {
        for (const tag of p.tags) tagSet.add(tag)
        const curtailBands = [
          ...curtailmentBands(p.flexPeriods, windowStart, windowEnd),
          ...curtailmentBands(p.invPeriods, windowStart, windowEnd),
        ]
        let producedKwh = 0
        let curtailedKwh = 0
        for (const t of slots) {
          const a = p.actual.get(t) ?? 0
          const h = p.hindcast.get(t) ?? 0
          const point = timelineMap.get(t)!
          point.actual += a * 4 // Wh per 15-min → average W
          point.hindcast += h * 4
          producedKwh += a / 1000
          if (inBands(t, curtailBands)) curtailedKwh += Math.max(0, h - a) / 1000
        }
        // Whole-day potential = what was produced + what was curtailed away.
        const potentialKwh = producedKwh + curtailedKwh
        perInverterRows.push({
          identifier: p.invId,
          producedKwh,
          potentialKwh,
          curtailedKwh,
          curtailedPct: potentialKwh > 0 ? (curtailedKwh / potentialKwh) * 100 : 0,
        })
        totalProduced += producedKwh
        totalPotential += potentialKwh
        totalCurtailed += curtailedKwh
        if (p.quality != null) {
          qSum += p.quality
          qN += 1
        }
      }

      // Fold address grid flows into the timeline (Wh per 15-min → average W) and day totals.
      let deliveryKwh = 0
      let returnKwh = 0
      for (const [t, g] of grid) {
        const point = timelineMap.get(t)
        if (point) {
          point.delivery = g.delivery * 4
          point.return = g.return * 4
        }
        deliveryKwh += g.delivery / 1000
        returnKwh += g.return / 1000
      }

      const timelineArr = [...timelineMap.values()].sort((a, b) => a.t - b.t)
      const nextImpact: AddressCurtailmentImpact = {
        producedKwh: totalProduced,
        potentialKwh: totalPotential,
        curtailedKwh: totalCurtailed,
        curtailedPct: totalPotential > 0 ? (totalCurtailed / totalPotential) * 100 : 0,
        deliveryKwh,
        returnKwh,
        forecastQuality: qN ? qSum / qN : null,
      }

      const tags = [...tagSet]
      const stamp = new Date().toISOString()
      setInverters(steerable)
      setRows(periodRows)
      setTimeline(timelineArr)
      setGroupBands(groupBandsAll)
      setInverterBands(inverterBandsAll)
      setImpact(nextImpact)
      setPerInverter(perInverterRows)
      setForecastTags(tags)
      setGeneratedAt(stamp)
      setStatus('done')
      setEntry<CachedReport>(
        cacheKey,
        {
          inverters: steerable,
          rows: periodRows,
          timeline: timelineArr,
          groupBands: groupBandsAll,
          inverterBands: inverterBandsAll,
          impact: nextImpact,
          perInverter: perInverterRows,
          forecastTags: tags,
        },
        stamp,
      )
    } catch (err) {
      if (err instanceof AbortedError || signal.aborted) setStatus('cancelled')
      else {
        setError(err)
        setStatus('error')
      }
    }
  }, [addressUuid, cacheKey, range, setEntry])

  return {
    status,
    progress,
    inverters,
    rows,
    timeline,
    groupBands,
    inverterBands,
    impact,
    perInverter,
    forecastTags,
    generatedAt,
    error,
    run,
    cancel,
  }
}
