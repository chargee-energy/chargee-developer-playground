import { useTranslation } from 'react-i18next'
import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { useContextStore } from '@/store/context'
import {
  useGroupControllerGetGroupsV2,
  useGroupControllerGetGroupSparkiesV2,
} from '@/api/generated/groups/groups'

// Pages where picking a specific address is meaningful. Elsewhere (dashboard,
// addresses, flex, console) the address control is hidden.
const ADDRESS_ROUTES = ['/devices', '/schedules', '/telemetry']

export function ContextBar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { groupUuid, addressUuid, setGroup, setAddress } = useContextStore()

  const groupsQuery = useGroupControllerGetGroupsV2({ limit: 1000 })
  const groups = useMemo(() => groupsQuery.data?.results ?? [], [groupsQuery.data])

  const addressesQuery = useGroupControllerGetGroupSparkiesV2(
    groupUuid ?? '',
    { limit: 200 },
    { query: { enabled: !!groupUuid } },
  )
  const addresses = addressesQuery.data?.results ?? []

  // Auto-select the only group.
  useEffect(() => {
    if (!groupUuid && groups.length === 1) setGroup(groups[0].uuid, groups[0].name)
  }, [groups, groupUuid, setGroup])

  const showAddress = ADDRESS_ROUTES.includes(pathname) && !!groupUuid
  const idx = addresses.findIndex((a) => a.uuid === addressUuid)
  const goTo = (i: number) => {
    const a = addresses[i]
    if (a) setAddress(a.uuid, a)
  }

  const navBtn =
    'flex size-7 shrink-0 items-center justify-center rounded-full text-text-gray transition-colors hover:bg-beige disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-11 font-bold uppercase tracking-wide text-text-gray">
          {t('context.group')}
        </span>
        <select
          className="h-9 min-w-[14rem] rounded-full border border-beige-2 bg-white px-3 text-13 font-semibold leading-none text-dark-blue focus:border-dark-purple focus:ring-dark-purple"
          value={groupUuid ?? ''}
          onChange={(e) => {
            const g = groups.find((x) => x.uuid === e.target.value)
            setGroup(g?.uuid ?? null, g?.name ?? null)
          }}
        >
          <option value="">{t('context.selectGroup')}</option>
          {groups.map((g) => (
            <option key={g.uuid} value={g.uuid}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      {showAddress && (
        <div className="flex items-center gap-2">
          <span className="text-11 font-bold uppercase tracking-wide text-text-gray">
            {t('context.address')}
          </span>
          <div className="flex h-9 items-center gap-1 rounded-full border border-beige-2 bg-white px-1">
            <button
              className={navBtn}
              disabled={idx <= 0}
              onClick={() => goTo(idx - 1)}
              aria-label={t('common.previous')}
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <select
              className="h-7 w-[36rem] max-w-[80vw] border-0 bg-transparent px-1 font-mono text-13 font-normal leading-none text-dark-blue focus:ring-0"
              value={addressUuid ?? ''}
              onChange={(e) => {
                const a = addresses.find((x) => x.uuid === e.target.value)
                if (a) setAddress(a.uuid, a)
              }}
            >
              <option value="">{t('context.selectAddress')}</option>
              {addresses.map((a, i) => (
                <option key={a.uuid} value={a.uuid}>
                  [{i + 1}/{addresses.length}] {a.sparky?.serialNumber ? `${a.sparky.serialNumber} · ` : ''}
                  {a.uuid}
                </option>
              ))}
            </select>
            <button
              className={navBtn}
              disabled={idx >= addresses.length - 1}
              onClick={() => goTo(idx + 1)}
              aria-label={t('common.next')}
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
