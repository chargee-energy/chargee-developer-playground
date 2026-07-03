import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { type Column } from '@/components/common/DataTable'
import { useContextStore } from '@/store/context'
import { cn } from '@/utils/cn'
import { ReportRunner, pct, type ReportMetric } from '../ReportRunner'
import { useAllHvacsReport, type HvacReportRow } from '../useAllHvacsReport'
import type { FreshnessStatus } from '../reportFreshness'

const STATUS_CLS: Record<FreshnessStatus, string> = {
  connected: 'bg-light-green text-green',
  stale: 'bg-orange/10 text-orange',
  disconnected: 'bg-red/10 text-red',
}

export function AllHvacsReport() {
  const { t } = useTranslation()
  const { groupUuid } = useContextStore()
  const { status, progress, rows, totals, generatedAt, error, run, cancel } = useAllHvacsReport(groupUuid)

  const cols: Column<HvacReportRow>[] = [
    { key: 'addressUuid', header: t('reports.col.address') },
    { key: 'sparkySerial', header: t('reports.col.sparky'), render: (r) => r.sparkySerial ?? '—' },
    { key: 'flintSerial', header: t('reports.col.flint'), render: (r) => r.flintSerial ?? '—' },
    { key: 'brand', header: t('reports.col.brand'), render: (r) => r.brand || '—' },
    { key: 'model', header: t('reports.col.model'), render: (r) => r.model ?? '—' },
    { key: 'category', header: t('reports.col.category'), render: (r) => r.category ?? '—' },
    {
      key: 'currentTemperature',
      header: t('reports.col.temperature'),
      render: (r) => (r.currentTemperature != null ? `${r.currentTemperature}°C` : '—'),
    },
    {
      key: 'isActive',
      header: t('reports.col.activity'),
      render: (r) => (r.isActive == null ? '—' : t(r.isActive ? 'reports.hvacState.active' : 'reports.hvacState.idle')),
    },
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
    const active = rows.filter((r) => r.isActive === true).length
    return [
      { label: t('reports.metrics.totalHvacs'), value: total },
      {
        label: t('reports.metrics.addressCoverageHvacs'),
        value: `${pct(totals.addressesWithData, totals.addresses)}%`,
        sub: t('reports.metrics.addressCoverageSub', { covered: totals.addressesWithData, total: totals.addresses }),
      },
      { label: t('reports.metrics.connected'), value: `${pct(connected, total)}%`, sub: `${connected} / ${total}` },
      { label: t('reports.metrics.stale'), value: `${pct(stale, total)}%`, sub: `${stale} / ${total}` },
      { label: t('reports.metrics.disconnected'), value: `${pct(disconnected, total)}%`, sub: `${disconnected} / ${total}` },
      { label: t('reports.metrics.active'), value: `${pct(active, total)}%`, sub: `${active} / ${total}` },
    ]
  }, [rows, totals, t])

  return (
    <ReportRunner
      title={t('reports.templates.allHvacs.title')}
      description={t('reports.templates.allHvacs.description')}
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
      csvFilename={`all-hvacs-${new Date().toISOString().slice(0, 10)}.csv`}
      emptyMessage={t('reports.emptyHvacs')}
      canRun={!!groupUuid}
    />
  )
}
