import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataState } from '@/components/common/DataState'
import { InsightCards } from '@/components/common/InsightCards'
import { RefreshButton } from '@/components/common/RefreshButton'
import { ExportCsvButton } from '@/components/common/ExportCsvButton'
import { AutoChart } from './AutoChart'
import { ForecastView } from './ForecastView'
import { Section, DateInput } from './parts'
import { useResolutionRange } from './useResolutionRange'
import { todayISO } from '@/utils/format'
import { GAS_COLOR } from '@/utils/records'
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

export function SmartMeterTelemetry({ addressUuid, identifier }: { addressUuid: string; identifier: string }) {
  const { t } = useTranslation()
  const [date, setDate] = useState(todayISO())

  const latestElec = useSmartMetersControllerGetLatestElectricityReadingV2(addressUuid, identifier)
  const latestGas = useSmartMetersControllerGetLatestGasReadingV2(addressUuid, identifier)

  // Resolution + adaptive period picker drive the interval-aggregation range.
  const { range, control: intervalControls } = useResolutionRange()
  const elec = useSmartMetersAggregationControllerGetElectricityIntervalsV2(addressUuid, identifier, range)
  const gas = useSmartMetersAggregationControllerGetGasIntervalsV2(addressUuid, identifier, range)

  const delivery = useSmartMetersForecastControllerGetDeliveryForecastForSmartMeterV2(addressUuid, identifier, { date })
  const ret = useSmartMetersForecastControllerGetReturnForecastForSmartMeterV2(addressUuid, identifier, { date })

  const dateControl = <DateInput value={date} onChange={setDate} />

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

      <Section
        title={`${t('telemetry.elecRange')} · kWh`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {intervalControls}
            <ExportCsvButton rows={(elec.data?.results ?? []) as any[]} filename={`electricity-${identifier}.csv`} />
          </div>
        }
      >
        <DataState isLoading={elec.isLoading} error={elec.error} isEmpty={(elec.data?.results?.length ?? 0) === 0} emptyMessage={t('telemetry.noReadings')} onRetry={() => elec.refetch()}>
          <AutoChart rows={(elec.data?.results ?? []) as any[]} unit="kWh" scale={0.001} decimals={3} timeMode="utc" showTable={false} brush />
        </DataState>
      </Section>

      <Section
        title={`${t('telemetry.gasRange')} · m³`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {intervalControls}
            <ExportCsvButton rows={(gas.data?.results ?? []) as any[]} filename={`gas-${identifier}.csv`} />
          </div>
        }
      >
        <DataState isLoading={gas.isLoading} error={gas.error} isEmpty={(gas.data?.results?.length ?? 0) === 0} emptyMessage={t('telemetry.noReadings')} onRetry={() => gas.refetch()}>
          <AutoChart rows={(gas.data?.results ?? []) as any[]} unit="m³" color={GAS_COLOR} scale={0.001} decimals={3} timeMode="utc" showTable={false} brush />
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
