import { useCallback } from 'react'
import { solarInvertersControllerListV2 } from '@/api/generated/solar-inverters/solar-inverters'
import {
  smartMetersControllerGetSmartMetersForAddressV2,
  smartMetersControllerGetLatestElectricityReadingV2,
} from '@/api/generated/smart-meters/smart-meters'
import type { GroupAddressDto, SolarInverterDto } from '@/api/generated/model'
import { useAddressReport } from './useAddressReport'
import { asString, mostRecent } from './reportFreshness'
import {
  deriveConnectionType,
  deriveProductionStatus,
  deriveSparkyStatus,
  type ConnectionType,
  type ProductionStatus,
  type SparkyStatus,
} from './reportSolarStatus'

export interface SolarInverterReportRow {
  addressUuid: string
  sparkySerial: string | null
  flintSerial: string | null
  identifier: string
  brand: string
  model: string | null
  connectionType: ConnectionType
  productionStatus: ProductionStatus
  lastProductionTime: string | null
  isProducing: boolean | null
  productionRateWh: number | null
  sparkyStatus: SparkyStatus
  lastElectricityTime: string | null
}

function buildRows(
  address: GroupAddressDto,
  inverters: SolarInverterDto[],
  sparky: { status: SparkyStatus; lastElectricityTime: string | null },
): SolarInverterReportRow[] {
  return inverters.map((inv) => {
    const info: any = inv.info ?? {}
    const ps: any = inv.lastProductionState ?? null
    return {
      addressUuid: address.uuid,
      sparkySerial: address.sparky?.serialNumber ?? null,
      flintSerial: address.flint?.serialNumber ?? null,
      identifier: inv.identifier,
      brand: info.brand ?? '',
      model: info.model ?? null,
      connectionType: deriveConnectionType(info),
      productionStatus: deriveProductionStatus(ps, info),
      lastProductionTime: ps?.time ?? null,
      isProducing: ps ? ps.isProducing ?? null : null,
      productionRateWh: ps ? ps.productionRate ?? null : null,
      sparkyStatus: sparky.status,
      lastElectricityTime: sparky.lastElectricityTime,
    }
  })
}

/**
 * Freshness of the address's Sparky, from the latest electricity reading of its
 * smart meter(s). Fully defensive: a missing Sparky, no meters, or any API error
 * resolves to a status without throwing, so one bad address can't fail the run.
 */
async function fetchSparkyStatus(
  address: GroupAddressDto,
  signal: AbortSignal,
): Promise<{ status: SparkyStatus; lastElectricityTime: string | null }> {
  if (!address.sparky?.serialNumber) return { status: 'none', lastElectricityTime: null }
  try {
    const metersRes = await smartMetersControllerGetSmartMetersForAddressV2(address.uuid, undefined, signal)
    const meters = metersRes.results ?? []
    const electricity = meters.filter((m: any) => m.eanElectricity)
    const targets = electricity.length ? electricity : meters
    const times = await Promise.all(
      targets.map(async (m: any) => {
        try {
          const reading = await smartMetersControllerGetLatestElectricityReadingV2(address.uuid, m.identifier, undefined, signal)
          // `time` is typed as an opaque DateTime but is an ISO string at runtime.
          return asString((reading as any).time)
        } catch {
          return null
        }
      }),
    )
    const latest = mostRecent(...times)
    return { status: deriveSparkyStatus(true, latest), lastElectricityTime: latest }
  } catch {
    return { status: deriveSparkyStatus(true, null), lastElectricityTime: null }
  }
}

/** Group-wide "All Solar Inverters" report — one row per inverter. */
export function useAllSolarInvertersReport(groupUuid: string | null) {
  const fetchRows = useCallback(async (address: GroupAddressDto, signal: AbortSignal) => {
    const [invRes, sparky] = await Promise.all([
      solarInvertersControllerListV2(address.uuid, undefined, signal),
      fetchSparkyStatus(address, signal),
    ])
    return buildRows(address, invRes.results ?? [], sparky)
  }, [])

  return useAddressReport<SolarInverterReportRow>(groupUuid, 'allSolarInverters', fetchRows)
}
