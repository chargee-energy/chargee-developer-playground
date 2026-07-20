import type { FlexAggregateMinute } from './useGroupCurtailmentReport'

const MIN_TO_KWH = 1 / 60000 // avg W over 1 min → kWh
const ANCHOR_MS = 15 * 60 * 1000 // window used to read the pre/post solar level
const SLOPE_MS = 15 * 60 * 1000 // extra window used to detect rising/falling sun

export type ImpactConfidence = 'high' | 'low' | 'none'

export interface CurtailmentImpact {
  /** Actual solar energy produced during curtailment (kWh). */
  producedKwh: number
  /** Grid energy exported / imported during curtailment (kWh). */
  exportedKwh: number
  importedKwh: number
  /** Estimated solar energy had there been no curtailment (kWh). */
  potentialKwh: number
  /** Estimated energy curtailed = potential − produced (kWh). */
  curtailedKwh: number
  /** Curtailed as a share of estimated potential (%). */
  curtailedPct: number
  /** Largest instantaneous shave (W). */
  peakShavedW: number
  confidence: ImpactConfidence
}

interface Band {
  start: number
  end: number
}

const avgSolar = (minutes: FlexAggregateMinute[], from: number, to: number): number | null => {
  const win = minutes.filter((m) => m.t >= from && m.t < to)
  if (win.length === 0) return null
  return win.reduce((s, m) => s + m.solarProduction, 0) / win.length
}

/**
 * Estimate the effect of curtailment from data we already hold: energy integrals
 * over the curtailment period(s) (facts), plus an estimated counterfactual solar
 * curve interpolated from the uncurtailed hour before/after (estimate). Returns a
 * per-minute `potential` map for the dashed overview line.
 *
 * Confidence is `low` when an anchor is missing or the event spans the solar peak
 * (sun rising into it and falling out of it) — where a straight interpolation
 * under-reads the true potential and only a solar hindcast could do better.
 */
export function computeCurtailmentImpact(
  minutes: FlexAggregateMinute[],
  bands: Band[],
): { impact: CurtailmentImpact; potentialByT: Map<number, number> } {
  const potentialByT = new Map<number, number>()
  const empty: CurtailmentImpact = {
    producedKwh: 0,
    exportedKwh: 0,
    importedKwh: 0,
    potentialKwh: 0,
    curtailedKwh: 0,
    curtailedPct: 0,
    peakShavedW: 0,
    confidence: 'none',
  }
  if (minutes.length === 0 || bands.length === 0) return { impact: empty, potentialByT }

  const spanStart = Math.min(...bands.map((b) => b.start))
  const spanEnd = Math.max(...bands.map((b) => b.end))
  const inCurtailment = (t: number) => bands.some((b) => t >= b.start && t < b.end)

  // Anchors: uncurtailed solar level just before start and just after end.
  const preVal = avgSolar(minutes, spanStart - ANCHOR_MS, spanStart)
  const postVal = avgSolar(minutes, spanEnd, spanEnd + ANCHOR_MS)
  const hasPre = preVal != null
  const hasPost = postVal != null

  const baselineAt = (t: number): number | null => {
    if (hasPre && hasPost) {
      const frac = spanEnd > spanStart ? (t - spanStart) / (spanEnd - spanStart) : 0
      return preVal! + (postVal! - preVal!) * Math.min(1, Math.max(0, frac))
    }
    if (hasPre) return preVal!
    if (hasPost) return postVal!
    return null
  }

  // Facts + estimate over curtailment minutes.
  let producedKwh = 0
  let exportedKwh = 0
  let importedKwh = 0
  let potentialKwh = 0
  let curtailedKwh = 0
  let peakShavedW = 0

  for (const m of minutes) {
    const base = baselineAt(m.t)
    if (base != null && m.t >= spanStart && m.t <= spanEnd) potentialByT.set(m.t, base)
    if (!inCurtailment(m.t)) continue
    producedKwh += m.solarProduction * MIN_TO_KWH
    exportedKwh += m.return * MIN_TO_KWH
    importedKwh += m.delivery * MIN_TO_KWH
    if (base != null) {
      potentialKwh += base * MIN_TO_KWH
      const shave = Math.max(0, base - m.solarProduction)
      curtailedKwh += shave * MIN_TO_KWH
      peakShavedW = Math.max(peakShavedW, shave)
    }
  }

  // Confidence: low if an anchor is missing or the sun rises into and falls out
  // of the event (peak inside → linear interpolation under-reads potential).
  let confidence: ImpactConfidence = 'none'
  if (hasPre || hasPost) {
    const preEarly = avgSolar(minutes, spanStart - ANCHOR_MS - SLOPE_MS, spanStart - ANCHOR_MS)
    const postLate = avgSolar(minutes, spanEnd + ANCHOR_MS, spanEnd + ANCHOR_MS + SLOPE_MS)
    const risingIn = preEarly != null && hasPre && preVal! > preEarly
    const fallingOut = postLate != null && hasPost && postVal! > postLate
    confidence = hasPre && hasPost && !(risingIn && fallingOut) ? 'high' : 'low'
  }

  const curtailedPct = potentialKwh > 0 ? (curtailedKwh / potentialKwh) * 100 : 0

  return {
    impact: { producedKwh, exportedKwh, importedKwh, potentialKwh, curtailedKwh, curtailedPct, peakShavedW, confidence },
    potentialByT,
  }
}
