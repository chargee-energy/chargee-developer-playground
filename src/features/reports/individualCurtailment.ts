import {
  solarInverterFlexScheduleControllerListV2,
  solarInverterScheduleControllerListV2,
} from '@/api/generated/solar-inverters/solar-inverters'
import type { ScheduleDto, SolarInverterFlexScheduleDto } from '@/api/generated/model'
import { mapWithConcurrency } from '@/utils/concurrency'
import { loadSteerableInverters, refKey, type InverterRef, type SteerableScan } from './groupProduction'

const SCHEDULE_PAGE = 1000
const FETCH_CONCURRENCY = 4 // simultaneous per-address / per-inverter calls
const FETCH_STAGGER_MS = 60 // small delay between a worker's requests
// Individual commands are issued in a loop over the group, so the per-inverter
// timestamps of one "group-wide" command are close but never identical. Schedules
// with the same target landing within this window are folded into one row.
const CLUSTER_TOLERANCE_MS = 60 * 1000

export type CurtailmentTargetType = 'group' | 'address' | 'inverter' | 'zeroExport' | 'none'

/**
 * Where a curtailment period came from: the group's own flex schedule, an
 * inverter-scoped flex schedule, or the inverter's own schedule.
 */
export type CurtailmentSource = 'group' | 'flex' | 'schedule'

/** Which leg of the scan progress refers to — they count different things. */
export type IndividualStage = 'addresses' | 'inverters'

export interface TargetDesc {
  type: CurtailmentTargetType
  value: number | null
  label: string
  isCurtailment: boolean
}

export interface Span {
  start: number
  end: number
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Flex target fields, shared by the group- and inverter-scoped flex schedule DTOs. */
interface FlexTargetFields {
  groupGridTargetKw?: unknown
  addressGridTargetW?: unknown
  solarInverterCapacityPercentage?: unknown
}

/** A soft-deleted schedule was cancelled and never ran — drop it. */
export const isLiveSchedule = (s: { deletedAt?: unknown }) => s.deletedAt == null

export function describeFlexTarget(s: FlexTargetFields): TargetDesc {
  const kw = num(s.groupGridTargetKw)
  if (kw != null) return { type: 'group', value: kw, label: `${kw} kW`, isCurtailment: true }
  const w = num(s.addressGridTargetW)
  if (w != null) return { type: 'address', value: w, label: `${w} W`, isCurtailment: true }
  const pct = num(s.solarInverterCapacityPercentage)
  // Inverters running at 100% is the default (full production) — not curtailment.
  if (pct != null) return { type: 'inverter', value: pct, label: `${pct} %`, isCurtailment: pct < 100 }
  return { type: 'none', value: null, label: '—', isCurtailment: false }
}

/** Inverter's own schedule: zero-export or a sub-100% power limit is curtailment. */
export function describeScheduleTarget(s: ScheduleDto): TargetDesc {
  if (s.zeroExport === true) return { type: 'zeroExport', value: 0, label: '0 W', isCurtailment: true }
  const pl = num(s.powerlimit)
  if (pl != null) return { type: 'inverter', value: pl, label: `${pl} %`, isCurtailment: pl < 100 }
  return { type: 'none', value: null, label: '—', isCurtailment: false }
}

export interface Period {
  start: number
  /** null = still in effect at the end of the series ("ongoing"). */
  end: number | null
  desc: TargetDesc
}

/**
 * Resolve a schedule list into step-function periods overlapping the window: each
 * schedule holds until the next one takes over, the last one runs open-ended. Each
 * period carries the schedule that produced it, so callers can keep identifiers
 * even when two schedules share a timestamp.
 */
export function buildStepPeriods<T>(
  items: T[],
  timeOf: (item: T) => number,
  describe: (item: T) => TargetDesc,
  windowStart: number,
  windowEnd: number,
): (Period & { item: T })[] {
  const sorted = items
    .map((s) => ({ s, t: timeOf(s) }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t)

  const periods: (Period & { item: T })[] = []
  for (let i = 0; i < sorted.length; i++) {
    const { s, t } = sorted[i]
    const nextT = i + 1 < sorted.length ? sorted[i + 1].t : null
    const periodEnd = nextT ?? Number.POSITIVE_INFINITY
    if (periodEnd <= windowStart || t >= windowEnd) continue
    periods.push({ start: t, end: nextT, desc: describe(s), item: s })
  }
  return periods
}

/** Merge overlapping/touching spans into a disjoint, ascending set. */
export function mergeSpans(spans: Span[], gapMs = 0): Span[] {
  const sorted = [...spans].filter((s) => s.end > s.start).sort((a, b) => a.start - b.start)
  const out: Span[] = []
  for (const s of sorted) {
    const last = out[out.length - 1]
    if (last && s.start <= last.end + gapMs) last.end = Math.max(last.end, s.end)
    else out.push({ start: s.start, end: s.end })
  }
  return out
}

/**
 * Curtailment periods as spans clamped to the window (ongoing → window end),
 * split into events and standing limits.
 *
 * A limit issued before the window that was never released is a *standing* state
 * rather than an event: it stretches across the whole window, so letting it
 * anchor the telemetry fetch would pull in the entire day at 1s resolution and
 * bury the actual command that happened inside it. Callers shade both but only
 * size the fetch window from `events`.
 */
export function splitCurtailmentSpans(
  periods: Period[],
  windowStart: number,
  windowEnd: number,
): { events: Span[]; standing: Span[] } {
  const events: Span[] = []
  const standing: Span[] = []
  for (const p of periods) {
    if (!p.desc.isCurtailment) continue
    const span = { start: Math.max(p.start, windowStart), end: Math.min(p.end ?? windowEnd, windowEnd) }
    if (span.end <= span.start) continue
    if (p.end == null && p.start < windowStart) standing.push(span)
    else events.push(span)
  }
  return { events, standing }
}

/**
 * One group-wide individual command: the same target sent to many inverters at
 * (near) the same moment, folded into a single row.
 */
export interface IndividualCluster {
  key: string
  source: Exclude<CurtailmentSource, 'group'>
  start: number
  end: number | null
  desc: TargetDesc
  inverters: number
  addresses: number
}

interface Event {
  source: Exclude<CurtailmentSource, 'group'>
  addressUuid: string
  inverterId: string
  period: Period
}

interface OpenCluster {
  key: string
  source: Exclude<CurtailmentSource, 'group'>
  start: number
  maxEnd: number
  ongoing: boolean
  desc: TargetDesc
  inverters: Set<string>
  addresses: Set<string>
}

/**
 * Fold per-inverter periods into group-wide commands. Events sharing a source,
 * target and a start within CLUSTER_TOLERANCE_MS are one command; because events
 * are processed in start order, only the most recent open cluster per signature
 * can still be in range.
 */
function clusterEvents(events: Event[]): IndividualCluster[] {
  const sorted = [...events].sort((a, b) => a.period.start - b.period.start)
  const open = new Map<string, OpenCluster>()
  const done: OpenCluster[] = []

  for (const e of sorted) {
    const sig = `${e.source}|${e.period.desc.type}|${e.period.desc.label}`
    let cluster = open.get(sig)
    if (cluster && e.period.start - cluster.start > CLUSTER_TOLERANCE_MS) {
      done.push(cluster)
      cluster = undefined
    }
    if (!cluster) {
      cluster = {
        key: `${sig}|${e.period.start}`,
        source: e.source,
        start: e.period.start,
        maxEnd: e.period.end ?? e.period.start,
        ongoing: e.period.end == null,
        desc: e.period.desc,
        inverters: new Set(),
        addresses: new Set(),
      }
      open.set(sig, cluster)
    }
    if (e.period.end == null) cluster.ongoing = true
    else cluster.maxEnd = Math.max(cluster.maxEnd, e.period.end)
    cluster.inverters.add(`${e.addressUuid}:${e.inverterId}`)
    cluster.addresses.add(e.addressUuid)
  }
  done.push(...open.values())

  return done
    .map((c) => ({
      key: c.key,
      source: c.source,
      start: c.start,
      end: c.ongoing ? null : c.maxEnd,
      desc: c.desc,
      inverters: c.inverters.size,
      addresses: c.addresses.size,
    }))
    .sort((a, b) => a.start - b.start)
}

/**
 * Keep each curtailment command plus the command immediately before it (prior
 * state) and after it (the release), dropping stale no-limit spans in between.
 */
function keepRelevant(clusters: IndividualCluster[]): IndividualCluster[] {
  const bySource = new Map<string, IndividualCluster[]>()
  for (const c of clusters) {
    const list = bySource.get(c.source) ?? []
    list.push(c)
    bySource.set(c.source, list)
  }
  const kept: IndividualCluster[] = []
  for (const list of bySource.values()) {
    list.forEach((c, i) => {
      if (
        c.desc.isCurtailment ||
        (i > 0 && list[i - 1].desc.isCurtailment) ||
        (i < list.length - 1 && list[i + 1].desc.isCurtailment)
      ) {
        kept.push(c)
      }
    })
  }
  return kept.sort((a, b) => a.start - b.start)
}

export interface IndividualCurtailmentResult {
  clusters: IndividualCluster[]
  /** Merged curtailment spans from commands issued within the window. */
  bands: Span[]
  /** Limits already in effect when the window opened and never released. */
  standingBands: Span[]
  addressesScanned: number
  invertersScanned: number
  /** Total individual schedules read (both sources, before windowing). */
  schedules: number
  /** The steerable inverters scanned, so telemetry can reuse them. */
  refs: InverterRef[]
  scan: SteerableScan
  /**
   * Keys (`address:inverter`) of inverters under a curtailment command overlapping
   * the window — the set whose telemetry you'd expect to show an effect.
   */
  curtailedInverterKeys: string[]
}

/**
 * Scan a group's steerable inverters for *individual* curtailment — commands
 * addressed per inverter rather than to the pool as a whole. Both inverter-level
 * sources are read: the inverter's flex schedule (`/flex/schedules`) and its own
 * schedule (`/schedules`, power limit / zero export).
 *
 * This is a deliberate fan-out (one call per address, two per steerable inverter)
 * run through a throttled worker pool, which is why the caller gates it behind an
 * opt-in. `info.isSteerable` comes back inline on the inverter list, so filtering
 * to steerable inverters costs no extra request.
 */
export async function loadIndividualCurtailment(
  groupUuid: string,
  windowStart: number,
  windowEnd: number,
  onProgress: (done: number, total: number, stage: IndividualStage) => void,
  signal: AbortSignal,
): Promise<IndividualCurtailmentResult> {
  // The two stages count different things — addresses while listing inverters,
  // then inverters while reading their schedules — and the second stage's size is
  // only known once the steerable set is resolved. Reporting them separately keeps
  // the counter honest instead of revising one total upward mid-run.
  const scan = await loadSteerableInverters(
    groupUuid,
    (done, total) => onProgress(done, total, 'addresses'),
    signal,
  )
  const pairs = scan.refs

  let done = 0
  const tick = () => onProgress((done += 1), pairs.length, 'inverters')
  onProgress(0, pairs.length, 'inverters')

  const events: Event[] = []
  const spans: Span[] = []
  const standingSpans: Span[] = []
  let schedules = 0

  await mapWithConcurrency(
    pairs,
    FETCH_CONCURRENCY,
    async ({ addressUuid, inverterId }) => {
      const [flexRes, schedRes] = await Promise.all([
        solarInverterFlexScheduleControllerListV2(addressUuid, inverterId, { limit: SCHEDULE_PAGE }, undefined, signal),
        solarInverterScheduleControllerListV2(addressUuid, inverterId, { limit: SCHEDULE_PAGE }, undefined, signal),
      ])
      tick()
      const flex = (flexRes.results ?? []).filter(isLiveSchedule)
      const own = schedRes.results ?? []
      schedules += flex.length + own.length

      const flexPeriods = buildStepPeriods<SolarInverterFlexScheduleDto>(
        flex,
        (s) => new Date(s.time as unknown as string).getTime(),
        describeFlexTarget,
        windowStart,
        windowEnd,
      )
      const ownPeriods = buildStepPeriods<ScheduleDto>(
        own,
        (s) => new Date(s.time as unknown as string).getTime(),
        describeScheduleTarget,
        windowStart,
        windowEnd,
      )

      for (const period of flexPeriods) events.push({ source: 'flex', addressUuid, inverterId, period })
      for (const period of ownPeriods) events.push({ source: 'schedule', addressUuid, inverterId, period })
      for (const periods of [flexPeriods, ownPeriods]) {
        const split = splitCurtailmentSpans(periods, windowStart, windowEnd)
        spans.push(...split.events)
        standingSpans.push(...split.standing)
      }
    },
    { signal, minDelayMs: FETCH_STAGGER_MS },
  )

  const curtailedInverterKeys = [
    ...new Set(events.filter((e) => e.period.desc.isCurtailment).map((e) => refKey(e))),
  ]

  return {
    clusters: keepRelevant(clusterEvents(events)),
    curtailedInverterKeys,
    bands: mergeSpans(spans),
    standingBands: mergeSpans(standingSpans),
    addressesScanned: scan.addresses,
    invertersScanned: pairs.length,
    refs: pairs,
    scan,
    schedules,
  }
}
