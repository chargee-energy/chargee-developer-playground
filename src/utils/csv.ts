// Flatten one level of nested objects into dotted columns; arrays become JSON.
function flattenRow(row: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) out[`${k}.${k2}`] = v2
    } else if (Array.isArray(v)) {
      out[k] = JSON.stringify(v)
    } else {
      out[k] = v
    }
  }
  return out
}

function escape(value: unknown): string {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Trigger a browser download of `rows` as a CSV file (raw API values). */
export function downloadCsv(filename: string, rows: Record<string, any>[]): void {
  if (!rows.length) return
  const flat = rows.map(flattenRow)
  const cols: string[] = []
  for (const r of flat) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k)

  const csv = [
    cols.join(','),
    ...flat.map((r) => cols.map((c) => escape(r[c])).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
