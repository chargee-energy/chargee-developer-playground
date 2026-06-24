import { type ReactNode } from 'react'
import { JsonViewer } from './JsonViewer'

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
}

interface DataTableProps<T> {
  rows: T[]
  columns?: Column<T>[]
  /** When no columns are given, infer scalar columns from the first row. */
  rowKey?: (row: T, i: number) => string
  emptyMessage?: string
  /** Make rows clickable (e.g. to open a detail view). */
  onRowClick?: (row: T) => void
}

function isScalar(v: unknown): boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v)
}

function renderCell(v: unknown): ReactNode {
  if (isScalar(v)) return v === null ? '—' : String(v)
  return <span className="text-text-gray">{Array.isArray(v) ? `[${v.length}]` : '{…}'}</span>
}

// Renders any array of records. Without explicit columns it infers the scalar
// fields of the first row — so new API fields show up automatically.
export function DataTable<T extends Record<string, any>>({
  rows,
  columns,
  rowKey,
  emptyMessage,
  onRowClick,
}: DataTableProps<T>) {
  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-text-gray">{emptyMessage || 'No data'}</p>
  }

  const cols: Column<T>[] =
    columns ??
    Object.keys(rows[0])
      .filter((k) => isScalar(rows[0][k]))
      .map((k) => ({ key: k, header: k }))

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-beige-2 text-left">
            {cols.map((c) => (
              <th key={c.key} className="whitespace-nowrap px-3 py-2 text-11 font-bold uppercase tracking-wide text-text-gray">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey ? rowKey(row, i) : i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-beige-2/60 hover:bg-beige/60 ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {cols.map((c) => (
                <td key={c.key} className="whitespace-nowrap px-3 py-2 font-mono text-13 text-dark-blue">
                  {c.render ? c.render(row) : renderCell(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Render a single record as a key/value card (objects shown via JsonViewer). */
export function RecordCard({ record }: { record: Record<string, any> }) {
  const entries = Object.entries(record)
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-11 font-bold uppercase tracking-wide text-text-gray">{k}</dt>
          <dd className="mt-0.5 break-words font-mono text-13 text-dark-blue">
            {isScalar(v) ? (v === null ? '—' : String(v)) : <JsonViewer data={v} />}
          </dd>
        </div>
      ))}
    </dl>
  )
}
