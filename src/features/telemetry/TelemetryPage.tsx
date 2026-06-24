import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { CopyButton } from '@/components/common/CopyButton'
import { useTelemetryStore } from '@/store/telemetry'
import { useContextStore } from '@/store/context'
import type { TelemetryTarget } from './types'
import { SparkyTelemetry } from './SparkyTelemetry'
import { SolarTelemetry } from './SolarTelemetry'
import { SmartMeterTelemetry } from './SmartMeterTelemetry'
import { ChargerTelemetry } from './ChargerTelemetry'
import { AddressEnergyTelemetry } from './AddressEnergyTelemetry'

// Maps the active target to the request the inspector should preselect.
function primaryCallFor(target: TelemetryTarget): { method: string; url: string } {
  const { kind, addressUuid: a, identifier: id } = target
  switch (kind) {
    case 'sparky':
      return { method: 'GET', url: `/api/v2/sparkies/${id}/electricity/15min` }
    case 'solar':
      return { method: 'GET', url: `/api/v2/addresses/${a}/solar-inverters/${id}/energy/production` }
    case 'smartMeter':
      return { method: 'GET', url: `/api/v2/addresses/${a}/smart-meters/${id}/energy/electricity` }
    case 'charger':
      return { method: 'GET', url: `/api/v2/addresses/${a}/chargers/${id}/energy/consumption` }
    case 'addressEnergy':
      return { method: 'GET', url: `/api/v2/addresses/${a}/electricity/p4/15min` }
  }
}

export function TelemetryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const target = useTelemetryStore((s) => s.target)
  const setTarget = useTelemetryStore((s) => s.setTarget)
  const { addressUuid, addressSerial } = useContextStore()

  // Keep telemetry in sync with the selected address. Address-level views
  // (sparky, P4 energy) re-point automatically; device-specific views point at
  // an id that only exists on the old address, so send the user to pick a new one.
  useEffect(() => {
    if (!target || !addressUuid || target.addressUuid === addressUuid) return
    if (target.kind === 'addressEnergy') {
      setTarget({ kind: 'addressEnergy', addressUuid, identifier: addressUuid, label: t('telemetry.addressEnergy') })
    } else if (target.kind === 'sparky' && addressSerial) {
      setTarget({ kind: 'sparky', addressUuid, identifier: addressSerial, label: addressSerial })
    } else {
      setTarget(null)
      navigate('/devices')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressUuid, addressSerial])

  if (!target) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t('telemetry.eyebrow')} title={t('telemetry.title')} hideInspector />
        <EmptyState title={t('telemetry.pickDevice')} description={t('telemetry.subtitle')} />
      </div>
    )
  }

  const { kind, addressUuid: targetAddress, identifier } = target

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('telemetry.eyebrow')}
        title={t(`telemetry.kind.${kind}`)}
        onBack={() => navigate('/devices')}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <code className="font-mono text-13 text-text-gray">{identifier}</code>
            <CopyButton text={identifier} compact />
          </span>
        }
        primaryCall={primaryCallFor(target)}
      />

      {kind === 'sparky' && <SparkyTelemetry key={identifier} serial={identifier} />}
      {kind === 'solar' && (
        <SolarTelemetry key={identifier} addressUuid={targetAddress} identifier={identifier} steerable={target.steerable} />
      )}
      {kind === 'smartMeter' && <SmartMeterTelemetry key={identifier} addressUuid={targetAddress} identifier={identifier} />}
      {kind === 'charger' && <ChargerTelemetry key={identifier} addressUuid={targetAddress} identifier={identifier} />}
      {kind === 'addressEnergy' && <AddressEnergyTelemetry key={targetAddress} addressUuid={targetAddress} />}
    </div>
  )
}
