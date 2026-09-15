import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { DataState } from '@/components/common/DataState'
import { Spinner } from '@/components/common/Spinner'
import { cn } from '@/utils/cn'
import { downloadCsv } from '@/utils/csv'
import { fmtNumber, todayISO } from '@/utils/format'
import { flattenNumbers, humanizeKey } from '@/utils/records'
import { CurtailmentChart } from '@/features/reports/reports/CurtailmentChart'
import { MetricCard } from '@/features/reports/ReportRunner'
import { type ReportMetric } from '@/features/reports/reportMetrics'
import { type SeriesDef } from './TimeSeriesChart'
import { useChargerReadings, type ChargerReading } from './useChargerReadings'

type DateMode = 'single' | 'range'
type Metric = 'power' | 'current' | 'voltage'

const METRICS: Metric[] = ['power', 'current', 'voltage']
const UNIT: Record<Metric, string> = { power: 'W', current: 'A', voltage: 'V' }

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const BLOCK_MS = 15 * MINUTE_MS
const DETAIL_PAD_MS = 15 * MINUTE_MS // 15 min of context on each side of a block
// The overview is averaged into the smallest bucket that keeps it under ~1500 points.
const OVERVIEW_POINTS = 1500
const BUCKETS_MS = [10 * 1000, 30 * 1000, MINUTE_MS, 5 * MINUTE_MS, 15 * MINUTE_MS, HOUR_MS]
// Power above this counts as charging (ignores the charger's own standby draw).
const CHARGING_MIN_W = 100
// Don't integrate energy or draw a line across a reporting gap longer than this.
const MAX_GAP_MS = 5 * MINUTE_MS

const POWER_COLOR = '#6245DE'
const PHASE_COLORS: Record<string, string> = {
  phaseOne: '#6245DE',
  phaseTwo: '#FF8500',
  phaseThree: '#0EA5E9',
  total: '#16B364',
}
const PALETTE = ['#6245DE', '#FF8500', '#0EA5E9', '#16B364', '#FFD602', '#1570EF']

type Point = { t: number } & Record<string, number | [number, number] | undefined>

function localMs(day: string, time: string): number {
  const [y, m, d] = day.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h || 0, min || 0).getTime()
}

function fmtDuration(ms: number): string {
  const minutes = Math.round(ms / MINUTE_MS)
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function fmtStep(ms: number): string {
  if (ms < MINUTE_MS) return `${Math.round(ms / 1000)} s`
  if (ms < HOUR_MS) return `${fmtNumber(ms / MINUTE_MS, ms % MINUTE_MS ? 1 : 0)} min`
  return `${fmtNumber(ms / HOUR_MS, 0)} h`
}

/** Numeric series of one reading for the chosen metric (dots dropped — recharts reads them as paths). */
function valuesOf(r: ChargerReading, metric: Metric): Record<string, number> {
  if (metric === 'power') return Number.isFinite(r.power) ? { power: r.power } : {}
  const flat = flattenNumbers(r[metric] ?? {})
  return Object.fromEntries(Object.entries(flat).map(([k, v]) => [k.replace(/\./g, '_'), v]))
}

/**
 * Average readings into `bucketMs` buckets (optionally with a min–max power band)
 * and insert an empty point after any reporting gap so the lines break there
 * instead of drawing a straight line across an offline period.
 */
function toPoints(readings: ChargerReading[], metric: Metric, bucketMs: number, withBand: boolean): Point[] {
  const buckets = new Map<number, { sums: Record<string, number>; n: Record<string, number>; min: number; max: number }>()
  for (const r of readings) {
    const b = Math.floor(r.t / bucketMs) * bucketMs
    let acc = buckets.get(b)
    if (!acc) {
      acc = { sums: {}, n: {}, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY }
      buckets.set(b, acc)
    }
    for (const [k, v] of Object.entries(valuesOf(r, metric))) {
      acc.sums[k] = (acc.sums[k] ?? 0) + v
      acc.n[k] = (acc.n[k] ?? 0) + 1
    }
    if (Number.isFinite(r.power)) {
      acc.min = Math.min(acc.min, r.power)
      acc.max = Math.max(acc.max, r.power)
    }
  }
  const points: Point[] = []
  let prevT: number | null = null
  for (const [t, acc] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    if (prevT != null && t - prevT > Math.max(MAX_GAP_MS, 2 * bucketMs)) points.push({ t: prevT + bucketMs })
    const point: Point = { t }
    for (const k of Object.keys(acc.sums)) point[k] = acc.sums[k] / acc.n[k]
    if (withBand && acc.max >= acc.min) point.band = [acc.min, acc.max]
    points.push(point)
    prevT = t
  }
  return points
}

export function ChargerTelemetry({ addressUuid, identifier }: { addressUuid: string; identifier: string }) {
  const { t } = useTranslation()

  const [mode, setMode] = useState<DateMode>('single')
  const [fromDay, setFromDay] = useState(todayISO())
  const [toDay, setToDay] = useState(todayISO())
  const [fromTime, setFromTime] = useState('00:00')
  const [toTime, setToTime] = useState('23:59')
  const [metric, setMetric] = useState<Metric>('power')

  // The "to" time is inclusive of its whole minute.
  const period = useMemo(() => {
    const fromMs = localMs(fromDay, fromTime)
    const toMs = localMs(mode === 'single' ? fromDay : toDay, toTime) + MINUTE_MS
    return Number.isFinite(fromMs) && Number.isFinite(toMs) ? { fromMs, toMs } : null
  }, [mode, fromDay, toDay, fromTime, toTime])
  const invalid = !period || period.fromMs >= period.toMs

  const { readings, truncated, loading, pages, error, retry } = useChargerReadings(
    addressUuid,
    identifier,
    invalid ? null : period,
  )

  const domain = useMemo<[number, number]>(() => (period ? [period.fromMs, period.toMs] : [0, 0]), [period])
  const multiDay = period != null && format(period.fromMs, 'yyyy-MM-dd') !== format(period.toMs - 1, 'yyyy-MM-dd')
  const timeLabel = (ms: number) => format(new Date(ms), multiDay ? 'd MMM HH:mm' : 'HH:mm')

  // Typical spacing between readings — decides whether averaging adds anything.
  const intervalMs = useMemo(() => {
    if (readings.length < 2) return null
    const gaps = readings.slice(1).map((r, i) => r.t - readings[i].t).sort((a, b) => a - b)
    return gaps[Math.floor(gaps.length / 2)]
  }, [readings])

  const bucketMs = useMemo(() => {
    const span = domain[1] - domain[0]
    return BUCKETS_MS.find((b) => span / b <= OVERVIEW_POINTS) ?? BUCKETS_MS[BUCKETS_MS.length - 1]
  }, [domain])
  const averaged = intervalMs != null && bucketMs > 2 * intervalMs

  const series = useMemo<SeriesDef[]>(() => {
    if (metric === 'power') return [{ key: 'power', name: t('fields.power'), color: POWER_COLOR }]
    const keys: string[] = []
    for (const r of readings) for (const k of Object.keys(valuesOf(r, metric))) if (!keys.includes(k)) keys.push(k)
    return keys.map((k, i) => ({
      key: k,
      name: t(`fields.${k}`, { defaultValue: humanizeKey(k) }),
      color: PHASE_COLORS[k] ?? PALETTE[i % PALETTE.length],
    }))
  }, [metric, readings, t])

  const overview = useMemo(
    () => toPoints(readings, metric, averaged ? bucketMs : 1, averaged && metric === 'power'),
    [readings, metric, bucketMs, averaged],
  )

  const stats = useMemo(() => {
    let energyWh = 0
    let chargingMs = 0
    let peak: ChargerReading | null = null
    readings.forEach((r, i) => {
      if (Number.isFinite(r.power) && (!peak || r.power > peak.power)) peak = r
      if (i === 0) return
      const prev = readings[i - 1]
      const dt = r.t - prev.t
      if (dt > MAX_GAP_MS || !Number.isFinite(prev.power) || !Number.isFinite(r.power)) return
      energyWh += ((prev.power + r.power) / 2) * (dt / HOUR_MS)
      if (prev.power > CHARGING_MIN_W) chargingMs += dt
    })
    return { energyWh, chargingMs, peak: peak as ChargerReading | null }
  }, [readings])

  const metrics: ReportMetric[] = [
    {
      label: t('telemetry.charger.metrics.energy'),
      value: `${fmtNumber(stats.energyWh / 1000, 1)} kWh`,
      sub: t('telemetry.charger.metrics.energySub'),
    },
    {
      label: t('telemetry.charger.metrics.peak'),
      value: stats.peak ? `${fmtNumber(stats.peak.power / 1000, 1)} kW` : '—',
      sub: stats.peak ? t('telemetry.charger.metrics.peakSub', { time: timeLabel(stats.peak.t) }) : undefined,
    },
    {
      label: t('telemetry.charger.metrics.charging'),
      value: fmtDuration(stats.chargingMs),
      sub: t('telemetry.charger.metrics.chargingSub', { watts: CHARGING_MIN_W }),
    },
    {
      label: t('telemetry.charger.metrics.readings'),
      value: readings.length.toLocaleString(),
      sub: intervalMs != null ? t('telemetry.charger.metrics.readingsSub', { interval: fmtStep(intervalMs) }) : undefined,
    },
  ]

  // Block detail — full-resolution 15-min block ±15 min, sliced from the loaded readings.
  const alignBlock = (ms: number) => Math.floor(ms / BLOCK_MS) * BLOCK_MS
  const first = readings[0]
  const last = readings[readings.length - 1]
  const startBlock = first ? alignBlock(first.t) : null
  const endBlock = last ? alignBlock(last.t) : null
  const peakBlock = stats.peak ? alignBlock(stats.peak.t) : null
  const showDetail = !!first && domain[1] - domain[0] > BLOCK_MS + 2 * DETAIL_PAD_MS

  const [blockStart, setBlockStart] = useState<number | null>(null)
  useEffect(() => {
    setBlockStart(startBlock)
  }, [startBlock])

  const blockOptions = useMemo(() => {
    if (startBlock == null || endBlock == null) return [] as number[]
    const opts: number[] = []
    for (let ms = startBlock; ms <= endBlock; ms += BLOCK_MS) opts.push(ms)
    return opts
  }, [startBlock, endBlock])

  const detailDomain = useMemo<[number, number] | null>(
    () =>
      blockStart == null
        ? null
        : [Math.max(blockStart - DETAIL_PAD_MS, domain[0]), Math.min(blockStart + BLOCK_MS + DETAIL_PAD_MS, domain[1])],
    [blockStart, domain],
  )
  const detail = useMemo(
    () =>
      detailDomain
        ? toPoints(
            readings.filter((r) => r.t >= detailDomain[0] && r.t <= detailDomain[1]),
            metric,
            1,
            false,
          )
        : [],
    [readings, detailDomain, metric],
  )

  const exportCsv = () =>
    downloadCsv(
      `charger-${identifier}-${format(domain[0], 'yyyyMMdd-HHmm')}_${format(domain[1], 'yyyyMMdd-HHmm')}.csv`,
      readings.map((r) => ({
        time: r.time,
        power: r.power,
        energyTotal: r.energyTotal,
        ...flattenNumbers(r.current ?? {}, 'current'),
        ...flattenNumbers(r.voltage ?? {}, 'voltage'),
      })),
    )

  const pill = (active: boolean) =>
    cn(
      'rounded-full px-3 py-1.5 text-13 font-semibold transition-colors',
      active ? 'bg-dark-purple text-white' : 'bg-beige-2 text-text-gray hover:bg-beige/60',
    )

  const metricToggle = (
    <div className="inline-flex overflow-hidden rounded-xl border border-beige-2">
      {METRICS.map((m) => (
        <button
          key={m}
          onClick={() => setMetric(m)}
          className={cn(
            'px-3 py-1.5 text-13 font-semibold transition-colors',
            metric === m ? 'bg-dark-purple text-white' : 'bg-white text-text-gray hover:bg-beige/60',
          )}
        >
          {t(`telemetry.charger.metric.${m}`)} ({UNIT[m]})
        </button>
      ))}
    </div>
  )

  const filters = (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="label">{t('telemetry.charger.period')}</label>
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
                {t(`telemetry.charger.mode.${m}`)}
              </button>
            ))}
          </div>
        </div>
        {mode === 'single' ? (
          <>
            <div>
              <label className="label">{t('telemetry.charger.date')}</label>
              <input type="date" className="input" value={fromDay} onChange={(e) => setFromDay(e.target.value)} />
            </div>
            <div>
              <label className="label">{t('telemetry.charger.startTime')}</label>
              <input type="time" className="input" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
            </div>
            <div>
              <label className="label">{t('telemetry.charger.endTime')}</label>
              <input type="time" className="input" value={toTime} onChange={(e) => setToTime(e.target.value)} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="label">{t('telemetry.charger.from')}</label>
              <div className="flex gap-2">
                <input type="date" className="input" value={fromDay} onChange={(e) => setFromDay(e.target.value)} />
                <input type="time" className="input" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">{t('telemetry.charger.to')}</label>
              <div className="flex gap-2">
                <input type="date" className="input" value={toDay} onChange={(e) => setToDay(e.target.value)} />
                <input type="time" className="input" value={toTime} onChange={(e) => setToTime(e.target.value)} />
              </div>
            </div>
          </>
        )}
        <button className="btn-secondary ml-auto" onClick={exportCsv} disabled={loading || readings.length === 0}>
          <ArrowDownTrayIcon className="size-4" />
          {t('common.exportCsv')}
        </button>
      </div>
      <p className="text-11 text-text-gray">{t('telemetry.charger.hint')}</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {filters}

      {invalid ? (
        <div className="card p-5 text-center text-sm text-text-gray">{t('telemetry.charger.invalid')}</div>
      ) : loading ? (
        <div className="card flex items-center justify-center gap-3 py-16 text-sm text-text-gray">
          <Spinner />
          <span>{t('telemetry.charger.fetching', { pages })}</span>
        </div>
      ) : (
        <DataState
          isLoading={false}
          error={error}
          isEmpty={readings.length === 0}
          emptyMessage={t('telemetry.noReadings')}
          onRetry={retry}
        >
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {metrics.map((m, i) => (
                <MetricCard key={i} label={m.label} value={m.value} sub={m.sub} />
              ))}
            </div>

            {truncated && last && (
              <div className="card border-orange/30 bg-orange/5 p-4 text-13 text-dark-blue">
                {t('telemetry.charger.truncated', {
                  pages,
                  readings: readings.length.toLocaleString(),
                  time: timeLabel(last.t),
                })}
              </div>
            )}

            <div className="card space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-dark-blue">{t('telemetry.charger.overview.title')}</p>
                  <p className="mt-1 text-13 text-text-gray">
                    {t('telemetry.charger.overview.subtitle', { from: timeLabel(domain[0]), to: timeLabel(domain[1]) })}
                  </p>
                </div>
                {metricToggle}
              </div>
              <CurtailmentChart
                data={overview}
                domain={domain}
                series={series}
                range={
                  averaged && metric === 'power'
                    ? { key: 'band', name: t('telemetry.charger.powerRange'), color: POWER_COLOR }
                    : undefined
                }
                unit={UNIT[metric]}
                decimals={metric === 'current' ? 1 : 0}
                height={320}
                toggleable
              />
              <p className="text-11 text-text-gray">
                {averaged
                  ? t('telemetry.charger.overview.hintAveraged', { bucket: fmtStep(bucketMs) })
                  : t('telemetry.charger.overview.hintRaw')}
              </p>
            </div>

            {showDetail && (
              <div className="card space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-dark-blue">{t('telemetry.charger.detail.title')}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {startBlock != null && (
                      <button onClick={() => setBlockStart(startBlock)} className={pill(blockStart === startBlock)}>
                        {t('telemetry.charger.detail.startBlock')}
                      </button>
                    )}
                    {peakBlock != null && (
                      <button onClick={() => setBlockStart(peakBlock)} className={pill(blockStart === peakBlock)}>
                        {t('telemetry.charger.detail.peakBlock')}
                      </button>
                    )}
                    {endBlock != null && endBlock !== startBlock && (
                      <button onClick={() => setBlockStart(endBlock)} className={pill(blockStart === endBlock)}>
                        {t('telemetry.charger.detail.endBlock')}
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
                    {t('telemetry.charger.detail.window', {
                      from: timeLabel(detailDomain[0]),
                      to: timeLabel(detailDomain[1]),
                    })}
                  </p>
                )}
                {detailDomain && detail.length > 0 ? (
                  <CurtailmentChart
                    data={detail}
                    domain={detailDomain}
                    series={series}
                    unit={UNIT[metric]}
                    decimals={metric === 'current' ? 1 : 0}
                    height={300}
                    withSeconds
                    toggleable
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-text-gray">{t('telemetry.charger.detail.empty')}</p>
                )}
              </div>
            )}
          </div>
        </DataState>
      )}
    </div>
  )
}
