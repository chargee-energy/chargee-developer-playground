import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataState } from '@/components/common/DataState'
import { AutoChart } from './AutoChart'
import { ExportCsvButton } from '@/components/common/ExportCsvButton'
import { Section, DateInput } from './parts'
import { todayISO } from '@/utils/format'
import { GAS_COLOR } from '@/utils/records'
import { cn } from '@/utils/cn'
import {
  useEnergyControllerElec15minV2,
  useEnergyControllerElec1dayV2,
  useEnergyControllerElec1monthV2,
  useEnergyControllerGas15minV2,
  useEnergyControllerGas1dayV2,
  useEnergyControllerGas1monthV2,
} from '@/api/generated/energy/energy'

type Resolution = '15min' | '1day' | '1month'
type EnergyType = 'electricity' | 'gas'

const RESOLUTIONS: Resolution[] = ['15min', '1day', '1month']

function Toggle<T extends string>({ value, options, labels, onChange }: { value: T; options: T[]; labels: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 rounded-full bg-beige p-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={cn('rounded-full px-3 py-1 text-13 font-semibold transition-colors', value === o ? 'bg-dark-blue text-beige' : 'text-text-gray hover:text-ink')}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  )
}

export function AddressEnergyTelemetry({ addressUuid }: { addressUuid: string }) {
  const { t } = useTranslation()
  const [date, setDate] = useState(todayISO())
  const [type, setType] = useState<EnergyType>('electricity')
  const [resolution, setResolution] = useState<Resolution>('15min')

  const params = { date }
  const e15 = useEnergyControllerElec15minV2(addressUuid, params)
  const e1d = useEnergyControllerElec1dayV2(addressUuid, params)
  const e1m = useEnergyControllerElec1monthV2(addressUuid, params)
  const g15 = useEnergyControllerGas15minV2(addressUuid, params)
  const g1d = useEnergyControllerGas1dayV2(addressUuid, params)
  const g1m = useEnergyControllerGas1monthV2(addressUuid, params)

  const active =
    type === 'electricity'
      ? { '15min': e15, '1day': e1d, '1month': e1m }[resolution]
      : { '15min': g15, '1day': g1d, '1month': g1m }[resolution]

  const rows = (active.data ?? []) as any[]

  const resolutionLabels: Record<Resolution, string> = {
    '15min': t('telemetry.interval15min'),
    '1day': t('telemetry.interval1day'),
    '1month': t('telemetry.interval1month'),
  }

  return (
    <div className="space-y-6">
      <Section
        title={t('telemetry.addressEnergy')}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Toggle<EnergyType>
              value={type}
              options={['electricity', 'gas']}
              labels={{ electricity: t('telemetry.electricity'), gas: t('telemetry.gas') }}
              onChange={setType}
            />
            <Toggle value={resolution} options={RESOLUTIONS} labels={resolutionLabels} onChange={setResolution} />
            <DateInput value={date} onChange={setDate} />
            <ExportCsvButton rows={rows} filename={`address-energy-${type}-${date}.csv`} />
          </div>
        }
      >
        <DataState
          isLoading={active.isLoading}
          error={active.error}
          isEmpty={rows.length === 0}
          emptyMessage={t('telemetry.noReadings')}
          onRetry={() => active.refetch()}
        >
          {/* Rows are cumulative meter counters — chart the per-interval delta
              (consumption); the table below keeps the raw counter values. P4
              times are already in the provider's timezone, so show them as-is. */}
          <AutoChart
            rows={rows}
            unit={type === 'electricity' ? 'kWh' : 'm³'}
            color={type === 'gas' ? GAS_COLOR : undefined}
            decimals={3}
            delta
            timeMode="raw"
          />
        </DataState>
      </Section>
    </div>
  )
}
