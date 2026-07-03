import { useCallback } from 'react'
import { smartMetersControllerGetSmartMetersForAddressV2 } from '@/api/generated/smart-meters/smart-meters'
import type { GroupAddressDto, SmartMeterDto } from '@/api/generated/model'
import { useAddressReport } from './useAddressReport'

export interface MeterReportRow {
  addressUuid: string
  sparkySerial: string | null
  flintSerial: string | null
  identifier: string
  smartMeterType: string | null
  meterNumber: string | null
  eanElectricity: string | null
  eanGas: string | null
}

function buildRows(address: GroupAddressDto, meters: SmartMeterDto[]): MeterReportRow[] {
  return meters.map((m) => ({
    addressUuid: address.uuid,
    sparkySerial: address.sparky?.serialNumber ?? null,
    flintSerial: address.flint?.serialNumber ?? null,
    identifier: m.identifier,
    smartMeterType: m.smartMeterType ?? null,
    meterNumber: m.meterNumber ?? null,
    eanElectricity: m.eanElectricity ?? null,
    eanGas: m.eanGas ?? null,
  }))
}

/** Group-wide "All Smart Meters" report — one row per meter. */
export function useAllMetersReport(groupUuid: string | null) {
  const fetchRows = useCallback(async (address: GroupAddressDto, signal: AbortSignal) => {
    const res = await smartMetersControllerGetSmartMetersForAddressV2(address.uuid, undefined, signal)
    return buildRows(address, res.results ?? [])
  }, [])

  return useAddressReport<MeterReportRow>(groupUuid, 'allMeters', fetchRows)
}
