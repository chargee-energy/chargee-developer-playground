import type { HourlySlot } from './addressEnergyHistory'
import { percentile } from './batterySizing'

/** Percentile of hourly load treated as the standby (baseline) level. */
export const STANDBY_PERCENTILE = 5

export interface AddressBenchmarkMetrics {
  addressUuid: string
  /** Total grid delivery over the period, kWh. */
  totalUsageKwh: number
  /** Highest hourly grid delivery, expressed as average kW over that hour. */
  peakUsageKw: number
  /** Baseline load: 5th percentile of hourly delivery, in W. */
  standbyUsageW: number
  /** Share of solar production consumed on-site; null without production data. */
  selfConsumptionPct: number | null
  hasSolar: boolean
}

export function computeBenchmarkMetrics(
  addressUuid: string,
  slots: HourlySlot[],
  hasSolar: boolean,
): AddressBenchmarkMetrics {
  const deliveries = slots.map((s) => s.delivered)
  const totalDeliveredWh = deliveries.reduce((a, b) => a + b, 0)
  const totalReturnedWh = slots.reduce((a, s) => a + s.returned, 0)
  const totalProducedWh = slots.reduce((a, s) => a + s.produced, 0)

  const selfConsumptionPct =
    hasSolar && totalProducedWh > 0
      ? Math.max(0, Math.min(100, Math.round(((totalProducedWh - totalReturnedWh) / totalProducedWh) * 100)))
      : null

  return {
    addressUuid,
    totalUsageKwh: totalDeliveredWh / 1000,
    // An hourly Wh total equals the average W over that hour.
    peakUsageKw: deliveries.length ? Math.max(...deliveries) / 1000 : 0,
    standbyUsageW: Math.round(percentile(deliveries, STANDBY_PERCENTILE)),
    selfConsumptionPct,
    hasSolar,
  }
}

/**
 * Share of the cohort the target scores better than, as a percentage.
 * "Better" is lower for usage-style metrics and higher for self-consumption.
 */
export function percentileRank(value: number, cohort: number[], higherIsBetter: boolean): number | null {
  if (cohort.length === 0) return null
  const beaten = cohort.filter((c) => (higherIsBetter ? value > c : value < c)).length
  return Math.round((beaten / cohort.length) * 100)
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Bucket cohort + target values into a small histogram for the distribution charts. */
export function histogram(
  cohort: number[],
  target: number,
  bucketCount = 10,
): Array<{ label: string; count: number; isTarget: boolean }> {
  const all = [...cohort, target]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const width = span / bucketCount
  const targetBucket = Math.min(bucketCount - 1, Math.floor((target - min) / width))
  return Array.from({ length: bucketCount }, (_, i) => {
    const lo = min + i * width
    const hi = lo + width
    const count = cohort.filter((v) => (i === bucketCount - 1 ? v >= lo && v <= hi : v >= lo && v < hi)).length
    return {
      label: `${formatShort(lo)}–${formatShort(hi)}`,
      count,
      isTarget: i === targetBucket,
    }
  })
}

function formatShort(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`
  return Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1)
}
