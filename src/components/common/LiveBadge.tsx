import { useTranslation } from 'react-i18next'

/** Marks an asset that streams high-resolution realtime data. */
export function LiveBadge() {
  const { t } = useTranslation()
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-light-green px-2 py-0.5 text-11 font-bold text-green">
      <span className="size-1.5 animate-pulse rounded-full bg-green" />
      {t('devices.live')}
    </span>
  )
}
