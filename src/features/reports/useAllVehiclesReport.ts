import { useCallback } from 'react'
import { vehicleControllerGetVehiclesForAddressV2 } from '@/api/generated/vehicles/vehicles'
import type { GroupAddressDto, VehicleDto } from '@/api/generated/model'
import { useAddressReport } from './useAddressReport'
import { deriveFreshness, mostRecent, type FreshnessStatus } from './reportFreshness'

// Vehicles report over the air far less often than local inverters, so a wider
// window before we consider their data stale.
const VEHICLE_STALE_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface VehicleReportRow {
  addressUuid: string
  sparkySerial: string | null
  flintSerial: string | null
  identifier: string
  vin: string
  brand: string
  model: string | null
  year: number | null
  batteryLevel: number | null
  isCharging: boolean | null
  isPluggedIn: boolean | null
  status: FreshnessStatus
  lastSeen: string | null
}

function toStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function buildRows(address: GroupAddressDto, vehicles: VehicleDto[]): VehicleReportRow[] {
  return vehicles.map((v) => {
    const info: any = v.info ?? {}
    const charge: any = v.lastChargeState ?? {}
    const location: any = v.lastLocation ?? {}
    const odometer: any = v.lastOdometer ?? {}

    // "Last seen" = the most recent signal from any of the vehicle's state feeds.
    const lastSeen = mostRecent(
      toStr(info.lastSeen),
      toStr(charge.time),
      toStr(location.time),
      toStr(odometer.time),
    )

    return {
      addressUuid: address.uuid,
      sparkySerial: address.sparky?.serialNumber ?? null,
      flintSerial: address.flint?.serialNumber ?? null,
      identifier: v.identifier,
      vin: v.vin,
      brand: info.brand ?? '',
      model: info.model ?? null,
      year: typeof info.year === 'number' ? info.year : null,
      batteryLevel: typeof charge.batteryLevel === 'number' ? charge.batteryLevel : null,
      isCharging: typeof charge.isCharging === 'boolean' ? charge.isCharging : null,
      isPluggedIn: typeof charge.isPluggedIn === 'boolean' ? charge.isPluggedIn : null,
      status: deriveFreshness(lastSeen, VEHICLE_STALE_MS),
      lastSeen,
    }
  })
}

/** Group-wide "All Vehicles" report — one row per vehicle. */
export function useAllVehiclesReport(groupUuid: string | null) {
  const fetchRows = useCallback(async (address: GroupAddressDto, signal: AbortSignal) => {
    const res = await vehicleControllerGetVehiclesForAddressV2(address.uuid, undefined, signal)
    return buildRows(address, res.results ?? [])
  }, [])

  return useAddressReport<VehicleReportRow>(groupUuid, 'allVehicles', fetchRows)
}
