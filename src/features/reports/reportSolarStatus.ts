import { deriveFreshness } from './reportFreshness'

/** Local (steerable) inverters stream live, so their data is stale after 1 minute. */
export const LOCAL_STALE_MS = 60 * 1000
/** Cloud (non-steerable) inverters report periodically, so stale after 8 hours. */
export const CLOUD_STALE_MS = 8 * 60 * 60 * 1000
/**
 * A Sparky feeds P1 electricity readings roughly every few seconds to minutes;
 * if the latest reading is older than 15 minutes we treat the Sparky as inactive
 * (and therefore unusable for local inverter curtailment).
 */
export const SPARKY_STALE_MS = 15 * 60 * 1000

export type ConnectionType = 'local' | 'cloud'
export type ProductionStatus = 'connected' | 'stale' | 'disconnected'
/** Whether the address's Sparky is delivering fresh electricity data. */
export type SparkyStatus = 'active' | 'inactive' | 'none'

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
 *   (1 min for local, 8 h for cloud),
 * - `connected` otherwise.
 * The stale threshold follows the same local/cloud rule as `deriveConnectionType`
 * (steerable OR live-data-capable = local), so connection type and freshness agree.
 */
export function deriveProductionStatus(
  lastProductionState: { time?: string | null } | null | undefined,
  connection?: ConnectionInput,
): ProductionStatus {
  const time = lastProductionState?.time
  if (!lastProductionState || !time) return 'disconnected'

  const threshold = deriveConnectionType(connection) === 'local' ? LOCAL_STALE_MS : CLOUD_STALE_MS
  const ageMs = Date.now() - new Date(time).getTime()
  if (Number.isFinite(ageMs) && ageMs > threshold) return 'stale'
  return 'connected'
}

/**
 * Whether the address's Sparky is delivering fresh electricity data:
 * - `none` when the address has no Sparky at all,
 * - `active` when the latest electricity reading is within `SPARKY_STALE_MS`,
 * - `inactive` otherwise (stale or no reading — so it can't curtail local inverters).
 */
export function deriveSparkyStatus(hasSparky: boolean, lastElectricityTime: string | null): SparkyStatus {
  if (!hasSparky) return 'none'
  return deriveFreshness(lastElectricityTime, SPARKY_STALE_MS) === 'connected' ? 'active' : 'inactive'
}
