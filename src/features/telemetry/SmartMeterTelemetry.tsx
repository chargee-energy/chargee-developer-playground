import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataState } from '@/components/common/DataState'
import { InsightCards } from '@/components/common/InsightCards'
import { RefreshButton } from '@/components/common/RefreshButton'
import { AutoChart } from './AutoChart'
import { ForecastView } from './ForecastView'
import { Section, DateInput } from './parts'
import { todayISO } from '@/utils/format'
import { cn } from '@/utils/cn'
import {
  useSmartMetersControllerGetLatestElectricityReadingV2,
  useSmartMetersControllerGetLatestGasReadingV2,
  useSmartMetersAggregationControllerGetElectricityIntervalsV2,
  useSmartMetersAggregationControllerGetGasIntervalsV2,
} from '@/api/generated/smart-meters/smart-meters'
import {
  useSmartMetersForecastControllerGetDeliveryForecastForSmartMeterV2,
  useSmartMetersForecastControllerGetReturnForecastForSmartMeterV2,
} from '@/api/generated/smart-meters/smart-meters'

type Resolution = 'quarter_hourly' | 'hourly' | 'daily'
const RESOLUTIONS: Resolution[] = ['quarter_hourly', 'hourly', 'daily']

export function SmartMeterTelemetry({ addressUuid, identifier }: { addressUuid: string; identifier: string }) {
  const { t } = useTranslation()
  const [date, setDate] = useState(todayISO())
  const [resolution, setResolution] = useState<Resolution>('quarter_hourly')

  const latestElec = useSmartMetersControllerGetLatestElectricityReadingV2(addressUuid, identifier)
  const latestGas = useSmartMetersControllerGetLatestGasReadingV2(addressUuid, identifier)

  // Raw readings are ~per-second (capped at 1000, no offset), so a full day
  // comes from the interval-aggregation endpoint instead.
  const range = { resolution, fromDate: `${date}T00:00:00.000Z`, toDate: `${date}T23:59:59.999Z` }
  const elec = useSmartMetersAggregationControllerGetElectricityIntervalsV2(addressUuid, identifier, range)
  const gas = useSmartMetersAggregationControllerGetGasIntervalsV2(addressUuid, identifier, range)

  const delivery = useSmartMetersForecastControllerGetDeliveryForecastForSmartMeterV2(addressUuid, identifier, { date })
  const ret = useSmartMetersForecastControllerGetReturnForecastForSmartMeterV2(addressUuid, identifier, { date })

  const dateControl = <DateInput value={date} onChange={setDate} />
  const resolutionLabels: Record<Resolution, string> = {
    quarter_hourly: t('telemetry.resQuarterHourly'),
    hourly: t('telemetry.resHourly'),
    daily: t('telemetry.resDaily'),
  }
  const intervalControls = (
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
  )

  return (
    <div className="space-y-6">
      <Section
        title={`${t('telemetry.latest')} · ${t('telemetry.electricity')}`}
        action={<RefreshButton onClick={() => latestElec.refetch()} busy={latestElec.isFetching} />}
      >
        <DataState isLoading={latestElec.isLoading} error={latestElec.error} isEmpty={!latestElec.data}>
          {latestElec.data && (
            <InsightCards
              record={latestElec.data as Record<string, any>}
              units={{ activePower: 'W', current: 'A', currentCalculated: 'A', voltage: 'V' }}
            />
          )}
        </DataState>
      </Section>
      <Section
        title={`${t('telemetry.latest')} · ${t('telemetry.gas')}`}
        action={<RefreshButton onClick={() => latestGas.refetch()} busy={latestGas.isFetching} />}
      >
        <DataState isLoading={latestGas.isLoading} error={latestGas.error} isEmpty={!latestGas.data}>
          {latestGas.data && <InsightCards record={latestGas.data as Record<string, any>} units={{}} />}
        </DataState>
      </Section>

      <Section title={`${t('telemetry.elecRange')} · Wh`} action={intervalControls}>
        <DataState isLoading={elec.isLoading} error={elec.error} isEmpty={(elec.data?.results?.length ?? 0) === 0} emptyMessage={t('telemetry.noReadings')} onRetry={() => elec.refetch()}>
          <AutoChart rows={(elec.data?.results ?? []) as any[]} unit="Wh" showTable={false} brush />
        </DataState>
      </Section>

      <Section title={`${t('telemetry.gasRange')} · dm³`} action={intervalControls}>
        <DataState isLoading={gas.isLoading} error={gas.error} isEmpty={(gas.data?.results?.length ?? 0) === 0} emptyMessage={t('telemetry.noReadings')} onRetry={() => gas.refetch()}>
          <AutoChart rows={(gas.data?.results ?? []) as any[]} unit="dm³" showTable={false} brush />
        </DataState>
      </Section>

      <ForecastView
        title={t('telemetry.deliveryForecast')}
        results={delivery.data?.results ?? []}
        seriesName={t('telemetry.deliveryForecast')}
        color="#FF8500"
        isLoading={delivery.isLoading}
        error={delivery.error}
        onRetry={() => delivery.refetch()}
        action={dateControl}
      />

      <ForecastView
        title={t('telemetry.returnForecast')}
        results={ret.data?.results ?? []}
        seriesName={t('telemetry.returnForecast')}
        color="#16B364"
        isLoading={ret.isLoading}
        error={ret.error}
        onRetry={() => ret.refetch()}
        action={dateControl}
      />
    </div>
  )
}
