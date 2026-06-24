import { useTranslation } from 'react-i18next'
import { ChartBarIcon } from '@heroicons/react/24/outline'
import { Drawer } from '@/components/common/Drawer'
import { JsonViewer } from '@/components/common/JsonViewer'
import { CopyButton } from '@/components/common/CopyButton'
import { fmtDateTime } from '@/utils/format'
import type { TelemetryTarget } from '@/features/telemetry/types'

export interface DeviceDetail {
  record: Record<string, any>
  /** Device category — shown big (e.g. "Solar inverters"). */
  category: string
  /** Device id/UUID — shown small and copyable. */
  deviceId: string
  /** When set, a "View telemetry" button is shown that navigates here. */
  telemetry?: TelemetryTarget
}

interface DeviceDetailDrawerProps {
  detail: DeviceDetail | null
  onClose: () => void
  onTelemetry: (target: TelemetryTarget) => void
}

const isScalar = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v)
const isPlainObject = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v)
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/

/** camelCase / snake_case → "Title Case" */
function humanize(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string' && ISO_RE.test(value)) return fmtDateTime(value)
  return String(value)
}

function ScalarGrid({ entries }: { entries: [string, unknown][] }) {
  if (!entries.length) return null
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-11 font-bold uppercase tracking-wide text-text-gray">{humanize(k)}</dt>
          <dd className="mt-0.5 break-words font-mono text-13 text-dark-blue">{formatValue(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

export function DeviceDetailDrawer({ detail, onClose, onTelemetry }: DeviceDetailDrawerProps) {
  const { t } = useTranslation()
  const record = detail?.record ?? {}

  const entries = Object.entries(record)
  const scalars = entries.filter(([, v]) => isScalar(v))
  const objects = entries.filter(([, v]) => isPlainObject(v)) as [string, Record<string, any>][]
  const arrays = entries.filter(([, v]) => Array.isArray(v)) as [string, unknown[]][]

  return (
    <Drawer
      open={!!detail}
      onClose={onClose}
      title={detail?.category ?? ''}
      subtitle={
        detail?.deviceId ? (
          <span className="inline-flex items-center gap-1.5">
            <code className="font-mono text-11 text-text-gray">{detail.deviceId}</code>
            <CopyButton text={detail.deviceId} compact />
          </span>
        ) : undefined
      }
      headerAction={
        detail?.telemetry ? (
          <button className="btn-secondary" onClick={() => onTelemetry(detail.telemetry!)}>
            <ChartBarIcon className="size-4" />
            {t('devices.viewTelemetry')}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {/* Top-level scalar fields */}
        <ScalarGrid entries={scalars} />

        {/* Nested objects rendered one level deep as titled sections */}
        {objects.map(([key, obj]) => {
          const sub = Object.entries(obj)
          const subScalars = sub.filter(([, v]) => isScalar(v))
          const hasComplex = sub.some(([, v]) => !isScalar(v))
          return (
            <section key={key} className="rounded-xl border border-beige-2 p-4">
              <h3 className="mb-3 text-13 font-bold text-dark-blue">{humanize(key)}</h3>
              <ScalarGrid entries={subScalars} />
              {hasComplex && (
                <div className="mt-3">
                  <JsonViewer data={obj} />
                </div>
              )}
            </section>
          )
        })}

        {/* Arrays shown as raw JSON */}
        {arrays.map(([key, arr]) => (
          <section key={key}>
            <h3 className="mb-2 text-13 font-bold text-dark-blue">
              {humanize(key)} <span className="text-text-gray">({arr.length})</span>
            </h3>
            <JsonViewer data={arr} />
          </section>
        ))}
      </div>
    </Drawer>
  )
}
