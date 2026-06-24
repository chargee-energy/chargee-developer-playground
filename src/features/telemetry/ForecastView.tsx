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
 * Renders a single forecast with its metadata and chart. When the API returns
 * multiple forecasts for the date, a toggle lets you switch between them.
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
  const [index, setIndex] = useState(0)
  const selected = results[index] ?? results[0]

  const intervals = selected?.intervals ?? []
  const labels = timeAxisLabels(intervals.map((iv) => iv.start))
  const data = intervals.map((iv, i) => ({ time: labels[i], wh: iv.whSum }))

  const forecastLabel = (f: ForecastDto, i: number) =>
    f.forecastTime ? fmtDateTime(f.forecastTime) : f.forecastType || `#${i + 1}`

  return (
    <Section title={`${title} · Wh`} action={action}>
      <DataState
        isLoading={isLoading}
        error={error}
        isEmpty={data.length === 0}
        emptyMessage={t('telemetry.noReadings')}
        onRetry={onRetry}
      >
        {results.length > 1 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-11 font-bold uppercase tracking-wide text-text-gray">
              {t('telemetry.forecastRun', { count: results.length })}
            </span>
            {results.map((f, i) => (
              <button
                key={f.identifier ?? i}
                onClick={() => setIndex(i)}
                className={cn(
                  'rounded-full px-3 py-1 text-13 font-semibold transition-colors',
                  i === index ? 'bg-dark-blue text-beige' : 'bg-beige text-text-gray hover:text-ink',
                )}
              >
                {forecastLabel(f, i)}
              </button>
            ))}
          </div>
        )}

        <ForecastMeta meta={selected} />
        <TimeSeriesChart data={data} xKey="time" unit="Wh" series={[{ key: 'wh', name: seriesName, color }]} />
      </DataState>
    </Section>
  )
}
