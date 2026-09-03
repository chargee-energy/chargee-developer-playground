import { jsPDF } from 'jspdf'
import {
  COLORS,
  MARGIN,
  MAX_Y,
  drawFooters,
  drawHeader,
  loadLogoDataUrl,
  pdfText,
  type PdfLanguage,
} from './pdfChrome'

// PDF export of the group curtailment report as a rendered image of the page,
// under a Chargee header. Rasterising rather than rebuilding the document keeps
// the export identical to what the user is looking at — charts, badges, colours
// and layout included — at the cost of the text not being selectable.

/** Mark a node with this to keep it out of the export (e.g. the filter bar). */
export const PDF_HIDE_ATTR = 'data-pdf-hide'
/** Mark a layout wrapper so its children are captured individually. */
export const PDF_GROUP_ATTR = 'data-pdf-group'

/** Preferred oversampling for crisp small text. */
const SCALE = 2
/**
 * Ceiling on pixels per captured canvas (~4 bytes each, so ~48 MB at this size).
 * Capturing the whole report in one canvas at 2x could reach hundreds of MB and
 * crash the renderer outright, so each block's scale is reduced to fit this
 * budget. Scale only affects sharpness — every block is placed at the same
 * width in mm — so varying it per block is safe.
 */
const MAX_BLOCK_PX = 12_000_000

const COPY: Record<PdfLanguage, { page: (n: number, total: number) => string }> = {
  en: { page: (n, total) => `Page ${n} of ${total}` },
  nl: { page: (n, total) => `Pagina ${n} van ${total}` },
}

export interface CurtailmentPdfOptions {
  language: PdfLanguage
  title: string
  /** Group, period and the options the report ran with. */
  subtitle: string
}

/**
 * Flatten the capture root into the blocks to place on pages: cards, tables and
 * notes. Wrappers marked `data-pdf-group` are descended into so their cards
 * become separate blocks; anything marked `data-pdf-hide` is skipped.
 */
function collectBlocks(root: HTMLElement): HTMLElement[] {
  const blocks: HTMLElement[] = []
  const visit = (el: HTMLElement) => {
    for (const child of Array.from(el.children)) {
      if (!(child instanceof HTMLElement)) continue
      if (child.hasAttribute(PDF_HIDE_ATTR)) continue
      if (child.offsetWidth === 0 || child.offsetHeight === 0) continue
      if (child.hasAttribute(PDF_GROUP_ATTR)) visit(child)
      else blocks.push(child)
    }
  }
  visit(root)
  return blocks
}

/** Drop a canvas's backing store now rather than waiting for GC between blocks. */
function release(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

/** Oversampling that keeps this element's canvas within the pixel budget. */
function scaleFor(el: HTMLElement): number {
  const area = el.offsetWidth * el.offsetHeight
  if (area <= 0) return 1
  return Math.max(1, Math.min(SCALE, Math.sqrt(MAX_BLOCK_PX / area)))
}

/**
 * Render `el` into a paginated A4 PDF.
 *
 * Each card is captured separately rather than the page as one tall canvas: a
 * single canvas of the whole report exceeds what the renderer can allocate, and
 * per-card capture also means page breaks land between cards instead of slicing
 * one in half. A card taller than a page is still sliced, but that is now the
 * exception rather than the rule.
 */
export async function buildCurtailmentPdf(
  el: HTMLElement,
  { language, title, subtitle }: CurtailmentPdfOptions,
): Promise<jsPDF> {
  const { default: html2canvas } = await import('html2canvas')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentW = pageWidth - MARGIN * 2
  const logo = await loadLogoDataUrl()

  // Header appears on page 1 only; later pages start near the top edge.
  drawHeader(doc, title, logo)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.textGray)
  // Draw each wrapped line with its own call: passing an array leaves the line
  // advance up to jsPDF's lineHeightFactor, which doesn't match this layout.
  const SUBTITLE_LINE_MM = 4.2
  const SUBTITLE_TOP = 44
  const subtitleLines: string[] = doc.splitTextToSize(pdfText(subtitle), contentW)
  subtitleLines.forEach((line, i) => doc.text(line, MARGIN, SUBTITLE_TOP + i * SUBTITLE_LINE_MM))

  const PAGE_TOP = 20
  const GAP_MM = 4
  let y = SUBTITLE_TOP + subtitleLines.length * SUBTITLE_LINE_MM + 4

  // Reused for slicing; resized per slice so only one extra canvas is live.
  const sliceCanvas = document.createElement('canvas')
  const sliceCtx = sliceCanvas.getContext('2d')
  if (!sliceCtx) throw new Error('Canvas 2D context unavailable')

  for (const block of collectBlocks(el)) {
    const canvas = await html2canvas(block, {
      scale: scaleFor(block),
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      ignoreElements: (node) => node instanceof HTMLElement && node.hasAttribute(PDF_HIDE_ATTR),
    })
    if (canvas.width === 0 || canvas.height === 0) continue

    const pxPerMm = canvas.width / contentW
    const blockMm = canvas.height / pxPerMm

    if (blockMm <= MAX_Y - PAGE_TOP) {
      // Fits on a page — start a fresh one if it doesn't fit on this one.
      if (blockMm > MAX_Y - y) {
        doc.addPage()
        y = PAGE_TOP
      }
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', MARGIN, y, contentW, blockMm)
      y += blockMm + GAP_MM
      release(canvas)
      continue
    }

    // Taller than a page (a long table): slice it. Encoding happens per slice,
    // never on the full canvas, so the base64 string stays small.
    let offsetPx = 0
    while (offsetPx < canvas.height) {
      if (y > MAX_Y - 20) {
        doc.addPage()
        y = PAGE_TOP
      }
      const slicePx = Math.min(Math.floor((MAX_Y - y) * pxPerMm), canvas.height - offsetPx)
      if (slicePx <= 0) break
      sliceCanvas.width = canvas.width
      sliceCanvas.height = slicePx
      sliceCtx.fillStyle = '#ffffff'
      sliceCtx.fillRect(0, 0, canvas.width, slicePx)
      sliceCtx.drawImage(canvas, 0, offsetPx, canvas.width, slicePx, 0, 0, canvas.width, slicePx)
      doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', MARGIN, y, contentW, slicePx / pxPerMm)
      offsetPx += slicePx
      y += slicePx / pxPerMm
      if (offsetPx < canvas.height) {
        doc.addPage()
        y = PAGE_TOP
      }
    }
    y += GAP_MM
    release(canvas)
  }

  release(sliceCanvas)
  drawFooters(doc, COPY[language].page)
  return doc
}
