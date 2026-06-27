import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { localDayRangeUTC, localMonthRangeUTC, localYearRangeUTC } from './range'
import { todayISO, thisMonth, thisYear } from '@/utils/format'

export type Resolution = 'quarter_hourly' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'

const RESOLUTIONS: Resolution[] = ['quarter_hourly', 'hourly', 'daily', 'weekly', 'monthly', 'yearly']

// Which calendar period the user picks for each resolution — chosen so the
// range yields a sensible number of points (a day of 15-min, a month of days,
// a year of months, etc.).
function periodKind(r: Resolution): 'date' | 'month' | 'year' {
  if (r === 'quarter_hourly' || r === 'hourly') return 'date'
  if (r === 'daily' || r === 'weekly') return 'month'
  return 'year'
}

const inputCls = 'input h-9 w-auto py-1'

/**
 * Resolution selector + an adaptive from/to period picker. The picker's
 * granularity follows the resolution (day → month → year) and is translated
 * into the appropriate fromDate/toDate range for the interval endpoints.
 */
export function useResolutionRange(initial: Resolution = 'quarter_hourly') {
  const { t } = useTranslation()
  const [resolution, setResolution] = useState<Resolution>(initial)
  const [day, setDay] = useState(todayISO())
  const [month, setMonth] = useState(thisMonth())
  const [year, setYear] = useState(thisYear())

  const kind = periodKind(resolution)

  const range = useMemo(() => {
    if (kind === 'date') return { resolution, ...localDayRangeUTC(day) }
    if (kind === 'month') return { resolution, ...localMonthRangeUTC(month) }
    // Yearly aggregates over a single year is one point — show a 5-year window.
    return { resolution, ...localYearRangeUTC(year, resolution === 'yearly' ? 4 : 0) }
  }, [resolution, kind, day, month, year])

  const labels: Record<Resolution, string> = {
    quarter_hourly: t('telemetry.resQuarterHourly'),
    hourly: t('telemetry.resHourly'),
    daily: t('telemetry.resDaily'),
    weekly: t('telemetry.resWeekly'),
    monthly: t('telemetry.resMonthly'),
    yearly: t('telemetry.resYearly'),
  }
  const years = Array.from({ length: 10 }, (_, i) => thisYear() - i)

  const control = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={inputCls}
        aria-label={t('telemetry.resolutionLabel')}
        value={resolution}
        onChange={(e) => setResolution(e.target.value as Resolution)}
      >
        {RESOLUTIONS.map((r) => (
          <option key={r} value={r}>
            {labels[r]}
          </option>
        ))}
      </select>

      {kind === 'date' && (
        <input type="date" className={inputCls} value={day} onChange={(e) => setDay(e.target.value)} />
      )}
      {kind === 'month' && (
        <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} />
      )}
      {kind === 'year' && (
        <select className={inputCls} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      )}
    </div>
  )

  return { resolution, range, control }
}
