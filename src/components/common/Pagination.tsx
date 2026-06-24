import { useTranslation } from 'react-i18next'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number
  pageCount: number
  onChange: (page: number) => void
}) {
  const { t } = useTranslation()
  if (pageCount <= 1) return null
  return (
    <div className="flex items-center justify-between gap-4 pt-2">
      <span className="text-13 text-text-gray">
        {t('common.page', { page, pages: pageCount })}
      </span>
      <div className="flex gap-2">
        <button
          className="btn-ghost"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeftIcon className="size-4" />
          {t('common.previous')}
        </button>
        <button
          className="btn-ghost"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
        >
          {t('common.next')}
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
