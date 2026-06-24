import { useTranslation } from 'react-i18next'
import { fmtDateTime } from '@/utils/format'

interface ForecastMetaLike {
  forecastType?: string
  forecastQuality?: number
  /** Duration in hours (per the API); rendered in minutes. */
  forecastDuration?: number
  forecastTime?: string
}

function Pill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-beige-2 bg-cream px-3 py-1 text-13">
      <span className="text-11 font-bold uppercase tracking-wide text-text-gray">{label}</span>
      <span className="font-semibold text-dark-blue">{value}</span>
    </span>
  )
}

/** Forecast metadata pills (type, quality, duration in minutes, generated time). */
export function ForecastMeta({ meta }: { meta?: ForecastMetaLike | null }) {
  const { t } = useTranslation()
  if (!meta) return null
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {meta.forecastType != null && <Pill label={t('telemetry.forecastType')} value={meta.forecastType} />}
      {meta.forecastQuality != null && (
        <Pill label={t('telemetry.forecastQuality')} value={`${meta.forecastQuality}/100`} />
      )}
      {meta.forecastDuration != null && (
        <Pill label={t('telemetry.forecastDuration')} value={`${Math.round(meta.forecastDuration * 60)} min`} />
      )}
      {meta.forecastTime != null && (
        <Pill label={t('telemetry.forecastGenerated')} value={fmtDateTime(meta.forecastTime)} />
      )}
    </div>
  )
}
