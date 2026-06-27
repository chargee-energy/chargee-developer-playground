import { fmtDateTime, fmtNumber } from './format'

const ISO_RE = /^\d{4}-\d{2}-\d{2}T/

export const isScalar = (v: unknown) =>
  v === null || ['string', 'number', 'boolean'].includes(typeof v)
export const isPlainObject = (v: unknown) =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** camelCase / snake_case / dotted.path → "Title Case" */
export function humanizeKey(key: string): string {
  return key
    .split('.')
    .map((seg) =>
      seg
        .replace(/_/g, ' ')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, (c) => c.toUpperCase()),
    )
    .join(' ')
}

/** Human-readable value for a scalar (ISO strings become dates). */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return fmtNumber(value)
  if (typeof value === 'string' && ISO_RE.test(value)) return fmtDateTime(value)
  return String(value)
}

/** Recursively collect numeric leaves as dotted paths → value. */
export function flattenNumbers(obj: unknown, prefix = ''): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isPlainObject(obj)) return out
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'number' && Number.isFinite(v)) out[path] = v
    else if (isPlainObject(v)) Object.assign(out, flattenNumbers(v, path))
  }
  return out
}

/** Keys representing energy returned/exported to the grid (plotted below zero). */
export const isReturnKey = (key: string) => /return/i.test(key)

/** Keys representing energy delivered/consumed from the grid. */
export const isDeliveryKey = (key: string) => /deliver/i.test(key)

/** Chargee chart colours for grid flow. */
export const DELIVERY_COLOR = '#FF8500' // orange
export const RETURN_COLOR = '#16B364' // green
export const GAS_COLOR = '#1570EF' // blue

const TIME_KEYS = ['time', 'from', 'date', 'start', 'timestamp']

/** Pick the most likely x-axis (time) key from a row. */
export function detectTimeKey(row: Record<string, any> | undefined): string | undefined {
  if (!row) return undefined
  return TIME_KEYS.find((k) => k in row) ?? Object.keys(row).find((k) => ISO_RE.test(String(row[k])))
}
