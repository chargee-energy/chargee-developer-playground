import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { type Column } from '@/components/common/DataTable'
import { useContextStore } from '@/store/context'
import { cn } from '@/utils/cn'
import { ReportRunner } from '../ReportRunner'
import { pct, type ReportMetric } from '../reportMetrics'
import { useAllSolarInvertersReport, type SolarInverterReportRow } from '../useAllSolarInvertersReport'
import { useSolarInverterFilters } from '../useSolarInverterFilters'
import { SolarInverterFilterBar } from '../SolarInverterFilterBar'
import type { ProductionStatus, SparkyStatus } from '../reportSolarStatus'

const STATUS_CLS: Record<ProductionStatus, string> = {
  connected: 'bg-light-green text-green',
  stale: 'bg-orange/10 text-orange',
  disconnected: 'bg-red/10 text-red',
}

const SPARKY_CLS: Record<SparkyStatus, string> = {
  active: 'bg-light-green text-green',
  inactive: 'bg-red/10 text-red',
  none: 'bg-beige-2 text-text-gray',
}

export function AllSolarInvertersReport() {
  const { t } = useTranslation()
  const { groupUuid } = useContextStore()
  const { status, progress, rows, totals, generatedAt, error, run, cancel } = useAllSolarInvertersReport(groupUuid)
  const filters = useSolarInverterFilters(rows)
  const { view } = filters

  const cols: Column<SolarInverterReportRow>[] = [
    { key: 'addressUuid', header: t('reports.col.address') },
    { key: 'sparkySerial', header: t('reports.col.sparky'), render: (r) => r.sparkySerial ?? '—' },
    {
      key: 'sparkyStatus',
      header: t('reports.col.sparkyStatus'),
      render: (r) => (
        <span
          className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-11 font-bold', SPARKY_CLS[r.sparkyStatus])}
          title={r.lastElectricityTime ? new Date(r.lastElectricityTime).toLocaleString() : undefined}
        >
          {t(`reports.sparkyStatus.${r.sparkyStatus}`)}
        </span>
      ),
    },
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

  // Tiles recount for the filtered view. The inverter/address counts describe the
  // connected (working) subset — the pool that can actually be curtailed.
  const metrics: ReportMetric[] = useMemo(() => {
    const total = view.length
    const connectedRows = view.filter((r) => r.productionStatus === 'connected')
    const connected = connectedRows.length
    const stale = view.filter((r) => r.productionStatus === 'stale').length
    const disconnected = view.filter((r) => r.productionStatus === 'disconnected').length
    const local = view.filter((r) => r.connectionType === 'local').length
    const cloud = total - local
    const localConnected = connectedRows.filter((r) => r.connectionType === 'local').length
    const cloudConnected = connected - localConnected
    const down = stale + disconnected
    const localDown = view.filter(
      (r) => r.connectionType === 'local' && (r.productionStatus === 'stale' || r.productionStatus === 'disconnected'),
    ).length
    const cloudDown = down - localDown
    const connectedAddresses = new Set(connectedRows.map((r) => r.addressUuid)).size
    // Row 1: Local & connected · Connected inverters · Stale & disconnected inverters
    // Row 2: Addresses with connected inverters · Local vs Cloud · Stale/Disconnected %
    return [
      {
        label: t('reports.metrics.localConnected'),
        value: localConnected,
        sub: t('reports.metrics.localConnectedSub', { pct: pct(localConnected, total) }),
      },
      {
        label: t('reports.metrics.connectedInverters'),
        value: connected,
        sub: t('reports.metrics.connectedInvertersSub', { local: localConnected, cloud: cloudConnected }),
      },
      {
        label: t('reports.metrics.staleDisconnectedInverters'),
        value: down,
        sub: t('reports.metrics.connectedInvertersSub', { local: localDown, cloud: cloudDown }),
      },
      {
        label: t('reports.metrics.addressCoverage'),
        value: `${pct(connectedAddresses, totals.addresses)}%`,
        sub: t('reports.metrics.addressCoverageSub', { covered: connectedAddresses, total: totals.addresses }),
      },
      {
        label: t('reports.metrics.distribution'),
        value: `${pct(local, total)}% / ${pct(cloud, total)}%`,
        sub: t('reports.metrics.distributionSub', { local, cloud }),
      },
      {
        label: t('reports.metrics.staleDisconnected'),
        value: `${pct(stale, total)}% / ${pct(disconnected, total)}%`,
        sub: t('reports.metrics.staleDisconnectedSub', { stale, disconnected }),
      },
    ]
  }, [view, totals, t])

  return (
    <ReportRunner
      title={t('reports.templates.allSolarInverters.title')}
      description={t('reports.templates.allSolarInverters.description')}
      status={status}
      progress={progress}
      rows={view}
      generatedAt={generatedAt}
      error={error}
      onRun={run}
      onCancel={cancel}
      columns={cols}
      rowKey={(r, i) => `${r.addressUuid}-${r.identifier}-${i}`}
      metrics={metrics}
      csvFilename={`all-solar-inverters-${new Date().toISOString().slice(0, 10)}.csv`}
      emptyMessage={rows.length ? t('reports.filters.noMatches') : t('reports.empty')}
      canRun={!!groupUuid}
      tableToolbar={rows.length > 0 ? <SolarInverterFilterBar filters={filters} /> : undefined}
    />
  )
}
