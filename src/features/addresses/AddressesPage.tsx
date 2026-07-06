import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlassIcon, CpuChipIcon } from '@heroicons/react/24/outline'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/common/DataState'
import { EmptyState } from '@/components/common/EmptyState'
import { Pagination } from '@/components/common/Pagination'
import { useContextStore } from '@/store/context'
import { useGroupAddresses } from '@/hooks/useGroupAddresses'
import { shortId, fmtDate } from '@/utils/format'
import { formatBoxCode } from '@/utils/sparky'

const PAGE_SIZE = 24

export function AddressesPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { groupUuid, addressUuid, setAddress } = useContextStore()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { addresses: all, total, isLoading: loading, error, refetch } = useGroupAddresses(groupUuid)

  const filtered = useMemo(() => {
    if (!search.trim()) return all
    const q = search.toLowerCase()
    return all.filter(
      (a) =>
        a.uuid.toLowerCase().includes(q) ||
        a.sparky?.serialNumber?.toLowerCase().includes(q) ||
        formatBoxCode(a.sparky?.boxCode).toLowerCase().includes(q),
    )
  }, [all, search])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const openDevices = (record: (typeof all)[number]) => {
    setAddress(record.uuid, record)
    navigate('/devices')
  }

  if (!groupUuid) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t('addresses.eyebrow')} title={t('addresses.title')} hideInspector />
        <EmptyState title={t('addresses.selectGroupFirst')} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('addresses.eyebrow')}
        title={t('addresses.title')}
        subtitle={t('addresses.subtitle')}
        primaryCall={{ method: 'GET', url: `/api/v2/groups/${groupUuid}/addresses` }}
      />

      <div className="relative max-w-md">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-gray-400" />
        <input
          className="input pl-10"
          placeholder={t('addresses.searchPlaceholder')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
        />
      </div>
      <p className="text-13 text-text-gray">
        {t('common.total', { count: total })} · {t('addresses.searchNote')}
        {total > all.length && ` · ${t('addresses.loadedNote', { loaded: all.length, total })}`}
      </p>

      <DataState
        isLoading={loading}
        error={error}
        isEmpty={filtered.length === 0}
        emptyMessage={t('common.noResults')}
        onRetry={refetch}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((a) => {
            const selected = a.uuid === addressUuid
            return (
              <div
                key={a.uuid}
                className={`card flex flex-col gap-3 p-5 transition-shadow hover:shadow-lg ${selected ? 'ring-2 ring-dark-purple' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-13 font-semibold text-dark-blue">{shortId(a.uuid)}</p>
                    <p className="text-11 text-text-gray">{fmtDate(a.createdAt)}</p>
                  </div>
                  <div className="flex gap-1">
                    {a.sparky && <span className="chip">{t('addresses.hasSparky')}</span>}
                    {a.flint && <span className="chip">{t('addresses.hasFlint')}</span>}
                  </div>
                </div>
                <dl className="space-y-1 text-13">
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-gray">{t('addresses.serial')}</dt>
                    <dd className="font-mono text-dark-blue">{a.sparky?.serialNumber ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-text-gray">{t('addresses.boxCode')}</dt>
                    <dd className="font-mono text-dark-blue">{formatBoxCode(a.sparky?.boxCode)}</dd>
                  </div>
                </dl>
                <button className="btn-secondary mt-auto" onClick={() => openDevices(a)}>
                  <CpuChipIcon className="size-4" />
                  {t('addresses.viewDevices')}
                </button>
              </div>
            )
          })}
        </div>

        <Pagination page={safePage} pageCount={pageCount} onChange={setPage} />
      </DataState>
    </div>
  )
}
