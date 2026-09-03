import { sparkyControllerGetSparkyDetailsV2 } from '@/api/generated/sparky/sparky'
import {
  solarInvertersControllerListV2,
  solarInvertersControllerGetProductionEnergyV2,
  solarInverterAggregationControllerGetProductionIntervalsV2,
} from '@/api/generated/solar-inverters/solar-inverters'
import { mapWithConcurrency } from '@/utils/concurrency'
import { loadAllAddresses } from './useAddressReport'
import { asBoolean, asString } from './reportFreshness'
import { deriveConnectionType, deriveProductionStatus, type ConnectionType, type ProductionStatus } from './reportSolarStatus'

const FETCH_CONCURRENCY = 4
const FETCH_STAGGER_MS = 60
const MINUTE_MS = 60 * 1000
const SLOT_MS = 15 * 60 * 1000 // quarter_hourly is the finest resolution on offer
const READING_LIMIT = 1000 // server max per page
const MAX_READING_PAGES = 6
// Raw readings from different inverters never share timestamps, so each series is
// resampled onto a common grid before summing.
const RAW_GRID_MS = 10 * 1000
// Drop an inverter out of the sum once its last reading is this stale, so an
// offline device doesn't hold a flat line into the total forever.
const RAW_STALE_MS = 5 * 60 * 1000

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

/** Raw sample for the on-demand detail view. */
export interface FlexAggregateRaw {
  t: number
  return: number
  delivery: number
  steerablePowerZeroExport: number
  solarProduction: number
}

export interface InverterRef {
  addressUuid: string
  inverterId: string
  brand: string | null
  model: string | null
  /** Live-streaming (steerable/live-capable) vs cloud-reported. */
  connection: ConnectionType
  /** Device health from `lastProductionState`, per the shared thresholds. */
  productionStatus: ProductionStatus
  lastProductionTime: string | null
  /** Serial of the Sparky on this address, if any — needed for local steering. */
  sparkySerial: string | null
}

/**
 * Counts at each narrowing step, so it is visible where inverters drop out
 * between "in the group" and "we can prove the curtailment landed".
 */
export interface SteerableScan {
  refs: InverterRef[]
  addresses: number
  addressesWithSparky: number
  /** Every inverter seen, before the steerable filter. */
  invertersFound: number
}

/** Whether an inverter actually returned production data for the window. */
export interface InverterCoverage {
  ref: InverterRef
  /** Number of 15-min intervals returned inside the window. */
  intervals: number
  /** Total energy reported across those intervals (kWh). */
  kwh: number
  lastIntervalTime: string | null
  /** Was this inverter under a curtailment command in the window? */
  curtailed: boolean
}

export const refKey = (r: { addressUuid: string; inverterId: string }) => `${r.addressUuid}:${r.inverterId}`

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const num0 = (v: unknown): number => num(v) ?? 0

/**
 * Every steerable inverter in a group, as address/inverter pairs. `info` comes
 * back inline on the list response, so the steerable filter costs no extra call.
 */
export async function loadSteerableInverters(
  groupUuid: string,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<SteerableScan> {
  const addresses = await loadAllAddresses(groupUuid, signal)
  let done = 0
  onProgress(0, addresses.length)

  const perAddress = await mapWithConcurrency(
    addresses,
    FETCH_CONCURRENCY,
    async (a) => {
      const res = await solarInvertersControllerListV2(a.uuid, undefined, signal)
      onProgress((done += 1), addresses.length)
      const all = res.results ?? []
      const refs = all
        .filter((i) => asBoolean(i.info?.isSteerable) === true)
        .map((i) => ({
          addressUuid: a.uuid,
          inverterId: i.identifier,
          brand: asString(i.info?.brand),
          model: asString(i.info?.model),
          connection: deriveConnectionType(i.info),
          productionStatus: deriveProductionStatus(i.lastProductionState, i.info),
          lastProductionTime: asString(i.lastProductionState?.time),
          sparkySerial: asString(a.sparky?.serialNumber),
        }))
      return { refs, found: all.length }
    },
    { signal, minDelayMs: FETCH_STAGGER_MS },
  )

  return {
    refs: perAddress.flatMap((r) => r.refs),
    addresses: addresses.length,
    addressesWithSparky: addresses.filter((a) => a.sparky != null).length,
    invertersFound: perAddress.reduce((n, r) => n + r.found, 0),
  }
}

/**
 * A Sparky's `disconnectedAt` — the one disconnection timestamp the platform
 * actually records; solar inverters carry no such field. Only reachable one
 * serial at a time, so this is a separate opt-in pass rather than part of the
 * main scan.
 */
export async function loadSparkyDisconnections(
  serials: string[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  let done = 0
  onProgress(0, serials.length)
  await mapWithConcurrency(
    serials,
    FETCH_CONCURRENCY,
    async (serial) => {
      try {
        const sparky = await sparkyControllerGetSparkyDetailsV2(serial, undefined, signal)
        out.set(serial, asString(sparky.disconnectedAt))
      } catch {
        // A serial the caller can't read shouldn't sink the whole pass.
        if (!signal.aborted) out.set(serial, null)
      }
      onProgress((done += 1), serials.length)
    },
    { signal, minDelayMs: FETCH_STAGGER_MS },
  )
  return out
}

/**
 * Group solar production summed from the individual inverters — the fallback for
 * groups the flex engine doesn't aggregate (anything that isn't a curtailment
 * pool), where `/groups/{uuid}/flex/aggregation` comes back empty.
 *
 * `quarter_hourly` is the finest resolution the interval endpoint offers, and
 * `production` is a Wh total per interval, so it is converted to the average kW
 * over the interval and held across each of the interval's minutes. That keeps the
 * output identical in shape *and units* to the flex aggregation series, so the
 * chart and the energy integrals downstream need no special cases — at the cost of
 * a stepped line. Use `loadGroupProductionRaw` to resolve anything shorter than
 * 15 minutes.
 */
export async function loadGroupProductionMinutes(
  refs: InverterRef[],
  fromIso: string,
  toIso: string,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ minutes: FlexAggregateMinute[]; coverage: InverterCoverage[] }> {
  const slots = new Map<number, { kw: number; inverters: number }>()
  const coverage: InverterCoverage[] = []
  let done = 0
  onProgress(0, refs.length)

  await mapWithConcurrency(
    refs,
    FETCH_CONCURRENCY,
    async (ref) => {
      const res = await solarInverterAggregationControllerGetProductionIntervalsV2(
        ref.addressUuid,
        ref.inverterId,
        { resolution: 'quarter_hourly', fromDate: fromIso, toDate: toIso },
        undefined,
        signal,
      )
      onProgress((done += 1), refs.length)
      // Track what each inverter actually returned, so silent non-reporters can
      // be told apart from inverters that genuinely produced nothing.
      let intervals = 0
      let wh = 0
      let lastT: number | null = null
      for (const iv of res.results ?? []) {
        const t = new Date(iv.time as unknown as string).getTime()
        if (!Number.isFinite(t)) continue
        const slot = Math.floor(t / SLOT_MS) * SLOT_MS
        // Wh over a 15-min interval → average kW: Wh / 1000 / 0.25.
        const kw = (num0(iv.production) * 4) / 1000
        const acc = slots.get(slot) ?? { kw: 0, inverters: 0 }
        acc.kw += kw
        acc.inverters += 1
        slots.set(slot, acc)
        intervals += 1
        wh += num0(iv.production)
        lastT = lastT == null ? t : Math.max(lastT, t)
      }
      coverage.push({
        ref,
        intervals,
        kwh: wh / 1000,
        lastIntervalTime: lastT == null ? null : new Date(lastT).toISOString(),
        curtailed: false, // filled in by the caller, which holds the schedule scan
      })
    },
    { signal, minDelayMs: FETCH_STAGGER_MS },
  )

  // Expand each 15-min slot into its minutes so per-minute energy integrals
  // (kW × 1/60 h) stay correct downstream.
  const minutes: FlexAggregateMinute[] = []
  for (const slot of [...slots.keys()].sort((a, b) => a - b)) {
    const acc = slots.get(slot)!
    for (let t = slot; t < slot + SLOT_MS; t += MINUTE_MS) {
      minutes.push({
        t,
        return: 0,
        delivery: 0,
        steerablePowerZeroExport: 0,
        solarProduction: acc.kw,
        solarBand: [acc.kw, acc.kw],
        solarInverterCount: acc.inverters,
        smartMeterCount: 0,
      })
    }
  }
  coverage.sort((a, b) => a.intervals - b.intervals || refKey(a.ref).localeCompare(refKey(b.ref)))
  return { minutes, coverage }
}

/** Page one inverter's raw readings by time (the endpoint ignores offset). */
async function loadReadings(
  ref: InverterRef,
  fromMs: number,
  toMs: number,
  signal: AbortSignal,
): Promise<{ t: number; kw: number }[]> {
  const out: { t: number; kw: number }[] = []
  const toIso = new Date(toMs).toISOString()
  let cursorMs = fromMs
  let lastMs = Number.NEGATIVE_INFINITY

  for (let page = 0; page < MAX_READING_PAGES && cursorMs < toMs; page++) {
    if (signal.aborted) break
    const res = await solarInvertersControllerGetProductionEnergyV2(
      ref.addressUuid,
      ref.inverterId,
      { fromDate: new Date(cursorMs).toISOString(), toDate: toIso, sortBy: 'ASC', limit: READING_LIMIT },
      undefined,
      signal,
    )
    const rows = res.results ?? []
    const fresh = rows
      .map((r) => ({ t: new Date(r.time as unknown as string).getTime(), kw: num0(r.power) / 1000 }))
      .filter((r) => Number.isFinite(r.t) && r.t > lastMs)
    if (fresh.length === 0) break
    out.push(...fresh)
    lastMs = fresh[fresh.length - 1].t
    if (rows.length < READING_LIMIT || lastMs <= cursorMs) break
    cursorMs = lastMs
  }
  return out
}

/**
 * Group solar production at device resolution, for the on-demand block detail.
 *
 * Inverters report on their own clocks, so summing raw samples directly would
 * undercount every instant where only some devices happened to report. Each
 * inverter is instead resampled onto a shared grid by holding its last reading
 * (power is a continuous signal), and dropped from the sum once that reading goes
 * stale — so an offline device doesn't hold a flat line into the total.
 *
 * This is the expensive path: one to six requests per inverter. It is only worth
 * it below the 15-minute floor of the interval endpoint.
 */
export async function loadGroupProductionRaw(
  refs: InverterRef[],
  fromMs: number,
  toMs: number,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<FlexAggregateRaw[]> {
  const gridN = Math.max(1, Math.ceil((toMs - fromMs) / RAW_GRID_MS))
  const sum = new Float64Array(gridN)
  const contributors = new Int32Array(gridN)
  let done = 0
  onProgress(0, refs.length)

  await mapWithConcurrency(
    refs,
    FETCH_CONCURRENCY,
    async (ref) => {
      const readings = await loadReadings(ref, fromMs, toMs, signal)
      onProgress((done += 1), refs.length)
      if (readings.length === 0) return
      // Last-value-hold onto the grid, expiring after RAW_STALE_MS.
      let idx = 0
      for (let g = 0; g < gridN; g++) {
        const gt = fromMs + g * RAW_GRID_MS
        while (idx + 1 < readings.length && readings[idx + 1].t <= gt) idx++
        const r = readings[idx]
        if (r.t > gt || gt - r.t > RAW_STALE_MS) continue
        sum[g] += r.kw
        contributors[g] += 1
      }
    },
    { signal, minDelayMs: FETCH_STAGGER_MS },
  )

  const out: FlexAggregateRaw[] = []
  for (let g = 0; g < gridN; g++) {
    if (contributors[g] === 0) continue
    out.push({
      t: fromMs + g * RAW_GRID_MS,
      return: 0,
      delivery: 0,
      steerablePowerZeroExport: 0,
      solarProduction: sum[g],
    })
  }
  return out
}
