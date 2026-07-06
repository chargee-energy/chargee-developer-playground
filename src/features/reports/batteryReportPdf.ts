import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import logoUrl from '@/assets/brand/chargee-logo.png'
import type { CapacitySweepRow } from './batterySizing'

// Chargee-branded PDF export of the battery advice report. The copy is
// self-contained (NL default, EN alternative) so the export language is
// independent of the app language.

export type PdfLanguage = 'nl' | 'en'

export interface MonthlyEnergyRow {
  month: string
  chargedKwh: number
  dischargedKwh: number
  avgSocPct: number
}

export interface DailyEnergyRow {
  /** UTC date, e.g. "2025-08-14". */
  date: string
  chargedKwh: number
  dischargedKwh: number
  endSocPct: number
}

export interface BatteryPdfInput {
  language: PdfLanguage
  addressUuid: string
  fromIso: string
  toIso: string
  generatedAt: string
  strategy: 'self-consumption' | 'profit'
  priceMode: 'fixed' | 'spot'
  fixedConsumption: number
  fixedReturn: number
  batteryCostPerKwh: number
  capacityKwh: number
  inverterKw: number
  recommendedInverterKw: number
  minSocPercent: number
  initialSocPercent: number
  selection: CapacitySweepRow
  sweepRows: CapacitySweepRow[]
  monthlySavings: Array<{ month: string; savings: number }>
  monthlyEnergy: MonthlyEnergyRow[]
  dailyEnergy: DailyEnergyRow[]
  totalChargedKwh: number
  totalDischargedKwh: number
}

const COLORS = {
  darkBlue: [29, 21, 67] as [number, number, number],
  darkPurple: [98, 69, 222] as [number, number, number],
  mediumPurple: [156, 135, 248] as [number, number, number],
  textGray: [105, 105, 105] as [number, number, number],
  beige: [245, 244, 242] as [number, number, number],
  beige2: [213, 211, 206] as [number, number, number],
  green: [22, 179, 100] as [number, number, number],
  orange: [255, 133, 0] as [number, number, number],
}

const MARGIN = 14
const FOOTER_LINE_Y = 280
const MAX_Y = FOOTER_LINE_Y - 10

interface Copy {
  title: string
  summaryHeading: string
  summary: (p: BatteryPdfInput, locale: string) => string
  detailsHeading: string
  address: string
  period: string
  generated: string
  strategyLabel: string
  strategies: Record<'self-consumption' | 'profit', string>
  pricesLabel: string
  priceModes: Record<'fixed' | 'spot', string>
  fixedRates: (cons: number, ret: number) => string
  batteryCost: string
  configHeading: string
  capacity: string
  inverter: string
  inverterRecommended: (kw: number) => string
  socLine: (minPct: number, initPct: number) => string
  keyFigures: string
  annualSavings: string
  investment: string
  payback: string
  paybackValue: (years: number) => string
  roi: string
  selfConsumption: string
  totalCharged: string
  totalDischarged: string
  sweepHeading: string
  sweepNote: string
  sweepHeaders: string[]
  selectedTag: string
  monthlySavingsHeading: string
  appendixHeading: string
  appendixIntro: string
  chargeLegend: string
  dischargeLegend: string
  energyHeaders: string[]
  dailyHeading: string
  dailyIntro: string
  dailyHeaders: string[]
  page: (n: number, total: number) => string
  disclaimer: string
}

const COPY: Record<PdfLanguage, Copy> = {
  nl: {
    title: 'Batterijadvies',
    summaryHeading: 'Samenvatting',
    summary: (p, locale) => {
      const from = new Date(p.fromIso).toLocaleDateString(locale)
      const to = new Date(p.toIso).toLocaleDateString(locale)
      const savings = fmtEur(p.selection.annualSavingsEur, locale)
      const payback =
        p.selection.paybackYears === Number.POSITIVE_INFINITY
          ? 'niet terugverdiend binnen de levensduur'
          : `terugverdiend in ${p.selection.paybackYears.toFixed(1)} jaar`
      return (
        `Op basis van de werkelijke energiedata van dit adres over de periode ${from} tot ${to} is een thuisbatterij van ` +
        `${p.capacityKwh} kWh met een omvormer van ${p.inverterKw} kW doorgerekend met de strategie "${COPY.nl.strategies[p.strategy]}" ` +
        `en ${p.priceMode === 'spot' ? 'EPEX-spotprijzen' : 'vaste tarieven'}. ` +
        `De verwachte besparing is ${savings} per jaar bij een investering van ${fmtEur(p.selection.costEur, locale)}; ` +
        `daarmee wordt de batterij ${payback} (ROI ${p.selection.roiPercent.toFixed(1)}%).`
      )
    },
    detailsHeading: 'Rapportgegevens',
    address: 'Adres',
    period: 'Periode',
    generated: 'Gegenereerd',
    strategyLabel: 'Strategie',
    strategies: { 'self-consumption': 'Zelfconsumptie', profit: 'Handelen (spot)' },
    pricesLabel: 'Prijzen',
    priceModes: { fixed: 'Vaste tarieven', spot: 'EPEX spot' },
    fixedRates: (cons, ret) => `Verbruik € ${cons.toFixed(2)}/kWh · Teruglevering € ${ret.toFixed(2)}/kWh`,
    batteryCost: 'Batterijkosten',
    configHeading: 'Doorgerekende configuratie',
    capacity: 'Capaciteit',
    inverter: 'Omvormervermogen',
    inverterRecommended: (kw) => `Aanbevolen op basis van pieken: ${kw} kW (95e percentiel van 15-min pieken)`,
    socLine: (minPct, initPct) => `Minimale laadtoestand ${minPct}% · Startlaadtoestand ${initPct}%`,
    keyFigures: 'Kerncijfers',
    annualSavings: 'Besparing per jaar',
    investment: 'Investering',
    payback: 'Terugverdientijd',
    paybackValue: (years) => (years === Number.POSITIVE_INFINITY ? '—' : `${years.toFixed(1)} jaar`),
    roi: 'ROI',
    selfConsumption: 'Zelfconsumptie',
    totalCharged: 'Totaal geladen',
    totalDischarged: 'Totaal ontladen',
    sweepHeading: 'Capaciteitsvergelijking',
    sweepNote: 'Elke capaciteit is gesimuleerd tegen de historische data met het gekozen omvormervermogen.',
    sweepHeaders: ['Capaciteit', 'Investering', 'Besparing/jaar', 'Terugverdientijd', 'ROI', 'Zelfconsumptie'],
    selectedTag: ' (gekozen)',
    monthlySavingsHeading: 'Geschatte besparing per maand',
    appendixHeading: 'Bijlage: laad- en ontlaadoverzicht',
    appendixIntro:
      'Hoeveel energie de batterij per maand zou laden en ontladen op basis van de historische data, inclusief de gemiddelde laadtoestand en het geschatte aantal cycli.',
    chargeLegend: 'Geladen (kWh)',
    dischargeLegend: 'Ontladen (kWh)',
    energyHeaders: ['Maand', 'Geladen (kWh)', 'Ontladen (kWh)', 'Gem. laadtoestand', 'Cycli (schatting)'],
    dailyHeading: 'Bijlage: laden en ontladen per dag',
    dailyIntro:
      'Gesimuleerde laad- en ontlaadenergie per dag, met de laadtoestand aan het einde van de dag. Hiermee kan de batterijsimulatie op dagniveau worden gecontroleerd.',
    dailyHeaders: ['Datum', 'Geladen (kWh)', 'Ontladen (kWh)', 'Laadtoestand einde dag', 'Cycli (schatting)'],
    page: (n, total) => `Pagina ${n} van ${total}`,
    disclaimer:
      'Deze simulatie is een indicatie op basis van historische data en marktprijzen; werkelijke resultaten kunnen afwijken.',
  },
  en: {
    title: 'Battery recommendation',
    summaryHeading: 'Summary',
    summary: (p, locale) => {
      const from = new Date(p.fromIso).toLocaleDateString(locale)
      const to = new Date(p.toIso).toLocaleDateString(locale)
      const savings = fmtEur(p.selection.annualSavingsEur, locale)
      const payback =
        p.selection.paybackYears === Number.POSITIVE_INFINITY
          ? 'not paid back within its lifetime'
          : `paid back in ${p.selection.paybackYears.toFixed(1)} years`
      return (
        `Based on this address's actual energy data from ${from} to ${to}, a home battery of ` +
        `${p.capacityKwh} kWh with a ${p.inverterKw} kW inverter was simulated using the "${COPY.en.strategies[p.strategy]}" strategy ` +
        `and ${p.priceMode === 'spot' ? 'EPEX spot prices' : 'fixed rates'}. ` +
        `The expected savings are ${savings} per year on an investment of ${fmtEur(p.selection.costEur, locale)}; ` +
        `the battery is ${payback} (ROI ${p.selection.roiPercent.toFixed(1)}%).`
      )
    },
    detailsHeading: 'Report details',
    address: 'Address',
    period: 'Period',
    generated: 'Generated',
    strategyLabel: 'Strategy',
    strategies: { 'self-consumption': 'Self-consumption', profit: 'Trading (spot)' },
    pricesLabel: 'Prices',
    priceModes: { fixed: 'Fixed rates', spot: 'EPEX spot' },
    fixedRates: (cons, ret) => `Consumption € ${cons.toFixed(2)}/kWh · Return € ${ret.toFixed(2)}/kWh`,
    batteryCost: 'Battery cost',
    configHeading: 'Simulated configuration',
    capacity: 'Capacity',
    inverter: 'Inverter power',
    inverterRecommended: (kw) => `Recommended from peaks: ${kw} kW (95th percentile of 15-min peaks)`,
    socLine: (minPct, initPct) => `Minimum state of charge ${minPct}% · Initial state of charge ${initPct}%`,
    keyFigures: 'Key figures',
    annualSavings: 'Savings per year',
    investment: 'Investment',
    payback: 'Payback',
    paybackValue: (years) => (years === Number.POSITIVE_INFINITY ? '—' : `${years.toFixed(1)} years`),
    roi: 'ROI',
    selfConsumption: 'Self-consumption',
    totalCharged: 'Total charged',
    totalDischarged: 'Total discharged',
    sweepHeading: 'Capacity comparison',
    sweepNote: 'Every capacity was simulated against the historical data with the chosen inverter power.',
    sweepHeaders: ['Capacity', 'Investment', 'Savings/year', 'Payback', 'ROI', 'Self-consumption'],
    selectedTag: ' (selected)',
    monthlySavingsHeading: 'Estimated savings per month',
    appendixHeading: 'Appendix: charge & discharge overview',
    appendixIntro:
      'How much energy the battery would charge and discharge per month based on the historical data, including the average state of charge and the estimated number of cycles.',
    chargeLegend: 'Charged (kWh)',
    dischargeLegend: 'Discharged (kWh)',
    energyHeaders: ['Month', 'Charged (kWh)', 'Discharged (kWh)', 'Avg. state of charge', 'Cycles (est.)'],
    dailyHeading: 'Appendix: daily charge & discharge',
    dailyIntro:
      'Simulated charged and discharged energy per day, with the state of charge at the end of the day. Use this to verify the battery simulation at day level.',
    dailyHeaders: ['Date', 'Charged (kWh)', 'Discharged (kWh)', 'End-of-day state of charge', 'Cycles (est.)'],
    page: (n, total) => `Page ${n} of ${total}`,
    disclaimer:
      'This simulation is an indication based on historical data and market prices; actual results may differ.',
  },
}

function fmtEur(v: number, locale: string): string {
  return `€ ${v.toLocaleString(locale, { maximumFractionDigits: 0 })}`
}

/** "2025-08" → localized short month + year, e.g. "aug 2025". */
function monthLabel(month: string, locale: string): string {
  const d = new Date(`${month}-01T00:00:00Z`)
  return d.toLocaleDateString(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

/** "2025-08-14" → localized short date, e.g. "do 14 aug 2025". */
function dayLabel(date: string, locale: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  return d.toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// Official Chargee logo (267×150 px), loaded once and reused across exports.
let logoDataUrlCache: string | null = null
async function loadLogoDataUrl(): Promise<string | null> {
  if (logoDataUrlCache) return logoDataUrlCache
  try {
    const blob = await fetch(logoUrl).then((r) => r.blob())
    logoDataUrlCache = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return logoDataUrlCache
  } catch {
    return null
  }
}

const LOGO_ASPECT = 267 / 150

function drawHeader(doc: jsPDF, title: string, logoDataUrl: string | null): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  if (logoDataUrl) {
    const logoH = 14
    doc.addImage(logoDataUrl, 'PNG', MARGIN - 2, 8, logoH * LOGO_ASPECT, logoH)
  } else {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...COLORS.darkBlue)
    doc.text('Chargee', MARGIN, 18)
  }

  doc.setDrawColor(...COLORS.darkBlue)
  doc.setLineWidth(0.4)
  doc.line(MARGIN, 26, pageWidth - MARGIN, 26)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...COLORS.darkBlue)
  doc.text(title, MARGIN, 37)
  return 47
}

function drawFooters(doc: jsPDF, copy: Copy) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setDrawColor(...COLORS.darkBlue)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, FOOTER_LINE_Y, pageWidth - MARGIN, FOOTER_LINE_Y)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.darkBlue)
    doc.text('chargee.energy', MARGIN, FOOTER_LINE_Y + 6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COLORS.textGray)
    const pageText = copy.page(p, totalPages)
    doc.text(pageText, pageWidth - MARGIN - doc.getTextWidth(pageText), FOOTER_LINE_Y + 6)
  }
}

function sectionTitle(doc: jsPDF, text: string, y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...COLORS.darkBlue)
  doc.text(text, MARGIN, y)
  return y + 7
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > MAX_Y) {
    doc.addPage()
    return 20
  }
  return y
}

/** Grouped bar chart (two series) drawn directly with rects; supports negatives. */
function drawGroupedBars(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  categories: string[],
  seriesA: number[],
  seriesB: number[] | null,
  colorA: [number, number, number],
  colorB: [number, number, number],
): void {
  const all = [...seriesA, ...(seriesB ?? [])]
  const maxV = Math.max(0, ...all)
  const minV = Math.min(0, ...all)
  const span = maxV - minV || 1
  const zeroY = y + (maxV / span) * h

  // Axis + zero line
  doc.setDrawColor(...COLORS.beige2)
  doc.setLineWidth(0.2)
  doc.line(x, zeroY, x + w, zeroY)

  const groupW = w / categories.length
  const barW = seriesB ? Math.min(groupW * 0.32, 6) : Math.min(groupW * 0.55, 9)

  for (let i = 0; i < categories.length; i++) {
    const cx = x + i * groupW + groupW / 2
    const drawBar = (value: number, offset: number, color: [number, number, number]) => {
      const barH = (Math.abs(value) / span) * h
      const top = value >= 0 ? zeroY - barH : zeroY
      doc.setFillColor(...color)
      if (barH > 0.2) doc.rect(cx + offset, top, barW, barH, 'F')
    }
    if (seriesB) {
      drawBar(seriesA[i], -barW - 0.5, colorA)
      drawBar(seriesB[i], 0.5, colorB)
    } else {
      drawBar(seriesA[i], -barW / 2, colorA)
    }
    // Category label
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...COLORS.textGray)
    doc.text(categories[i], cx, y + h + 4, { align: 'center' })
  }

  // Max value marker
  doc.setFontSize(7)
  doc.setTextColor(...COLORS.textGray)
  doc.text(maxV >= 10 ? maxV.toFixed(0) : maxV.toFixed(1), x - 1, y + 2, { align: 'right' })
  if (minV < 0) doc.text(minV.toFixed(0), x - 1, y + h, { align: 'right' })
}

function drawLegend(
  doc: jsPDF,
  x: number,
  y: number,
  items: Array<{ label: string; color: [number, number, number] }>,
): void {
  let cx = x
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  for (const item of items) {
    doc.setFillColor(...item.color)
    doc.rect(cx, y - 2.4, 3, 3, 'F')
    doc.setTextColor(...COLORS.textGray)
    doc.text(item.label, cx + 4.5, y)
    cx += 4.5 + doc.getTextWidth(item.label) + 8
  }
}

export async function buildBatteryPdf(input: BatteryPdfInput): Promise<jsPDF> {
  const copy = COPY[input.language]
  const locale = input.language === 'nl' ? 'nl-NL' : 'en-GB'
  const logoDataUrl = await loadLogoDataUrl()
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentW = pageWidth - 2 * MARGIN

  let y = drawHeader(doc, copy.title, logoDataUrl)

  // —— Summary ——
  y = sectionTitle(doc, copy.summaryHeading, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.textGray)
  const summaryLines = doc.splitTextToSize(copy.summary(input, locale), contentW)
  doc.text(summaryLines, MARGIN, y)
  y += summaryLines.length * 4.6 + 8

  // —— Key figures (highlight box) ——
  const sel = input.selection
  const figures: Array<[string, string]> = [
    [copy.capacity, `${input.capacityKwh} kWh`],
    [copy.inverter, `${input.inverterKw} kW`],
    [copy.annualSavings, fmtEur(sel.annualSavingsEur, locale)],
    [copy.investment, fmtEur(sel.costEur, locale)],
    [copy.payback, copy.paybackValue(sel.paybackYears)],
    [copy.roi, `${sel.roiPercent.toFixed(1)}%`],
    [copy.totalCharged, `${input.totalChargedKwh.toFixed(0)} kWh`],
    [copy.totalDischarged, `${input.totalDischargedKwh.toFixed(0)} kWh`],
  ]
  if (sel.selfConsumptionPercent != null) {
    figures.push([copy.selfConsumption, `${sel.selfConsumptionPercent}%`])
  }
  const cols = 3
  const rowsCount = Math.ceil(figures.length / cols)
  const boxH = 10 + rowsCount * 13
  doc.setFillColor(...COLORS.beige)
  doc.roundedRect(MARGIN, y, contentW, boxH, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.darkBlue)
  doc.text(copy.keyFigures, MARGIN + 5, y + 7)
  figures.forEach(([label, value], i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const fx = MARGIN + 5 + col * (contentW / cols)
    const fy = y + 15 + row * 13
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.textGray)
    doc.text(label.toUpperCase(), fx, fy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...COLORS.darkBlue)
    doc.text(value, fx, fy + 5.5)
  })
  y += boxH + 10

  // —— Report details ——
  y = sectionTitle(doc, copy.detailsHeading, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.textGray)
  const details: string[] = [
    `${copy.address}: ${input.addressUuid}`,
    `${copy.period}: ${new Date(input.fromIso).toLocaleDateString(locale)} – ${new Date(input.toIso).toLocaleDateString(locale)}`,
    `${copy.generated}: ${new Date(input.generatedAt).toLocaleString(locale)}`,
    `${copy.strategyLabel}: ${copy.strategies[input.strategy]}`,
    `${copy.pricesLabel}: ${copy.priceModes[input.priceMode]}${
      input.priceMode === 'fixed' ? ` — ${copy.fixedRates(input.fixedConsumption, input.fixedReturn)}` : ''
    }`,
    `${copy.batteryCost}: € ${input.batteryCostPerKwh}/kWh`,
    copy.inverterRecommended(input.recommendedInverterKw),
    copy.socLine(input.minSocPercent, input.initialSocPercent),
  ]
  for (const line of details) {
    doc.text(line, MARGIN, y)
    y += 5
  }
  y += 6

  // —— Monthly savings chart ——
  if (input.monthlySavings.length > 1) {
    y = ensureSpace(doc, y, 66)
    y = sectionTitle(doc, copy.monthlySavingsHeading, y)
    const labels = input.monthlySavings.map((m) => monthLabel(m.month, locale))
    drawGroupedBars(
      doc,
      MARGIN + 8,
      y,
      contentW - 8,
      42,
      labels,
      input.monthlySavings.map((m) => m.savings),
      null,
      COLORS.green,
      COLORS.green,
    )
    y += 42 + 10
  }

  // —— Capacity comparison table ——
  doc.addPage()
  y = 20
  y = sectionTitle(doc, copy.sweepHeading, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.textGray)
  doc.text(copy.sweepNote, MARGIN, y)
  y += 6
  const sweepBody = input.sweepRows.map((r) => {
    let capLabel = `${r.capacityKwh} kWh`
    if (r.capacityKwh === input.capacityKwh) capLabel += copy.selectedTag
    return [
      capLabel,
      fmtEur(r.costEur, locale),
      fmtEur(r.annualSavingsEur, locale),
      copy.paybackValue(r.paybackYears),
      `${r.roiPercent.toFixed(1)}%`,
      r.selfConsumptionPercent != null ? `${r.selfConsumptionPercent}%` : '—',
    ]
  })
  autoTable(doc, {
    startY: y,
    head: [copy.sweepHeaders],
    body: sweepBody,
    theme: 'grid',
    headStyles: { fillColor: COLORS.darkBlue, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
    styles: { fontSize: 8.5, textColor: COLORS.darkBlue, cellPadding: 1.6 },
    margin: { left: MARGIN, bottom: 297 - FOOTER_LINE_Y + 6 },
    tableWidth: contentW,
    didParseCell: (hook) => {
      if (hook.section !== 'body') return
      const cap = input.sweepRows[hook.row.index]?.capacityKwh
      if (cap === input.capacityKwh) {
        hook.cell.styles.fillColor = [235, 227, 247] // light-purple-3
        hook.cell.styles.fontStyle = 'bold'
      }
    },
  })

  // —— Appendix: charge/discharge overview ——
  doc.addPage()
  y = 20
  y = sectionTitle(doc, copy.appendixHeading, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.textGray)
  const introLines = doc.splitTextToSize(copy.appendixIntro, contentW)
  doc.text(introLines, MARGIN, y)
  y += introLines.length * 4.4 + 6

  if (input.monthlyEnergy.length > 0) {
    const labels = input.monthlyEnergy.map((m) => monthLabel(m.month, locale))
    drawLegend(doc, MARGIN + 8, y, [
      { label: copy.chargeLegend, color: COLORS.darkPurple },
      { label: copy.dischargeLegend, color: COLORS.green },
    ])
    y += 5
    drawGroupedBars(
      doc,
      MARGIN + 8,
      y,
      contentW - 8,
      48,
      labels,
      input.monthlyEnergy.map((m) => m.chargedKwh),
      input.monthlyEnergy.map((m) => m.dischargedKwh),
      COLORS.darkPurple,
      COLORS.green,
    )
    y += 48 + 12

    autoTable(doc, {
      startY: y,
      head: [copy.energyHeaders],
      body: input.monthlyEnergy.map((m) => [
        monthLabel(m.month, locale),
        m.chargedKwh.toFixed(1),
        m.dischargedKwh.toFixed(1),
        `${m.avgSocPct.toFixed(0)}%`,
        (m.dischargedKwh / input.capacityKwh).toFixed(1),
      ]),
      theme: 'grid',
      headStyles: { fillColor: COLORS.darkBlue, textColor: 255, fontStyle: 'bold', fontSize: 8.5 },
      styles: { fontSize: 8.5, textColor: COLORS.darkBlue, cellPadding: 1.6 },
      margin: { left: MARGIN, bottom: 297 - FOOTER_LINE_Y + 6 },
      tableWidth: contentW,
    })
    const withTable = doc as unknown as { lastAutoTable: { finalY: number } }
    y = withTable.lastAutoTable.finalY + 8
  }

  // —— Appendix: day-by-day table (for verifying the simulation) ——
  if (input.dailyEnergy.length > 0) {
    doc.addPage()
    y = 20
    y = sectionTitle(doc, copy.dailyHeading, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.textGray)
    const dailyIntroLines = doc.splitTextToSize(copy.dailyIntro, contentW)
    doc.text(dailyIntroLines, MARGIN, y)
    y += dailyIntroLines.length * 4.4 + 4
    autoTable(doc, {
      startY: y,
      head: [copy.dailyHeaders],
      body: input.dailyEnergy.map((d) => [
        dayLabel(d.date, locale),
        d.chargedKwh.toFixed(2),
        d.dischargedKwh.toFixed(2),
        `${d.endSocPct.toFixed(0)}%`,
        (d.dischargedKwh / input.capacityKwh).toFixed(2),
      ]),
      theme: 'grid',
      headStyles: { fillColor: COLORS.darkBlue, textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      styles: { fontSize: 7.5, textColor: COLORS.darkBlue, cellPadding: 1.2 },
      margin: { left: MARGIN, top: 20, bottom: 297 - FOOTER_LINE_Y + 6 },
      tableWidth: contentW,
    })
    const withDaily = doc as unknown as { lastAutoTable: { finalY: number } }
    y = withDaily.lastAutoTable.finalY + 8
  }

  y = ensureSpace(doc, y, 12)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.textGray)
  doc.text(doc.splitTextToSize(copy.disclaimer, contentW), MARGIN, y)

  drawFooters(doc, copy)
  return doc
}
