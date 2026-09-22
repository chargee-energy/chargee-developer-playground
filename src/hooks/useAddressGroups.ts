import { useCallback, useEffect, useRef, useState } from 'react'
import type { GroupAddressDto, UserGroupDto } from '@/api/generated/model'
import { AbortedError, mapWithConcurrency } from '@/utils/concurrency'
import { loadAllGroupAddresses, loadAllGroups } from '@/utils/groupAddresses'

export interface AddressGroupsResult {
  /** Groups whose address list contains this address. */
  groups: UserGroupDto[]
  /**
   * The address as a group lists it — the only shape that carries both sparky
   * and flint. Null when no group we can see contains the address.
   */
  record: GroupAddressDto | null
  /** Groups scanned, so a zero result can be told apart from "nothing to scan". */
  scanned: number
}

export type ScanStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled'

// Scanning is expensive, so remember it for the session. Keyed by address.
const cache = new Map<string, AddressGroupsResult>()

const GROUP_CONCURRENCY = 4

/**
 * Finds which groups an address belongs to, and recovers its full device
 * record along the way.
 *
 * The v2 API has no address → groups route and no address → sparky/flint
 * route: `/sparkies/{sn}` and `/flints/{sn}` are device-scoped and answer with
 * that one device plus an addressUuid, so a lookup by flint serial can never
 * report the sparky. `GET /groups/{uuid}/addresses` is the only endpoint that
 * returns a GroupAddressDto with both devices attached, and it takes no
 * address filter — so the only way to answer either question is to page every
 * group the user can see and look for the address. Deliberately manual: it can
 * be a lot of requests, and it is cached per address once done.
 */
export function useAddressGroups(addressUuid: string | null) {
  const [status, setStatus] = useState<ScanStatus>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<AddressGroupsResult | null>(null)
  const [error, setError] = useState<unknown>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Re-seed from the cache when the address changes.
  useEffect(() => {
    const cached = addressUuid ? cache.get(addressUuid) : undefined
    setResult(cached ?? null)
    setStatus(cached ? 'done' : 'idle')
    setProgress({ done: 0, total: 0 })
    setError(null)
  }, [addressUuid])

  const cancel = useCallback(() => abortRef.current?.abort(), [])

  const run = useCallback(async () => {
    if (!addressUuid) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const { signal } = controller

    setStatus('running')
    setError(null)
    setProgress({ done: 0, total: 0 })

    try {
      const groups = await loadAllGroups(signal)
      setProgress({ done: 0, total: groups.length })

      const hits = await mapWithConcurrency(
        groups,
        GROUP_CONCURRENCY,
        async (group) => {
          const addresses = await loadAllGroupAddresses(group.uuid, signal)
          const match = addresses.find((a) => a.uuid === addressUuid)
          return match ? { group, match } : null
        },
        { signal, onProgress: (done, total) => setProgress({ done, total }) },
      )

      if (signal.aborted) {
        setStatus('cancelled')
        return
      }

      const found = hits.filter((h): h is { group: UserGroupDto; match: GroupAddressDto } => h !== null)
      // Any group listing the address carries the same devices; take the
      // richest one in case a group has only part of it.
      const record =
        found.reduce<GroupAddressDto | null>(
          (best, { match }) => ({
            ...(best ?? match),
            uuid: match.uuid,
            sparky: best?.sparky ?? match.sparky ?? null,
            flint: best?.flint ?? match.flint ?? null,
          }),
          null,
        ) ?? null

      const next: AddressGroupsResult = { groups: found.map((h) => h.group), record, scanned: groups.length }
      cache.set(addressUuid, next)
      setResult(next)
      setStatus('done')
    } catch (err) {
      if (err instanceof AbortedError || signal.aborted) {
        setStatus('cancelled')
      } else {
        setError(err)
        setStatus('error')
      }
    }
  }, [addressUuid])

  return { status, progress, result, error, run, cancel }
}
