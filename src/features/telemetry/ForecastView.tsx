import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DataState } from '@/components/common/DataState'
import { Section } from './parts'
import { ForecastMeta } from './ForecastMeta'
import { TimeSeriesChart } from './TimeSeriesChart'
import { timeAxisLabels, fmtDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'

interface ForecastInterval {
  start: string
  whSum: number
}
interface ForecastDto {
  identifier?: string
  intervals?: ForecastInterval[] | null
  forecastType?: string
  forecastQuality?: number
  forecastDuration?: number
  forecastTime?: string
}

interface ForecastViewProps {
  title: string
  results: ForecastDto[]
  seriesName: string
  color: string
  isLoading?: boolean
  error?: unknown
  onRetry?: () => void
  /** Right-aligned controls (e.g. the date picker). */
  action?: ReactNode
}

/**
 * Renders a forecast with its metadata and chart. Forecasts are grouped by
 * type (a few pills); within a type the generated run is picked from a compact
 * dropdown (latest first) — far cleaner than a flat list of every run.
 */
export function ForecastView({
  title,
  results,
  seriesName,
  color,
  isLoading,
  error,
  onRetry,
  action,
}: ForecastViewProps) {
  const { t } = useTranslation()
  const [type, setType] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(null)

  // Group by forecast type; sort each group's runs newest-first.
  const groups = new Map<string, ForecastDto[]>()
  for (const f of results) {
    const key = f.forecastType || t('common.none')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(f)
  }
  for (const list of groups.values()) {
    list.sort((a, b) => String(b.forecastTime ?? '').localeCompare(String(a.forecastTime ?? '')))
  }

  const types = [...groups.keys()]
  const activeType = type && groups.has(type) ? type : (types[0] ?? '')
  const runs = groups.get(activeType) ?? []
  const selected = runs.find((r) => r.identifier === selId) ?? runs[0]

  const intervals = selected?.intervals ?? []
  const labels = timeAxisLabels(intervals.map((iv) => iv.start))
  const data = intervals.map((iv, i) => ({ time: labels[i], wh: iv.whSum }))

  return (
    <Section title={`${title} · Wh`} action={action}>
      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={results.length === 0}
        emptyMessage={t('telemetry.noReadings')}
        onRetry={onRetry}
      >
        <div className="mb-4 space-y-2">
          {types.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-11 font-bold uppercase tracking-wide text-text-gray">
                {t('telemetry.forecastType')}
              </span>
              {types.map((ty) => (
                <button
                  key={ty}
                  onClick={() => {
                    setType(ty)
                    setSelId(null)
                  }}
                  className={cn(
                    'rounded-full px-3 py-1 text-13 font-semibold transition-colors',
                    ty === activeType ? 'bg-dark-blue text-beige' : 'bg-beige text-text-gray hover:text-ink',
                  )}
                >
                  {ty} <span className="opacity-60">{groups.get(ty)!.length}</span>
                </button>
              ))}
            </div>
          )}
          {runs.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-11 font-bold uppercase tracking-wide text-text-gray">
                {t('telemetry.forecastGenerated')}
              </span>
              <select
                className="input h-9 w-auto py-1"
                value={selected?.identifier ?? ''}
                onChange={(e) => setSelId(e.target.value)}
              >
                {runs.map((r, i) => (
                  <option key={r.identifier ?? i} value={r.identifier ?? ''}>
                    {r.forecastTime ? fmtDateTime(r.forecastTime) : `#${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <ForecastMeta meta={selected} />
        <TimeSeriesChart data={data} xKey="time" unit="Wh" series={[{ key: 'wh', name: seriesName, color }]} />
      </DataState>
    </Section>
  )
}
