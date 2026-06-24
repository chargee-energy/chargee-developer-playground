import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataState } from '@/components/common/DataState'
import { InsightCards } from '@/components/common/InsightCards'
import { RefreshButton } from '@/components/common/RefreshButton'
import { TimeSeriesChart } from './TimeSeriesChart'
import { ForecastView } from './ForecastView'
import { Section, DateInput } from './parts'
import { dayRange } from './range'
import { timeAxisLabels, todayISO } from '@/utils/format'
import {
  useSolarInvertersControllerGetProductionEnergyV2,
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

  // Steerable/live inverters expose realtime readings; cloud inverters only
  // return data via the aggregated interval endpoint.
  const production = useSolarInvertersControllerGetProductionEnergyV2(addressUuid, identifier, dayRange(date), {
    query: { enabled: steerable },
  })
  const intervals = useSolarInverterAggregationControllerGetProductionIntervalsV2(
    addressUuid,
    identifier,
    { resolution, fromDate: `${date}T00:00:00.000Z`, toDate: `${date}T23:59:59.999Z` },
    { query: { enabled: !steerable } },
  )
  const latest = useSolarInvertersControllerGetLatestProductionEnergyV2(addressUuid, identifier)
  const forecast = useSolarInverterForecastControllerGetProductionForecastForSolarInverterV2(addressUuid, identifier, { date })

  const dateControl = <DateInput value={date} onChange={setDate} />

  const resolutionLabels: Record<Resolution, string> = {
    quarter_hourly: t('telemetry.resQuarterHourly'),
    hourly: t('telemetry.resHourly'),
    daily: t('telemetry.resDaily'),
  }

  return (
    <div className="space-y-6">
      <Section title={t('telemetry.latest')} action={<RefreshButton onClick={() => latest.refetch()} busy={latest.isFetching} />}>
        <DataState isLoading={latest.isLoading} error={latest.error} isEmpty={!latest.data}>
          {latest.data && <InsightCards record={latest.data as Record<string, any>} />}
        </DataState>
      </Section>

      {steerable ? (
        <Section title={`${t('telemetry.productionHistory')} · W`} action={dateControl}>
          <DataState isLoading={production.isLoading} error={production.error} isEmpty={(production.data?.results?.length ?? 0) === 0} emptyMessage={t('telemetry.noReadings')} onRetry={() => production.refetch()}>
            <TimeSeriesChart
              data={(() => {
                const rows = production.data?.results ?? []
                const labels = timeAxisLabels(rows.map((r) => r.time))
                return rows.map((r, i) => ({ time: labels[i], power: r.power }))
              })()}
              xKey="time"
              unit="W"
              series={[{ key: 'power', name: t('telemetry.production'), color: '#6245DE' }]}
            />
          </DataState>
        </Section>
      ) : (
        <Section
          title={`${t('telemetry.productionIntervals')} · Wh`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input h-9 w-auto py-1"
                value={resolution}
                onChange={(e) => setResolution(e.target.value as Resolution)}
              >
                {RESOLUTIONS.map((r) => (
                  <option key={r} value={r}>
                    {resolutionLabels[r]}
                  </option>
                ))}
              </select>
              {dateControl}
            </div>
          }
        >
          <p className="mb-3 text-13 text-text-gray">{t('telemetry.cloudNote')}</p>
          <DataState isLoading={intervals.isLoading} error={intervals.error} isEmpty={(intervals.data?.results?.length ?? 0) === 0} emptyMessage={t('telemetry.noReadings')} onRetry={() => intervals.refetch()}>
            <TimeSeriesChart
              data={(() => {
                const rows = intervals.data?.results ?? []
                const labels = timeAxisLabels(rows.map((r) => r.time))
                return rows.map((r, i) => ({ time: labels[i], production: r.production }))
              })()}
              xKey="time"
              unit="Wh"
              series={[{ key: 'production', name: t('telemetry.production'), color: '#6245DE' }]}
            />
          </DataState>
        </Section>
      )}

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
