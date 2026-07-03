import { useCallback } from 'react'
import { hvacControllerGetHvacsForAddressV2 } from '@/api/generated/hvacs/hvacs'
import type { GroupAddressDto, HvacDto } from '@/api/generated/model'
import { useAddressReport } from './useAddressReport'
import { asBoolean, asNumber, asString, deriveFreshness, type FreshnessStatus } from './reportFreshness'

// HVAC units have no steerable/live flag, so we use a single stale window.
const HVAC_STALE_MS = 60 * 60 * 1000 // 1 hour

export interface HvacReportRow {
  addressUuid: string
  sparkySerial: string | null
  flintSerial: string | null
  identifier: string
  brand: string
  model: string | null
  category: string | null
  currentTemperature: number | null
  isActive: boolean | null
  status: FreshnessStatus
  lastSeen: string | null
}

function buildRows(address: GroupAddressDto, hvacs: HvacDto[]): HvacReportRow[] {
  return hvacs.map((h) => {
    const ts: any = h.lastTemperatureState ?? {}
    const lastSeen = asString(ts.time)
    return {
      addressUuid: address.uuid,
      sparkySerial: address.sparky?.serialNumber ?? null,
      flintSerial: address.flint?.serialNumber ?? null,
      identifier: h.identifier,
      brand: h.brand ?? '',
      model: h.model ?? null,
      category: asString((h as any).category),
      currentTemperature: asNumber(ts.currentTemperature),
      isActive: asBoolean(ts.isActive),
      status: deriveFreshness(lastSeen, HVAC_STALE_MS),
      lastSeen,
    }
  })
}

/** Group-wide "All HVAC" report — one row per HVAC unit. */
export function useAllHvacsReport(groupUuid: string | null) {
  const fetchRows = useCallback(async (address: GroupAddressDto, signal: AbortSignal) => {
    const res = await hvacControllerGetHvacsForAddressV2(address.uuid, undefined, signal)
    return buildRows(address, res.results ?? [])
  }, [])

  return useAddressReport<HvacReportRow>(groupUuid, 'allHvacs', fetchRows)
}
