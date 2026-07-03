import { useCallback } from 'react'
import { chargerControllerGetChargersForAddressV2 } from '@/api/generated/chargers/chargers'
import type { ChargerDto, GroupAddressDto } from '@/api/generated/model'
import { useAddressReport } from './useAddressReport'
import { deriveConnectionType, LOCAL_STALE_MS, CLOUD_STALE_MS, type ConnectionType } from './reportSolarStatus'
import { asBoolean, asNumber, asString, deriveFreshness, type FreshnessStatus } from './reportFreshness'

export type ChargeActivity = 'charging' | 'pluggedIn' | 'idle'

export interface ChargerReportRow {
  addressUuid: string
  sparkySerial: string | null
  flintSerial: string | null
  identifier: string
  brand: string
  model: string | null
  year: number | null
  connectionType: ConnectionType
  status: FreshnessStatus
  activity: ChargeActivity
  lastSeen: string | null
}

function buildRows(address: GroupAddressDto, chargers: ChargerDto[]): ChargerReportRow[] {
  return chargers.map((c) => {
    const cs: any = c.lastChargeState ?? {}
    const connectionType = deriveConnectionType({ isSteerable: c.isSteerable, liveDataSupported: c.liveDataSupported })
    const lastSeen = asString(cs.time)
    const activity: ChargeActivity =
      asBoolean(cs.isCharging) === true ? 'charging' : asBoolean(cs.isPluggedIn) === true ? 'pluggedIn' : 'idle'
    return {
      addressUuid: address.uuid,
      sparkySerial: address.sparky?.serialNumber ?? null,
      flintSerial: address.flint?.serialNumber ?? null,
      identifier: c.identifier,
      brand: c.brand ?? '',
      model: c.model ?? null,
      year: asNumber(c.year),
      connectionType,
      status: deriveFreshness(lastSeen, connectionType === 'local' ? LOCAL_STALE_MS : CLOUD_STALE_MS),
      activity,
      lastSeen,
    }
  })
}

/** Group-wide "All Chargers" report — one row per charger. */
export function useAllChargersReport(groupUuid: string | null) {
  const fetchRows = useCallback(async (address: GroupAddressDto, signal: AbortSignal) => {
    const res = await chargerControllerGetChargersForAddressV2(address.uuid, undefined, signal)
    return buildRows(address, res.results ?? [])
  }, [])

  return useAddressReport<ChargerReportRow>(groupUuid, 'allChargers', fetchRows)
}
