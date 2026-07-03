import { useTranslation } from 'react-i18next'
import { ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/solid'

/** Local (steerable) inverters stream live, so stale after just 1 minute. */
const LOCAL_STALE_MS = 60 * 1000
/** Cloud (non-steerable) inverters report periodically, so stale after 8 hours. */
const CLOUD_STALE_MS = 8 * 60 * 60 * 1000

interface SolarProductionStatusBadgeProps {
  /** The inverter's last production state, if any. */
  lastProductionState?: { time?: string | null } | null
  /** Local connection when `isSteerable === true`; otherwise treated as cloud. */
  isSteerable?: boolean
}

/**
 * Shows a production-health indicator for a solar inverter:
 * - a "disconnected" remark when there is no production state at all,
 * - an exclamation mark when the last production state is stale
 *   (older than 1 minute for local, 8 hours for cloud inverters),
 * - a "connected" label when the production data is fresh.
 */
export function SolarProductionStatusBadge({ lastProductionState, isSteerable }: SolarProductionStatusBadgeProps) {
  const { t } = useTranslation()

  const time = lastProductionState?.time
  if (!lastProductionState || !time) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red/10 px-2 py-0.5 text-11 font-bold text-red">
        {t('devices.disconnected')}
      </span>
    )
  }

  const local = isSteerable === true
  const threshold = local ? LOCAL_STALE_MS : CLOUD_STALE_MS
  const ageMs = Date.now() - new Date(time).getTime()

  if (Number.isFinite(ageMs) && ageMs > threshold) {
    return (
      <span
        title={local ? t('devices.productionStaleLocal') : t('devices.productionStaleCloud')}
        className="inline-flex items-center text-orange"
      >
        <ExclamationCircleIcon className="size-4" />
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-light-green px-2 py-0.5 text-11 font-bold text-green">
      <CheckCircleIcon className="size-3" />
      {t('devices.connected')}
    </span>
  )
}
