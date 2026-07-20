import type { FlexAggregateMinute } from './useGroupCurtailmentReport'

const MIN_TO_KWH = 1 / 60000 // avg W over 1 min → kWh
const DAYLIGHT_MIN = 0.02 // ignore near-night samples when anchoring the shape
const MIN_ANCHORS = 10 // minutes of uncurtailed daylight needed for a stable scale
const MERGE_GAP_MS = 60 * 1000 // bands closer than this are one curtailment window
const LOCAL_CTX_MS = 60 * 60 * 1000 // uncurtailed neighbourhood used to anchor a window

// The API doesn't expose group coordinates, so we assume a Netherlands location
// for the clear-sky solar shape (only the shape matters — it's scaled to the
// group's own observed production).
const NL_LAT = 52.13
const NL_LON = 5.29

export type ImpactConfidence = 'high' | 'low' | 'none'

export interface CurtailmentImpact {
  producedKwh: number
  exportedKwh: number
  importedKwh: number
  potentialKwh: number
  curtailedKwh: number
  curtailedPct: number
  peakShavedW: number
  confidence: ImpactConfidence
}

interface Band {
  start: number
  end: number
}

/**
 * sin(solar elevation) for an instant at a location — a normalized clear-sky
 * shape (0 at night, ~1 at solar noon). NOAA solar-position approximation.
 */
function clearSkyShape(epochMs: number, latDeg = NL_LAT, lonDeg = NL_LON): number {
  const d = new Date(epochMs)
  const dayOfYear0 = Math.floor((epochMs - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000)
  const hoursUTC = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600
  const g = ((2 * Math.PI) / 365) * (dayOfYear0 + (hoursUTC - 12) / 24)
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g))
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)
  const tst = hoursUTC * 60 + eqTime + 4 * lonDeg // true solar time (minutes)
  const ha = ((tst / 4 - 180) * Math.PI) / 180 // hour angle (rad)
  const lat = (latDeg * Math.PI) / 180
  const sinElev = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha)
  return Math.max(0, Math.min(1, sinElev))
}

/** Merge touching/overlapping curtailment bands into distinct windows. */
function toWindows(bands: Band[]): Band[] {
  const sorted = [...bands].sort((a, b) => a.start - b.start)
  const windows: Band[] = []
  for (const b of sorted) {
    const last = windows[windows.length - 1]
    if (last && b.start <= last.end + MERGE_GAP_MS) last.end = Math.max(last.end, b.end)
    else windows.push({ start: b.start, end: b.end })
  }
  return windows
}

/**
 * Estimate the effect of curtailment from data we already hold. Facts: energy
 * integrals over the curtailment period(s). Estimate: a clear-sky solar shape
 * scaled (least-squares through the origin) to the uncurtailed daylight
 * production — anchored *per curtailment window* to its own local surroundings,
 * so separate events (e.g. midday vs evening) each get an accurate counterfactual
 * and the shape stays realistic.
 *
 * `potentialByT` is set only inside curtailment windows, so the dashed line shows
 * one segment per window. Confidence is `high` only when every window has enough
 * uncurtailed daylight on both sides to anchor its scale.
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

  const windows = toWindows(bands)
  const inCurtailment = (t: number) => windows.some((w) => t >= w.start && t < w.end)

  // Anchor the clear-sky shape to each window's own local uncurtailed daylight.
  const scales: (number | null)[] = []
  const confidences: ImpactConfidence[] = []
  for (const w of windows) {
    let sumOM = 0
    let sumMM = 0
    let anchors = 0
    let hasPre = false
    let hasPost = false
    for (const m of minutes) {
      if (m.t < w.start - LOCAL_CTX_MS || m.t > w.end + LOCAL_CTX_MS) continue
      if (inCurtailment(m.t)) continue
      const model = clearSkyShape(m.t)
      if (model < DAYLIGHT_MIN) continue
      sumOM += m.solarProduction * model
      sumMM += model * model
      anchors += 1
      if (m.t < w.start) hasPre = true
      if (m.t >= w.end) hasPost = true
    }
    const scale = sumMM > 0 ? sumOM / sumMM : null
    scales.push(scale)
    confidences.push(
      scale == null ? 'none' : anchors >= MIN_ANCHORS && hasPre && hasPost ? 'high' : 'low',
    )
  }

  const windowOf = (t: number) => windows.findIndex((w) => t >= w.start && t < w.end)

  let producedKwh = 0
  let exportedKwh = 0
  let importedKwh = 0
  let potentialKwh = 0
  let curtailedKwh = 0
  let peakShavedW = 0

  for (const m of minutes) {
    const wi = windowOf(m.t)
    if (wi < 0) continue // outside any curtailment window
    producedKwh += m.solarProduction * MIN_TO_KWH
    exportedKwh += m.return * MIN_TO_KWH
    importedKwh += m.delivery * MIN_TO_KWH
    const scale = scales[wi]
    if (scale != null) {
      const base = scale * clearSkyShape(m.t)
      potentialByT.set(m.t, base)
      potentialKwh += base * MIN_TO_KWH
      const shave = Math.max(0, base - m.solarProduction)
      curtailedKwh += shave * MIN_TO_KWH
      peakShavedW = Math.max(peakShavedW, shave)
    }
  }

  const withEstimate = confidences.filter((c) => c !== 'none')
  const confidence: ImpactConfidence =
    withEstimate.length === 0 ? 'none' : confidences.every((c) => c === 'high') ? 'high' : 'low'
  const curtailedPct = potentialKwh > 0 ? (curtailedKwh / potentialKwh) * 100 : 0

  return {
    impact: { producedKwh, exportedKwh, importedKwh, potentialKwh, curtailedKwh, curtailedPct, peakShavedW, confidence },
    potentialByT,
  }
}
