import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/common/DataState'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { ScheduleModal } from './ScheduleModal'
import { useContextStore } from '@/store/context'
import { fmtDateTime } from '@/utils/format'
import type { CreateScheduleDto, ScheduleDto } from '@/api/generated/model'
import { useSolarInvertersControllerListV2 } from '@/api/generated/solar-inverters/solar-inverters'
import {
  useSolarInverterScheduleControllerListV2,
  useSolarInverterScheduleControllerAddV2,
  useSolarInverterScheduleControllerDeleteV2,
} from '@/api/generated/solar-inverters/solar-inverters'

export function SchedulesPage() {
  const { t } = useTranslation()
  const { addressUuid } = useContextStore()
  const addr = addressUuid ?? ''
  const [inverterId, setInverterId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [toDelete, setToDelete] = useState<ScheduleDto | null>(null)

  const invertersQuery = useSolarInvertersControllerListV2(addr, {
    query: { enabled: !!addressUuid },
  })
  const inverters = invertersQuery.data?.results ?? []
  const activeInverter = inverterId || inverters[0]?.identifier || ''

  const schedulesQuery = useSolarInverterScheduleControllerListV2(
    addr,
    activeInverter,
    undefined,
    { query: { enabled: !!addressUuid && !!activeInverter } },
  )
  const schedules = schedulesQuery.data?.results ?? []

  const addMutation = useSolarInverterScheduleControllerAddV2({
    mutation: { onSuccess: () => schedulesQuery.refetch() },
  })
  const deleteMutation = useSolarInverterScheduleControllerDeleteV2({
    mutation: { onSuccess: () => schedulesQuery.refetch() },
  })

  const handleCreate = (dto: CreateScheduleDto) => {
    addMutation.mutate(
      { addressUuid: addr, solarInverterUuid: activeInverter, data: dto },
      { onSuccess: () => setCreateOpen(false) },
    )
  }

  const handleDelete = () => {
    if (!toDelete) return
    deleteMutation.mutate(
      { addressUuid: addr, solarInverterUuid: activeInverter, scheduleUuid: toDelete.uuid },
      { onSuccess: () => setToDelete(null) },
    )
  }

  if (!addressUuid) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t('schedules.eyebrow')} title={t('schedules.title')} hideInspector />
        <EmptyState title={t('devices.selectAddressFirst')} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('schedules.eyebrow')}
        title={t('schedules.title')}
        subtitle={t('schedules.subtitle')}
        primaryCall={{
          method: 'GET',
          url: `/api/v2/addresses/${addr}/solar-inverters/${activeInverter}/schedules`,
        }}
        action={
          <button
            className="btn-primary"
            disabled={!activeInverter}
            onClick={() => setCreateOpen(true)}
          >
            <PlusIcon className="size-4" />
            {t('schedules.create')}
          </button>
        }
      />

      {inverters.length === 0 ? (
        <EmptyState title={t('schedules.noInverters')} />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="text-13 font-semibold text-text-gray">{t('schedules.selectInverter')}</span>
            <select
              className="h-9 rounded-full border border-beige-2 bg-white px-3 text-13 font-semibold text-dark-blue"
              value={activeInverter}
              onChange={(e) => setInverterId(e.target.value)}
            >
              {inverters.map((inv) => (
                <option key={inv.identifier} value={inv.identifier}>
                  {inv.identifier}
                </option>
              ))}
            </select>
          </div>

          <div className="card p-5">
            <DataState
              isLoading={schedulesQuery.isLoading}
              error={schedulesQuery.error}
              isEmpty={schedules.length === 0}
              emptyMessage={t('schedules.empty')}
              onRetry={() => schedulesQuery.refetch()}
            >
              <ul className="divide-y divide-beige-2">
                {schedules.map((s) => (
                  <li key={s.uuid} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="font-semibold text-dark-blue">{fmtDateTime(s.time)}</p>
                      <p className="text-13 text-text-gray">
                        {s.zeroExport
                          ? t('schedules.zeroExport')
                          : `${t('schedules.powerLimit')}: ${String(s.powerlimit ?? '—')}`}
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
        </>
      )}

      <ScheduleModal
        open={createOpen}
        busy={addMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
      />
      <ConfirmDialog
        open={!!toDelete}
        destructive
        title={t('common.delete')}
        message={t('schedules.deleteConfirm')}
        confirmLabel={t('common.delete')}
        busy={deleteMutation.isPending}
        onConfirm={handleDelete}
        onClose={() => setToDelete(null)}
      />
    </div>
  )
}
