import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/common/DataState'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { InsightCards } from '@/components/common/InsightCards'
import { RefreshButton } from '@/components/common/RefreshButton'
import { useContextStore } from '@/store/context'
import { fmtDateTime } from '@/utils/format'
import type { GroupFlexScheduleDto, CreateGroupFlexScheduleDto } from '@/api/generated/model'
import {
  useGroupFlexAggregationControllerLatestAggregateV2,
  useGroupFlexScheduleControllerListV2,
  useGroupFlexScheduleControllerAddV2,
  useGroupFlexScheduleControllerDeleteV2,
} from '@/api/generated/groups/groups'

export function FlexPage() {
  const { t } = useTranslation()
  const { groupUuid } = useContextStore()
  const group = groupUuid ?? ''
  const enabled = { query: { enabled: !!groupUuid } }

  const [showCreate, setShowCreate] = useState(false)
  const [targetKw, setTargetKw] = useState(0)
  const [time, setTime] = useState('')
  const [toDelete, setToDelete] = useState<GroupFlexScheduleDto | null>(null)

  const latest = useGroupFlexAggregationControllerLatestAggregateV2(group, enabled)
  const schedulesQuery = useGroupFlexScheduleControllerListV2(group, undefined, enabled)
  const schedules = schedulesQuery.data?.results ?? []

  const addMutation = useGroupFlexScheduleControllerAddV2({
    mutation: { onSuccess: () => schedulesQuery.refetch() },
  })
  const deleteMutation = useGroupFlexScheduleControllerDeleteV2({
    mutation: { onSuccess: () => schedulesQuery.refetch() },
  })

  const handleCreate = () => {
    const iso = time ? new Date(time).toISOString() : new Date().toISOString()
    addMutation.mutate(
      {
        groupUuid: group,
        data: { groupGridTargetKw: targetKw, time: iso } as unknown as CreateGroupFlexScheduleDto,
      },
      { onSuccess: () => setShowCreate(false) },
    )
  }

  const handleDelete = () => {
    if (!toDelete) return
    deleteMutation.mutate(
      { groupUuid: group, scheduleUuid: toDelete.uuid },
      { onSuccess: () => setToDelete(null) },
    )
  }

  if (!groupUuid) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t('flex.eyebrow')} title={t('flex.title')} hideInspector />
        <EmptyState title={t('flex.selectGroupFirst')} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('flex.eyebrow')}
        title={t('flex.title')}
        subtitle={t('flex.subtitle')}
        primaryCall={{ method: 'GET', url: `/api/v2/groups/${group}/flex/aggregates/latest` }}
        action={
          <button className="btn-primary" onClick={() => setShowCreate((v) => !v)}>
            <PlusIcon className="size-4" />
            {t('flex.create')}
          </button>
        }
      />

      {showCreate && (
        <div className="card space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="label">{t('flex.groupGridTarget')}</label>
              <input
                type="number"
                className="input"
                value={targetKw}
                onChange={(e) => setTargetKw(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">{t('schedules.time')}</label>
              <input
                type="datetime-local"
                className="input"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" onClick={() => setShowCreate(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn-primary" onClick={handleCreate} disabled={addMutation.isPending}>
              {t('common.create')}
            </button>
          </div>
        </div>
      )}

      <div className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-13 font-bold text-dark-blue">{t('flex.latestAggregate')}</h3>
          <RefreshButton onClick={() => latest.refetch()} busy={latest.isFetching} />
        </div>
        <DataState
          isLoading={latest.isLoading}
          error={latest.error}
          isEmpty={!latest.data}
          emptyMessage={t('common.noData')}
          onRetry={() => latest.refetch()}
        >
          {latest.data && <InsightCards record={latest.data as Record<string, any>} />}
        </DataState>
      </div>

      <div className="card p-5">
        <h3 className="mb-3 text-13 font-bold text-dark-blue">{t('flex.schedules')}</h3>
        <DataState
          isLoading={schedulesQuery.isLoading}
          error={schedulesQuery.error}
          isEmpty={schedules.length === 0}
          emptyMessage={t('flex.empty')}
          onRetry={() => schedulesQuery.refetch()}
        >
          <ul className="divide-y divide-beige-2">
            {schedules.map((s) => (
              <li key={s.uuid} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-semibold text-dark-blue">{fmtDateTime(s.time)}</p>
                  <p className="text-13 text-text-gray">
                    {t('flex.groupGridTarget')}: {String(s.groupGridTargetKw ?? '—')}
                  </p>
                </div>
                <button className="btn-ghost text-red" onClick={() => setToDelete(s)}>
                  <TrashIcon className="size-4" />
                  {t('common.delete')}
                </button>
              </li>
            ))}
          </ul>
        </DataState>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        destructive
        title={t('common.delete')}
        message={t('flex.deleteConfirm')}
        confirmLabel={t('common.delete')}
        busy={deleteMutation.isPending}
        onConfirm={handleDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  )
}
