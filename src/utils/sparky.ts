// The Sparky `boxCode` is documented as a string, but the live API can return
// it wrapped in an object (e.g. `{ boxCode: "V3-1002548" }`). Coerce either
// shape to a displayable string so the UI never shows a raw "{…}".
export function formatBoxCode(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'string') return value || '—'
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    for (const key of ['boxCode', 'code', 'value', 'serialNumber']) {
      if (typeof o[key] === 'string' && o[key]) return o[key] as string
    }
    return JSON.stringify(value)
  }
  return String(value)
}
