import { useTranslation } from 'react-i18next'
import { ArrowPathIcon, ArrowDownTrayIcon, StopIcon } from '@heroicons/react/24/outline'
import { DataTable, type Column } from '@/components/common/DataTable'
import { Spinner } from '@/components/common/Spinner'
import { downloadCsv } from '@/utils/csv'
import type { ReportStatus } from './useAddressReport'
import type { ReportMetric } from './reportMetrics'

function MetricCard({ label, value, sub }: ReportMetric) {
  return (
    <div className="rounded-2xl border border-beige-2 bg-white p-4">
      <p className="text-11 font-bold uppercase tracking-wide text-text-gray">{label}</p>
      <p className="mt-1 text-28 font-extrabold leading-tight text-dark-blue">{value}</p>
      {sub && <p className="mt-0.5 text-13 text-text-gray">{sub}</p>}
    </div>
  )
}

interface ReportRunnerProps<TRow> {
  title: string
  description: string
  status: ReportStatus
  progress: { done: number; total: number }
  rows: TRow[]
  generatedAt: string | null
  error: unknown
  onRun: () => void
  onCancel: () => void
  columns: Column<TRow>[]
  rowKey: (row: TRow, i: number) => string
  metrics?: ReportMetric[]
  csvFilename: string
  emptyMessage: string
  /** Disable the generate button (e.g. no group selected). */
  canRun?: boolean
}

/**
 * Shared shell for a group-wide report: a header with generate/cancel/download
 * controls, a progress bar while running, a key-metrics grid, and the results
 * table. Report-specific pieces (columns, metrics) are supplied by the caller.
 */
export function ReportRunner<TRow extends Record<string, any>>({
  title,
  description,
  status,
  progress,
  rows,
  generatedAt,
  error,
  onRun,
  onCancel,
  columns,
  rowKey,
  metrics,
  csvFilename,
  emptyMessage,
  canRun = true,
}: ReportRunnerProps<TRow>) {
  const { t } = useTranslation()

  const running = status === 'running'
  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const finished = status === 'done' || status === 'cancelled'

  return (
    <div className="space-y-5">
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-dark-blue">{title}</p>
          <p className="mt-1 text-13 text-text-gray">{description}</p>
          {generatedAt && !running && (
            <p className="mt-1 text-11 text-text-gray">
              {t('reports.generatedAt', { time: new Date(generatedAt).toLocaleString() })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {running ? (
            <button className="btn-secondary" onClick={onCancel}>
              <StopIcon className="size-4" />
              {t('reports.cancel')}
            </button>
          ) : (
            <button className="btn-primary" onClick={onRun} disabled={!canRun}>
              <ArrowPathIcon className="size-4" />
              {finished ? t('reports.regenerate') : t('reports.generate')}
            </button>
          )}
          <button className="btn-secondary" onClick={() => downloadCsv(csvFilename, rows)} disabled={rows.length === 0}>
            <ArrowDownTrayIcon className="size-4" />
            {t('reports.downloadCsv')}
          </button>
        </div>
      </div>

      {running && (
        <div className="card space-y-3 p-5">
          <div className="flex items-center gap-3 text-sm text-text-gray">
            <Spinner />
            <span>{t('reports.progress', { done: progress.done, total: progress.total })}</span>
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

      {finished && rows.length > 0 && metrics && metrics.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {metrics.map((m, i) => (
            <MetricCard key={i} label={m.label} value={m.value} sub={m.sub} />
          ))}
        </div>
      )}

      {finished && (
        <div className="card p-5">
          <p className="mb-3 text-13 text-text-gray">{t('reports.resultCount', { n: rows.length })}</p>
          {rows.length > 0 ? (
            <DataTable rows={rows} columns={columns} rowKey={rowKey} />
          ) : (
            <p className="py-8 text-center text-sm text-text-gray">{emptyMessage}</p>
          )}
        </div>
      )}
    </div>
  )
}
