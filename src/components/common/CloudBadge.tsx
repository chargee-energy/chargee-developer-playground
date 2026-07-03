import { useTranslation } from 'react-i18next'
import { CloudIcon } from '@heroicons/react/24/outline'

/** Marks an asset that reports via the cloud rather than streaming live data. */
export function CloudBadge() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-light-purple-3 px-2 py-0.5 text-11 font-bold text-dark-purple">
      <CloudIcon className="size-3" />
      {t('devices.cloud')}
    </span>
  )
}
