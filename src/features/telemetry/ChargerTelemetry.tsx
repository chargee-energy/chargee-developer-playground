import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataState } from '@/components/common/DataState'
import { AutoChart } from './AutoChart'
import { Section, DateInput } from './parts'
import { dayRange } from './range'
import { todayISO } from '@/utils/format'
import { useChargerControllerListProductionEnergyV2 } from '@/api/generated/chargers/chargers'

export function ChargerTelemetry({ addressUuid, identifier }: { addressUuid: string; identifier: string }) {
  const { t } = useTranslation()
  const [date, setDate] = useState(todayISO())
  const consumption = useChargerControllerListProductionEnergyV2(addressUuid, identifier, dayRange(date))

  return (
    <Section title={t('telemetry.consumption')} action={<DateInput value={date} onChange={setDate} />}>
      <DataState
        isLoading={consumption.isLoading}
        error={consumption.error}
        isEmpty={(consumption.data?.results?.length ?? 0) === 0}
        emptyMessage={t('telemetry.noReadings')}
        onRetry={() => consumption.refetch()}
      >
        <AutoChart rows={(consumption.data?.results ?? []) as any[]} unit="W" />
      </DataState>
    </Section>
  )
}
