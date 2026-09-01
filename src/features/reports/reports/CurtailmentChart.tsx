import { useState } from 'react'
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

/** Round up to a "nice" value (…/50/100/…) so the top tick clears the data. */
function niceCeil(v: number): number {
  if (v <= 0) return 0
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const step = mag / 2
  return Math.ceil(v / step) * step
}

interface CurtailmentChartProps {
  data: object[]
  /** Numeric time axis domain in epoch ms. */
  domain: [number, number]
  /** Curtailment periods (epoch ms) to shade — one band each. */
  bands?: { start: number; end: number }[]
  /** Colour for `bands` (default group-purple). */
  bandColor?: string
  /** Optional second band set in a distinct colour (e.g. inverter-scoped curtailment). */
  bands2?: { start: number; end: number }[]
  band2Color?: string
  /**
   * Optional third band set drawn much fainter — for background state that holds
   * across the whole view (e.g. a limit already in effect before it opened) and
   * would otherwise read as "everything is curtailed".
   */
  bands3?: { start: number; end: number }[]
  band3Color?: string
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
  /** Bridge gaps in the main series (for points that carry only some keys, e.g. detail merged from separate endpoints). */
  connectNulls?: boolean
  /** Allow clicking legend entries to show/hide individual series. */
  toggleable?: boolean
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
  bandColor = '#6245DE',
  bands2,
  band2Color = '#FF8500',
  bands3,
  band3Color = '#696969',
  series,
  dashed,
  range,
  unit,
  decimals = 0,
  height = 300,
  withSeconds = false,
  connectNulls = false,
  toggleable = false,
}: CurtailmentChartProps) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const toggle = (key?: string | number | ((obj: unknown) => unknown)) => {
    if (!toggleable || (typeof key !== 'string' && typeof key !== 'number')) return
    const k = String(key)
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }
  const isHidden = (key?: string | number | ((obj: unknown) => unknown)) =>
    (typeof key === 'string' || typeof key === 'number') && hidden.has(String(key))
  const timeFmt = (ms: number) => format(new Date(ms), withSeconds ? 'HH:mm:ss' : 'HH:mm')
  const num = (v: number) =>
    v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

  // Clamp each band to the visible domain so it still renders when a curtailment
  // period starts/ends outside the current view (e.g. a detail block).
  const clamp = (bs?: { start: number; end: number }[]) =>
    (bs ?? [])
      .map((b) => ({ start: Math.max(b.start, domain[0]), end: Math.min(b.end, domain[1]) }))
      .filter((b) => b.end > b.start)
  const visibleBands = clamp(bands)
  const visibleBands2 = clamp(bands2)
  const visibleBands3 = clamp(bands3)

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#D5D3CE" vertical={false} />
        {visibleBands3.map((b, i) => (
          <ReferenceArea
            key={`b3-${i}`}
            x1={b.start}
            x2={b.end}
            fill={band3Color}
            fillOpacity={0.04}
            stroke="none"
            ifOverflow="extendDomain"
          />
        ))}
        {visibleBands.map((b, i) => (
          <ReferenceArea
            key={`b1-${i}`}
            x1={b.start}
            x2={b.end}
            fill={bandColor}
            fillOpacity={0.08}
            stroke={bandColor}
            strokeOpacity={0.25}
            ifOverflow="extendDomain"
          />
        ))}
        {visibleBands2.map((b, i) => (
          <ReferenceArea
            key={`b2-${i}`}
            x1={b.start}
            x2={b.end}
            fill={band2Color}
            fillOpacity={0.1}
            stroke={band2Color}
            strokeOpacity={0.3}
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
          domain={[0, (dataMax: number) => niceCeil(dataMax * 1.1)]}
          allowDecimals={false}
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
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          onClick={toggleable ? (e: { dataKey?: string | number | ((obj: unknown) => unknown) }) => toggle(e.dataKey) : undefined}
          formatter={
            toggleable
              ? (value: string, entry: { dataKey?: string | number | ((obj: unknown) => unknown) }) => {
                  const off = isHidden(entry?.dataKey)
                  return (
                    <span style={{ cursor: 'pointer', color: off ? '#9AA0A6' : undefined, textDecoration: off ? 'line-through' : undefined }}>
                      {value}
                    </span>
                  )
                }
              : undefined
          }
        />
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
            connectNulls={connectNulls}
            hide={hidden.has(s.key)}
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
            hide={hidden.has(s.key)}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
