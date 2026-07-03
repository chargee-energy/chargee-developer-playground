import { useTranslation } from 'react-i18next'
import { ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/solid'
import { deriveProductionStatus } from '@/features/reports/reportSolarStatus'

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

  const status = deriveProductionStatus(lastProductionState, isSteerable)
  const local = isSteerable === true

  if (status === 'disconnected') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red/10 px-2 py-0.5 text-11 font-bold text-red">
        {t('devices.disconnected')}
      </span>
    )
  }

  if (status === 'stale') {
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
