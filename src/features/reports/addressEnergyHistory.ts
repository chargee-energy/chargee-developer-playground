import { smartMetersControllerGetSmartMetersForAddressV2, smartMetersAggregationControllerGetElectricityIntervalsV2 } from '@/api/generated/smart-meters/smart-meters'
import { solarInvertersControllerListV2, solarInverterAggregationControllerGetProductionIntervalsV2 } from '@/api/generated/solar-inverters/solar-inverters'
import { mapWithConcurrency } from '@/utils/concurrency'

/** One hour of merged history: energy in Wh, time is the UTC hour start (ISO). */
export interface HourlySlot {
  time: string
  delivered: number
  returned: number
  produced: number
}

export interface AddressEnergyHistory {
  slots: HourlySlot[]
  hasSmartMeter: boolean
  hasSolar: boolean
  /** Identifier of the smart meter used, for follow-up queries. */
  meterUuid: string | null
}

/** Round a timestamp down to its UTC hour so all series share slot keys. */
export function hourKey(iso: string): string {
  const d = new Date(iso)
  d.setUTCMinutes(0, 0, 0)
  return d.toISOString()
}

/** Split [from, to) into calendar-month chunks to keep interval requests small. */
export function monthChunks(from: Date, to: Date): Array<{ fromDate: string; toDate: string }> {
  const chunks: Array<{ fromDate: string; toDate: string }> = []
  let cursor = new Date(from)
  while (cursor < to) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
    const end = next < to ? next : to
    chunks.push({ fromDate: cursor.toISOString(), toDate: end.toISOString() })
    cursor = end
  }
  return chunks
}

// Per-address request concurrency. Kept low: benchmark runs several addresses
// in parallel on top of this.
const CHUNK_CONCURRENCY = 2

interface FetchOptions {
  signal: AbortSignal
  /** Called as chunk requests complete (unit = one HTTP request). */
  onRequestDone?: () => void
  /** Called once after device discovery with the number of chunk requests planned. */
  onPlan?: (requestTotal: number) => void
}

/**
 * Fetch one address's hourly energy history (grid delivery/return via the
 * smart meter aggregation endpoint, solar production via the inverter
 * aggregation endpoint) and merge it into time-ordered hourly slots.
 */
export async function fetchAddressHourlyHistory(
  addressUuid: string,
  from: Date,
  to: Date,
  { signal, onRequestDone, onPlan }: FetchOptions,
): Promise<AddressEnergyHistory> {
  const chunks = monthChunks(from, to)

  const [metersRes, invertersRes] = await Promise.all([
    smartMetersControllerGetSmartMetersForAddressV2(addressUuid, undefined, signal),
    solarInvertersControllerListV2(addressUuid, undefined, signal),
  ])
  const meter = metersRes.results?.[0]
  const inverters = invertersRes.results ?? []
  onPlan?.(chunks.length * ((meter ? 1 : 0) + inverters.length))

  const slotMap = new Map<string, HourlySlot>()
  const getSlot = (time: string): HourlySlot => {
    let slot = slotMap.get(time)
    if (!slot) {
      slot = { time, delivered: 0, returned: 0, produced: 0 }
      slotMap.set(time, slot)
    }
    return slot
  }

  if (meter) {
    await mapWithConcurrency(
      chunks,
      CHUNK_CONCURRENCY,
      async (chunk) => {
        const res = await smartMetersAggregationControllerGetElectricityIntervalsV2(
          addressUuid,
          meter.identifier,
          { resolution: 'hourly', fromDate: chunk.fromDate, toDate: chunk.toDate },
          undefined,
          signal,
        )
        for (const r of res.results ?? []) {
          const slot = getSlot(hourKey(r.time))
          slot.delivered += r.delivery
          slot.returned += r.return
        }
        onRequestDone?.()
      },
      { signal },
    )
  }

  for (const inverter of inverters) {
    await mapWithConcurrency(
      chunks,
      CHUNK_CONCURRENCY,
      async (chunk) => {
        const res = await solarInverterAggregationControllerGetProductionIntervalsV2(
          addressUuid,
          inverter.identifier,
          { resolution: 'hourly', fromDate: chunk.fromDate, toDate: chunk.toDate },
          undefined,
          signal,
        )
        for (const r of res.results ?? []) {
          getSlot(hourKey(r.time)).produced += r.production
        }
        onRequestDone?.()
      },
      { signal },
    )
  }

  const slots = [...slotMap.values()].sort((a, b) => a.time.localeCompare(b.time))
  return { slots, hasSmartMeter: !!meter, hasSolar: inverters.length > 0, meterUuid: meter?.identifier ?? null }
}

/**
 * Fetch quarter-hourly grid power samples for an address over a period.
 * Each 15-min Wh interval is converted to average power in W (Wh × 4); the
 * result is the absolute net grid power per interval — the basis for the
 * percentile-based inverter sizing.
 */
export async function fetchQuarterHourlyNetPowerW(
  addressUuid: string,
  from: Date,
  to: Date,
  { signal, onRequestDone }: FetchOptions,
): Promise<number[]> {
  const metersRes = await smartMetersControllerGetSmartMetersForAddressV2(addressUuid, undefined, signal)
  const meter = metersRes.results?.[0]
  if (!meter) return []

  const chunks = monthChunks(from, to)
  const perChunk = await mapWithConcurrency(
    chunks,
    CHUNK_CONCURRENCY,
    async (chunk) => {
      const res = await smartMetersAggregationControllerGetElectricityIntervalsV2(
        addressUuid,
        meter.identifier,
        { resolution: 'quarter_hourly', fromDate: chunk.fromDate, toDate: chunk.toDate },
        undefined,
        signal,
      )
      onRequestDone?.()
      return (res.results ?? []).map((r) => Math.abs(r.delivery - r.return) * 4)
    },
    { signal },
  )
  return perChunk.flat()
}
