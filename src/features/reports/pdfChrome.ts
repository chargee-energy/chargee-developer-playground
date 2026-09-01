import type { jsPDF } from 'jspdf'
import logoUrl from '@/assets/brand/chargee-logo.png'

// Shared Chargee page furniture for PDF exports: brand palette, header band,
// footer rule and the small layout helpers every report needs. Report-specific
// content lives in the per-report builders.

export type PdfLanguage = 'nl' | 'en'

export const COLORS = {
  darkBlue: [29, 21, 67] as [number, number, number],
  darkPurple: [98, 69, 222] as [number, number, number],
  mediumPurple: [156, 135, 248] as [number, number, number],
  textGray: [105, 105, 105] as [number, number, number],
  beige: [245, 244, 242] as [number, number, number],
  beige2: [213, 211, 206] as [number, number, number],
  green: [22, 179, 100] as [number, number, number],
  orange: [255, 133, 0] as [number, number, number],
}

/**
 * jsPDF's built-in Helvetica is a standard-14 font limited to Latin-1, so any
 * typographic character outside it renders as garbage ("→" came out as "!'").
 * Map the ones our copy actually uses to ASCII and drop anything else left.
 */
const PDF_CHAR_MAP: Record<string, string> = {
  '\u2192': '->', // →
  '\u2013': '-', // –
  '\u2014': '-', // —
  '\u2212': '-', // −
  '\u2018': "'", // ‘
  '\u2019': "'", // ’
  '\u201C': '"', // “
  '\u201D': '"', // ”
  '\u2026': '...', // …
  '\u2264': '<=', // ≤
  '\u2265': '>=', // ≥
  '\u2713': 'x', // ✓
  '\u00A0': ' ', // non-breaking space
}

/** Make a string safe for jsPDF's standard fonts. */
export function pdfText(value: string): string {
  return value
    .replace(/[\u2192\u2013\u2014\u2212\u2018\u2019\u201C\u201D\u2026\u2264\u2265\u2713\u00A0]/g, (c) => PDF_CHAR_MAP[c] ?? c)
    // Anything still outside Latin-1 has no glyph in the standard fonts.
    .replace(/[^\u0020-\u00FF\n\r\t]/g, '')
}

export const MARGIN = 14
export const FOOTER_LINE_Y = 280
export const MAX_Y = FOOTER_LINE_Y - 10

// Official Chargee logo (267×150 px), loaded once and reused across exports.
let logoDataUrlCache: string | null = null
export async function loadLogoDataUrl(): Promise<string | null> {
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

/** Logo, rule and title. Returns the y to continue drawing from. */
export function drawHeader(doc: jsPDF, title: string, logoDataUrl: string | null): number {
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
  doc.text(pdfText(title), MARGIN, 37)
  return 47
}

/** Footer rule, wordmark and page numbers — call once, after all content. */
export function drawFooters(doc: jsPDF, pageLabel: (n: number, total: number) => string) {
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
    const pageText = pdfText(pageLabel(p, totalPages))
    doc.text(pageText, pageWidth - MARGIN - doc.getTextWidth(pageText), FOOTER_LINE_Y + 6)
  }
}

export function sectionTitle(doc: jsPDF, text: string, y: number): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...COLORS.darkBlue)
  doc.text(pdfText(text), MARGIN, y)
  return y + 7
}

/** Break to a new page when `needed` mm wouldn't fit above the footer. */
export function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > MAX_Y) {
    doc.addPage()
    return 20
  }
  return y
}

export function drawLegend(
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
    const label = pdfText(item.label)
    doc.text(label, cx + 4.5, y)
    cx += 4.5 + doc.getTextWidth(label) + 8
  }
}
