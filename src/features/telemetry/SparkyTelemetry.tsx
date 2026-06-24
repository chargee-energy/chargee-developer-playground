import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataState } from '@/components/common/DataState'
import { InsightCards } from '@/components/common/InsightCards'
import { RefreshButton } from '@/components/common/RefreshButton'
import { TimeSeriesChart } from './TimeSeriesChart'
import { AutoChart } from './AutoChart'
import { Section, DateInput } from './parts'
import { fmtTime, todayISO } from '@/utils/format'
import {
  useSparkyControllerGetLatestP1V2,
  useSparkyControllerGetElectricity15minForSNV2,
  useSparkyControllerGetGas15minForSNV2,
  useSparkyControllerGetElectricityAndGas15minForSNV2,
  useSparkyControllerGetElectricityLatestForSNV2,
} from '@/api/generated/sparky/sparky'

export function SparkyTelemetry({ serial }: { serial: string }) {
  const { t } = useTranslation()
  const [date, setDate] = useState(todayISO())
  const [live, setLive] = useState(false)
  const [livePoints, setLivePoints] = useState<Array<{ time: string; delivered: number; returned: number }>>([])

  const latestP1 = useSparkyControllerGetLatestP1V2(serial, {
    query: { enabled: live, refetchInterval: live ? 5000 : false },
  })
  const elec15 = useSparkyControllerGetElectricity15minForSNV2(serial, { date })
  const gas15 = useSparkyControllerGetGas15minForSNV2(serial, { date })
  const total15 = useSparkyControllerGetElectricityAndGas15minForSNV2(serial, { date })
  const latest = useSparkyControllerGetElectricityLatestForSNV2(serial)

  useEffect(() => {
    const d = latestP1.data as any
    if (!d) return
    const delivered = (parseFloat(String(d.power_delivered ?? '0')) || 0) * 1000
    // Returned/exported power is plotted below zero.
    const returned = -((parseFloat(String(d.power_returned ?? '0')) || 0) * 1000)
    setLivePoints((prev) => [...prev, { time: fmtTime(new Date().toISOString()), delivered, returned }].slice(-60))
  }, [latestP1.data])

  const dateControl = <DateInput value={date} onChange={setDate} />

  return (
    <div className="space-y-6">
      <Section
        title={t('telemetry.latest')}
        action={<RefreshButton onClick={() => latest.refetch()} busy={latest.isFetching} />}
      >
        <DataState isLoading={latest.isLoading} error={latest.error} isEmpty={!latest.data}>
          {latest.data && <InsightCards record={latest.data as Record<string, any>} />}
        </DataState>
      </Section>

      <Section
        title={`${t('telemetry.realtime')} · W`}
        action={
          <button className={live ? 'btn-primary h-9' : 'btn-secondary h-9'} onClick={() => setLive((v) => !v)}>
            {live ? `● ${t('telemetry.realtimeOn')}` : t('telemetry.realtime')}
          </button>
        }
      >
        {!live ? (
          <p className="py-8 text-center text-sm text-text-gray">{t('telemetry.realtimePaused')}</p>
        ) : livePoints.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-gray">{t('common.loading')}</p>
        ) : (
          <TimeSeriesChart
            data={livePoints}
            xKey="time"
            unit="W"
            series={[
              { key: 'delivered', name: t('telemetry.delivered'), color: '#FF8500' },
              { key: 'returned', name: t('telemetry.returned'), color: '#16B364' },
            ]}
          />
        )}
      </Section>

      <Section title={`${t('telemetry.electricity')} · kWh (${t('telemetry.interval15min')})`} action={dateControl}>
        <DataState isLoading={elec15.isLoading} error={elec15.error} isEmpty={(elec15.data?.length ?? 0) === 0} emptyMessage={t('telemetry.noReadings')} onRetry={() => elec15.refetch()}>
          <TimeSeriesChart
            data={(elec15.data ?? []).map((r) => ({ time: fmtTime(r.from), delivery: r.delivery, return: -r.return }))}
            xKey="time"
            unit="kWh"
            series={[
              { key: 'delivery', name: t('telemetry.delivered'), color: '#FF8500' },
              { key: 'return', name: t('telemetry.returned'), color: '#16B364' },
            ]}
          />
        </DataState>
      </Section>

      <Section title={`${t('telemetry.gas')} · m³ (${t('telemetry.interval15min')})`} action={dateControl}>
        <DataState isLoading={gas15.isLoading} error={gas15.error} isEmpty={(gas15.data?.length ?? 0) === 0} emptyMessage={t('telemetry.noReadings')} onRetry={() => gas15.refetch()}>
          <TimeSeriesChart
            data={(gas15.data ?? []).map((r) => ({ time: fmtTime(r.from), gas: r.delivery }))}
            xKey="time"
            unit="m³"
            series={[{ key: 'gas', name: t('telemetry.gas'), color: '#6245DE' }]}
          />
        </DataState>
      </Section>

      <Section title={`${t('telemetry.total')} (${t('telemetry.interval15min')})`} action={dateControl}>
        <DataState isLoading={total15.isLoading} error={total15.error} isEmpty={(total15.data?.length ?? 0) === 0} emptyMessage={t('telemetry.noReadings')} onRetry={() => total15.refetch()}>
          <AutoChart rows={(total15.data ?? []) as any[]} showTable={false} />
        </DataState>
      </Section>
    </div>
  )
}
