import { useMemo } from 'react'
import { TimeSeriesChart, type SeriesDef } from './TimeSeriesChart'
import { DataTable } from '@/components/common/DataTable'
import {
  flattenNumbers,
  detectTimeKey,
  humanizeKey,
  isReturnKey,
  isDeliveryKey,
  DELIVERY_COLOR,
  RETURN_COLOR,
} from '@/utils/records'
import { timeAxisLabels, type TimeMode } from '@/utils/format'

// Chargee-leaning palette cycled across non delivery/return series.
const PALETTE = ['#6245DE', '#1570EF', '#9C87F8', '#FFD602', '#FF8500', '#16B364']

interface AutoChartProps {
  rows: any[]
  /** Force the x-axis key; auto-detected from time-like fields otherwise. */
  xKey?: string
  /** Cap the number of plotted series to avoid clutter. */
  maxSeries?: number
  unit?: string
  /** Force a single colour for all series (overrides delivery/return auto-colour). */
  color?: string
  /** Multiply every value (e.g. 0.001 to convert Wh→kWh or dm³→m³). */
  scale?: number
  /** Decimal places for axis/tooltip values. */
  decimals?: number
  /** 'bar' (default) or 'line' for continuous/counter data. */
  variant?: 'bar' | 'line'
  /** Time display: 'local' (convert), 'utc' (zone-less = UTC → local), 'raw' (as written). */
  timeMode?: TimeMode
  /** Rows are cumulative counters — chart the per-interval difference. */
  delta?: boolean
  /** Render a raw table beneath the chart. */
  showTable?: boolean
  /** Show a draggable zoom/scroll selector for dense series. */
  brush?: boolean
}

/**
 * Renders any reading array as a bar chart by auto-detecting the time axis and
 * numeric series (nested fields are flattened to dotted paths). Falls back to a
 * table when nothing chartable is found — so new API fields plot automatically.
 */
export function AutoChart({
  rows,
  xKey,
  maxSeries = 6,
  unit,
  color,
  scale = 1,
  decimals,
  variant = 'bar',
  timeMode = 'local',
  delta = false,
  showTable = true,
  brush,
}: AutoChartProps) {
  const { data, series, timeKey } = useMemo(() => {
    const tKey = xKey ?? detectTimeKey(rows[0])
    if (!tKey || rows.length === 0) return { data: [], series: [] as SeriesDef[], timeKey: tKey }

    const flat = rows.map((r) => flattenNumbers(r))

    // Stable union of numeric leaf keys across the rows.
    const keys: string[] = []
    for (const nums of flat) {
      for (const k of Object.keys(nums)) if (!keys.includes(k)) keys.push(k)
    }
    const chosen = keys.slice(0, maxSeries)

    // Plot returned/exported energy below zero — but only when the chart also
    // has a delivery-type series (a standalone return chart stays positive).
    const hasNonReturn = chosen.some((k) => !isReturnKey(k))
    const negate = (k: string) => hasNonReturn && isReturnKey(k)

    const labels = timeAxisLabels(rows.map((row) => row[tKey]), timeMode)
    const data = rows.map((row, i) => {
      const nums = flat[i]
      const next = flat[i + 1]
      const point: Record<string, any> = { __x: labels[i] }
      for (const k of chosen) {
        // In delta mode the rows are cumulative counters at the interval START.
        // Consumption for the period beginning at this point is next − current,
        // so e.g. the reading at Jan 1 shows January's usage. The last reading
        // has no successor (period still open), so it has no bar.
        const v = delta ? (nums[k] != null && next?.[k] != null ? next[k] - nums[k] : null) : nums[k]
        point[k] = v == null ? null : (negate(k) ? -v : v) * scale
      }
      return point
    })

    const series: SeriesDef[] = chosen.map((k, i) => ({
      key: k,
      name: humanizeKey(k),
      color: color ?? (isReturnKey(k) ? RETURN_COLOR : isDeliveryKey(k) ? DELIVERY_COLOR : PALETTE[i % PALETTE.length]),
    }))
    return { data, series, timeKey: tKey }
  }, [rows, xKey, maxSeries, scale, color, timeMode, delta])

  if (!timeKey || series.length === 0) {
    // Nothing chartable — show the raw rows instead.
    return <DataTable rows={rows} rowKey={(_, i) => String(i)} />
  }

  return (
    <div className="space-y-4">
      <TimeSeriesChart data={data} xKey="__x" series={series} unit={unit} decimals={decimals} variant={variant} brush={brush} />
      {showTable && <DataTable rows={rows} rowKey={(_, i) => String(i)} />}
    </div>
  )
}
