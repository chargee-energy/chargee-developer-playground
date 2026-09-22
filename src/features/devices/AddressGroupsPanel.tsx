import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { MagnifyingGlassIcon, StopIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import { Spinner } from '@/components/common/Spinner'
import { useContextStore } from '@/store/context'
import type { useAddressGroups } from '@/hooks/useAddressGroups'

/**
 * Which groups an address belongs to — and the devices that come with the
 * answer. Neither is reachable directly: the v2 API has no address → groups
 * route, and `/sparkies/{sn}` and `/flints/{sn}` each return only the device
 * you asked for, so an address found by flint serial has no sparky attached.
 * Paging the groups is the only route to both, so it runs on demand.
 */
/** Owned by DevicesPage so the page sees a finished scan straight away. */
type Scan = ReturnType<typeof useAddressGroups>

export function AddressGroupsPanel({ scan }: { scan: Scan }) {
  const { t } = useTranslation()
  const { groupUuid, addressRecord, mergeAddressDevices, selectGroupForAddress } = useContextStore()
  const { status, progress, result, error, run, cancel } = scan

  // A scan is the only way to learn the devices a lookup could not return.
  useEffect(() => {
    if (result?.record) mergeAddressDevices(result.record)
  }, [result, mergeAddressDevices])

  const running = status === 'running'
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0
  const foundDevices = result?.record
  const gainedSparky = !!foundDevices?.sparky && !addressRecord?.sparky
  const gainedFlint = !!foundDevices?.flint && !addressRecord?.flint

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-dark-blue">
            <UserGroupIcon className="size-4 text-text-gray" />
            {t('devices.groups.title')}
          </p>
          <p className="mt-1 text-13 text-text-gray">{t('devices.groups.subtitle')}</p>
        </div>
        {running ? (
          <button className="btn-secondary" onClick={cancel}>
            <StopIcon className="size-4" />
            {t('reports.cancel')}
          </button>
        ) : (
          <button className="btn-secondary" onClick={run}>
            <MagnifyingGlassIcon className="size-4" />
            {t(status === 'done' ? 'devices.groups.rescan' : 'devices.groups.scan')}
          </button>
        )}
      </div>

      {running && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-3 text-sm text-text-gray">
            <Spinner />
            <span>{t('devices.groups.progress', { done: progress.done, total: progress.total })}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-beige-2">
            <div className="h-full rounded-full bg-dark-purple transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {status === 'error' && (
        <p className="mt-4 text-sm font-semibold text-red">
          {(error as any)?.response?.data?.message || (error as any)?.message || t('common.error')}
        </p>
      )}

      {status === 'done' && result && (
        <div className="mt-4 space-y-3">
          {result.groups.length === 0 ? (
            <p className="text-sm text-text-gray">{t('devices.groups.none', { count: result.scanned })}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {result.groups.map((g) => {
                  const active = g.uuid === groupUuid
                  return (
                    <button
                      key={g.uuid}
                      className={`chip ${active ? 'ring-2 ring-dark-purple' : 'hover:bg-light-purple-3'}`}
                      title={g.key}
                      onClick={() => selectGroupForAddress(g.uuid, g.name)}
                    >
                      {g.name || g.key}
                      {g.groupKind ? ` · ${g.groupKind}` : ''}
                    </button>
                  )
                })}
              </div>
              <p className="text-11 text-text-gray">
                {t('devices.groups.foundIn', { count: result.groups.length, scanned: result.scanned })}
                {' · '}
                {t('devices.groups.selectHint')}
              </p>
            </>
          )}
          {(gainedSparky || gainedFlint) && (
            <p className="text-11 font-semibold text-green">
              {t('devices.groups.devicesRecovered', {
                devices: [gainedSparky && 'sparky', gainedFlint && 'flint'].filter(Boolean).join(' + '),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
