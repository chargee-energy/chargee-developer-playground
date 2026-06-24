import { useTranslation } from 'react-i18next'
import { ArrowPathIcon } from '@heroicons/react/24/outline'
import { cn } from '@/utils/cn'

export function RefreshButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  const { t } = useTranslation()
  return (
    <button onClick={onClick} className="btn-ghost" disabled={busy} title={t('common.refresh')}>
      <ArrowPathIcon className={cn('size-4', busy && 'animate-spin')} />
      {t('common.refresh')}
    </button>
  )
}
