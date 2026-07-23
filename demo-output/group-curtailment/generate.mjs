// Demo Group Solar Curtailment data generator (two scenarios).
//
// Produces fully synthetic curtailment days shaped like real reference days, then
// runs the SAME impact math the report uses (ported from src/features/reports/
// curtailmentImpact.ts) so the tile numbers fall out of the data rather than being
// copied. Tuned ~15% above the reference days, so nothing is the partner's actual
// figure. Both scenarios are the SAME demo group ("Demo Solar Curtailment Pool")
// on different days.
//
//   node generate.mjs            # builds both
//   node generate.mjs full-day   # builds one
//
// Output: data-<scenario>.json

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const round1 = (v) => Math.round(v * 10) / 10

// ---- deterministic RNG (mulberry32) so demos are reproducible --------------
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- clear-sky potential shape (gaussian around solar noon) ----------------
const clearSky = (min, pmax, noon, sigma) => pmax * Math.exp(-((min - noon) ** 2) / (2 * sigma * sigma))

const hm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`
const toMin = (t) => {
  const [h, m, s] = t.split(':').map(Number)
  return h * 60 + m + (s || 0) / 60
}
const durLabel = (a, b) => {
  const min = Math.round((new Date(b) - new Date(a)) / 60000)
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

// ---- scenarios --------------------------------------------------------------
const GROUP = 'Demo Solar Curtailment Pool'
const SCENARIOS = {
  'full-day': {
    date: '2026-07-19',
    generatedAt: '2026-07-23T09:27:53',
    counts: { inverters: 165, meters: 165 },
    totalFlexSchedules: 248,
    // sun / production shape
    pmax: 348,
    noon: 808,
    sigma: 208,
    seed: 20260719,
    // curtailment windows (HH:MM) — hard zero-export drops
    curtail: [{ start: '10:15', end: '17:30', type: 'address', target: '0 W', trough: 72, ret: 36, del: 29 }],
    detail: { start: '10:00', end: '10:45', block: '10:15' },
    // table rows (bounding inverter periods + the curtailment)
    periods: [
      ['2026-07-18T17:06:00', '2026-07-19T10:15:00', 'inverter', 'No limit (100%)'],
      ['2026-07-19T10:15:00', '2026-07-19T17:30:00', 'address', '0 W'],
      ['2026-07-19T17:30:00', '2026-07-20T15:06:00', 'inverter', 'No limit (100%)'],
    ],
  },
  short: {
    date: '2026-07-20',
    generatedAt: '2026-07-23T10:13:52',
    counts: { inverters: 161, meters: 161 },
    totalFlexSchedules: 248,
    // high, gently-declining afternoon production (flatter shape)
    pmax: 380,
    noon: 808,
    sigma: 330,
    seed: 20260720,
    // one brief 9-minute zero-export notch during strong production
    curtail: [{ start: '15:06', end: '15:15', type: 'address', target: '0 W', trough: 56, ret: 22, del: 20 }],
    detail: { start: '14:45', end: '15:30', block: '15:00' },
    periods: [
      ['2026-07-19T17:30:00', '2026-07-20T15:06:00', 'inverter', 'No limit (100%)'],
      ['2026-07-20T15:06:00', '2026-07-20T15:15:00', 'address', '0 W'],
      ['2026-07-20T15:15:00', '2026-07-21T15:51:00', 'inverter', 'No limit (100%)'],
    ],
  },
}

const MIN_TO_KWH = 1 / 60

function build(key) {
  const S = SCENARIOS[key]
  const rand = rng(S.seed)
  const jitter = (amp) => (rand() * 2 - 1) * amp
  const wins = S.curtail.map((c) => ({ ...c, s: toMin(c.start), e: toMin(c.end) }))
  const inWin = (min) => wins.find((w) => min >= w.s && min < w.e)

  // overview window = curtailment span ±1h, clamped to the day
  const spanS = Math.min(...wins.map((w) => w.s))
  const spanE = Math.max(...wins.map((w) => w.e))
  const winStart = Math.max(0, spanS - 60)
  const winEnd = Math.min(1440, spanE + 60)

  const pot = (min) => clearSky(min, S.pmax, S.noon, S.sigma)
  // slow undulation gives the realistic wavy production line
  const undu = (min) => 11 * Math.sin(min / 13.3) + 7 * Math.sin(min / 29 + 1.7)

  function solar(min, noisy) {
    const w = inWin(min)
    if (w) {
      const rise = 6 * Math.sin((Math.PI * (min - w.s)) / Math.max(1, w.e - w.s))
      return Math.max(0, w.trough + rise + (noisy ? jitter(6) : 0))
    }
    return Math.max(0, pot(min) + undu(min) + (noisy ? jitter(8) : 0))
  }
  const steer = (min, noisy) => {
    const w = inWin(min)
    const s = solar(min, false)
    return Math.max(0, (w ? s - 4 : s * 0.93) + (noisy ? jitter(8) : 0))
  }
  const ret = (min, noisy) => {
    const w = inWin(min)
    return Math.max(0, (w ? w.ret : 14) + (noisy ? jitter(6) : jitter(3)))
  }
  const del = (min, noisy) => {
    const w = inWin(min)
    return Math.max(0, (w ? w.del : 16) + (noisy ? jitter(5) : jitter(3)))
  }

  // ---- per-minute overview series ----
  const minutes = []
  for (let min = winStart; min <= winEnd; min++) {
    const sv = solar(min, true)
    const bandAmp = inWin(min) ? 5 : 12
    minutes.push({
      t: `${S.date}T${hm(min)}:00`,
      min,
      solarProduction: round1(sv),
      steerablePowerZeroExport: round1(steer(min, true)),
      return: round1(ret(min, true)),
      delivery: round1(del(min, true)),
      solarBand: [round1(Math.max(0, sv - bandAmp - rand() * 4)), round1(sv + bandAmp + rand() * 4)],
      solarInverterCount: S.counts.inverters,
      smartMeterCount: S.counts.meters,
    })
  }

  // ---- raw ~1s detail series ----
  const dS = toMin(S.detail.start)
  const dE = toMin(S.detail.end)
  const detail = []
  for (let s = dS * 60; s <= dE * 60; s++) {
    const min = s / 60
    const edge = inWin(min) ? 6 : 12
    detail.push({
      t: `${S.date}T${hm(Math.floor(min))}:${String(Math.round(s % 60)).padStart(2, '0')}`,
      sec: s - dS * 60,
      solarProduction: round1(solar(min, false) + jitter(edge)),
      steerablePowerZeroExport: round1(steer(min, false) + jitter(edge)),
      return: round1(ret(min, false)),
      delivery: round1(del(min, false)),
    })
  }

  // ---- impact (ported from curtailmentImpact.ts) ----
  let sumOM = 0
  let sumMM = 0
  let anchors = 0
  for (const m of minutes) {
    if (inWin(m.min)) continue
    const model = pot(m.min)
    if (model < S.pmax * 0.02) continue
    sumOM += m.solarProduction * model
    sumMM += model * model
    anchors++
  }
  const scale = sumMM > 0 ? sumOM / sumMM : 0
  let produced = 0
  let exported = 0
  let imported = 0
  let curtailed = 0
  const potentialByMin = {}
  for (const m of minutes) {
    produced += m.solarProduction * MIN_TO_KWH
    if (!inWin(m.min)) continue
    exported += m.return * MIN_TO_KWH
    imported += m.delivery * MIN_TO_KWH
    const base = scale * pot(m.min)
    potentialByMin[m.min] = round1(base)
    curtailed += Math.max(0, base - m.solarProduction) * MIN_TO_KWH
  }
  const potentialKwh = produced + curtailed
  const impact = {
    confidence: anchors >= 10 ? 'high' : 'low',
    curtailedKwh: round1(curtailed),
    reductionPct: Math.round((curtailed / potentialKwh) * 100),
    potentialKwh: round1(potentialKwh),
    producedKwh: round1(produced),
    exportedKwh: round1(exported),
    importedKwh: round1(imported),
    potentialByMin,
  }

  // ---- periods table + metrics ----
  const periods = S.periods.map(([start, end, type, target]) => ({
    start,
    end,
    durationLabel: durLabel(start, end),
    targetType: type,
    target,
    isCurtailment: type !== 'inverter',
  }))
  const curtRows = periods.filter((p) => p.isCurtailment)
  const totalCurtMin = wins.reduce((a, w) => a + (w.e - w.s), 0)

  const model = {
    group: GROUP,
    date: S.date,
    generatedAt: S.generatedAt,
    counts: S.counts,
    metrics: {
      curtailmentPeriods: curtRows.length,
      timeCurtailed: durLabel(0 * 60000, totalCurtMin * 60000), // reuse label helper via ms
      totalFlexSchedules: S.totalFlexSchedules,
    },
    window: { start: `${S.date}T${hm(winStart)}:00`, end: `${S.date}T${hm(winEnd)}:00` },
    curtailment: wins.map((w) => ({ start: `${S.date}T${hm(w.s)}:00`, end: `${S.date}T${hm(w.e)}:00` })),
    detailWindow: { start: `${S.date}T${hm(dS)}:00`, end: `${S.date}T${hm(dE)}:00` },
    detailBlock: S.detail.block,
    periods,
    impact,
    minutes,
    detail,
  }

  const out = join(HERE, `data-${key}.json`)
  writeFileSync(out, JSON.stringify(model, null, 2))
  console.log(`\n[${key}] wrote ${out}`)
  console.log(`  window ${hm(winStart)}–${hm(winEnd)} · curtailed ${model.metrics.timeCurtailed} · ${impact.confidence} confidence`)
  console.log('  IMPACT', {
    curtailed: impact.curtailedKwh,
    reductionPct: impact.reductionPct,
    potential: impact.potentialKwh,
    produced: impact.producedKwh,
    exported: impact.exportedKwh,
    imported: impact.importedKwh,
  })
}

const which = process.argv[2]
const keys = which ? [which] : Object.keys(SCENARIOS)
for (const k of keys) {
  if (!SCENARIOS[k]) throw new Error(`unknown scenario: ${k}`)
  build(k)
}
