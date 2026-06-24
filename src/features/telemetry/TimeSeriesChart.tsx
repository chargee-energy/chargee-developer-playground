import {
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
  /** Show a draggable range selector for zooming/scrolling dense series. */
  brush?: boolean
}

// Show the brush pre-zoomed to the last window when there are many points.
const BRUSH_WINDOW = 60

export function TimeSeriesChart({ data, xKey, series, unit, brush }: TimeSeriesChartProps) {
  const showBrush = brush && data.length > 12
  const brushStart = showBrush && data.length > BRUSH_WINDOW ? data.length - BRUSH_WINDOW : 0
  return (
    <ResponsiveContainer width="100%" height={showBrush ? 360 : 320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#D5D3CE" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: '#696969' }} minTickGap={32} />
        <YAxis
          tick={{ fontSize: 11, fill: '#696969' }}
          width={56}
          label={unit ? { value: unit, angle: -90, position: 'insideLeft', fontSize: 11, fill: '#696969' } : undefined}
        />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: '1px solid #D5D3CE', fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {/* Zero baseline — returned/exported energy sits below it. */}
        <ReferenceLine y={0} stroke="#A8A49D" strokeWidth={1} />
        {series.map((s) => (
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
        ))}
        {showBrush && (
          <Brush
            dataKey={xKey}
            height={26}
            stroke="#9C87F8"
            travellerWidth={8}
            startIndex={brushStart}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
