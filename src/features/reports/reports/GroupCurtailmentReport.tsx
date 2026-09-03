import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { ArrowDownTrayIcon, CodeBracketIcon } from '@heroicons/react/24/outline'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ApiInspector } from '@/components/common/ApiInspector'
import { Spinner } from '@/components/common/Spinner'
import { useContextStore } from '@/store/context'
import { cn } from '@/utils/cn'
import { fmtDate, fmtDateTime, fmtNumber, todayISO } from '@/utils/format'
import { downloadCsv } from '@/utils/csv'
import { type SeriesDef } from '@/features/telemetry/TimeSeriesChart'
import { ReportRunner } from '../ReportRunner'
import { type ReportMetric } from '../reportMetrics'
import {
  useGroupCurtailmentReport,
  type CurtailmentPeriodRow,
  type CurtailmentSource,
  type CurtailmentTargetType,
  type IsoSpan,
} from '../useGroupCurtailmentReport'
import { computeCurtailmentImpact } from '../curtailmentImpact'
import { PDF_HIDE_ATTR } from '../curtailmentReportPdf'
import { loadSparkyDisconnections, type InverterCoverage } from '../groupProduction'
import { CurtailmentChart } from './CurtailmentChart'

type DateMode = 'single' | 'range'

const TYPE_CLS: Record<CurtailmentTargetType, string> = {
  group: 'bg-light-purple-3 text-dark-purple',
  address: 'bg-light-green text-green',
  inverter: 'bg-orange/10 text-orange',
  zeroExport: 'bg-dark-blue/10 text-dark-blue',
  none: 'bg-beige-2 text-text-gray',
}

const SOURCE_CLS: Record<CurtailmentSource, string> = {
  group: 'bg-light-purple-3 text-dark-purple',
  flex: 'bg-orange/10 text-orange',
  schedule: 'bg-orange/10 text-orange',
}

/** Individual curtailment is shaded in the same orange as its badges. */
const INDIVIDUAL_BAND_COLOR = '#FF8500'

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

/** Energy value with a fixed 1 decimal so tiles line up (12.0 kWh, not 12 kWh). */
const fmtKwh = (v: number) =>
  `${v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`

const toMsSpans = (spans: IsoSpan[]) =>
  spans.map((s) => ({ start: new Date(s.start).getTime(), end: new Date(s.end).getTime() }))

/** Human-readable minutes, e.g. "1h 30m" / "45m" / "—". */
function fmtDuration(minutes: number | null): string {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function GroupCurtailmentReport() {
  const { t, i18n } = useTranslation()
  const { groupUuid, groupName } = useContextStore()

  const [mode, setMode] = useState<DateMode>('single')
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [includeIndividual, setIncludeIndividual] = useState(false)
  const [showTelemetry, setShowTelemetry] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [sparky, setSparky] = useState<{ checked: boolean; disconnected: Map<string, string | null> }>({
    checked: false,
    disconnected: new Map(),
  })
  const [sparkyBusy, setSparkyBusy] = useState<{ done: number; total: number } | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const captureRef = useRef<HTMLDivElement>(null)

  const range = useMemo(() => {
    if (mode === 'single') return { from, to: from }
    return from <= to ? { from, to } : { from: to, to: from }
  }, [mode, from, to])

  const {
    status,
    progress,
    phase,
    truncated,
    rows,
    totals,
    minutes,
    curtailSpan,
    fetchWindow,
    groupBands,
    individualBands,
    standingBands,
    generatedAt,
    error,
    run,
    cancel,
    telemetrySource,
    coverage,
    funnel,
    detail,
    detailLoading,
    detailProgress,
    loadDetail,
  } = useGroupCurtailmentReport(groupUuid, range, { includeIndividual, showTelemetry })

  // Source/scope columns only carry information once individual schedules are in.
  const cols: Column<CurtailmentPeriodRow>[] = useMemo(() => {
    const base: Column<CurtailmentPeriodRow>[] = [
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
    if (!includeIndividual) return base
    return [
      ...base,
      {
        key: 'source',
        header: t('reports.curtailment.col.source'),
        render: (r) => (
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-11 font-bold', SOURCE_CLS[r.source])}>
            {t(`reports.curtailment.source.${r.source}`)}
          </span>
        ),
      },
      {
        key: 'inverters',
        header: t('reports.curtailment.col.scope'),
        render: (r) =>
          r.inverters == null
            ? t('reports.curtailment.scope.wholeGroup')
            : t('reports.curtailment.scope.inverters', { inverters: r.inverters, addresses: r.addresses ?? 0 }),
      },
    ]
  }, [includeIndividual, t])

  const metrics: ReportMetric[] = useMemo(() => {
    const curtailmentPeriods = rows.filter((r) => r.isCurtailment).length
    const base: ReportMetric[] = [
      { label: t('reports.curtailment.metrics.curtailmentPeriods'), value: curtailmentPeriods },
      {
        label: t('reports.curtailment.metrics.curtailedTime'),
        value: fmtDuration(totals.curtailedMinutes),
        // A limit left on since last month would otherwise read as a full day.
        sub:
          totals.standingMinutes > 0
            ? t('reports.curtailment.metrics.standingNote', { duration: fmtDuration(totals.standingMinutes) })
            : undefined,
      },
      { label: t('reports.curtailment.metrics.totalSchedules'), value: totals.schedules },
    ]
    if (!includeIndividual) return base
    return [
      ...base,
      {
        label: t('reports.curtailment.metrics.individualSchedules'),
        value: totals.individualSchedules,
        sub: t('reports.curtailment.metrics.individualSchedulesSub', {
          inverters: totals.invertersScanned,
          addresses: totals.addressesScanned,
        }),
      },
    ]
  }, [rows, totals, includeIndividual, t])

  const fromInverters = telemetrySource === 'inverters'
  const chartSeries: SeriesDef[] = fromInverters
    ? [{ key: 'solarProduction', name: t('reports.curtailment.series.solarProduction'), color: '#6245DE' }]
    : [
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

  // Shaded curtailment windows, already merged and clamped by the hook. Group and
  // individual stay separate so the chart can tell the two scopes apart.
  const groupMs = useMemo(() => toMsSpans(groupBands), [groupBands])
  const individualMs = useMemo(() => toMsSpans(individualBands), [individualBands])
  const standingMs = useMemo(() => toMsSpans(standingBands), [standingBands])
  // Standing limits are deliberately excluded from the impact estimate: they cover
  // the whole window, which would leave no uncurtailed daylight to anchor the
  // clear-sky counterfactual and collapse confidence to 'none'.
  const impactBands = useMemo(() => [...groupMs, ...individualMs], [groupMs, individualMs])

  const counts = useMemo(() => {
    if (minutes.length === 0) return { inverters: 0, meters: 0 }
    return {
      // On the inverter-sum path count distinct reporters across the window: the
      // per-point count is per 15-min slot, so a max understates any inverter that
      // reported in some slots but not others.
      inverters:
        coverage.length > 0
          ? coverage.filter((c) => c.intervals > 0).length
          : Math.max(...minutes.map((m) => m.solarInverterCount)),
      meters: Math.max(...minutes.map((m) => m.smartMeterCount)),
    }
  }, [minutes, coverage])

  // Inverters that were asked for production but returned nothing for the window.
  // Curtailed-but-silent first: those are the ones whose effect you can't verify.
  const silent = useMemo(
    () =>
      coverage
        .filter((c) => c.intervals === 0)
        .sort((a, b) => Number(b.curtailed) - Number(a.curtailed)),
    [coverage],
  )
  const silentCurtailed = useMemo(() => silent.filter((c) => c.curtailed).length, [silent])
  const curtailedTotal = useMemo(() => coverage.filter((c) => c.curtailed).length, [coverage])
  const coverageCols: Column<InverterCoverage>[] = useMemo(
    () => [
      { key: 'inverterId', header: t('reports.curtailment.coverage.col.inverter'), render: (c) => c.ref.inverterId },
      { key: 'addressUuid', header: t('reports.curtailment.coverage.col.address'), render: (c) => c.ref.addressUuid },
      {
        key: 'device',
        header: t('reports.curtailment.coverage.col.device'),
        render: (c) => [c.ref.brand, c.ref.model].filter(Boolean).join(' ') || '—',
      },
      {
        key: 'connection',
        header: t('reports.curtailment.coverage.col.connection'),
        render: (c) => t(`reports.curtailment.coverage.connection.${c.ref.connection}`),
      },
      {
        key: 'productionStatus',
        header: t('reports.curtailment.coverage.col.status'),
        render: (c) => (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-11 font-bold',
              c.ref.productionStatus === 'connected'
                ? 'bg-light-green text-green'
                : c.ref.productionStatus === 'stale'
                  ? 'bg-orange/10 text-orange'
                  : 'bg-beige-2 text-text-gray',
            )}
          >
            {t(`reports.curtailment.coverage.status.${c.ref.productionStatus}`)}
          </span>
        ),
      },
      {
        key: 'lastProductionTime',
        header: t('reports.curtailment.coverage.col.lastSeen'),
        render: (c) => (c.ref.lastProductionTime ? fmtDateTime(c.ref.lastProductionTime) : '—'),
      },
      ...(sparky.checked
        ? [
            {
              key: 'sparkyDisconnectedAt',
              header: t('reports.curtailment.coverage.col.sparky'),
              render: (c: InverterCoverage) => {
                if (!c.ref.sparkySerial) return t('reports.curtailment.coverage.sparky.none')
                const at = sparky.disconnected.get(c.ref.sparkySerial)
                return at ? t('reports.curtailment.coverage.sparky.since', { at: fmtDateTime(at) })
                          : t('reports.curtailment.coverage.sparky.connected')
              },
            } satisfies Column<InverterCoverage>,
          ]
        : []),
      ...(curtailedTotal > 0
        ? [
            {
              key: 'curtailed',
              header: t('reports.curtailment.coverage.col.curtailed'),
              render: (c: InverterCoverage) =>
                c.curtailed ? (
                  <span className="inline-flex items-center rounded-full bg-orange/10 px-2 py-0.5 text-11 font-bold text-orange">
                    {t('reports.curtailment.coverage.curtailedYes')}
                  </span>
                ) : (
                  <span className="text-text-gray">{t('reports.curtailment.coverage.curtailedNo')}</span>
                ),
            } satisfies Column<InverterCoverage>,
          ]
        : []),
    ],
    [t, curtailedTotal, sparky],
  )

  // Curtailment impact: factual energy integrals + estimated counterfactual.
  const { impact, overviewData } = useMemo(() => {
    const { impact, potentialByT } = computeCurtailmentImpact(minutes, impactBands)
    const overviewData = minutes.map((m) => ({ ...m, potential: potentialByT.get(m.t) }))
    return { impact, overviewData }
  }, [minutes, impactBands])

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
    <div className="card flex flex-col gap-4 p-5" {...{ [PDF_HIDE_ATTR]: '' }}>
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
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-13 text-text-gray">
          <input
            type="checkbox"
            checked={includeIndividual}
            onChange={(e) => setIncludeIndividual(e.target.checked)}
            className="size-4 rounded border-beige-2 text-dark-purple focus:ring-dark-purple"
          />
          {t('reports.curtailment.includeIndividual')}
        </label>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-13 text-text-gray">
          <input
            type="checkbox"
            checked={showTelemetry}
            onChange={(e) => setShowTelemetry(e.target.checked)}
            className="size-4 rounded border-beige-2 text-dark-purple focus:ring-dark-purple"
          />
          {t('reports.curtailment.showTelemetry')}
        </label>
        <button className="btn-secondary ml-auto" onClick={() => setInspectorOpen(true)}>
          <CodeBracketIcon className="size-4" />
          {t('common.viewRaw')}
        </button>
      </div>
      <p className="text-11 text-text-gray">{t('reports.curtailment.groupHint')}</p>
      {includeIndividual && (
        <p className="text-11 text-text-gray">{t('reports.curtailment.includeIndividualHint')}</p>
      )}
      <p className="text-11 text-text-gray">
        {t(showTelemetry ? 'reports.curtailment.telemetryOnHint' : 'reports.curtailment.telemetryOffHint')}
      </p>
    </div>
  )

  const funnelStages = useMemo(() => {
    if (!funnel) return []
    const rows = [
      { key: 'found', label: t('reports.curtailment.funnel.found'), value: funnel.invertersFound, drop: null as number | null, muted: false },
      {
        key: 'steerable',
        label: t('reports.curtailment.funnel.steerable'),
        value: funnel.steerable,
        drop: funnel.invertersFound - funnel.steerable,
        muted: false,
      },
      {
        key: 'commanded',
        label: t('reports.curtailment.funnel.commanded'),
        value: funnel.commanded,
        drop: funnel.steerable - funnel.commanded,
        muted: false,
      },
    ]
    if (!funnel.hasTelemetry) return rows
    return [
      ...rows,
      {
        key: 'provable',
        label: t('reports.curtailment.funnel.provable'),
        value: funnel.provable,
        drop: funnel.commanded - funnel.provable,
        muted: false,
      },
    ]
  }, [funnel, t])

  const exportPdf = async () => {
    const el = captureRef.current
    if (!el) return
    setPdfBusy(true)
    try {
      const { buildCurtailmentPdf } = await import('../curtailmentReportPdf')
      const doc = await buildCurtailmentPdf(el, {
        language: i18n.language.startsWith('nl') ? 'nl' : 'en',
        title: t('reports.templates.groupCurtailment.title'),
        subtitle: contextLine,
      })
      doc.save(`group-curtailment-${range.from}${range.to !== range.from ? `_${range.to}` : ''}.pdf`)
    } finally {
      setPdfBusy(false)
    }
  }

  // Solar inverters carry no disconnection timestamp; the Sparky on the address
  // does. It is one request per serial, so it stays behind a button.
  const checkSparky = async () => {
    const serials = [...new Set(coverage.map((c) => c.ref.sparkySerial).filter((v): v is string => !!v))]
    if (serials.length === 0) return
    const controller = new AbortController()
    setSparkyBusy({ done: 0, total: serials.length })
    try {
      const map = await loadSparkyDisconnections(
        serials,
        (done, total) => setSparkyBusy({ done, total }),
        controller.signal,
      )
      setSparky({ checked: true, disconnected: map })
    } finally {
      setSparkyBusy(null)
    }
  }

  const contextLine = [
    groupName || groupUuid,
    range.from === range.to ? fmtDate(range.from) : `${fmtDate(range.from)} → ${fmtDate(range.to)}`,
    t(
      includeIndividual
        ? 'reports.curtailment.header.withIndividual'
        : 'reports.curtailment.header.groupOnly',
    ),
    t(
      !showTelemetry
        ? 'reports.curtailment.header.telemetryOff'
        : telemetrySource === 'inverters'
          ? 'reports.curtailment.header.telemetryInverters'
          : telemetrySource === 'aggregation'
            ? 'reports.curtailment.header.telemetryAggregation'
            : 'reports.curtailment.header.telemetryEmpty',
    ),
  ].join(' · ')

  const progressText =
    phase === 'schedules'
      ? t('reports.curtailment.fetchingSchedules')
      : phase === 'individualAddresses'
        ? t('reports.curtailment.fetchingAddresses', { done: progress.done, total: progress.total })
        : phase === 'individualInverters'
          ? t('reports.curtailment.fetchingInverters', { done: progress.done, total: progress.total })
          : phase === 'production'
            ? t('reports.curtailment.fetchingProduction', { done: progress.done, total: progress.total })
            : t('reports.curtailment.fetching', { done: progress.done, total: progress.total })

  const showTimeline = status === 'done' && minutes.length > 0 && window

  return (
    <div className="space-y-5" ref={captureRef}>
      <ReportRunner
        title={t('reports.templates.groupCurtailment.title')}
        description={
          <>
            {t('reports.templates.groupCurtailment.description')}
            {status === 'done' && (
              <span className="mt-1 block font-semibold text-dark-blue">{contextLine}</span>
            )}
          </>
        }
        headerFirst
        extraActions={
          <button className="btn-secondary" onClick={exportPdf} disabled={pdfBusy || status !== 'done'}>
            <ArrowDownTrayIcon className="size-4" />
            {t(pdfBusy ? 'reports.curtailment.exportingPdf' : 'reports.curtailment.exportPdf')}
          </button>
        }
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
        csvFilename={`group-curtailment${includeIndividual ? '-incl-individual' : ''}-${range.from}${range.to !== range.from ? `_${range.to}` : ''}.csv`}
        emptyMessage={t('reports.curtailment.empty')}
        canRun={!!groupUuid}
        filters={filters}
        progressText={progressText}
      />

      {/* Say why there is no chart — the two causes need different fixes. */}
      {status === 'done' && showTelemetry && !showTimeline && (
        <div className="card border-beige-2 p-4 text-13 text-text-gray">
          {!window
            ? t(
                includeIndividual
                  ? 'reports.curtailment.noWindow.scanned'
                  : 'reports.curtailment.noWindow.groupOnly',
              )
            : t('reports.curtailment.noAggregation')}
        </div>
      )}

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
                    value={fmtKwh(impact.curtailedKwh)}
                    sub={t('reports.curtailment.impact.estimated')}
                    accent
                  />
                  <ImpactTile
                    label={t('reports.curtailment.impact.reduction')}
                    value={`${fmtNumber(impact.curtailedPct, 0)}%`}
                    sub={t('reports.curtailment.impact.estimated')}
                    accent
                  />
                </>
              )}
              <ImpactTile label={t('reports.curtailment.impact.potential')} value={fmtKwh(impact.potentialKwh)} />
              <ImpactTile label={t('reports.curtailment.impact.produced')} value={fmtKwh(impact.producedKwh)} />
              {!fromInverters && (
                <>
                  <ImpactTile label={t('reports.curtailment.impact.exported')} value={fmtKwh(impact.exportedKwh)} />
                  <ImpactTile label={t('reports.curtailment.impact.imported')} value={fmtKwh(impact.importedKwh)} />
                </>
              )}
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
                {fromInverters && (
                  <span className="rounded-full bg-orange/10 px-2.5 py-1 text-orange">
                    {t('reports.curtailment.source.inverterSum')}
                  </span>
                )}
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
              bands={groupMs}
              bands2={individualMs}
              band2Color={INDIVIDUAL_BAND_COLOR}
              bands3={standingMs}
              series={chartSeries}
              dashed={
                impact.confidence !== 'none'
                  ? [{ key: 'potential', name: t('reports.curtailment.series.potential'), color: '#DB2777' }]
                  : undefined
              }
              range={{ key: 'solarBand', name: t('reports.curtailment.series.solarRange'), color: '#6245DE' }}
              unit="kW"
              height={300}
            />
            {(individualMs.length > 0 || standingMs.length > 0) && (
              <div className="flex flex-wrap items-center gap-4 text-11 text-text-gray">
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm border border-dark-purple/25 bg-dark-purple/10" />
                  {t('reports.curtailment.bandLegend.group')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm border border-orange/30 bg-orange/10" />
                  {t('reports.curtailment.bandLegend.individual')}
                </span>
                {standingMs.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="size-3 rounded-sm border border-text-gray/20 bg-text-gray/5" />
                    {t('reports.curtailment.bandLegend.standing')}
                  </span>
                )}
              </div>
            )}
            <p className="text-11 text-text-gray">
              {t(fromInverters ? 'reports.curtailment.overview.inverterHint' : 'reports.curtailment.overview.hint')}
            </p>
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
                <span>
                  {fromInverters && detailProgress.total > 0
                    ? t('reports.curtailment.detail.loadingInverters', {
                        done: detailProgress.done,
                        total: detailProgress.total,
                      })
                    : t('reports.curtailment.detail.loading')}
                </span>
              </div>
            ) : detailDomain && detail.length > 0 ? (
              <CurtailmentChart
                data={detail}
                domain={detailDomain}
                bands={groupMs}
                bands2={individualMs}
                band2Color={INDIVIDUAL_BAND_COLOR}
                bands3={standingMs}
                series={chartSeries}
                unit="kW"
                height={300}
                withSeconds
              />
            ) : (
              <p className="py-8 text-center text-sm text-text-gray">{t('reports.curtailment.detail.empty')}</p>
            )}
          </div>
        </>
      )}

      {/* Funnel — where inverters drop out between "in the group" and "provable". */}
      {funnel && (
        <div className="card space-y-3 p-5">
          <p className="text-sm font-semibold text-dark-blue">{t('reports.curtailment.funnel.title')}</p>
          <p className="text-13 text-text-gray">{t('reports.curtailment.funnel.subtitle')}</p>
          <div className="space-y-1.5">
            {funnelStages.map((stage) => (
              <div key={stage.key} className="flex items-center gap-3">
                <div className="w-56 shrink-0 text-13 text-dark-blue">{stage.label}</div>
                <div className="h-6 flex-1 overflow-hidden rounded-lg bg-beige-2">
                  <div
                    className={cn('h-full rounded-lg', stage.muted ? 'bg-beige' : 'bg-dark-purple')}
                    style={{ width: `${funnelStages[0].value > 0 ? (stage.value / funnelStages[0].value) * 100 : 0}%` }}
                  />
                </div>
                <div className="w-14 shrink-0 text-right text-13 font-semibold text-dark-blue">{stage.value}</div>
                <div className="w-40 shrink-0 text-11 text-text-gray">
                  {stage.drop != null && stage.drop > 0 ? t('reports.curtailment.funnel.dropped', { n: stage.drop }) : ''}
                </div>
              </div>
            ))}
          </div>
          {!funnel.hasTelemetry && (
            <p className="text-11 text-text-gray">{t('reports.curtailment.funnel.noTelemetry')}</p>
          )}
          <p className="text-11 text-text-gray">{t('reports.curtailment.funnel.hint')}</p>
        </div>
      )}

      {/* Coverage — which inverters actually answered, and why the rest didn't. */}
      {coverage.length > 0 && (
        <div className="card space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-dark-blue">{t('reports.curtailment.coverage.title')}</p>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-1 text-11 font-bold',
                silent.length === 0 ? 'bg-light-green text-green' : 'bg-orange/10 text-orange',
              )}
            >
              {t('reports.curtailment.coverage.summary', {
                reporting: coverage.length - silent.length,
                total: coverage.length,
              })}
            </span>
          </div>
          {silent.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-gray">{t('reports.curtailment.coverage.allReporting')}</p>
          ) : (
            <>
              <p className="text-13 text-text-gray">
                {t('reports.curtailment.coverage.subtitle', { n: silent.length })}
              </p>
              {curtailedTotal > 0 && (
                <p
                  className={cn(
                    'rounded-xl px-3 py-2 text-13',
                    silentCurtailed > 0 ? 'bg-orange/5 text-dark-blue' : 'bg-light-green/40 text-dark-blue',
                  )}
                >
                  {silentCurtailed > 0
                    ? t('reports.curtailment.coverage.curtailedSilent', {
                        silent: silentCurtailed,
                        total: curtailedTotal,
                      })
                    : t('reports.curtailment.coverage.curtailedAllReporting', { total: curtailedTotal })}
                </p>
              )}
              <DataTable
                rows={silent}
                columns={coverageCols}
                rowKey={(c) => `${c.ref.addressUuid}:${c.ref.inverterId}`}
              />
              <div className="flex flex-wrap items-center gap-3">
                {!sparky.checked && (
                  <button className="btn-secondary" onClick={checkSparky} disabled={!!sparkyBusy}>
                    {sparkyBusy
                      ? t('reports.curtailment.coverage.sparky.checking', {
                          done: sparkyBusy.done,
                          total: sparkyBusy.total,
                        })
                      : t('reports.curtailment.coverage.sparky.check')}
                  </button>
                )}
                <button
                  className="btn-secondary"
                  onClick={() =>
                    downloadCsv(
                      `inverter-coverage-${range.from}${range.to !== range.from ? `_${range.to}` : ''}.csv`,
                      coverage.map((c) => ({
                        addressUuid: c.ref.addressUuid,
                        inverterId: c.ref.inverterId,
                        brand: c.ref.brand,
                        model: c.ref.model,
                        connection: c.ref.connection,
                        productionStatus: c.ref.productionStatus,
                        lastProductionTime: c.ref.lastProductionTime,
                        curtailedInWindow: c.curtailed,
                        sparkySerial: c.ref.sparkySerial,
                        sparkyDisconnectedAt: c.ref.sparkySerial
                          ? (sparky.disconnected.get(c.ref.sparkySerial) ?? null)
                          : null,
                        intervalsInWindow: c.intervals,
                        kwhInWindow: c.kwh,
                        lastIntervalTime: c.lastIntervalTime,
                      })),
                    )
                  }
                >
                  {t('reports.curtailment.coverage.export')}
                </button>
                <p className="text-11 text-text-gray">{t('reports.curtailment.coverage.hint')}</p>
              </div>
            </>
          )}
        </div>
      )}


      <div {...{ [PDF_HIDE_ATTR]: '' }}>
        <ApiInspector
          open={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
          primary={{ method: 'GET', url: `/api/v2/groups/${groupUuid ?? ''}/flex/aggregation` }}
        />
      </div>
    </div>
  )
}
