import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { MapPinIcon, CommandLineIcon } from '@heroicons/react/24/outline'
import { PageHeader } from '@/components/PageHeader'
import { useContextStore } from '@/store/context'
import { useGroupControllerGetGroupsV2, useGroupControllerGetGroupSparkiesV2 } from '@/api/generated/groups/groups'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card p-5">
      <p className="text-11 font-bold uppercase tracking-wide text-text-gray">{label}</p>
      <p className="mt-1 break-words text-lg font-extrabold leading-tight text-dark-blue sm:text-28 sm:leading-none">
        {value}
      </p>
    </div>
  )
}

export function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { groupUuid, groupName } = useContextStore()

  const groupsQuery = useGroupControllerGetGroupsV2({ limit: 1000 })
  const addressesQuery = useGroupControllerGetGroupSparkiesV2(
    groupUuid ?? '',
    { limit: 1 },
    { query: { enabled: !!groupUuid } },
  )

  const groupCount = groupsQuery.data?.meta.total ?? groupsQuery.data?.results.length ?? 0
  const addressCount = addressesQuery.data?.meta.total ?? 0

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('dashboard.eyebrow')}
        title={t('dashboard.title')}
        subtitle={t('dashboard.subtitle')}
        primaryCall={{ method: 'GET', url: '/api/v2/groups' }}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label={t('dashboard.groups')} value={groupCount} />
        <Stat label={t('dashboard.addresses')} value={groupUuid ? addressCount : '—'} />
        <Stat label={t('dashboard.selectedGroup')} value={groupName ?? '—'} />
      </div>

      <div className="card sun-glow p-7">
        <h2 className="text-lg font-bold text-dark-blue">{t('dashboard.quickStart')}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-160 text-text-gray">
          {t('dashboard.quickStartBody')}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn-primary" onClick={() => navigate('/addresses')}>
            <MapPinIcon className="size-4" />
            {t('dashboard.browseAddresses')}
          </button>
          <button className="btn-secondary" onClick={() => navigate('/console')}>
            <CommandLineIcon className="size-4" />
            {t('dashboard.openConsole')}
          </button>
        </div>
      </div>
    </div>
  )
}
