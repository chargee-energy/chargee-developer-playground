import { useMemo, useState } from 'react'
import type { ConnectionType, ProductionStatus, SparkyStatus } from './reportSolarStatus'
import type { SolarInverterReportRow } from './useAllSolarInvertersReport'

export type SortKey =
  | 'addressUuid'
  | 'sparkySerial'
  | 'flintSerial'
  | 'brand'
  | 'model'
  | 'connectionType'
  | 'productionStatus'
  | 'sparkyStatus'
  | 'lastProductionTime'
export type SortDir = 'asc' | 'desc'

export interface SolarInverterFilterState {
  search: string
  connection: Set<ConnectionType>
  status: Set<ProductionStatus>
  sparky: Set<SparkyStatus>
  sortKey: SortKey
  sortDir: SortDir
}

/** Scalar used for sorting each column (missing values sort last in asc order). */
function sortValue(row: SolarInverterReportRow, key: SortKey): string | number {
  if (key === 'lastProductionTime') {
    return row.lastProductionTime ? new Date(row.lastProductionTime).getTime() : -Infinity
  }
  return (row[key] ?? '').toString().toLowerCase()
}

/** Fields folded into the free-text search. */
function searchHaystack(row: SolarInverterReportRow): string {
  return [row.addressUuid, row.sparkySerial, row.flintSerial, row.brand, row.model, row.identifier]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

/**
 * Local filter/sort state for the All Solar Inverters report. Produces `view`
 * (filtered + sorted rows) that both the table and the recounting tiles consume.
 * Kept report-specific on purpose — not a generic table utility yet.
 */
export function useSolarInverterFilters(rows: SolarInverterReportRow[]) {
  const [search, setSearch] = useState('')
  const [connection, setConnection] = useState<Set<ConnectionType>>(new Set())
  const [status, setStatus] = useState<Set<ProductionStatus>>(new Set())
  const [sparky, setSparky] = useState<Set<SparkyStatus>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('lastProductionTime')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const active = search.trim() !== '' || connection.size > 0 || status.size > 0 || sparky.size > 0

  const toggleConnection = (v: ConnectionType) =>
    setConnection((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })

  const toggleStatus = (v: ProductionStatus) =>
    setStatus((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })

  const toggleSparky = (v: SparkyStatus) =>
    setSparky((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })

  const clear = () => {
    setSearch('')
    setConnection(new Set())
    setStatus(new Set())
    setSparky(new Set())
  }

  const view = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const filtered = rows.filter((r) => {
      if (connection.size > 0 && !connection.has(r.connectionType)) return false
      if (status.size > 0 && !status.has(r.productionStatus)) return false
      if (sparky.size > 0 && !sparky.has(r.sparkyStatus)) return false
      if (needle && !searchHaystack(r).includes(needle)) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sortKey)
      const bv = sortValue(b, sortKey)
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      return 0
    })
  }, [rows, search, connection, status, sparky, sortKey, sortDir])

  return {
    view,
    active,
    state: { search, connection, status, sparky, sortKey, sortDir } as SolarInverterFilterState,
    setSearch,
    toggleConnection,
    toggleStatus,
    toggleSparky,
    setSortKey,
    setSortDir,
    clear,
  }
}
