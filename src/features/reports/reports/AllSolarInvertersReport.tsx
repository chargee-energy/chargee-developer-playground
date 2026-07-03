import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowPathIcon, ArrowDownTrayIcon, StopIcon } from '@heroicons/react/24/outline'
import { DataTable, type Column } from '@/components/common/DataTable'
import { Spinner } from '@/components/common/Spinner'
import { useContextStore } from '@/store/context'
import { downloadCsv } from '@/utils/csv'
import { cn } from '@/utils/cn'
import { useAllSolarInvertersReport, type SolarInverterReportRow } from '../useAllSolarInvertersReport'
import type { ProductionStatus } from '../reportSolarStatus'

const STATUS_CLS: Record<ProductionStatus, string> = {
  connected: 'bg-light-green text-green',
  stale: 'bg-orange/10 text-orange',
  disconnected: 'bg-red/10 text-red',
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

function MetricCard({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-beige-2 bg-white p-4">
      <p className="text-11 font-bold uppercase tracking-wide text-text-gray">{label}</p>
      <p className="mt-1 text-28 font-extrabold leading-tight text-dark-blue">{value}</p>
      {sub && <p className="mt-0.5 text-13 text-text-gray">{sub}</p>}
    </div>
  )
}

export function AllSolarInvertersReport() {
  const { t } = useTranslation()
  const { groupUuid } = useContextStore()
  const { status, progress, rows, totals, generatedAt, error, run, cancel } = useAllSolarInvertersReport(groupUuid)

  const running = status === 'running'
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const metrics = useMemo(() => {
    const total = rows.length
    const connected = rows.filter((r) => r.productionStatus === 'connected').length
    const stale = rows.filter((r) => r.productionStatus === 'stale').length
    const disconnected = rows.filter((r) => r.productionStatus === 'disconnected').length
    const local = rows.filter((r) => r.connectionType === 'local').length
    const cloud = total - local
    return { total, connected, stale, disconnected, local, cloud }
  }, [rows])

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

  const handleDownload = () => {
    downloadCsv(`all-solar-inverters-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-dark-blue">{t('reports.templates.allSolarInverters.title')}</p>
          <p className="mt-1 text-13 text-text-gray">{t('reports.templates.allSolarInverters.description')}</p>
          {generatedAt && !running && (
            <p className="mt-1 text-11 text-text-gray">
              {t('reports.generatedAt', { time: new Date(generatedAt).toLocaleString() })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {running ? (
            <button className="btn-secondary" onClick={cancel}>
              <StopIcon className="size-4" />
              {t('reports.cancel')}
            </button>
          ) : (
            <button className="btn-primary" onClick={run} disabled={!groupUuid}>
              <ArrowPathIcon className="size-4" />
              {status === 'done' || status === 'cancelled' ? t('reports.regenerate') : t('reports.generate')}
            </button>
          )}
          <button className="btn-secondary" onClick={handleDownload} disabled={rows.length === 0}>
            <ArrowDownTrayIcon className="size-4" />
            {t('reports.downloadCsv')}
          </button>
        </div>
      </div>

      {running && (
        <div className="card space-y-3 p-5">
          <div className="flex items-center gap-3 text-sm text-text-gray">
            <Spinner />
            <span>
              {t('reports.progress', { done: progress.done, total: progress.total })}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-beige-2">
            <div className="h-full rounded-full bg-dark-purple transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="card p-5 text-sm font-semibold text-red">
          {(error as any)?.response?.data?.message || (error as any)?.message || t('common.error')}
        </div>
      )}

      {(status === 'done' || status === 'cancelled') && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricCard label={t('reports.metrics.total')} value={metrics.total} />
          <MetricCard
            label={t('reports.metrics.addressCoverage')}
            value={`${pct(totals.addressesWithInverters, totals.addresses)}%`}
            sub={t('reports.metrics.addressCoverageSub', {
              covered: totals.addressesWithInverters,
              total: totals.addresses,
            })}
          />
          <MetricCard
            label={t('reports.metrics.distribution')}
            value={`${pct(metrics.local, metrics.total)}% / ${pct(metrics.cloud, metrics.total)}%`}
            sub={t('reports.metrics.distributionSub', { local: metrics.local, cloud: metrics.cloud })}
          />
          <MetricCard
            label={t('reports.metrics.working')}
            value={`${pct(metrics.connected, metrics.total)}%`}
            sub={t('reports.metrics.ofTotal', { n: metrics.connected })}
          />
          <MetricCard
            label={t('reports.metrics.stale')}
            value={`${pct(metrics.stale, metrics.total)}%`}
            sub={t('reports.metrics.ofTotal', { n: metrics.stale })}
          />
          <MetricCard
            label={t('reports.metrics.disconnected')}
            value={`${pct(metrics.disconnected, metrics.total)}%`}
            sub={t('reports.metrics.ofTotal', { n: metrics.disconnected })}
          />
        </div>
      )}

      {(status === 'done' || status === 'cancelled') && (
        <div className="card p-5">
          <p className="mb-3 text-13 text-text-gray">{t('reports.resultCount', { n: rows.length })}</p>
          {rows.length > 0 ? (
            <DataTable rows={rows} columns={cols} rowKey={(r, i) => `${r.addressUuid}-${r.identifier}-${i}`} />
          ) : (
            <p className="py-8 text-center text-sm text-text-gray">{t('reports.empty')}</p>
          )}
        </div>
      )}
    </div>
  )
}
