import type { HourlySlot } from './addressEnergyHistory'

// Hour-by-hour battery simulation with SoC carry-over, ported from the
// companion-web app (src/utils/batterySimulation.ts) and adapted to a single
// EUR/kWh price map (incl. BTW) from EnergyZero.

export interface HourlySimResult {
  time: string
  socStart: number
  chargeWh: number
  dischargeWh: number
  socEnd: number
}

export interface BatterySimulationResult {
  totalChargedWh: number
  totalDischargedWh: number
  selfConsumptionPercent: number | null
  savingsEur: number | null
  hourly: HourlySimResult[]
}

export type BatteryStrategy = 'self-consumption' | 'profit'

export interface BatterySimulationParams {
  hourlySlots: HourlySlot[]
  /** Hourly EUR/kWh (incl. BTW) keyed by UTC hour ISO; required for the profit strategy. */
  hourlyPricesByTime?: Map<string, number>
  /** Self-consumption with fixed rates: EUR/kWh paid for grid consumption. */
  fixedConsumptionPriceEurPerKwh?: number
  /** Self-consumption with fixed rates: EUR/kWh received for grid return. */
  fixedReturnPriceEurPerKwh?: number
  capacityKwh: number
  inverterKw: number
  minSocPercent: number
  initialSocKwh: number
  strategy: BatteryStrategy
}

/**
 * Simulate a battery over the given hourly slots with SoC carry-over.
 * SoC is clamped to [minSoc, capacity]; charge/discharge are limited by the
 * inverter power (kW == kWh per hourly slot).
 */
export function runBatterySimulation(params: BatterySimulationParams): BatterySimulationResult {
  const {
    hourlySlots,
    hourlyPricesByTime,
    fixedConsumptionPriceEurPerKwh,
    fixedReturnPriceEurPerKwh,
    capacityKwh,
    inverterKw,
    minSocPercent,
    initialSocKwh,
    strategy,
  } = params

  const capacityWh = capacityKwh * 1000
  const inverterWh = inverterKw * 1000
  const minSocWh = capacityWh * (minSocPercent / 100)
  const hourly: HourlySimResult[] = []
  let totalChargedWh = 0
  let totalDischargedWh = 0
  let totalGridDrawWh = 0
  let totalGridDrawAfterBatteryWh = 0

  let soc = Math.min(initialSocKwh * 1000, capacityWh)
  soc = Math.max(soc, minSocWh)

  if (strategy === 'profit' && hourlyPricesByTime) {
    // Per day: rank hours by price; charge in the cheap half, discharge in the
    // expensive half (relative to the daily median).
    const slotDecisions = new Map<string, 'charge' | 'discharge'>()
    const byDate = new Map<string, { time: string; price: number }[]>()
    for (const slot of hourlySlots) {
      const date = slot.time.slice(0, 10)
      const price = hourlyPricesByTime.get(slot.time) ?? 0
      const list = byDate.get(date) ?? []
      list.push({ time: slot.time, price })
      byDate.set(date, list)
    }
    for (const [, daySlots] of byDate) {
      const sorted = [...daySlots].sort((a, b) => a.price - b.price)
      const mid = Math.floor(sorted.length / 2)
      const median = sorted[mid]?.price ?? 0
      for (const { time, price } of daySlots) {
        slotDecisions.set(time, price <= median ? 'charge' : 'discharge')
      }
    }

    for (const slot of hourlySlots) {
      const socStart = soc
      const excessWh = Math.max(0, slot.returned - slot.delivered)
      const needWh = Math.max(0, slot.delivered - slot.returned)
      let chargeWh = 0
      let dischargeWh = 0
      const headroom = capacityWh - soc
      const usableSoc = Math.max(0, soc - minSocWh)
      const decision = slotDecisions.get(slot.time) ?? 'charge'
      if (decision === 'charge') {
        const fromSolar = Math.min(inverterWh, headroom, excessWh)
        const fromGrid = Math.min(inverterWh - fromSolar, headroom - fromSolar)
        chargeWh = fromSolar + fromGrid
      } else {
        dischargeWh = Math.min(inverterWh, usableSoc, needWh)
      }
      soc = Math.max(minSocWh, Math.min(capacityWh, soc + chargeWh - dischargeWh))
      totalChargedWh += chargeWh
      totalDischargedWh += dischargeWh
      hourly.push({ time: slot.time, socStart, chargeWh, dischargeWh, socEnd: soc })
    }

    const totalCostBefore = hourlySlots.reduce(
      (sum, s) =>
        sum + (Math.max(0, s.delivered - s.returned) / 1000) * (hourlyPricesByTime.get(s.time) ?? 0),
      0,
    )
    let costAfter = 0
    for (let i = 0; i < hourlySlots.length; i++) {
      const slot = hourlySlots[i]
      const hr = hourly[i]
      const netGridWh = Math.max(0, slot.delivered - slot.returned) - hr.dischargeWh + hr.chargeWh
      costAfter += (netGridWh / 1000) * (hourlyPricesByTime.get(slot.time) ?? 0)
    }
    return {
      totalChargedWh,
      totalDischargedWh,
      selfConsumptionPercent: null,
      savingsEur: totalCostBefore - costAfter,
      hourly,
    }
  }

  // Self-consumption strategy: charge from solar excess, discharge to cover
  // grid draw.
  for (const slot of hourlySlots) {
    const socStart = soc
    const excessWh = Math.max(0, slot.returned - slot.delivered)
    const needWh = Math.max(0, slot.delivered - slot.returned)
    totalGridDrawWh += needWh

    const headroom = capacityWh - soc
    const usableSoc = Math.max(0, soc - minSocWh)
    const chargeWh = Math.min(inverterWh, headroom, excessWh)
    const dischargeWh = Math.min(inverterWh, usableSoc, needWh)

    soc = Math.max(minSocWh, Math.min(capacityWh, soc + chargeWh - dischargeWh))
    totalChargedWh += chargeWh
    totalDischargedWh += dischargeWh
    totalGridDrawAfterBatteryWh += needWh - dischargeWh

    hourly.push({ time: slot.time, socStart, chargeWh, dischargeWh, socEnd: soc })
  }

  const selfConsumptionPercent =
    totalGridDrawWh > 0 ? Math.round((1 - totalGridDrawAfterBatteryWh / totalGridDrawWh) * 100) : 0

  // Savings: spot prices value each discharged kWh at that hour's price;
  // fixed rates value discharge at the consumption rate minus the return
  // opportunity cost of the charged energy.
  let savingsEur: number | null = null
  if (hourlyPricesByTime && hourlyPricesByTime.size > 0) {
    savingsEur = hourly.reduce(
      (sum, hr) => sum + (hr.dischargeWh / 1000) * (hourlyPricesByTime.get(hr.time) ?? 0),
      0,
    )
  } else if (fixedConsumptionPriceEurPerKwh != null && fixedReturnPriceEurPerKwh != null) {
    const consumptionValue = (totalDischargedWh / 1000) * fixedConsumptionPriceEurPerKwh
    const opportunityCostReturn = (totalChargedWh / 1000) * fixedReturnPriceEurPerKwh
    savingsEur = Math.max(0, consumptionValue - opportunityCostReturn)
  }

  return { totalChargedWh, totalDischargedWh, selfConsumptionPercent, savingsEur, hourly }
}
