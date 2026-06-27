import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataState } from '@/components/common/DataState'
import { InsightCards } from '@/components/common/InsightCards'
import { RefreshButton } from '@/components/common/RefreshButton'
import { TimeSeriesChart } from './TimeSeriesChart'
import { ForecastView } from './ForecastView'
import { Section, DateInput } from './parts'
import { localDayRangeUTC } from './range'
import { timeAxisLabels, todayISO } from '@/utils/format'
import { cn } from '@/utils/cn'
import {
  useSolarInvertersControllerGetLatestProductionEnergyV2,
  useSolarInverterForecastControllerGetProductionForecastForSolarInverterV2,
  useSolarInverterAggregationControllerGetProductionIntervalsV2,
} from '@/api/generated/solar-inverters/solar-inverters'

type Resolution = 'quarter_hourly' | 'hourly' | 'daily'
const RESOLUTIONS: Resolution[] = ['quarter_hourly', 'hourly', 'daily']

export function SolarTelemetry({
  addressUuid,
  identifier,
  steerable = true,
}: {
  addressUuid: string
  identifier: string
  steerable?: boolean
}) {
  const { t } = useTranslation()
  const [date, setDate] = useState(todayISO())
  const [resolution, setResolution] = useState<Resolution>('quarter_hourly')

  // Full-day production comes from the aggregated interval endpoint. The raw
  // energy/production stream is capped at 1000 records (no offset), so it can't
  // return a whole day — interval aggregation is the API's full-history path.
  const intervals = useSolarInverterAggregationControllerGetProductionIntervalsV2(
    addressUuid,
    identifier,
    { resolution, ...localDayRangeUTC(date) },
  )
  // Live latest reading only exists for steerable (locally-connected) inverters.
  const latest = useSolarInvertersControllerGetLatestProductionEnergyV2(addressUuid, identifier, {
    query: { enabled: steerable },
  })
  const forecast = useSolarInverterForecastControllerGetProductionForecastForSolarInverterV2(addressUuid, identifier, { date })

  const dateControl = <DateInput value={date} onChange={setDate} />
  const resolutionLabels: Record<Resolution, string> = {
    quarter_hourly: t('telemetry.resQuarterHourly'),
    hourly: t('telemetry.resHourly'),
    daily: t('telemetry.resDaily'),
  }

  const rows = intervals.data?.results ?? []
  const labels = timeAxisLabels(rows.map((r) => r.time))
  const data = rows.map((r, i) => ({ time: labels[i], production: r.production }))

  return (
    <div className="space-y-6">
      <Section
        title={t('telemetry.latest')}
        action={steerable ? <RefreshButton onClick={() => latest.refetch()} busy={latest.isFetching} /> : undefined}
      >
        {steerable ? (
          <DataState isLoading={latest.isLoading} error={latest.error} isEmpty={!latest.data}>
            {latest.data && <InsightCards record={latest.data as Record<string, any>} />}
          </DataState>
        ) : (
          <p className="py-6 text-center text-sm leading-160 text-text-gray">{t('telemetry.noLiveSolar')}</p>
        )}
      </Section>

      <Section
        title={`${t('telemetry.productionHistory')} · Wh`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-full bg-beige p-1">
              {RESOLUTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setResolution(r)}
                  className={cn(
                    'rounded-full px-3 py-1 text-13 font-semibold transition-colors',
                    resolution === r ? 'bg-dark-blue text-beige' : 'text-text-gray hover:text-ink',
                  )}
                >
                  {resolutionLabels[r]}
                </button>
              ))}
            </div>
            {dateControl}
          </div>
        }
      >
        {!steerable && <p className="mb-3 text-13 text-text-gray">{t('telemetry.cloudNote')}</p>}
        <DataState
          isLoading={intervals.isLoading}
          error={intervals.error}
          isEmpty={rows.length === 0}
          emptyMessage={t('telemetry.noReadings')}
          onRetry={() => intervals.refetch()}
        >
          <TimeSeriesChart
            data={data}
            xKey="time"
            unit="Wh"
            brush
            series={[{ key: 'production', name: t('telemetry.production'), color: '#6245DE' }]}
          />
        </DataState>
      </Section>

      <ForecastView
        title={t('telemetry.productionForecast')}
        results={forecast.data?.results ?? []}
        seriesName={t('telemetry.forecast')}
        color="#FF8500"
        isLoading={forecast.isLoading}
        error={forecast.error}
        onRetry={() => forecast.refetch()}
        action={dateControl}
      />
    </div>
  )
}
