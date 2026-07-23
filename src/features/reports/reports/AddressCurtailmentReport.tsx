import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { CodeBracketIcon } from '@heroicons/react/24/outline'
import { DataTable, type Column } from '@/components/common/DataTable'
import { ApiInspector } from '@/components/common/ApiInspector'
import { Spinner } from '@/components/common/Spinner'
import { CopyButton } from '@/components/common/CopyButton'
import { useContextStore } from '@/store/context'
import { useGroupAddresses } from '@/hooks/useGroupAddresses'
import { cn } from '@/utils/cn'
import { fmtDateTime, fmtNumber, shortId, todayISO } from '@/utils/format'
import { type SeriesDef } from '@/features/telemetry/TimeSeriesChart'
import { ReportRunner } from '../ReportRunner'
import { type ReportMetric } from '../reportMetrics'
import {
  useAddressCurtailmentReport,
  type AddressCurtailmentPeriodRow,
  type CurtailmentSource,
  type CurtailmentTargetType,
  type InverterImpactRow,
} from '../useAddressCurtailmentReport'
import { CurtailmentChart } from './CurtailmentChart'

type DateMode = 'single' | 'range'
const DAY_MS = 24 * 60 * 60 * 1000
const BLOCK_MS = 15 * 60 * 1000
const DETAIL_PAD_MS = 15 * 60 * 1000 // 15 min of context on each side of a block
const CONTEXT_MS = 60 * 60 * 1000 // block dropdown spans the curtailment ±1h

const TYPE_CLS: Record<CurtailmentTargetType, string> = {
  group: 'bg-light-purple-3 text-dark-purple',
  address: 'bg-light-green text-green',
  inverter: 'bg-orange/10 text-orange',
  zeroExport: 'bg-red/10 text-red',
  none: 'bg-beige-2 text-text-gray',
}
const SOURCE_CLS: Record<CurtailmentSource, string> = {
  group: 'bg-light-purple-3 text-dark-purple',
  inverter: 'bg-orange/10 text-orange',
}

const fmtKwh = (v: number) => `${v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kWh`

function fmtDuration(minutes: number | null): string {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function dayStartMs(day: string) {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

export function AddressCurtailmentReport() {
  const { t } = useTranslation()
  const { groupUuid, addressUuid, addressSerial, setAddress } = useContextStore()

  const [mode, setMode] = useState<DateMode>('single')
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [inspectorOpen, setInspectorOpen] = useState(false)

  // Paste-an-address-UUID lookup. Resolves the record from the group's address
  // list (already cached by the context bar on /reports) so the sparky serial is
  // populated; setAddress updates the shared context (and the top address picker).
  const { addresses: groupAddresses } = useGroupAddresses(groupUuid)
  const [uuidInput, setUuidInput] = useState(addressUuid ?? '')
  useEffect(() => setUuidInput(addressUuid ?? ''), [addressUuid])
  const applyUuid = () => {
    const uuid = uuidInput.trim()
    if (!uuid || uuid === addressUuid) return
    setAddress(uuid, groupAddresses.find((a) => a.uuid === uuid) ?? null)
  }

  const range = useMemo(() => {
    if (mode === 'single') return { from, to: from }
    return from <= to ? { from, to } : { from: to, to: from }
  }, [mode, from, to])

  const {
    status,
    progress,
    inverters,
    rows,
    timeline,
    groupBands,
    inverterBands,
    impact,
    perInverter,
    forecastTags,
    generatedAt,
    error,
    run,
    cancel,
    detail,
    detailLoading,
    loadDetail,
  } = useAddressCurtailmentReport(addressUuid, range)

  const domain = useMemo<[number, number]>(
    () => [dayStartMs(range.from), dayStartMs(range.to) + DAY_MS],
    [range],
  )

  // Block detail — the earliest 15-min block in which any inverter was curtailed
  // (group ∪ inverter bands). Only shown when there was curtailment.
  const span = useMemo(() => {
    const bands = [...groupBands, ...inverterBands]
    if (bands.length === 0) return null
    return {
      start: Math.min(...bands.map((b) => b.start)),
      end: Math.max(...bands.map((b) => b.end)),
    }
  }, [groupBands, inverterBands])

  const alignBlock = (ms: number) => Math.floor(ms / BLOCK_MS) * BLOCK_MS
  const startBlock = span ? alignBlock(span.start) : null
  const endBlock = span ? alignBlock(span.end) : null

  const [blockStart, setBlockStart] = useState<number | null>(null)
  useEffect(() => {
    setBlockStart(startBlock)
  }, [startBlock])

  const multiDay = range.from !== range.to
  const timeLabel = (ms: number) => format(new Date(ms), multiDay ? 'd MMM HH:mm' : 'HH:mm')

  // Block dropdown limited to the curtailment span ±1h, clamped to the day(s).
  const blockOptions = useMemo(() => {
    if (!span) return [] as number[]
    const winStart = Math.max(span.start - CONTEXT_MS, domain[0])
    const winEnd = Math.min(span.end + CONTEXT_MS, domain[1])
    const opts: number[] = []
    const first = Math.ceil(winStart / BLOCK_MS) * BLOCK_MS
    for (let ms = first; ms + BLOCK_MS <= winEnd + 1; ms += BLOCK_MS) opts.push(ms)
    return opts
  }, [span, domain])

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

  const cols: Column<AddressCurtailmentPeriodRow>[] = [
    {
      key: 'source',
      header: t('reports.addrCurtailment.col.source'),
      render: (r) => (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-11 font-bold', SOURCE_CLS[r.source])}>
          {t(`reports.addrCurtailment.source.${r.source}`)}
        </span>
      ),
    },
    {
      key: 'inverter',
      header: t('reports.addrCurtailment.col.inverter'),
      render: (r) => (r.inverter ? shortId(r.inverter) : t('reports.addrCurtailment.allInverters')),
    },
    { key: 'start', header: t('reports.curtailment.col.start'), render: (r) => fmtDateTime(r.start) },
    {
      key: 'end',
      header: t('reports.curtailment.col.end'),
      render: (r) => (r.end ? fmtDateTime(r.end) : t('reports.curtailment.ongoing')),
    },
    { key: 'durationMinutes', header: t('reports.curtailment.col.duration'), render: (r) => fmtDuration(r.durationMinutes) },
    {
      key: 'target',
      header: t('reports.curtailment.col.target'),
      render: (r) =>
        r.isCurtailment ? (
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-11 font-bold', TYPE_CLS[r.targetType])}>
            {r.targetType === 'zeroExport' ? t('reports.addrCurtailment.zeroExport') : r.target}
          </span>
        ) : (
          t('reports.curtailment.noLimit')
        ),
    },
  ]

  const metrics: ReportMetric[] = useMemo(
    () => [
      { label: t('reports.addrCurtailment.metrics.curtailed'), value: fmtKwh(impact.curtailedKwh) },
      { label: t('reports.addrCurtailment.metrics.reduction'), value: `${fmtNumber(impact.curtailedPct, 0)}%` },
      { label: t('reports.addrCurtailment.metrics.potential'), value: fmtKwh(impact.potentialKwh) },
      { label: t('reports.addrCurtailment.metrics.produced'), value: fmtKwh(impact.producedKwh) },
      { label: t('reports.addrCurtailment.metrics.delivery'), value: fmtKwh(impact.deliveryKwh) },
      { label: t('reports.addrCurtailment.metrics.return'), value: fmtKwh(impact.returnKwh) },
      {
        label: t('reports.addrCurtailment.metrics.quality'),
        value: impact.forecastQuality != null ? `${fmtNumber(impact.forecastQuality, 0)}%` : '—',
        sub: t('reports.addrCurtailment.metrics.qualitySub'),
      },
    ],
    [impact, t],
  )

  const chartSeries: SeriesDef[] = [
    { key: 'actual', name: t('reports.addrCurtailment.series.actual'), color: '#16B364' },
    { key: 'delivery', name: t('reports.addrCurtailment.series.delivery'), color: '#FF8500' },
    { key: 'return', name: t('reports.addrCurtailment.series.return'), color: '#0EA5E9' },
  ]
  const chartDashed: SeriesDef[] = [
    { key: 'hindcast', name: t('reports.addrCurtailment.series.hindcast'), color: '#6245DE' },
  ]
  // Detail = raw device power (W): solar from the inverter, grid flows from the meter.
  const detailSeries: SeriesDef[] = [
    { key: 'solarProduction', name: t('reports.addrCurtailment.series.solarProduction'), color: '#6245DE' },
    { key: 'delivery', name: t('reports.addrCurtailment.series.delivery'), color: '#FF8500' },
    { key: 'return', name: t('reports.addrCurtailment.series.return'), color: '#0EA5E9' },
  ]

  const perInvCols: Column<InverterImpactRow>[] = [
    { key: 'identifier', header: t('reports.addrCurtailment.col.inverter'), render: (r) => shortId(r.identifier) },
    { key: 'curtailedKwh', header: t('reports.addrCurtailment.metrics.curtailed'), render: (r) => fmtKwh(r.curtailedKwh) },
    { key: 'curtailedPct', header: t('reports.addrCurtailment.metrics.reduction'), render: (r) => `${fmtNumber(r.curtailedPct, 0)}%` },
    { key: 'potentialKwh', header: t('reports.addrCurtailment.metrics.potential'), render: (r) => fmtKwh(r.potentialKwh) },
    { key: 'producedKwh', header: t('reports.addrCurtailment.metrics.produced'), render: (r) => fmtKwh(r.producedKwh) },
  ]

  const filters = (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[18rem] flex-1">
          <label className="label">{t('reports.addrCurtailment.lookup.label')}</label>
          <input
            className="input font-mono"
            placeholder={t('reports.addrCurtailment.lookup.placeholder')}
            value={uuidInput}
            onChange={(e) => setUuidInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyUuid()
            }}
          />
        </div>
        <button className="btn-primary" onClick={applyUuid} disabled={!uuidInput.trim() || uuidInput.trim() === addressUuid}>
          {t('reports.addrCurtailment.lookup.apply')}
        </button>
      </div>
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
      <p className="text-11 text-text-gray">{t('reports.addrCurtailment.hint')}</p>
    </div>
  )

  const showResults = status === 'done'

  return (
    <div className="space-y-5">
      <ReportRunner
        title={t('reports.templates.addressCurtailment.title')}
        description={t('reports.templates.addressCurtailment.description')}
        status={status}
        progress={progress}
        rows={rows}
        generatedAt={generatedAt}
        error={error}
        onRun={run}
        onCancel={cancel}
        columns={cols}
        rowKey={(r) => r.key}
        metrics={metrics}
        csvFilename={`address-curtailment-${range.from}${range.to !== range.from ? `_${range.to}` : ''}.csv`}
        emptyMessage={t('reports.addrCurtailment.emptySchedules')}
        canRun={!!addressUuid}
        filters={filters}
        progressText={t('reports.addrCurtailment.fetching', { done: progress.done, total: progress.total })}
      />

      {showResults && addressUuid && (
        <div className="card flex flex-wrap items-center gap-x-8 gap-y-2 p-4">
          <div className="flex items-center gap-2">
            <span className="text-11 font-bold uppercase tracking-wide text-text-gray">
              {t('reports.addrCurtailment.result.address')}
            </span>
            <span className="font-mono text-13 text-dark-blue">{addressUuid}</span>
            <CopyButton text={addressUuid} compact />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-11 font-bold uppercase tracking-wide text-text-gray">
              {t('reports.addrCurtailment.result.sparky')}
            </span>
            <span className="font-mono text-13 text-dark-blue">{addressSerial ?? '—'}</span>
            {addressSerial && <CopyButton text={addressSerial} compact />}
          </div>
        </div>
      )}

      {showResults && inverters.length === 0 && (
        <div className="card border-orange/30 bg-orange/5 p-4 text-13 text-dark-blue">
          {t('reports.addrCurtailment.noInverters')}
        </div>
      )}

      {showResults && timeline.length > 0 && (
        <div className="card space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-dark-blue">{t('reports.addrCurtailment.timeline.title')}</p>
              <p className="mt-1 text-13 text-text-gray">{t('reports.addrCurtailment.timeline.subtitle')}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-11 font-semibold">
              <span className="rounded-full bg-light-purple-3 px-2.5 py-1 text-dark-purple">
                {t('reports.addrCurtailment.legend.group')}
              </span>
              <span className="rounded-full bg-orange/10 px-2.5 py-1 text-orange">
                {t('reports.addrCurtailment.legend.inverter')}
              </span>
            </div>
          </div>
          <CurtailmentChart
            data={timeline}
            domain={domain}
            bands={groupBands}
            bandColor="#6245DE"
            bands2={inverterBands}
            band2Color="#FF8500"
            series={chartSeries}
            dashed={chartDashed}
            unit="W"
            height={320}
          />
          {forecastTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-11 font-semibold text-text-gray">{t('reports.addrCurtailment.tags')}:</span>
              {forecastTags.map((tag) => (
                <span key={tag} className="rounded-full bg-beige-2 px-2 py-0.5 font-mono text-11 text-text-gray">
                  {tag}
                </span>
              ))}
            </div>
          )}
          <p className="text-11 text-text-gray">{t('reports.addrCurtailment.timeline.hint')}</p>
        </div>
      )}

      {showResults && perInverter.length > 0 && (
        <div className="card space-y-3 p-5">
          <p className="text-sm font-semibold text-dark-blue">{t('reports.addrCurtailment.perInverter')}</p>
          <DataTable rows={perInverter} columns={perInvCols} rowKey={(r) => r.identifier} />
        </div>
      )}

      {/* Detail — 15-min block ±15 min, raw device readings fetched on demand. Only when curtailed. */}
      {showResults && span && blockOptions.length > 0 && (
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
              {endBlock != null && endBlock !== startBlock && (
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
              bands={groupBands}
              bandColor="#6245DE"
              bands2={inverterBands}
              band2Color="#FF8500"
              series={detailSeries}
              unit="W"
              height={300}
              withSeconds
              connectNulls
              toggleable
            />
          ) : (
            <p className="py-8 text-center text-sm text-text-gray">{t('reports.curtailment.detail.empty')}</p>
          )}
        </div>
      )}

      <ApiInspector
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        primary={{
          method: 'GET',
          url: `/api/v2/addresses/${addressUuid ?? ''}/solar-inverters/${inverters[0] ?? ''}/production-forecast`,
        }}
      />
    </div>
  )
}
