import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Spinner } from './Spinner'

interface DataStateProps {
  isLoading?: boolean
  error?: unknown
  isEmpty?: boolean
  emptyMessage?: string
  onRetry?: () => void
  children: ReactNode
}

/** Uniform loading / error / empty handling around any data view. */
export function DataState({
  isLoading,
  error,
  isEmpty,
  emptyMessage,
  onRetry,
  children,
}: DataStateProps) {
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-text-gray">
        <Spinner />
        <span>{t('common.loading')}</span>
      </div>
    )
  }

  if (error) {
    const message = (error as any)?.response?.data?.message || (error as any)?.message || t('common.error')
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm font-semibold text-red">{String(message)}</p>
        {onRetry && (
          <button onClick={onRetry} className="btn-secondary">
            {t('common.retry')}
          </button>
        )}
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="py-16 text-center text-sm text-text-gray">
        {emptyMessage || t('common.noData')}
      </div>
    )
  }

  return <>{children}</>
}
