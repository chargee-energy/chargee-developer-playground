/** Local (steerable) inverters stream live, so their data is stale after 1 minute. */
export const LOCAL_STALE_MS = 60 * 1000
/** Cloud (non-steerable) inverters report periodically, so stale after 8 hours. */
export const CLOUD_STALE_MS = 8 * 60 * 60 * 1000

export type ConnectionType = 'local' | 'cloud'
export type ProductionStatus = 'connected' | 'stale' | 'disconnected'

interface ConnectionInput {
  isSteerable?: unknown
  liveDataSupported?: unknown
}

/**
 * A "local" inverter streams live data (steerable or live-capable); anything
 * else is served via the cloud. Mirrors the Live vs Cloud badge in DevicesPage.
 */
export function deriveConnectionType(info: ConnectionInput | null | undefined): ConnectionType {
  return info?.isSteerable === true || info?.liveDataSupported === true ? 'local' : 'cloud'
}

/**
 * Production health from the last production state:
 * - `disconnected` when there is no state/timestamp,
 * - `stale` when the timestamp is older than the connection's threshold
 *   (1 min for steerable/local, 8 h for cloud),
 * - `connected` otherwise.
 * The stale threshold keys off `isSteerable` only, matching SolarProductionStatusBadge.
 */
export function deriveProductionStatus(
  lastProductionState: { time?: string | null } | null | undefined,
  isSteerable?: unknown,
): ProductionStatus {
  const time = lastProductionState?.time
  if (!lastProductionState || !time) return 'disconnected'

  const threshold = isSteerable === true ? LOCAL_STALE_MS : CLOUD_STALE_MS
  const ageMs = Date.now() - new Date(time).getTime()
  if (Number.isFinite(ageMs) && ageMs > threshold) return 'stale'
  return 'connected'
}
