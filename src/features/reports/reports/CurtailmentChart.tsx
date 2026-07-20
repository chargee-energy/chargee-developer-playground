import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceArea,
} from 'recharts'
import { format } from 'date-fns'
import type { SeriesDef } from '@/features/telemetry/TimeSeriesChart'

interface CurtailmentChartProps {
  data: object[]
  /** Numeric time axis domain in epoch ms. */
  domain: [number, number]
  /** Curtailment periods (epoch ms) to shade — one band each. */
  bands?: { start: number; end: number }[]
  series: SeriesDef[]
  /** Optional dashed lines (e.g. an estimated counterfactual), drawn with gaps. */
  dashed?: SeriesDef[]
  /** Optional min/max range area (dataKey holds a [min, max] tuple). */
  range?: { key: string; name: string; color: string }
  unit?: string
  decimals?: number
  height?: number
  /** Include seconds in axis/tooltip time labels (detail view). */
  withSeconds?: boolean
}

/**
 * Power timeline on a numeric time axis (so a shaded curtailment band and precise
 * zoom domains work regardless of sample density). Reused for the per-minute day
 * overview (with an optional min/max band) and the raw 15-min detail views.
 */
export function CurtailmentChart({
  data,
  domain,
  bands,
  series,
  dashed,
  range,
  unit,
  decimals = 0,
  height = 300,
  withSeconds = false,
}: CurtailmentChartProps) {
  const timeFmt = (ms: number) => format(new Date(ms), withSeconds ? 'HH:mm:ss' : 'HH:mm')
  const num = (v: number) =>
    v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

  // Clamp each band to the visible domain so it still renders when a curtailment
  // period starts/ends outside the current view (e.g. a detail block).
  const visibleBands = (bands ?? [])
    .map((b) => ({ start: Math.max(b.start, domain[0]), end: Math.min(b.end, domain[1]) }))
    .filter((b) => b.end > b.start)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#D5D3CE" vertical={false} />
        {visibleBands.map((b, i) => (
          <ReferenceArea
            key={i}
            x1={b.start}
            x2={b.end}
            fill="#6245DE"
            fillOpacity={0.08}
            stroke="#6245DE"
            strokeOpacity={0.25}
            ifOverflow="extendDomain"
          />
        ))}
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={domain}
          tickFormatter={timeFmt}
          tick={{ fontSize: 11, fill: '#696969' }}
          minTickGap={40}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#696969' }}
          width={64}
          tickFormatter={(v: number) => num(v)}
          label={unit ? { value: unit, angle: -90, position: 'insideLeft', fontSize: 11, fill: '#696969' } : undefined}
        />
        <Tooltip
          cursor={{ stroke: '#9C87F8' }}
          contentStyle={{ borderRadius: 12, border: '1px solid #D5D3CE', fontSize: 12 }}
          labelFormatter={(ms: number) => timeFmt(ms)}
          formatter={(value: number | number[], name: string) => {
            if (Array.isArray(value)) return [`${num(value[0])} – ${num(value[1])}${unit ? ` ${unit}` : ''}`, name]
            return [unit ? `${num(value)} ${unit}` : num(value), name]
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {range && (
          <Area
            dataKey={range.key}
            name={range.name}
            stroke="none"
            fill={range.color}
            fillOpacity={0.15}
            isAnimationActive={false}
            activeDot={false}
          />
        )}
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
        {(dashed ?? []).map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
