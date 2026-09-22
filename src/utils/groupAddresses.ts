import { groupControllerGetGroupsV2, groupControllerGetGroupSparkiesV2 } from '@/api/generated/groups/groups'
import type { GroupAddressDto, UserGroupDto } from '@/api/generated/model'
import { mapWithConcurrency } from '@/utils/concurrency'

// Throttle knobs — tuned in one place to keep backend load reasonable.
const ADDRESS_PAGE = 1000
const MAX_ADDRESS_PAGES = 20 // up to 20k addresses per group
const GROUP_PAGE = 1000
const PAGE_CONCURRENCY = 4

/** Fetch every address in a group by paging through the offset/limit endpoint. */
export async function loadAllGroupAddresses(groupUuid: string, signal: AbortSignal): Promise<GroupAddressDto[]> {
  const first = await groupControllerGetGroupSparkiesV2(groupUuid, { limit: ADDRESS_PAGE, offset: 0 }, undefined, signal)
  const total = first.meta?.total ?? 0
  const pages = Math.min(Math.ceil(total / ADDRESS_PAGE), MAX_ADDRESS_PAGES)
  const offsets = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => (i + 1) * ADDRESS_PAGE)

  const rest = await mapWithConcurrency(
    offsets,
    PAGE_CONCURRENCY,
    (offset) =>
      groupControllerGetGroupSparkiesV2(groupUuid, { limit: ADDRESS_PAGE, offset }, undefined, signal).then(
        (r) => r.results ?? [],
      ),
    { signal },
  )

  return [...(first.results ?? []), ...rest.flat()]
}

/** Every group the user can see. */
export async function loadAllGroups(signal: AbortSignal): Promise<UserGroupDto[]> {
  const first = await groupControllerGetGroupsV2({ limit: GROUP_PAGE, offset: 0 }, undefined, signal)
  const total = first.meta?.total ?? 0
  const pages = Math.ceil(total / GROUP_PAGE)
  const offsets = Array.from({ length: Math.max(0, pages - 1) }, (_, i) => (i + 1) * GROUP_PAGE)

  const rest = await mapWithConcurrency(
    offsets,
    PAGE_CONCURRENCY,
    (offset) =>
      groupControllerGetGroupsV2({ limit: GROUP_PAGE, offset }, undefined, signal).then((r) => r.results ?? []),
    { signal },
  )

  return [...(first.results ?? []), ...rest.flat()]
}
