import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { type Column } from '@/components/common/DataTable'
import { useContextStore } from '@/store/context'
import { cn } from '@/utils/cn'
import { ReportRunner } from '../ReportRunner'
import { pct, type ReportMetric } from '../reportMetrics'
import { useAllChargersReport, type ChargerReportRow } from '../useAllChargersReport'
import type { FreshnessStatus } from '../reportFreshness'

const STATUS_CLS: Record<FreshnessStatus, string> = {
  connected: 'bg-light-green text-green',
  stale: 'bg-orange/10 text-orange',
  disconnected: 'bg-red/10 text-red',
}

export function AllChargersReport() {
  const { t } = useTranslation()
  const { groupUuid } = useContextStore()
  const { status, progress, rows, totals, generatedAt, error, run, cancel } = useAllChargersReport(groupUuid)

  const cols: Column<ChargerReportRow>[] = [
    { key: 'addressUuid', header: t('reports.col.address') },
    { key: 'sparkySerial', header: t('reports.col.sparky'), render: (r) => r.sparkySerial ?? '—' },
    { key: 'flintSerial', header: t('reports.col.flint'), render: (r) => r.flintSerial ?? '—' },
    { key: 'brand', header: t('reports.col.brand'), render: (r) => r.brand || '—' },
    { key: 'model', header: t('reports.col.model'), render: (r) => r.model ?? '—' },
    { key: 'year', header: t('reports.col.year'), render: (r) => r.year ?? '—' },
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
    { key: 'activity', header: t('reports.col.charge'), render: (r) => t(`reports.chargeState.${r.activity}`) },
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
    const local = rows.filter((r) => r.connectionType === 'local').length
    const cloud = total - local
    const charging = rows.filter((r) => r.activity === 'charging').length
    return [
      { label: t('reports.metrics.totalChargers'), value: total },
      {
        label: t('reports.metrics.addressCoverageChargers'),
        value: `${pct(totals.addressesWithData, totals.addresses)}%`,
        sub: t('reports.metrics.addressCoverageSub', { covered: totals.addressesWithData, total: totals.addresses }),
      },
      {
        label: t('reports.metrics.distribution'),
        value: `${pct(local, total)}% / ${pct(cloud, total)}%`,
        sub: t('reports.metrics.distributionSub', { local, cloud }),
      },
      { label: t('reports.metrics.connected'), value: `${pct(connected, total)}%`, sub: `${connected} / ${total}` },
      { label: t('reports.metrics.stale'), value: `${pct(stale, total)}%`, sub: `${stale} / ${total}` },
      { label: t('reports.metrics.charging'), value: `${pct(charging, total)}%`, sub: `${charging} / ${total}` },
    ]
  }, [rows, totals, t])

  return (
    <ReportRunner
      title={t('reports.templates.allChargers.title')}
      description={t('reports.templates.allChargers.description')}
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
      csvFilename={`all-chargers-${new Date().toISOString().slice(0, 10)}.csv`}
      emptyMessage={t('reports.emptyChargers')}
      canRun={!!groupUuid}
    />
  )
}
