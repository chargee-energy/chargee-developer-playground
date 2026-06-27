import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { CopyButton } from '@/components/common/CopyButton'
import { Spinner } from '@/components/common/Spinner'
import { useTelemetryStore } from '@/store/telemetry'
import { useContextStore } from '@/store/context'
import type { TelemetryTarget } from './types'
import { SparkyTelemetry } from './SparkyTelemetry'
import { SolarTelemetry } from './SolarTelemetry'
import { SmartMeterTelemetry } from './SmartMeterTelemetry'
import { ChargerTelemetry } from './ChargerTelemetry'
import { AddressEnergyTelemetry } from './AddressEnergyTelemetry'
import { useSolarInvertersControllerListV2 } from '@/api/generated/solar-inverters/solar-inverters'
import { useSmartMetersControllerGetSmartMetersForAddressV2 } from '@/api/generated/smart-meters/smart-meters'
import { useChargerControllerGetChargersForAddressV2 } from '@/api/generated/chargers/chargers'

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

  const kind = target?.kind
  // True while the selected address differs from the one the target points at.
  const needsRepoint = !!target && !!addressUuid && target.addressUuid !== addressUuid

  // Device-specific kinds: when the address changes, fetch that address's
  // devices of the same kind so we can re-point to the first one.
  const solarList = useSolarInvertersControllerListV2(addressUuid ?? '', {
    query: { enabled: needsRepoint && kind === 'solar' },
  })
  const meterList = useSmartMetersControllerGetSmartMetersForAddressV2(addressUuid ?? '', {
    query: { enabled: needsRepoint && kind === 'smartMeter' },
  })
  const chargerList = useChargerControllerGetChargersForAddressV2(addressUuid ?? '', {
    query: { enabled: needsRepoint && kind === 'charger' },
  })
  const repointQuery =
    kind === 'solar' ? solarList : kind === 'smartMeter' ? meterList : kind === 'charger' ? chargerList : null

  useEffect(() => {
    if (!needsRepoint || !target || !addressUuid) return
    if (target.kind === 'addressEnergy') {
      setTarget({ kind: 'addressEnergy', addressUuid, identifier: addressUuid, label: t('telemetry.addressEnergy') })
      return
    }
    if (target.kind === 'sparky') {
      setTarget(addressSerial ? { kind: 'sparky', addressUuid, identifier: addressSerial, label: addressSerial } : null)
      return
    }
    // Device-specific: wait for the new address's device list, then re-point.
    if (!repointQuery || repointQuery.isLoading) return
    const first = (repointQuery.data?.results ?? [])[0] as any
    if (first) {
      const steerable =
        target.kind === 'solar'
          ? first.info?.isSteerable === true || first.info?.liveDataSupported === true
          : undefined
      setTarget({ kind: target.kind, addressUuid, identifier: first.identifier, label: first.identifier, steerable })
    } else {
      setTarget(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsRepoint, addressUuid, addressSerial, repointQuery?.data, repointQuery?.isLoading])

  // While following the address change, show a spinner rather than stale data.
  if (needsRepoint) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t('telemetry.eyebrow')} title={t('telemetry.title')} hideInspector />
        <div className="flex items-center justify-center gap-3 py-16 text-text-gray">
          <Spinner />
          <span>{t('common.loading')}</span>
        </div>
      </div>
    )
  }

  if (!target) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t('telemetry.eyebrow')} title={t('telemetry.title')} hideInspector />
        <EmptyState title={t('telemetry.pickDevice')} description={t('telemetry.subtitle')} />
      </div>
    )
  }

  const { addressUuid: targetAddress, identifier } = target

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('telemetry.eyebrow')}
        title={t(`telemetry.kind.${target.kind}`)}
        onBack={() => navigate('/devices')}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <code className="font-mono text-13 text-text-gray">{identifier}</code>
            <CopyButton text={identifier} compact />
          </span>
        }
        primaryCall={primaryCallFor(target)}
      />

      {target.kind === 'sparky' && <SparkyTelemetry key={identifier} serial={identifier} />}
      {target.kind === 'solar' && (
        <SolarTelemetry key={identifier} addressUuid={targetAddress} identifier={identifier} steerable={target.steerable} />
      )}
      {target.kind === 'smartMeter' && <SmartMeterTelemetry key={identifier} addressUuid={targetAddress} identifier={identifier} />}
      {target.kind === 'charger' && <ChargerTelemetry key={identifier} addressUuid={targetAddress} identifier={identifier} />}
      {target.kind === 'addressEnergy' && <AddressEnergyTelemetry key={targetAddress} addressUuid={targetAddress} />}
    </div>
  )
}
