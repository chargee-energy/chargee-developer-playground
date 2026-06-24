import { useTranslation } from 'react-i18next'
import { useEffect, useMemo } from 'react'
import { useContextStore } from '@/store/context'
import { useGroupControllerGetGroupsV2 } from '@/api/generated/groups/groups'
import { useGroupControllerGetGroupSparkiesV2 } from '@/api/generated/groups/groups'
import { shortId } from '@/utils/format'

// Persistent group → address selector shown in the top bar. Auto-selects when
// only one option exists, mirroring how customers expect to "land" on data.
export function ContextBar() {
  const { t } = useTranslation()
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
    if (!groupUuid && groups.length === 1) {
      setGroup(groups[0].uuid, groups[0].name)
    }
  }, [groups, groupUuid, setGroup])

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <span className="text-11 font-bold uppercase tracking-wide text-text-gray">
          {t('context.group')}
        </span>
        <select
          className="h-9 rounded-full border border-beige-2 bg-white px-3 text-13 font-semibold text-dark-blue focus:border-dark-purple focus:ring-dark-purple"
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

      <div className="flex items-center gap-2">
        <span className="text-11 font-bold uppercase tracking-wide text-text-gray">
          {t('context.address')}
        </span>
        <select
          className="h-9 max-w-[16rem] rounded-full border border-beige-2 bg-white px-3 text-13 font-semibold text-dark-blue focus:border-dark-purple focus:ring-dark-purple disabled:opacity-50"
          value={addressUuid ?? ''}
          disabled={!groupUuid}
          onChange={(e) => {
            const a = addresses.find((x) => x.uuid === e.target.value)
            setAddress(a?.uuid ?? null, a ?? null)
          }}
        >
          <option value="">{t('context.selectAddress')}</option>
          {addresses.map((a) => (
            <option key={a.uuid} value={a.uuid}>
              {a.sparky?.serialNumber ? `${a.sparky.serialNumber} · ` : ''}
              {shortId(a.uuid)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
