import { useTranslation } from 'react-i18next'
import { ArrowLongDownIcon, ArrowLongUpIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { cn } from '@/utils/cn'
import type { ConnectionType, ProductionStatus, SparkyStatus } from './reportSolarStatus'
import { type SortDir, type SortKey, useSolarInverterFilters } from './useSolarInverterFilters'

const CONNECTION_VALUES: ConnectionType[] = ['local', 'cloud']
const STATUS_VALUES: ProductionStatus[] = ['connected', 'stale', 'disconnected']
const SPARKY_VALUES: SparkyStatus[] = ['active', 'inactive', 'none']
const SORT_KEYS: SortKey[] = [
  'lastProductionTime',
  'connectionType',
  'productionStatus',
  'sparkyStatus',
  'brand',
  'model',
  'addressUuid',
]

type Filters = ReturnType<typeof useSolarInverterFilters>

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-13 font-semibold transition-colors',
        active ? 'bg-dark-purple text-white' : 'bg-white text-text-gray hover:bg-beige/60',
      )}
    >
      {label}
    </button>
  )
}

/** Filter/sort toolbar for the All Solar Inverters report (report-specific). */
export function SolarInverterFilterBar({ filters }: { filters: Filters }) {
  const { t } = useTranslation()
  const { state, active, setSearch, toggleConnection, toggleStatus, toggleSparky, setSortKey, setSortDir, clear } = filters

  return (
    <div className="flex flex-col gap-4 border-b border-beige-2 pb-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[16rem] flex-1">
          <label className="label">{t('reports.filters.search')}</label>
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-gray" />
            <input
              className="input pl-9"
              placeholder={t('reports.filters.searchPlaceholder')}
              value={state.search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">{t('reports.filters.sortBy')}</label>
          <div className="flex items-center gap-2">
            <select
              className="input w-auto min-w-[11rem] pr-9"
              value={state.sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`reports.col.${sortColKey(k)}`)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-secondary"
              title={t(`reports.filters.dir.${state.sortDir}`)}
              onClick={() => setSortDir(nextDir(state.sortDir))}
            >
              {state.sortDir === 'asc' ? (
                <ArrowLongUpIcon className="size-4" />
              ) : (
                <ArrowLongDownIcon className="size-4" />
              )}
            </button>
          </div>
        </div>

        {active && (
          <button type="button" className="btn-secondary ml-auto" onClick={clear}>
            <XMarkIcon className="size-4" />
            {t('reports.filters.clear')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-11 font-bold uppercase tracking-wide text-text-gray">{t('reports.col.connection')}</span>
          {CONNECTION_VALUES.map((v) => (
            <Chip
              key={v}
              label={t(`reports.connection.${v}`)}
              active={state.connection.has(v)}
              onClick={() => toggleConnection(v)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-11 font-bold uppercase tracking-wide text-text-gray">{t('reports.col.status')}</span>
          {STATUS_VALUES.map((v) => (
            <Chip
              key={v}
              label={t(`reports.status.${v}`)}
              active={state.status.has(v)}
              onClick={() => toggleStatus(v)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-11 font-bold uppercase tracking-wide text-text-gray">{t('reports.col.sparkyStatus')}</span>
          {SPARKY_VALUES.map((v) => (
            <Chip
              key={v}
              label={t(`reports.sparkyStatus.${v}`)}
              active={state.sparky.has(v)}
              onClick={() => toggleSparky(v)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const nextDir = (dir: SortDir): SortDir => (dir === 'asc' ? 'desc' : 'asc')

/** Maps a sort key to its `reports.col.*` label key. */
function sortColKey(k: SortKey): string {
  if (k === 'lastProductionTime') return 'lastProduction'
  if (k === 'connectionType') return 'connection'
  if (k === 'productionStatus') return 'status'
  if (k === 'addressUuid') return 'address'
  return k
}
