import { useTranslation } from 'react-i18next'
import { isScalar, isPlainObject, humanizeKey } from '@/utils/records'
import { fmtNumber, fmtDateTimeSec, isIsoString } from '@/utils/format'

interface InsightCardsProps {
  record: Record<string, any>
  /** Unit appended to a group's values, keyed by the group field name. */
  units?: Record<string, string>
}

const TIME_KEYS = ['time', 'date', 'timestamp']

/**
 * Presents a single reading attractively:
 *  - the reading timestamp becomes an "as of …" caption
 *  - remaining scalars become headline KPI tiles
 *  - nested objects render as matrices (e.g. phase × net/delivering/returning)
 *    or compact phase strips (e.g. per-phase voltage)
 * Labels are translated via the `fields.*` namespace (falling back to a
 * humanized key) so domain terms read naturally per language.
 */
export function InsightCards({ record, units }: InsightCardsProps) {
  const { t } = useTranslation()
  const label = (path: string) =>
    path
      .split('.')
      .map((seg) => t(`fields.${seg}`, { defaultValue: humanizeKey(seg) }))
      .join(' ')

  const timeKey = TIME_KEYS.find((k) => k in record && isIsoString(record[k]))
  const entries = Object.entries(record).filter(([k]) => k !== timeKey)
  const scalars = entries.filter(([, v]) => isScalar(v))
  const groups = entries.filter(([, v]) => isPlainObject(v)) as [string, Record<string, any>][]

  return (
    <div className="space-y-4">
      {timeKey && (
        <p className="text-13 text-text-gray">
          {t('common.asOf', { time: fmtDateTimeSec(record[timeKey]) })}
        </p>
      )}

      {scalars.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {scalars.map(([k, v]) => {
            const isNum = typeof v === 'number'
            const display = isNum ? fmtNumber(v) : String(v ?? '—')
            return (
              <div key={k} className="rounded-2xl border border-beige-2 bg-cream p-4">
                <p className="text-11 font-bold uppercase tracking-wide text-text-gray">{label(k)}</p>
                <p className="mt-1 truncate text-xl font-extrabold text-dark-blue" title={display}>
                  {display}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {groups.map(([key, obj]) => (
        <Group key={key} name={key} obj={obj} unit={units?.[key]} label={label} />
      ))}
    </div>
  )
}

function Group({
  name,
  obj,
  unit,
  label,
}: {
  name: string
  obj: Record<string, any>
  unit?: string
  label: (p: string) => string
}) {
  const childEntries = Object.entries(obj)
  const childObjects = childEntries.filter(([, v]) => isPlainObject(v)) as [string, Record<string, any>][]
  const childScalars = childEntries.filter(([, v]) => typeof v === 'number') as [string, number][]

  const header = (
    <p className="mb-3 text-13 font-bold text-dark-blue">
      {label(name)}
      {unit ? <span className="ml-1 font-normal text-text-gray">· {unit}</span> : null}
    </p>
  )

  // Matrix: children are objects (e.g. activePower → total/phase × net/...).
  if (childObjects.length > 0 && childScalars.length === 0) {
    const cols: string[] = []
    for (const [, row] of childObjects) {
      for (const c of Object.keys(row)) if (typeof row[c] === 'number' && !cols.includes(c)) cols.push(c)
    }
    return (
      <div className="rounded-2xl border border-beige-2 bg-white p-4">
        {header}
        <div className="overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="text-text-gray">
                <th />
                {cols.map((c) => (
                  <th key={c} className="px-2 py-1 text-right font-semibold">
                    {label(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {childObjects.map(([rk, row]) => (
                <tr key={rk} className="border-t border-beige-2/60">
                  <td className="py-1.5 pr-2 text-text-gray">{label(rk)}</td>
                  {cols.map((c) => (
                    <td key={c} className="px-2 py-1.5 text-right font-mono font-semibold text-dark-blue">
                      {typeof row[c] === 'number' ? fmtNumber(row[c]) : '—'}
                      {unit ? <span className="ml-0.5 text-11 text-text-gray">{unit}</span> : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // Phase strip: children are scalars (e.g. per-phase voltage/current).
  return (
    <div className="rounded-2xl border border-beige-2 bg-white p-4">
      {header}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {childScalars.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-2">
            <span className="text-11 text-text-gray">{label(k)}</span>
            <span className="font-mono text-13 font-semibold text-dark-blue">
              {fmtNumber(v)}
              {unit ? <span className="ml-0.5 text-11 text-text-gray">{unit}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
