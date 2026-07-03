import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { type Column } from '@/components/common/DataTable'
import { useContextStore } from '@/store/context'
import { cn } from '@/utils/cn'
import { ReportRunner, pct, type ReportMetric } from '../ReportRunner'
import { useAllVehiclesReport, type VehicleReportRow } from '../useAllVehiclesReport'
import type { FreshnessStatus } from '../reportFreshness'

const STATUS_CLS: Record<FreshnessStatus, string> = {
  connected: 'bg-light-green text-green',
  stale: 'bg-orange/10 text-orange',
  disconnected: 'bg-red/10 text-red',
}

function chargeLabel(r: VehicleReportRow, t: (k: string) => string): string {
  if (r.isCharging) return t('reports.chargeState.charging')
  if (r.isPluggedIn) return t('reports.chargeState.pluggedIn')
  return t('reports.chargeState.idle')
}

export function AllVehiclesReport() {
  const { t } = useTranslation()
  const { groupUuid } = useContextStore()
  const { status, progress, rows, totals, generatedAt, error, run, cancel } = useAllVehiclesReport(groupUuid)

  const cols: Column<VehicleReportRow>[] = [
    { key: 'addressUuid', header: t('reports.col.address') },
    { key: 'sparkySerial', header: t('reports.col.sparky'), render: (r) => r.sparkySerial ?? '—' },
    { key: 'flintSerial', header: t('reports.col.flint'), render: (r) => r.flintSerial ?? '—' },
    { key: 'brand', header: t('reports.col.brand'), render: (r) => r.brand || '—' },
    { key: 'model', header: t('reports.col.model'), render: (r) => r.model ?? '—' },
    { key: 'batteryLevel', header: t('reports.col.battery'), render: (r) => (r.batteryLevel != null ? `${r.batteryLevel}%` : '—') },
    { key: 'charge', header: t('reports.col.charge'), render: (r) => chargeLabel(r, t) },
    {
      key: 'status',
      header: t('reports.col.status'),
      render: (r) => (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-11 font-bold', STATUS_CLS[r.status])}>
          {t(`reports.status.${r.status}`)}
        </span>
      ),
    },
    {
      key: 'lastSeen',
      header: t('reports.col.lastSeen'),
      render: (r) => (r.lastSeen ? new Date(r.lastSeen).toLocaleString() : '—'),
    },
  ]

  const metrics: ReportMetric[] = useMemo(() => {
    const total = rows.length
    const connected = rows.filter((r) => r.status === 'connected').length
    const stale = rows.filter((r) => r.status === 'stale').length
    const disconnected = rows.filter((r) => r.status === 'disconnected').length
    const pluggedIn = rows.filter((r) => r.isPluggedIn === true).length
    return [
      { label: t('reports.metrics.totalVehicles'), value: total },
      {
        label: t('reports.metrics.addressCoverageVehicles'),
        value: `${pct(totals.addressesWithData, totals.addresses)}%`,
        sub: t('reports.metrics.addressCoverageSub', { covered: totals.addressesWithData, total: totals.addresses }),
      },
      {
        label: t('reports.metrics.connected'),
        value: `${pct(connected, total)}%`,
        sub: t('reports.metrics.ofTotalVehicles', { n: connected }),
      },
      {
        label: t('reports.metrics.stale'),
        value: `${pct(stale, total)}%`,
        sub: t('reports.metrics.ofTotalVehicles', { n: stale }),
      },
      {
        label: t('reports.metrics.disconnected'),
        value: `${pct(disconnected, total)}%`,
        sub: t('reports.metrics.ofTotalVehicles', { n: disconnected }),
      },
      {
        label: t('reports.metrics.pluggedIn'),
        value: `${pct(pluggedIn, total)}%`,
        sub: t('reports.metrics.ofTotalVehicles', { n: pluggedIn }),
      },
    ]
  }, [rows, totals, t])

  return (
    <ReportRunner
      title={t('reports.templates.allVehicles.title')}
      description={t('reports.templates.allVehicles.description')}
      status={status}
      progress={progress}
      rows={rows}
      generatedAt={generatedAt}
      error={error}
      onRun={run}
      onCancel={cancel}
      columns={cols}
      rowKey={(r, i) => `${r.addressUuid}-${r.identifier}-${i}`}
      metrics={metrics}
      csvFilename={`all-vehicles-${new Date().toISOString().slice(0, 10)}.csv`}
      emptyMessage={t('reports.emptyVehicles')}
      canRun={!!groupUuid}
    />
  )
}
