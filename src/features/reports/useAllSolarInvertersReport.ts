import { useCallback } from 'react'
import { solarInvertersControllerListV2 } from '@/api/generated/solar-inverters/solar-inverters'
import type { GroupAddressDto, SolarInverterDto } from '@/api/generated/model'
import { useAddressReport } from './useAddressReport'
import {
  deriveConnectionType,
  deriveProductionStatus,
  type ConnectionType,
  type ProductionStatus,
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
}

function buildRows(address: GroupAddressDto, inverters: SolarInverterDto[]): SolarInverterReportRow[] {
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
      productionStatus: deriveProductionStatus(ps, info.isSteerable),
      lastProductionTime: ps?.time ?? null,
      isProducing: ps ? ps.isProducing ?? null : null,
      productionRateWh: ps ? ps.productionRate ?? null : null,
    }
  })
}

/** Group-wide "All Solar Inverters" report — one row per inverter. */
export function useAllSolarInvertersReport(groupUuid: string | null) {
  const fetchRows = useCallback(async (address: GroupAddressDto, signal: AbortSignal) => {
    const res = await solarInvertersControllerListV2(address.uuid, undefined, signal)
    return buildRows(address, res.results ?? [])
  }, [])

  return useAddressReport<SolarInverterReportRow>(groupUuid, 'allSolarInverters', fetchRows)
}
