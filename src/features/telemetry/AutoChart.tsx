import { useMemo } from 'react'
import { TimeSeriesChart, type SeriesDef } from './TimeSeriesChart'
import { DataTable } from '@/components/common/DataTable'
import { flattenNumbers, detectTimeKey, humanizeKey, isReturnKey } from '@/utils/records'
import { timeAxisLabels } from '@/utils/format'

// Chargee-leaning palette cycled across detected series.
const PALETTE = ['#6245DE', '#FF8500', '#16B364', '#1570EF', '#9C87F8', '#FFD602']

interface AutoChartProps {
  rows: any[]
  /** Force the x-axis key; auto-detected from time-like fields otherwise. */
  xKey?: string
  /** Cap the number of plotted series to avoid clutter. */
  maxSeries?: number
  unit?: string
  /** Render a raw table beneath the chart. */
  showTable?: boolean
  /** Show a draggable zoom/scroll selector for dense series. */
  brush?: boolean
}

/**
 * Renders any reading array as a line chart by auto-detecting the time axis and
 * numeric series (nested fields are flattened to dotted paths). Falls back to a
 * table when nothing chartable is found — so new API fields plot automatically.
 */
export function AutoChart({ rows, xKey, maxSeries = 6, unit, showTable = true, brush }: AutoChartProps) {
  const { data, series, timeKey } = useMemo(() => {
    const tKey = xKey ?? detectTimeKey(rows[0])
    if (!tKey || rows.length === 0) return { data: [], series: [] as SeriesDef[], timeKey: tKey }

    // Stable union of numeric leaf keys across the rows.
    const keys: string[] = []
    for (const row of rows) {
      for (const k of Object.keys(flattenNumbers(row))) {
        if (!keys.includes(k)) keys.push(k)
      }
    }
    const chosen = keys.slice(0, maxSeries)

    // Plot returned/exported energy below zero — but only when the chart also
    // has a delivery-type series (a standalone return chart stays positive).
    const hasNonReturn = chosen.some((k) => !isReturnKey(k))
    const negate = (k: string) => hasNonReturn && isReturnKey(k)

    const labels = timeAxisLabels(rows.map((row) => row[tKey]))
    const data = rows.map((row, i) => {
      const nums = flattenNumbers(row)
      const point: Record<string, any> = { __x: labels[i] }
      for (const k of chosen) {
        const v = nums[k]
        point[k] = v != null && negate(k) ? -v : v
      }
      return point
    })

    const series: SeriesDef[] = chosen.map((k, i) => ({
      key: k,
      name: humanizeKey(k),
      color: PALETTE[i % PALETTE.length],
    }))
    return { data, series, timeKey: tKey }
  }, [rows, xKey, maxSeries])

  if (!timeKey || series.length === 0) {
    // Nothing chartable — show the raw rows instead.
    return <DataTable rows={rows} rowKey={(_, i) => String(i)} />
  }

  return (
    <div className="space-y-4">
      <TimeSeriesChart data={data} xKey="__x" series={series} unit={unit} brush={brush} />
      {showTable && <DataTable rows={rows} rowKey={(_, i) => String(i)} />}
    </div>
  )
}
