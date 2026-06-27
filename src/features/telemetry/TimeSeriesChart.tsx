import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  Brush,
} from 'recharts'

export interface SeriesDef {
  key: string
  name: string
  color: string
}

interface TimeSeriesChartProps {
  data: Array<Record<string, any>>
  xKey: string
  series: SeriesDef[]
  unit?: string
  /** Decimal places for axis ticks and the tooltip. */
  decimals?: number
  /** 'bar' for discrete samples (default), 'line' for continuous/counter data. */
  variant?: 'bar' | 'line'
  /** Show a draggable range selector for zooming/scrolling dense series. */
  brush?: boolean
}

// Show the brush pre-zoomed to the last window when there are many points.
const BRUSH_WINDOW = 60

/**
 * Telemetry chart. Bars by default (absolute samples at discrete times, no
 * interpolation); lines for continuous/counter data. Returned/exported energy
 * is negative and sits below the zero baseline.
 */
export function TimeSeriesChart({ data, xKey, series, unit, decimals, variant = 'bar', brush }: TimeSeriesChartProps) {
  const showBrush = brush && data.length > 12
  const brushStart = showBrush && data.length > BRUSH_WINDOW ? data.length - BRUSH_WINDOW : 0
  const num = (v: number) =>
    v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  // Axis keeps the sign (return is below zero); tooltip shows the magnitude +
  // unit since the bar position already conveys delivery vs return.
  const axisFmt = decimals != null ? (v: number) => num(v) : undefined
  const tipFmt = (v: number) => {
    const n = decimals != null ? num(Math.abs(v)) : String(v)
    return unit ? `${n} ${unit}` : n
  }
  const Chart = variant === 'line' ? LineChart : BarChart

  return (
    <ResponsiveContainer width="100%" height={showBrush ? 360 : 320}>
      <Chart data={data} stackOffset="sign" margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#D5D3CE" vertical={false} />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#696969' }} minTickGap={24} />
        <YAxis
          tick={{ fontSize: 11, fill: '#696969' }}
          width={64}
          tickFormatter={axisFmt}
          label={unit ? { value: unit, angle: -90, position: 'insideLeft', fontSize: 11, fill: '#696969' } : undefined}
        />
        <Tooltip
          cursor={variant === 'line' ? { stroke: '#9C87F8' } : { fill: 'rgba(98, 69, 222, 0.06)' }}
          contentStyle={{ borderRadius: 12, border: '1px solid #D5D3CE', fontSize: 12 }}
          formatter={(value: number, name: string) => [tipFmt(value), name]}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {/* Zero baseline — returned/exported energy sits below it. */}
        <ReferenceLine y={0} stroke="#A8A49D" strokeWidth={1} />
        {series.map((s) =>
          variant === 'line' ? (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ) : (
            // Same stackId → bars share the x position. Positive (delivery)
            // stacks up, negative (return) stacks down, directly beneath it.
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              stackId="series"
              maxBarSize={40}
              isAnimationActive={false}
            />
          ),
        )}
        {showBrush && (
          <Brush dataKey={xKey} height={26} stroke="#9C87F8" travellerWidth={8} startIndex={brushStart} />
        )}
      </Chart>
    </ResponsiveContainer>
  )
}
