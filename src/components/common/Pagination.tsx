import { useState, useEffect } from 'react'
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
  const [jump, setJump] = useState(String(page))

  // Keep the jump field in sync when the page changes elsewhere (prev/next).
  useEffect(() => setJump(String(page)), [page])

  if (pageCount <= 1) return null

  const applyJump = () => {
    const n = Number(jump)
    if (Number.isFinite(n)) onChange(Math.min(Math.max(1, Math.round(n)), pageCount))
    else setJump(String(page))
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
      <div className="flex items-center gap-2 text-13 text-text-gray">
        <span>{t('common.page', { page, pages: pageCount })}</span>
        <span className="text-beige-2">·</span>
        <label className="flex items-center gap-1.5">
          {t('common.goToPage')}
          <input
            type="number"
            min={1}
            max={pageCount}
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            onBlur={applyJump}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyJump()
            }}
            className="h-8 w-16 rounded-lg border border-beige-2 bg-white px-2 text-center text-13 text-dark-blue focus:border-dark-purple focus:ring-dark-purple"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeftIcon className="size-4" />
          {t('common.previous')}
        </button>
        <button className="btn-ghost" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
          {t('common.next')}
          <ChevronRightIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
