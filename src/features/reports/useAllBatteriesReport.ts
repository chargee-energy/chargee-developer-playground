import { useCallback } from 'react'
import { batteryControllerGetBatteriesForAddressV2 } from '@/api/generated/batteries/batteries'
import type { BatteryDto, GroupAddressDto } from '@/api/generated/model'
import { useAddressReport } from './useAddressReport'
import { asNumber, asString, deriveFreshness, type FreshnessStatus } from './reportFreshness'

// Batteries have no steerable/live flag, so we use a single stale window.
const BATTERY_STALE_MS = 60 * 60 * 1000 // 1 hour

export type BatteryActivity = 'charging' | 'discharging' | 'idle' | 'fault' | 'unknown'

// status enum: UNKNOWN=0, IDLE=1, CHARGING=2, DISCHARGING=3, FAULT=4, UNRECOGNIZED=-1
function toActivity(status: unknown): BatteryActivity {
  switch (status) {
    case 2:
      return 'charging'
    case 3:
      return 'discharging'
    case 1:
      return 'idle'
    case 4:
      return 'fault'
    default:
      return 'unknown'
  }
}

export interface BatteryReportRow {
  addressUuid: string
  sparkySerial: string | null
  flintSerial: string | null
  identifier: string
  brand: string
  model: string | null
  batteryLevel: number | null
  activity: BatteryActivity
  status: FreshnessStatus
  lastSeen: string | null
}

function buildRows(address: GroupAddressDto, batteries: BatteryDto[]): BatteryReportRow[] {
  return batteries.map((b) => {
    const cs: any = b.lastChargeState ?? {}
    const lastSeen = asString(cs.time)
    return {
      addressUuid: address.uuid,
      sparkySerial: address.sparky?.serialNumber ?? null,
      flintSerial: address.flint?.serialNumber ?? null,
      identifier: b.identifier,
      brand: b.brand ?? '',
      model: b.model ?? null,
      batteryLevel: asNumber(cs.batteryLevel),
      activity: toActivity(cs.status),
      status: deriveFreshness(lastSeen, BATTERY_STALE_MS),
      lastSeen,
    }
  })
}

/** Group-wide "All Batteries" report — one row per battery. */
export function useAllBatteriesReport(groupUuid: string | null) {
  const fetchRows = useCallback(async (address: GroupAddressDto, signal: AbortSignal) => {
    const res = await batteryControllerGetBatteriesForAddressV2(address.uuid, undefined, signal)
    return buildRows(address, res.results ?? [])
  }, [])

  return useAddressReport<BatteryReportRow>(groupUuid, 'allBatteries', fetchRows)
}
