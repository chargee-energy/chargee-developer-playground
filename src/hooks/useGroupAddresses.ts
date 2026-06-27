import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  useGroupControllerGetGroupSparkiesV2,
  groupControllerGetGroupSparkiesV2,
} from '@/api/generated/groups/groups'
import type { GroupAddressDto } from '@/api/generated/model'

const CHUNK = 1000
const MAX_CHUNKS = 20 // up to 20k addresses

/**
 * Loads every address in a group by paging through the offset/limit endpoint
 * (max 1000 per request, no search/offset-search) so callers can search and
 * paginate the full list client-side. Results are React-Query cached, so the
 * context bar and the Addresses page share the same fetches.
 */
export function useGroupAddresses(groupUuid: string | null, enabled = true) {
  const on = enabled && !!groupUuid

  const first = useGroupControllerGetGroupSparkiesV2(
    groupUuid ?? '',
    { limit: CHUNK, offset: 0 },
    { query: { enabled: on } },
  )
  const total = first.data?.meta.total ?? 0
  const chunkCount = Math.min(Math.ceil(total / CHUNK), MAX_CHUNKS)
  const offsets = Array.from({ length: Math.max(0, chunkCount - 1) }, (_, i) => (i + 1) * CHUNK)

  const extra = useQueries({
    queries: offsets.map((offset) => ({
      queryKey: ['group-addresses', groupUuid, offset],
      queryFn: () => groupControllerGetGroupSparkiesV2(groupUuid as string, { limit: CHUNK, offset }),
      enabled: on,
    })),
  })

  const addresses = useMemo(
    () =>
      [
        ...(first.data?.results ?? []),
        ...extra.flatMap((q) => q.data?.results ?? []),
      ] as GroupAddressDto[],
    [first.data, extra],
  )

  return {
    addresses,
    total,
    isLoading: first.isLoading || extra.some((q) => q.isLoading),
    isError: first.isError || extra.some((q) => q.isError),
    error: first.isError ? first.error : extra.find((q) => q.isError)?.error,
    refetch: () => {
      first.refetch()
      extra.forEach((q) => q.refetch())
    },
  }
}
