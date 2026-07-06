import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowPathIcon, ArrowDownTrayIcon, DocumentArrowDownIcon, StopIcon } from '@heroicons/react/24/outline'
import {
  ComposedChart,
  Bar,
  Cell,
  Line,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Spinner } from '@/components/common/Spinner'
import { DataTable, type Column } from '@/components/common/DataTable'
import { TimeSeriesChart } from '@/features/telemetry/TimeSeriesChart'
import { downloadCsv } from '@/utils/csv'
import { useContextStore } from '@/store/context'
import { useBatteryReport } from '../useBatteryReport'
import { runBatterySimulation, type BatteryStrategy } from '../batterySimulation'
import { sweepCapacities, CAPACITY_SWEEP_MIN_KWH, CAPACITY_SWEEP_MAX_KWH } from '../batterySizing'
import type { PdfLanguage } from '../batteryReportPdf'
import type { HourlySlot } from '../addressEnergyHistory'

type PriceMode = 'fixed' | 'spot'

// Simulation defaults (mirroring the companion-web battery report).
const MIN_SOC_PERCENT = 10
const INITIAL_SOC_PERCENT = 50
// Starting point for the interactive comparison — a common home battery size.
const DEFAULT_CAPACITY_KWH = 10

const eur = (v: number) => `€ ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`

/** Estimated savings per calendar month for one simulated battery. */
function monthlySavings(
  slots: HourlySlot[],
  hourly: { time: string; chargeWh: number; dischargeWh: number }[],
  strategy: BatteryStrategy,
  priceMode: PriceMode,
  prices: Map<string, number>,
  fixedConsumption: number,
  fixedReturn: number,
): Array<{ month: string; savings: number }> {
  const byMonth = new Map<string, number>()
  for (let i = 0; i < slots.length; i++) {
    const hr = hourly[i]
    if (!hr) continue
    const month = hr.time.slice(0, 7)
    let value = 0
    if (priceMode === 'spot') {
      const price = prices.get(hr.time) ?? 0
      value =
        strategy === 'profit'
          ? ((hr.dischargeWh - hr.chargeWh) / 1000) * price
          : (hr.dischargeWh / 1000) * price
    } else {
      value = (hr.dischargeWh / 1000) * fixedConsumption - (hr.chargeWh / 1000) * fixedReturn
    }
    byMonth.set(month, (byMonth.get(month) ?? 0) + value)
  }
  return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, savings]) => ({ month, savings }))
}

export function BatteryReport() {
  const { t } = useTranslation()
  const { addressUuid } = useContextStore()

  const [months, setMonths] = useState(12)
  const [strategy, setStrategy] = useState<BatteryStrategy>('self-consumption')
  const [priceMode, setPriceMode] = useState<PriceMode>('spot')
  const [fixedConsumption, setFixedConsumption] = useState(0.25)
  const [fixedReturn, setFixedReturn] = useState(0.08)
  const [batteryCostPerKwh, setBatteryCostPerKwh] = useState(500)
  // User-selected configuration to explore; null = follow the recommendation.
  const [capacitySel, setCapacitySel] = useState<number | null>(null)
  const [inverterSel, setInverterSel] = useState<number | null>(null)
  const [pdfLang, setPdfLang] = useState<PdfLanguage>('nl')

  const { status, progress, data, generatedAt, error, run, cancel } = useBatteryReport(addressUuid, months)

  const running = status === 'running'
  const progressPct = progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0

  // Profit strategy only makes sense against hourly spot prices.
  const effectivePriceMode: PriceMode = strategy === 'profit' ? 'spot' : priceMode

  const priceMap = useMemo(() => new Map(data?.priceEntries ?? []), [data])

  // The whole sweep runs at the selected inverter power (default: recommended
  // from the peaks), so changing the inverter re-ranks every capacity.
  const inverterKw = inverterSel ?? data?.inverterKw ?? 0

  const sweep = useMemo(() => {
    if (!data || data.slots.length === 0) return null
    return sweepCapacities({
      hourlySlots: data.slots,
      periodDays: data.periodDays,
      inverterKw,
      strategy,
      hourlyPricesByTime: effectivePriceMode === 'spot' ? priceMap : undefined,
      fixedConsumptionPriceEurPerKwh: effectivePriceMode === 'fixed' ? fixedConsumption : undefined,
      fixedReturnPriceEurPerKwh: effectivePriceMode === 'fixed' ? fixedReturn : undefined,
      batteryCostPerKwh,
      minSocPercent: MIN_SOC_PERCENT,
      initialSocPercent: INITIAL_SOC_PERCENT,
    })
  }, [data, inverterKw, strategy, effectivePriceMode, priceMap, fixedConsumption, fixedReturn, batteryCostPerKwh])

  const selectedCapacity = capacitySel ?? DEFAULT_CAPACITY_KWH
  const selectedRow = sweep?.rows.find((r) => r.capacityKwh === selectedCapacity) ?? null

  // Full simulation of the selected configuration — feeds the monthly chart
  // and the PDF appendix.
  const selectedSim = useMemo(() => {
    if (!data || !selectedRow) return null
    return runBatterySimulation({
      hourlySlots: data.slots,
      hourlyPricesByTime: effectivePriceMode === 'spot' ? priceMap : undefined,
      fixedConsumptionPriceEurPerKwh: effectivePriceMode === 'fixed' ? fixedConsumption : undefined,
      fixedReturnPriceEurPerKwh: effectivePriceMode === 'fixed' ? fixedReturn : undefined,
      capacityKwh: selectedRow.capacityKwh,
      inverterKw,
      minSocPercent: MIN_SOC_PERCENT,
      initialSocKwh: selectedRow.capacityKwh * (INITIAL_SOC_PERCENT / 100),
      strategy,
    })
  }, [data, selectedRow, inverterKw, strategy, effectivePriceMode, priceMap, fixedConsumption, fixedReturn])

  const monthly = useMemo(() => {
    if (!data || !selectedSim) return []
    return monthlySavings(data.slots, selectedSim.hourly, strategy, effectivePriceMode, priceMap, fixedConsumption, fixedReturn)
  }, [data, selectedSim, strategy, effectivePriceMode, priceMap, fixedConsumption, fixedReturn])

  // Charged/discharged kWh per UTC day — discharge plotted below zero.
  const daily = useMemo(() => {
    if (!selectedSim) return []
    const byDate = new Map<string, { charge: number; discharge: number }>()
    for (const hr of selectedSim.hourly) {
      const date = hr.time.slice(0, 10)
      const s = byDate.get(date) ?? { charge: 0, discharge: 0 }
      s.charge += hr.chargeWh
      s.discharge += hr.dischargeWh
      byDate.set(date, s)
    }
    return [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, s]) => ({ date, charge: s.charge / 1000, discharge: -s.discharge / 1000 }))
  }, [selectedSim])

  // Day drill-down for verifying the simulation; defaults to the most active day.
  const [daySel, setDaySel] = useState<string | null>(null)
  const defaultDay = useMemo(() => {
    let bestDate: string | null = null
    let bestValue = -1
    for (const d of daily) {
      const activity = d.charge - d.discharge // discharge is negative
      if (activity > bestValue) {
        bestValue = activity
        bestDate = d.date
      }
    }
    return bestDate
  }, [daily])
  const day = daySel && daily.some((d) => d.date === daySel) ? daySel : defaultDay

  interface DayHourRow {
    time: string
    delivered: number
    returned: number
    produced: number
    charge: number
    discharge: number
    socPct: number
    price: number | null
  }

  const dayDetail = useMemo<DayHourRow[]>(() => {
    if (!data || !selectedSim || !selectedRow || !day) return []
    const capacityWh = selectedRow.capacityKwh * 1000
    const rows: DayHourRow[] = []
    // slots and sim.hourly are index-aligned (the sim iterates the slots).
    for (let i = 0; i < data.slots.length; i++) {
      const slot = data.slots[i]
      if (!slot.time.startsWith(day)) continue
      const hr = selectedSim.hourly[i]
      if (!hr) continue
      rows.push({
        time: slot.time.slice(11, 16),
        delivered: slot.delivered / 1000,
        returned: slot.returned / 1000,
        produced: slot.produced / 1000,
        charge: hr.chargeWh / 1000,
        discharge: hr.dischargeWh / 1000,
        socPct: (hr.socEnd / capacityWh) * 100,
        price: effectivePriceMode === 'spot' ? (priceMap.get(slot.time) ?? null) : null,
      })
    }
    return rows
  }, [data, selectedSim, selectedRow, day, effectivePriceMode, priceMap])

  const kwh = (v: number) => v.toFixed(2)
  const dayCols: Column<DayHourRow>[] = [
    { key: 'time', header: t('reports.battery.day.colTime') },
    { key: 'delivered', header: t('reports.battery.day.colDelivered'), render: (r) => kwh(r.delivered) },
    { key: 'returned', header: t('reports.battery.day.colReturned'), render: (r) => kwh(r.returned) },
    { key: 'produced', header: t('reports.battery.day.colProduced'), render: (r) => kwh(r.produced) },
    {
      key: 'charge',
      header: t('reports.battery.day.colCharge'),
      render: (r) => <span className={r.charge > 0 ? 'font-bold text-dark-purple' : ''}>{kwh(r.charge)}</span>,
    },
    {
      key: 'discharge',
      header: t('reports.battery.day.colDischarge'),
      render: (r) => <span className={r.discharge > 0 ? 'font-bold text-green' : ''}>{kwh(r.discharge)}</span>,
    },
    { key: 'socPct', header: t('reports.battery.day.colSoc'), render: (r) => `${r.socPct.toFixed(0)}%` },
    ...(effectivePriceMode === 'spot'
      ? [
          {
            key: 'price',
            header: t('reports.battery.day.colPrice'),
            render: (r) => (r.price != null ? r.price.toFixed(3) : '—'),
          } as Column<DayHourRow>,
        ]
      : []),
  ]

  const exportPdf = async () => {
    if (!data || !sweep || !selectedRow || !selectedSim || !addressUuid) return
    // jsPDF is heavy; load it only when an export is actually requested.
    const { buildBatteryPdf } = await import('../batteryReportPdf')
    // Appendix data: monthly charged/discharged energy and average SoC.
    const capacityWh = selectedRow.capacityKwh * 1000
    const byMonth = new Map<string, { chargeWh: number; dischargeWh: number; socSum: number; hours: number }>()
    for (const hr of selectedSim.hourly) {
      const month = hr.time.slice(0, 7)
      const slot = byMonth.get(month) ?? { chargeWh: 0, dischargeWh: 0, socSum: 0, hours: 0 }
      slot.chargeWh += hr.chargeWh
      slot.dischargeWh += hr.dischargeWh
      slot.socSum += hr.socEnd / capacityWh
      slot.hours++
      byMonth.set(month, slot)
    }
    const monthlyEnergy = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, s]) => ({
        month,
        chargedKwh: s.chargeWh / 1000,
        dischargedKwh: s.dischargeWh / 1000,
        avgSocPct: s.hours > 0 ? (s.socSum / s.hours) * 100 : 0,
      }))

    // Day-by-day breakdown so the simulation can be verified in the PDF.
    const byDate = new Map<string, { chargeWh: number; dischargeWh: number; endSocWh: number }>()
    for (const hr of selectedSim.hourly) {
      const date = hr.time.slice(0, 10)
      const slot = byDate.get(date) ?? { chargeWh: 0, dischargeWh: 0, endSocWh: 0 }
      slot.chargeWh += hr.chargeWh
      slot.dischargeWh += hr.dischargeWh
      slot.endSocWh = hr.socEnd // hourly is chronological, so the last hour wins
      byDate.set(date, slot)
    }
    const dailyEnergy = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, s]) => ({
        date,
        chargedKwh: s.chargeWh / 1000,
        dischargedKwh: s.dischargeWh / 1000,
        endSocPct: (s.endSocWh / capacityWh) * 100,
      }))

    const doc = await buildBatteryPdf({
      language: pdfLang,
      addressUuid,
      fromIso: data.fromIso,
      toIso: data.toIso,
      generatedAt: generatedAt ?? new Date().toISOString(),
      strategy,
      priceMode: effectivePriceMode,
      fixedConsumption,
      fixedReturn,
      batteryCostPerKwh,
      capacityKwh: selectedRow.capacityKwh,
      inverterKw,
      recommendedInverterKw: data.inverterKw,
      minSocPercent: MIN_SOC_PERCENT,
      initialSocPercent: INITIAL_SOC_PERCENT,
      selection: selectedRow,
      sweepRows: sweep.rows,
      monthlySavings: monthly,
      monthlyEnergy,
      dailyEnergy,
      totalChargedKwh: selectedSim.totalChargedWh / 1000,
      totalDischargedKwh: selectedSim.totalDischargedWh / 1000,
    })
    doc.save(`chargee-battery-advice-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const inputCls = 'input h-10 w-auto py-1'
  const selectCls = `${inputCls} pr-9`
  const labelCls = 'text-11 font-bold uppercase tracking-wide text-text-gray'

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="card p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t('reports.battery.period')}</span>
            <select className={selectCls} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[3, 6, 12].map((m) => (
                <option key={m} value={m}>
                  {t('reports.battery.periodMonths', { n: m })}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t('reports.battery.strategy')}</span>
            <select
              className={selectCls}
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as BatteryStrategy)}
            >
              <option value="self-consumption">{t('reports.battery.strategySelf')}</option>
              <option value="profit">{t('reports.battery.strategyProfit')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t('reports.battery.priceMode')}</span>
            <select
              className={selectCls}
              value={effectivePriceMode}
              disabled={strategy === 'profit'}
              onChange={(e) => setPriceMode(e.target.value as PriceMode)}
            >
              <option value="spot">{t('reports.battery.priceSpot')}</option>
              <option value="fixed">{t('reports.battery.priceFixed')}</option>
            </select>
          </label>
          {effectivePriceMode === 'fixed' && (
            <>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>{t('reports.battery.fixedConsumption')}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={`${inputCls} w-24`}
                  value={fixedConsumption}
                  onChange={(e) => setFixedConsumption(Number(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>{t('reports.battery.fixedReturn')}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={`${inputCls} w-24`}
                  value={fixedReturn}
                  onChange={(e) => setFixedReturn(Number(e.target.value))}
                />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className={labelCls}>{t('reports.battery.batteryCost')}</span>
            <input
              type="number"
              step="50"
              min="0"
              className={`${inputCls} w-28`}
              value={batteryCostPerKwh}
              onChange={(e) => setBatteryCostPerKwh(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-beige-2 pt-4">
          <p className="text-11 text-text-gray">
            {generatedAt && !running
              ? t('reports.generatedAt', { time: new Date(generatedAt).toLocaleString() })
              : ''}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <button className="btn-secondary" onClick={cancel}>
                <StopIcon className="size-4" />
                {t('reports.cancel')}
              </button>
            ) : (
              <button className="btn-primary" onClick={run} disabled={!addressUuid}>
                <ArrowPathIcon className="size-4" />
                {status === 'done' || status === 'cancelled' ? t('reports.regenerate') : t('reports.generate')}
              </button>
            )}
            {sweep && (
              <>
                <button
                  className="btn-secondary"
                  onClick={() =>
                    downloadCsv(`battery-advice-${new Date().toISOString().slice(0, 10)}.csv`, sweep.rows)
                  }
                >
                  <ArrowDownTrayIcon className="size-4" />
                  {t('reports.downloadCsv')}
                </button>
                <select
                  className="input h-12 w-auto rounded-20 pr-9 font-semibold"
                  aria-label={t('reports.battery.pdfLanguage')}
                  value={pdfLang}
                  onChange={(e) => setPdfLang(e.target.value as PdfLanguage)}
                >
                  <option value="nl">Nederlands</option>
                  <option value="en">English</option>
                </select>
                <button className="btn-secondary" onClick={exportPdf} disabled={!selectedRow}>
                  <DocumentArrowDownIcon className="size-4" />
                  {t('reports.battery.downloadPdf')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {running && (
        <div className="card space-y-3 p-5">
          <div className="flex items-center gap-3 text-sm text-text-gray">
            <Spinner />
            <span>{t('reports.battery.progressRequests', { done: progress.done, total: progress.total })}</span>
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

      {status === 'done' && data && !data.hasSmartMeter && (
        <div className="card p-5 text-sm font-semibold text-orange">{t('reports.battery.noSmartMeter')}</div>
      )}
      {status === 'done' && data && data.hasSmartMeter && !data.hasSolar && strategy === 'self-consumption' && (
        <div className="card p-5 text-sm text-text-gray">{t('reports.battery.noSolarNote')}</div>
      )}

      {sweep && data && (
        <>
          {/* Explore a specific configuration */}
          <div className="card border-2 border-dark-purple/30 p-5">
            <p className="mb-1 text-sm font-semibold text-dark-blue">{t('reports.battery.tryTitle')}</p>
            <p className="mb-4 text-13 text-text-gray">{t('reports.battery.trySub')}</p>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1">
                <span className={labelCls}>{t('reports.battery.tryCapacity')}</span>
                <select
                  className={selectCls}
                  value={selectedCapacity ?? ''}
                  onChange={(e) => setCapacitySel(Number(e.target.value))}
                >
                  {Array.from(
                    { length: CAPACITY_SWEEP_MAX_KWH - CAPACITY_SWEEP_MIN_KWH + 1 },
                    (_, i) => CAPACITY_SWEEP_MIN_KWH + i,
                  ).map((cap) => (
                    <option key={cap} value={cap}>
                      {cap} kWh
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>{t('reports.battery.tryInverter')}</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="20"
                  className={`${inputCls} w-24`}
                  value={inverterKw}
                  onChange={(e) => setInverterSel(Math.max(0.5, Math.min(20, Number(e.target.value) || 0.5)))}
                />
              </label>
              {(capacitySel != null || inverterSel != null) && (
                <button
                  className="btn-secondary h-10"
                  onClick={() => {
                    setCapacitySel(null)
                    setInverterSel(null)
                  }}
                >
                  {t('reports.battery.tryReset')}
                </button>
              )}
            </div>
            <p className="mt-2 text-11 text-text-gray">
              {t('reports.battery.inverterRecommendedSub', { kw: data.inverterKw })} —{' '}
              {t('reports.battery.inverterSub')}
            </p>
            {selectedRow && (
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-beige-2 pt-4 sm:grid-cols-4">
                <div>
                  <p className={labelCls}>{t('reports.battery.annualSavings')}</p>
                  <p className="text-28 font-extrabold leading-tight text-green">{eur(selectedRow.annualSavingsEur)}</p>
                </div>
                <div>
                  <p className={labelCls}>{t('reports.battery.investment')}</p>
                  <p className="text-28 font-extrabold leading-tight text-dark-blue">{eur(selectedRow.costEur)}</p>
                </div>
                <div>
                  <p className={labelCls}>{t('reports.battery.payback')}</p>
                  <p className="text-28 font-extrabold leading-tight text-dark-blue">
                    {selectedRow.paybackYears === Number.POSITIVE_INFINITY
                      ? '—'
                      : t('reports.battery.paybackYears', { years: selectedRow.paybackYears.toFixed(1) })}
                  </p>
                </div>
                <div>
                  <p className={labelCls}>{t('reports.battery.roi')}</p>
                  <p className="text-28 font-extrabold leading-tight text-dark-blue">
                    {selectedRow.roiPercent.toFixed(1)}%
                  </p>
                  {selectedRow.selfConsumptionPercent != null && (
                    <p className="text-11 text-text-gray">
                      {t('reports.battery.selfConsumptionSub', { pct: selectedRow.selfConsumptionPercent })}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Capacity sweep */}
          <div className="card p-5">
            <p className="mb-1 text-sm font-semibold text-dark-blue">{t('reports.battery.sweepTitle')}</p>
            <p className="mb-4 text-13 text-text-gray">{t('reports.battery.sweepSub')}</p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={sweep!.rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D5D3CE" vertical={false} />
                <XAxis
                  dataKey="capacityKwh"
                  tick={{ fontSize: 11, fill: '#696969' }}
                  label={{ value: 'kWh', position: 'insideBottomRight', offset: -2, fontSize: 11, fill: '#696969' }}
                />
                <YAxis yAxisId="savings" tick={{ fontSize: 11, fill: '#696969' }} width={56} />
                <YAxis yAxisId="roi" orientation="right" tick={{ fontSize: 11, fill: '#696969' }} width={44} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #D5D3CE', fontSize: 12 }}
                  formatter={(value: number, name: string) =>
                    name === t('reports.battery.chartRoi') ? [`${value.toFixed(1)}%`, name] : [eur(value), name]
                  }
                  labelFormatter={(v) => `${v} kWh`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  yAxisId="savings"
                  dataKey="annualSavingsEur"
                  name={t('reports.battery.chartAnnualSavings')}
                  fill="#9C87F8"
                  maxBarSize={24}
                  isAnimationActive={false}
                >
                  {sweep!.rows.map((r) => (
                    <Cell key={r.capacityKwh} fill={r.capacityKwh === selectedCapacity ? '#6245DE' : '#9C87F8'} />
                  ))}
                </Bar>
                <Line
                  yAxisId="roi"
                  type="monotone"
                  dataKey="roiPercent"
                  name={t('reports.battery.chartRoi')}
                  stroke="#FF8500"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly savings for the selected battery */}
          {monthly.length > 1 && selectedRow && (
            <div className="card p-5">
              <p className="mb-1 text-sm font-semibold text-dark-blue">
                {t('reports.battery.monthlyTitle', { capacity: selectedRow.capacityKwh })}
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthly} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D5D3CE" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#696969' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#696969' }} width={56} />
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #D5D3CE', fontSize: 12 }}
                    formatter={(value: number) => [eur(value), t('reports.battery.chartMonthlySavings')]}
                  />
                  <Bar dataKey="savings" name={t('reports.battery.chartMonthlySavings')} fill="#16B364" maxBarSize={32} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Daily charge/discharge — verification view of the simulation */}
          {daily.length > 1 && (
            <div className="card p-5">
              <p className="mb-1 text-sm font-semibold text-dark-blue">{t('reports.battery.dailyTitle')}</p>
              <p className="mb-3 text-xs text-text-gray">{t('reports.battery.dailySub')}</p>
              <TimeSeriesChart
                data={daily}
                xKey="date"
                unit="kWh"
                decimals={1}
                brush
                series={[
                  { key: 'charge', name: t('reports.battery.chartCharge'), color: '#6245DE' },
                  { key: 'discharge', name: t('reports.battery.chartDischarge'), color: '#16B364' },
                ]}
              />
            </div>
          )}

          {/* Hour-by-hour drill-down of one day */}
          {day && (
            <div className="card p-5">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-dark-blue">{t('reports.battery.dayDetailTitle')}</p>
                  <p className="text-xs text-text-gray">{t('reports.battery.dayDetailSub')}</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-text-gray">
                  {t('reports.battery.day.pick')}
                  <input
                    type="date"
                    className={inputCls}
                    value={day}
                    min={daily[0]?.date}
                    max={daily[daily.length - 1]?.date}
                    onChange={(e) => setDaySel(e.target.value || null)}
                  />
                </label>
              </div>
              {dayDetail.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <ComposedChart data={dayDetail} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#D5D3CE" vertical={false} />
                      <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#696969' }} minTickGap={16} />
                      <YAxis
                        yAxisId="kwh"
                        tick={{ fontSize: 11, fill: '#696969' }}
                        width={48}
                        label={{ value: 'kWh', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#696969' }}
                      />
                      <YAxis
                        yAxisId="soc"
                        orientation="right"
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: '#696969' }}
                        width={40}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: '1px solid #D5D3CE', fontSize: 12 }}
                        formatter={(value: number, name: string) =>
                          name === t('reports.battery.chartSoc')
                            ? [`${value.toFixed(0)}%`, name]
                            : [`${value.toFixed(2)} kWh`, name]
                        }
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar yAxisId="kwh" dataKey="charge" name={t('reports.battery.chartCharge')} fill="#6245DE" maxBarSize={20} isAnimationActive={false} />
                      <Bar yAxisId="kwh" dataKey="discharge" name={t('reports.battery.chartDischarge')} fill="#16B364" maxBarSize={20} isAnimationActive={false} />
                      <Line
                        yAxisId="soc"
                        type="monotone"
                        dataKey="socPct"
                        name={t('reports.battery.chartSoc')}
                        stroke="#F79009"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="mt-4">
                    <DataTable rows={dayDetail} columns={dayCols} rowKey={(r) => r.time} />
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-text-gray">{t('reports.battery.day.empty')}</p>
              )}
            </div>
          )}
        </>
      )}

      {status === 'done' && data && data.slots.length === 0 && data.hasSmartMeter && (
        <div className="card p-5 text-center text-sm text-text-gray">{t('reports.battery.noData')}</div>
      )}
    </div>
  )
}
