export type FreshnessStatus = 'connected' | 'stale' | 'disconnected'

/**
 * Classifies a device by how recently it reported:
 * - `disconnected` when there is no timestamp,
 * - `stale` when the timestamp is older than `staleMs`,
 * - `connected` otherwise.
 */
export function deriveFreshness(time: string | null | undefined, staleMs: number): FreshnessStatus {
  if (!time) return 'disconnected'
  const ageMs = Date.now() - new Date(time).getTime()
  if (Number.isFinite(ageMs) && ageMs > staleMs) return 'stale'
  return 'connected'
}

/** Narrows a loosely-typed generated field to a string, or null. */
export function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/** Narrows a loosely-typed generated field to a number, or null. */
export function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Narrows a loosely-typed generated field to a boolean, or null. */
export function asBoolean(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null
}

/** Returns the most recent of the given ISO timestamps, ignoring nullish/invalid ones. */
export function mostRecent(...times: (string | null | undefined)[]): string | null {
  let bestMs: number | null = null
  let bestStr: string | null = null
  for (const t of times) {
    if (!t) continue
    const ms = new Date(t).getTime()
    if (Number.isFinite(ms) && (bestMs === null || ms > bestMs)) {
      bestMs = ms
      bestStr = t
    }
  }
  return bestStr
}
