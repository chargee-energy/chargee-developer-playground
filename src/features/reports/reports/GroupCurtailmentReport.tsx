import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { CodeBracketIcon } from '@heroicons/react/24/outline'
import { type Column } from '@/components/common/DataTable'
import { ApiInspector } from '@/components/common/ApiInspector'
import { Spinner } from '@/components/common/Spinner'
import { useContextStore } from '@/store/context'
import { cn } from '@/utils/cn'
import { fmtDateTime, fmtNumber, todayISO } from '@/utils/format'
import { type SeriesDef } from '@/features/telemetry/TimeSeriesChart'
import { ReportRunner } from '../ReportRunner'
import { type ReportMetric } from '../reportMetrics'
import {
  useGroupCurtailmentReport,
  type CurtailmentPeriodRow,
  type CurtailmentTargetType,
} from '../useGroupCurtailmentReport'
import { computeCurtailmentImpact } from '../curtailmentImpact'
import { CurtailmentChart } from './CurtailmentChart'

type DateMode = 'single' | 'range'

const TYPE_CLS: Record<CurtailmentTargetType, string> = {
  group: 'bg-light-purple-3 text-dark-purple',
  address: 'bg-light-green text-green',
  inverter: 'bg-orange/10 text-orange',
  none: 'bg-beige-2 text-text-gray',
}

const BLOCK_MS = 15 * 60 * 1000
const DETAIL_PAD_MS = 15 * 60 * 1000 // 15 min of context on each side of a block

function ImpactTile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-2xl border p-4', accent ? 'border-dark-purple/20 bg-light-purple-3/40' : 'border-beige-2 bg-white')}>
      <p className="text-11 font-bold uppercase tracking-wide text-text-gray">{label}</p>
      <p className="mt-1 text-24 font-extrabold leading-tight text-dark-blue">{value}</p>
      {sub && <p className="mt-0.5 text-11 text-text-gray">{sub}</p>}
    </div>
  )
}

/** Human-readable minutes, e.g. "1h 30m" / "45m" / "—". */
function fmtDuration(minutes: number | null): string {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function GroupCurtailmentReport() {
  const { t } = useTranslation()
  const { groupUuid } = useContextStore()

  const [mode, setMode] = useState<DateMode>('single')
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [inspectorOpen, setInspectorOpen] = useState(false)

  const range = useMemo(() => {
    if (mode === 'single') return { from, to: from }
    return from <= to ? { from, to } : { from: to, to: from }
  }, [mode, from, to])

  const {
    status,
    progress,
    truncated,
    rows,
    totals,
    minutes,
    curtailSpan,
    fetchWindow,
    generatedAt,
    error,
    run,
    cancel,
    detail,
    detailLoading,
    loadDetail,
  } = useGroupCurtailmentReport(groupUuid, range)

  const cols: Column<CurtailmentPeriodRow>[] = [
    { key: 'start', header: t('reports.curtailment.col.start'), render: (r) => fmtDateTime(r.start) },
    {
      key: 'end',
      header: t('reports.curtailment.col.end'),
      render: (r) => (r.end ? fmtDateTime(r.end) : t('reports.curtailment.ongoing')),
    },
    {
      key: 'durationMinutes',
      header: t('reports.curtailment.col.duration'),
      render: (r) => fmtDuration(r.durationMinutes),
    },
    {
      key: 'targetType',
      header: t('reports.curtailment.col.type'),
      render: (r) => (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-11 font-bold', TYPE_CLS[r.targetType])}>
          {t(`reports.curtailment.type.${r.targetType}`)}
        </span>
      ),
    },
    {
      key: 'target',
      header: t('reports.curtailment.col.target'),
      render: (r) => (r.isCurtailment ? r.target : t('reports.curtailment.noLimit')),
    },
  ]

  const metrics: ReportMetric[] = useMemo(() => {
    const curtailmentPeriods = rows.filter((r) => r.isCurtailment).length
    const hours = Math.floor(totals.curtailedMinutes / 60)
    const mins = totals.curtailedMinutes % 60
    return [
      { label: t('reports.curtailment.metrics.curtailmentPeriods'), value: curtailmentPeriods },
      {
        label: t('reports.curtailment.metrics.curtailedTime'),
        value: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
      },
      { label: t('reports.curtailment.metrics.totalSchedules'), value: totals.schedules },
    ]
  }, [rows, totals, t])

  const chartSeries: SeriesDef[] = [
    { key: 'solarProduction', name: t('reports.curtailment.series.solarProduction'), color: '#6245DE' },
    { key: 'delivery', name: t('reports.curtailment.series.delivery'), color: '#FF8500' },
    { key: 'return', name: t('reports.curtailment.series.return'), color: '#16B364' },
    { key: 'steerablePowerZeroExport', name: t('reports.curtailment.series.steerable'), color: '#9C87F8' },
  ]

  const span = useMemo(
    () => (curtailSpan ? { start: new Date(curtailSpan.start).getTime(), end: new Date(curtailSpan.end).getTime() } : null),
    [curtailSpan],
  )
  const window = useMemo(
    () => (fetchWindow ? { start: new Date(fetchWindow.start).getTime(), end: new Date(fetchWindow.end).getTime() } : null),
    [fetchWindow],
  )

  // One shaded band per actual curtailment period (ongoing → clamp to window end).
  const bands = useMemo(() => {
    const end = window?.end ?? 0
    return rows
      .filter((r) => r.isCurtailment)
      .map((r) => ({ start: new Date(r.start).getTime(), end: r.end ? new Date(r.end).getTime() : end }))
  }, [rows, window])

  const counts = useMemo(() => {
    if (minutes.length === 0) return { inverters: 0, meters: 0 }
    return {
      inverters: Math.max(...minutes.map((m) => m.solarInverterCount)),
      meters: Math.max(...minutes.map((m) => m.smartMeterCount)),
    }
  }, [minutes])

  // Curtailment impact: factual energy integrals + estimated counterfactual.
  const { impact, overviewData } = useMemo(() => {
    const { impact, potentialByT } = computeCurtailmentImpact(minutes, bands)
    const overviewData = minutes.map((m) => ({ ...m, potential: potentialByT.get(m.t) }))
    return { impact, overviewData }
  }, [minutes, bands])

  // 15-min detail block, aligned to :00/:15/:30/:45 so chips match the dropdown.
  const alignBlock = (ms: number) => Math.floor(ms / BLOCK_MS) * BLOCK_MS
  const startBlock = span ? alignBlock(span.start) : null
  const endBlock = span ? alignBlock(span.end) : null

  const [blockStart, setBlockStart] = useState<number | null>(null)
  useEffect(() => {
    setBlockStart(startBlock)
  }, [startBlock])

  const multiDay = range.from !== range.to
  const timeLabel = (ms: number) => format(new Date(ms), multiDay ? 'd MMM HH:mm' : 'HH:mm')

  const blockOptions = useMemo(() => {
    if (!window) return [] as number[]
    const opts: number[] = []
    const first = Math.ceil(window.start / BLOCK_MS) * BLOCK_MS
    for (let ms = first; ms + BLOCK_MS <= window.end + 1; ms += BLOCK_MS) opts.push(ms)
    return opts
  }, [window])

  const detailDomain = useMemo<[number, number] | null>(
    () => (blockStart == null ? null : [blockStart - DETAIL_PAD_MS, blockStart + BLOCK_MS + DETAIL_PAD_MS]),
    [blockStart],
  )

  // Fetch the raw detail slice on demand whenever the selected block changes.
  const detailFrom = detailDomain?.[0]
  const detailTo = detailDomain?.[1]
  useEffect(() => {
    if (status === 'done' && detailFrom != null && detailTo != null) loadDetail(detailFrom, detailTo)
  }, [status, detailFrom, detailTo, loadDetail])

  const filters = (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="label">{t('reports.curtailment.dateMode')}</label>
          <div className="inline-flex overflow-hidden rounded-xl border border-beige-2">
            {(['single', 'range'] as DateMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  'px-3 py-1.5 text-13 font-semibold transition-colors',
                  mode === m ? 'bg-dark-purple text-white' : 'bg-white text-text-gray hover:bg-beige/60',
                )}
              >
                {t(`reports.curtailment.mode.${m}`)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">{mode === 'single' ? t('reports.curtailment.date') : t('reports.curtailment.from')}</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        {mode === 'range' && (
          <div>
            <label className="label">{t('reports.curtailment.to')}</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        )}
        <button className="btn-secondary ml-auto" onClick={() => setInspectorOpen(true)}>
          <CodeBracketIcon className="size-4" />
          {t('common.viewRaw')}
        </button>
      </div>
      <p className="text-11 text-text-gray">{t('reports.curtailment.groupHint')}</p>
    </div>
  )

  const showTimeline = status === 'done' && minutes.length > 0 && window

  return (
    <div className="space-y-5">
      <ReportRunner
        title={t('reports.templates.groupCurtailment.title')}
        description={t('reports.templates.groupCurtailment.description')}
        status={status}
        progress={progress}
        rows={rows}
        generatedAt={generatedAt}
        error={error}
        onRun={run}
        onCancel={cancel}
        columns={cols}
        rowKey={(r, i) => `${r.scheduleUuid}-${i}`}
        metrics={metrics}
        csvFilename={`group-curtailment-${range.from}${range.to !== range.from ? `_${range.to}` : ''}.csv`}
        emptyMessage={t('reports.curtailment.empty')}
        canRun={!!groupUuid}
        filters={filters}
        progressText={t('reports.curtailment.fetching', { done: progress.done, total: progress.total })}
      />

      {showTimeline && (
        <>
          {truncated && (
            <div className="card border-orange/30 bg-orange/5 p-4 text-13 text-dark-blue">
              {t('reports.curtailment.truncated')}
            </div>
          )}

          {/* Curtailment impact — facts (energy) + estimated counterfactual. */}
          <div className="card space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-dark-blue">{t('reports.curtailment.impact.title')}</p>
              {impact.confidence !== 'none' && (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-1 text-11 font-bold',
                    impact.confidence === 'high' ? 'bg-light-green text-green' : 'bg-orange/10 text-orange',
                  )}
                >
                  {t(`reports.curtailment.impact.confidence.${impact.confidence}`)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {impact.confidence !== 'none' && (
                <>
                  <ImpactTile
                    label={t('reports.curtailment.impact.curtailed')}
                    value={`${fmtNumber(impact.curtailedKwh, 1)} kWh`}
                    sub={t('reports.curtailment.impact.estimated')}
                    accent
                  />
                  <ImpactTile
                    label={t('reports.curtailment.impact.reduction')}
                    value={`${fmtNumber(impact.curtailedPct, 0)}%`}
                    sub={t('reports.curtailment.impact.estimated')}
                    accent
                  />
                  <ImpactTile
                    label={t('reports.curtailment.impact.peakShaved')}
                    value={`${fmtNumber(impact.peakShavedW, 0)} W`}
                    sub={t('reports.curtailment.impact.estimated')}
                    accent
                  />
                </>
              )}
              <ImpactTile label={t('reports.curtailment.impact.produced')} value={`${fmtNumber(impact.producedKwh, 1)} kWh`} />
              <ImpactTile label={t('reports.curtailment.impact.exported')} value={`${fmtNumber(impact.exportedKwh, 1)} kWh`} />
              <ImpactTile label={t('reports.curtailment.impact.imported')} value={`${fmtNumber(impact.importedKwh, 1)} kWh`} />
            </div>
            <p className="text-11 text-text-gray">
              {impact.confidence === 'none'
                ? t('reports.curtailment.impact.noEstimate')
                : impact.confidence === 'low'
                  ? t('reports.curtailment.impact.lowNote')
                  : t('reports.curtailment.impact.estimateNote')}
            </p>
          </div>

          {/* Day overview — per-minute averages + solar min/max band, curtailment shaded. */}
          <div className="card space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-dark-blue">{t('reports.curtailment.overview.title')}</p>
                <p className="mt-1 text-13 text-text-gray">
                  {t('reports.curtailment.overview.subtitle', {
                    from: fmtDateTime(fetchWindow!.start),
                    to: fmtDateTime(fetchWindow!.end),
                  })}
                </p>
              </div>
              <div className="flex gap-2 text-11 font-semibold">
                <span className="rounded-full bg-light-purple-3 px-2.5 py-1 text-dark-purple">
                  {t('reports.curtailment.timeline.inverters', { n: counts.inverters })}
                </span>
                <span className="rounded-full bg-beige-2 px-2.5 py-1 text-text-gray">
                  {t('reports.curtailment.timeline.meters', { n: counts.meters })}
                </span>
              </div>
            </div>
            <CurtailmentChart
              data={overviewData}
              domain={[window!.start, window!.end]}
              bands={bands}
              series={chartSeries}
              dashed={
                impact.confidence !== 'none'
                  ? [{ key: 'potential', name: t('reports.curtailment.series.potential'), color: '#DB2777' }]
                  : undefined
              }
              range={{ key: 'solarBand', name: t('reports.curtailment.series.solarRange'), color: '#6245DE' }}
              unit="W"
              height={300}
            />
            <p className="text-11 text-text-gray">{t('reports.curtailment.overview.hint')}</p>
          </div>

          {/* Detail — 15-min block ±15 min context, raw 1s resolution, fetched on demand. */}
          <div className="card space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-dark-blue">{t('reports.curtailment.detail.title')}</p>
              <div className="flex flex-wrap items-center gap-2">
                {startBlock != null && (
                  <button
                    onClick={() => setBlockStart(startBlock)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-13 font-semibold transition-colors',
                      blockStart === startBlock ? 'bg-dark-purple text-white' : 'bg-beige-2 text-text-gray hover:bg-beige/60',
                    )}
                  >
                    {t('reports.curtailment.detail.startBlock')}
                  </button>
                )}
                {endBlock != null && (
                  <button
                    onClick={() => setBlockStart(endBlock)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-13 font-semibold transition-colors',
                      blockStart === endBlock ? 'bg-dark-purple text-white' : 'bg-beige-2 text-text-gray hover:bg-beige/60',
                    )}
                  >
                    {t('reports.curtailment.detail.endBlock')}
                  </button>
                )}
                <select
                  className="input py-1.5"
                  value={blockStart ?? ''}
                  onChange={(e) => setBlockStart(Number(e.target.value))}
                >
                  {blockOptions.map((ms) => (
                    <option key={ms} value={ms}>
                      {timeLabel(ms)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {detailDomain && (
              <p className="text-13 text-text-gray">
                {t('reports.curtailment.detail.window', {
                  from: timeLabel(detailDomain[0]),
                  to: timeLabel(detailDomain[1]),
                })}
              </p>
            )}
            {detailLoading ? (
              <div className="flex items-center justify-center gap-3 py-16 text-sm text-text-gray">
                <Spinner />
                <span>{t('reports.curtailment.detail.loading')}</span>
              </div>
            ) : detailDomain && detail.length > 0 ? (
              <CurtailmentChart
                data={detail}
                domain={detailDomain}
                bands={bands}
                series={chartSeries}
                unit="W"
                height={300}
                withSeconds
              />
            ) : (
              <p className="py-8 text-center text-sm text-text-gray">{t('reports.curtailment.detail.empty')}</p>
            )}
          </div>
        </>
      )}

      <ApiInspector
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        primary={{ method: 'GET', url: `/api/v2/groups/${groupUuid ?? ''}/flex/aggregation` }}
      />
    </div>
  )
}
