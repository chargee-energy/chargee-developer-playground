import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { type Column } from '@/components/common/DataTable'
import { useContextStore } from '@/store/context'
import { cn } from '@/utils/cn'
import { ReportRunner } from '../ReportRunner'
import { pct, type ReportMetric } from '../reportMetrics'
import { useAllSolarInvertersReport, type SolarInverterReportRow } from '../useAllSolarInvertersReport'
import type { ProductionStatus } from '../reportSolarStatus'

const STATUS_CLS: Record<ProductionStatus, string> = {
  connected: 'bg-light-green text-green',
  stale: 'bg-orange/10 text-orange',
  disconnected: 'bg-red/10 text-red',
}

export function AllSolarInvertersReport() {
  const { t } = useTranslation()
  const { groupUuid } = useContextStore()
  const { status, progress, rows, totals, generatedAt, error, run, cancel } = useAllSolarInvertersReport(groupUuid)

  const cols: Column<SolarInverterReportRow>[] = [
    { key: 'addressUuid', header: t('reports.col.address') },
    { key: 'sparkySerial', header: t('reports.col.sparky'), render: (r) => r.sparkySerial ?? '—' },
    { key: 'flintSerial', header: t('reports.col.flint'), render: (r) => r.flintSerial ?? '—' },
    { key: 'brand', header: t('reports.col.brand'), render: (r) => r.brand || '—' },
    { key: 'model', header: t('reports.col.model'), render: (r) => r.model ?? '—' },
    {
      key: 'connectionType',
      header: t('reports.col.connection'),
      render: (r) => (
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-11 font-bold',
            r.connectionType === 'local' ? 'bg-light-green text-green' : 'bg-light-purple-3 text-dark-purple',
          )}
        >
          {t(`reports.connection.${r.connectionType}`)}
        </span>
      ),
    },
    {
      key: 'productionStatus',
      header: t('reports.col.status'),
      render: (r) => (
        <span
          className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-11 font-bold', STATUS_CLS[r.productionStatus])}
        >
          {t(`reports.status.${r.productionStatus}`)}
        </span>
      ),
    },
    {
      key: 'lastProductionTime',
      header: t('reports.col.lastProduction'),
      render: (r) => (r.lastProductionTime ? new Date(r.lastProductionTime).toLocaleString() : '—'),
    },
  ]

  const metrics: ReportMetric[] = useMemo(() => {
    const total = rows.length
    const connected = rows.filter((r) => r.productionStatus === 'connected').length
    const stale = rows.filter((r) => r.productionStatus === 'stale').length
    const disconnected = rows.filter((r) => r.productionStatus === 'disconnected').length
    const local = rows.filter((r) => r.connectionType === 'local').length
    const cloud = total - local
    return [
      { label: t('reports.metrics.total'), value: total },
      {
        label: t('reports.metrics.addressCoverage'),
        value: `${pct(totals.addressesWithData, totals.addresses)}%`,
        sub: t('reports.metrics.addressCoverageSub', { covered: totals.addressesWithData, total: totals.addresses }),
      },
      {
        label: t('reports.metrics.distribution'),
        value: `${pct(local, total)}% / ${pct(cloud, total)}%`,
        sub: t('reports.metrics.distributionSub', { local, cloud }),
      },
      {
        label: t('reports.metrics.working'),
        value: `${pct(connected, total)}%`,
        sub: t('reports.metrics.ofTotal', { n: connected }),
      },
      {
        label: t('reports.metrics.stale'),
        value: `${pct(stale, total)}%`,
        sub: t('reports.metrics.ofTotal', { n: stale }),
      },
      {
        label: t('reports.metrics.disconnected'),
        value: `${pct(disconnected, total)}%`,
        sub: t('reports.metrics.ofTotal', { n: disconnected }),
      },
    ]
  }, [rows, totals, t])

  return (
    <ReportRunner
      title={t('reports.templates.allSolarInverters.title')}
      description={t('reports.templates.allSolarInverters.description')}
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
      csvFilename={`all-solar-inverters-${new Date().toISOString().slice(0, 10)}.csv`}
      emptyMessage={t('reports.empty')}
      canRun={!!groupUuid}
    />
  )
}
