import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LineChart, Line, YAxis, ReferenceLine, ResponsiveContainer } from 'recharts'

const GREEN = '#16B364'
const ORANGE = '#FF8500'

// Ease the displayed number towards a new target so the readout counts up/down
// smoothly instead of snapping on every poll (ported from the companion app).
function useAnimatedNumber(target: number | null): number | null {
  const [display, setDisplay] = useState<number | null>(target)
  const raf = useRef<number | null>(null)
  const current = useRef<number | null>(target)

  useEffect(() => {
    const cancel = () => {
      if (raf.current != null) cancelAnimationFrame(raf.current)
      raf.current = null
    }
    if (target === null) {
      cancel()
      current.current = null
      setDisplay(null)
      return
    }
    // First value after being empty: snap without animating.
    if (current.current === null) {
      current.current = target
      setDisplay(target)
      return
    }
    const start = current.current
    const startTime = performance.now()
    const duration = 450
    const ease = (t: number) => 1 - Math.pow(1 - t, 3)
    cancel()
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1)
      const value = Math.round(start + (target - start) * ease(t))
      current.current = value
      setDisplay(value)
      if (t < 1) raf.current = requestAnimationFrame(tick)
      else raf.current = null
    }
    raf.current = requestAnimationFrame(tick)
    return cancel
  }, [target])

  return display
}

export interface GridPowerCardProps {
  /** Signed net grid power in watts: positive = consuming, negative = returning. Null when no data yet. */
  netWatts: number | null
  /** Rolling history of net watts for the sparkline. */
  history: number[]
}

/**
 * Real-time "Netvermogen" widget: shows current net grid power with a live
 * sparkline. Green when returning to the grid, orange when consuming from it.
 */
export function GridPowerCard({ netWatts, history }: GridPowerCardProps) {
  const { t } = useTranslation()
  const display = useAnimatedNumber(netWatts)
  const returning = display != null && display < 0
  const color = returning ? GREEN : ORANGE

  const chartData = history.map((net, i) => ({ i, net }))
  const values = history.length ? history : [0]
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const pad = Math.max((hi - lo) * 0.2, 50)

  return (
    <div className="overflow-hidden rounded-30px bg-dark-blue p-5 shadow-btn-shadow">
      <div className="mb-3 flex items-start justify-between">
        <span className="text-sm font-medium text-white">{t('telemetry.now')}</span>
        <span className="flex items-center gap-1.5 text-sm font-medium text-white">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-green" aria-hidden />
          {t('telemetry.live')}
        </span>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
        <div className="flex min-w-0 items-center gap-2">
          <svg
            className="size-5 shrink-0"
            style={{ color }}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M7 2v11h3v9l7-12h-3l4-8z" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm text-white">
              {returning ? t('telemetry.returningToGrid') : t('telemetry.gridConsumption')}
            </p>
            <p className="text-2xl font-bold tabular-nums md:text-3xl" style={{ color }}>
              {display != null ? Math.abs(display).toLocaleString() : '—'}
              <span className="ml-0.5 text-lg font-semibold" style={{ color }}>
                W
              </span>
            </p>
          </div>
        </div>

        <div className="relative h-24 flex-1 md:h-20">
          {chartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <YAxis hide domain={[lo - pad, hi + pad]} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-white/50">
              {t('common.loading')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
