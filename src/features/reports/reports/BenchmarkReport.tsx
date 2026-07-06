import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowPathIcon, ArrowDownTrayIcon, StopIcon } from '@heroicons/react/24/outline'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Spinner } from '@/components/common/Spinner'
import { downloadCsv } from '@/utils/csv'
import { useContextStore } from '@/store/context'
import { useBenchmarkReport } from '../useBenchmarkReport'
import { histogram, median, percentileRank, type AddressBenchmarkMetrics } from '../benchmarkMetrics'

const MAX_COHORT = 50

interface MetricDef {
  key: 'totalUsageKwh' | 'peakUsageKw' | 'standbyUsageW' | 'selfConsumptionPct'
  higherIsBetter: boolean
  unit: string
  format: (v: number) => string
}

const METRICS: MetricDef[] = [
  { key: 'totalUsageKwh', higherIsBetter: false, unit: 'kWh', format: (v) => v.toFixed(0) },
  { key: 'peakUsageKw', higherIsBetter: false, unit: 'kW', format: (v) => v.toFixed(2) },
  { key: 'standbyUsageW', higherIsBetter: false, unit: 'W', format: (v) => v.toFixed(0) },
  { key: 'selfConsumptionPct', higherIsBetter: true, unit: '%', format: (v) => v.toFixed(0) },
]

function MetricBenchmarkCard({
  def,
  target,
  cohort,
}: {
  def: MetricDef
  target: AddressBenchmarkMetrics
  cohort: AddressBenchmarkMetrics[]
}) {
  const { t } = useTranslation()

  const targetValue = target[def.key]
  const cohortValues = cohort
    .map((c) => c[def.key])
    .filter((v): v is number => v != null)

  if (targetValue == null) {
    return (
      <div className="card p-5">
        <p className="text-sm font-semibold text-dark-blue">{t(`reports.benchmark.metric.${def.key}`)}</p>
        <p className="mt-3 text-sm text-text-gray">{t('reports.benchmark.notApplicable')}</p>
      </div>
    )
  }

  const rank = percentileRank(targetValue, cohortValues, def.higherIsBetter)
  const med = median(cohortValues)
  const bars = cohortValues.length > 0 ? histogram(cohortValues, targetValue) : []

  return (
    <div className="card p-5">
      <p className="text-sm font-semibold text-dark-blue">{t(`reports.benchmark.metric.${def.key}`)}</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-28 font-extrabold leading-tight text-dark-blue">
          {def.format(targetValue)}
          <span className="ml-1 text-sm font-semibold text-text-gray">{def.unit}</span>
        </p>
        <p className="text-13 text-text-gray">
          {t('reports.benchmark.cohortMedian', { value: `${def.format(med)} ${def.unit}` })}
        </p>
      </div>
      {rank != null && (
        <p className="mt-1 text-13 font-semibold text-dark-purple">
          {t('reports.benchmark.betterThan', { pct: rank })}
        </p>
      )}
      {bars.length > 0 && (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={bars} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#D5D3CE" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#696969' }} interval={1} />
              <YAxis tick={{ fontSize: 10, fill: '#696969' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #D5D3CE', fontSize: 12 }}
                formatter={(value: number) => [value, t('reports.benchmark.addresses')]}
                labelFormatter={(label) => `${label} ${def.unit}`}
              />
              <Bar dataKey="count" isAnimationActive={false} maxBarSize={28}>
                {bars.map((b, i) => (
                  <Cell key={i} fill={b.isTarget ? '#6245DE' : '#C6C5FF'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="mt-1 text-11 text-text-gray">{t('reports.benchmark.histogramHint')}</p>
        </div>
      )}
    </div>
  )
}

export function BenchmarkReport() {
  const { t } = useTranslation()
  const { groupUuid, addressUuid } = useContextStore()

  const [cohortSize, setCohortSize] = useState(20)
  const [months, setMonths] = useState(12)

  const { status, progress, data, generatedAt, error, run, cancel } = useBenchmarkReport(
    groupUuid,
    addressUuid,
    cohortSize,
    months,
  )

  const running = status === 'running'
  const progressPct = progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0

  const csvRows = useMemo(() => {
    if (!data) return []
    const toRow = (m: AddressBenchmarkMetrics, isTarget: boolean) => ({
      addressUuid: m.addressUuid,
      isTarget,
      totalUsageKwh: m.totalUsageKwh.toFixed(1),
      peakUsageKw: m.peakUsageKw.toFixed(2),
      standbyUsageW: m.standbyUsageW,
      selfConsumptionPct: m.selfConsumptionPct ?? '',
      hasSolar: m.hasSolar,
    })
    return [...(data.target ? [toRow(data.target, true)] : []), ...data.cohort.map((c) => toRow(c, false))]
  }, [data])

  const inputCls = 'input h-10 w-auto py-1'
  const labelCls = 'text-11 font-bold uppercase tracking-wide text-text-gray'

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="card space-y-4 p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t('reports.benchmark.cohortSize')}</span>
            <input
              type="number"
              min={1}
              max={MAX_COHORT}
              className={`${inputCls} w-24`}
              value={cohortSize}
              onChange={(e) => setCohortSize(Math.max(1, Math.min(MAX_COHORT, Number(e.target.value) || 1)))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t('reports.battery.period')}</span>
            <select className={`${inputCls} pr-9`} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[3, 6, 12].map((m) => (
                <option key={m} value={m}>
                  {t('reports.battery.periodMonths', { n: m })}
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex items-center gap-2">
            {running ? (
              <button className="btn-secondary" onClick={cancel}>
                <StopIcon className="size-4" />
                {t('reports.cancel')}
              </button>
            ) : (
              <button className="btn-primary" onClick={run} disabled={!groupUuid || !addressUuid}>
                <ArrowPathIcon className="size-4" />
                {status === 'done' || status === 'cancelled' ? t('reports.regenerate') : t('reports.generate')}
              </button>
            )}
            <button
              className="btn-secondary"
              onClick={() => downloadCsv(`benchmark-${new Date().toISOString().slice(0, 10)}.csv`, csvRows)}
              disabled={csvRows.length === 0}
            >
              <ArrowDownTrayIcon className="size-4" />
              {t('reports.downloadCsv')}
            </button>
          </div>
        </div>
        {generatedAt && !running && (
          <p className="text-11 text-text-gray">
            {t('reports.generatedAt', { time: new Date(generatedAt).toLocaleString() })}
          </p>
        )}
      </div>

      {running && (
        <div className="card space-y-3 p-5">
          <div className="flex items-center gap-3 text-sm text-text-gray">
            <Spinner />
            <span>{t('reports.benchmark.progressAddresses', { done: progress.done, total: progress.total })}</span>
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

      {status === 'done' && data && !data.target && (
        <div className="card p-5 text-sm font-semibold text-orange">
          {data.targetHasSmartMeter ? t('reports.benchmark.noTargetData') : t('reports.benchmark.noSmartMeter')}
        </div>
      )}

      {status === 'done' && data?.target && (
        <>
          <div className="card flex flex-wrap items-center gap-x-6 gap-y-1 p-5 text-13 text-text-gray">
            <span>{t('reports.benchmark.cohortSummary', { n: data.cohort.length, requested: data.cohortRequested })}</span>
            {data.skipped > 0 && <span>{t('reports.benchmark.skipped', { n: data.skipped })}</span>}
            <span>
              {t('reports.benchmark.period', {
                from: new Date(data.fromIso).toLocaleDateString(),
                to: new Date(data.toIso).toLocaleDateString(),
              })}
            </span>
          </div>

          {data.cohort.length === 0 ? (
            <div className="card p-5 text-sm text-text-gray">{t('reports.benchmark.emptyCohort')}</div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {METRICS.map((def) => (
                <MetricBenchmarkCard key={def.key} def={def} target={data.target!} cohort={data.cohort} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
