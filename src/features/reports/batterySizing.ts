import type { HourlySlot } from './addressEnergyHistory'
import { runBatterySimulation, type BatteryStrategy } from './batterySimulation'

/** Percentile of 15-min peaks used for inverter sizing (avoids one-off outliers). */
export const INVERTER_SIZING_PERCENTILE = 95
export const CAPACITY_SWEEP_MIN_KWH = 1
export const CAPACITY_SWEEP_MAX_KWH = 30

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

/**
 * Recommended battery inverter power: the 95th percentile of absolute 15-min
 * net grid power over the period, rounded up to the next 0.5 kW.
 */
export function recommendInverterKw(quarterHourlyNetPowerW: number[]): number {
  const p95W = percentile(quarterHourlyNetPowerW, INVERTER_SIZING_PERCENTILE)
  return Math.max(0.5, Math.ceil((p95W / 1000) * 2) / 2)
}

export interface CapacitySweepRow {
  capacityKwh: number
  savingsEur: number
  annualSavingsEur: number
  costEur: number
  paybackYears: number
  roiPercent: number
  selfConsumptionPercent: number | null
}

export interface SweepParams {
  hourlySlots: HourlySlot[]
  periodDays: number
  inverterKw: number
  strategy: BatteryStrategy
  hourlyPricesByTime?: Map<string, number>
  fixedConsumptionPriceEurPerKwh?: number
  fixedReturnPriceEurPerKwh?: number
  batteryCostPerKwh: number
  minSocPercent: number
  initialSocPercent: number
}

export interface SweepResult {
  rows: CapacitySweepRow[]
}

/**
 * Simulate every capacity from 1 to 30 kWh and annualize the savings so the
 * options can be compared on savings, payback and ROI.
 */
export function sweepCapacities(params: SweepParams): SweepResult {
  const {
    hourlySlots,
    periodDays,
    inverterKw,
    strategy,
    hourlyPricesByTime,
    fixedConsumptionPriceEurPerKwh,
    fixedReturnPriceEurPerKwh,
    batteryCostPerKwh,
    minSocPercent,
    initialSocPercent,
  } = params

  const rows: CapacitySweepRow[] = []
  for (let cap = CAPACITY_SWEEP_MIN_KWH; cap <= CAPACITY_SWEEP_MAX_KWH; cap++) {
    const sim = runBatterySimulation({
      hourlySlots,
      hourlyPricesByTime,
      fixedConsumptionPriceEurPerKwh,
      fixedReturnPriceEurPerKwh,
      capacityKwh: cap,
      inverterKw,
      minSocPercent,
      initialSocKwh: cap * (initialSocPercent / 100),
      strategy,
    })
    const savingsEur = Math.max(0, sim.savingsEur ?? 0)
    const annualSavingsEur = periodDays > 0 ? (savingsEur * 365) / periodDays : 0
    const costEur = cap * batteryCostPerKwh
    const paybackYears = annualSavingsEur > 0 ? costEur / annualSavingsEur : Number.POSITIVE_INFINITY
    const roiPercent = costEur > 0 ? (annualSavingsEur / costEur) * 100 : 0
    rows.push({
      capacityKwh: cap,
      savingsEur,
      annualSavingsEur,
      costEur,
      paybackYears,
      roiPercent,
      selfConsumptionPercent: sim.selfConsumptionPercent,
    })
  }

  return { rows }
}
