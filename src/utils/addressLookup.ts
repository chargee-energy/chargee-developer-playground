import { isAxiosError } from 'axios'
import type { GroupAddressDto, GroupFlintDto, GroupSparkyDto } from '@/api/generated/model'
import {
  sparkyControllerGetSparkyDetailsV2,
  sparkyControllerGetSparkyDetailsByBoxCodeV2,
} from '@/api/generated/sparky/sparky'
import { flintControllerGetFlintDetailsV2 } from '@/api/generated/flint/flint'
import {
  smartMetersEanControllerFindByElectricityEanV2,
  smartMetersEanControllerFindByGasEanV2,
} from '@/api/generated/smart-meters/smart-meters'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EAN_RE = /^\d{18}$/
// Whitespace plus invisible format characters (zero-width spaces, BOM) that ride along when copying.
const STRAY_CHARS_RE = /[\s\p{Cf}]+/gu

/**
 * Strip every space, tab and newline from lookup input. No identifier contains
 * whitespace, and a pasted value often carries a stray one that makes an
 * otherwise valid lookup miss.
 */
export const normalizeLookupInput = (input: string) => input.replace(STRAY_CHARS_RE, '')

function addressRecord(
  uuid: string,
  devices: { sparky?: GroupSparkyDto; flint?: GroupFlintDto } = {},
): GroupAddressDto {
  return { uuid, sparky: devices.sparky ?? null, flint: devices.flint ?? null, createdAt: '', updatedAt: null }
}

/**
 * Resolves free-text input to a single address, for roles without a group
 * limit. There's no address search endpoint, so each identifier the API can
 * look up is tried in turn until one returns an address. Sparky and flint
 * serials share a format, so a flint serial always misses on the sparky
 * endpoint first. A bare address UUID is taken as-is: nothing returns its
 * sparky/flint, so those stay empty.
 *
 * A failed attempt never stops the chain — the API may answer a serial of the
 * other device kind with a 4xx, a 5xx or an empty body. Returns null when
 * nothing matches (including addresses outside the user's access); throws
 * only if nothing matched and a request never got a response (network).
 */
export async function lookupAddress(input: string, signal?: AbortSignal): Promise<GroupAddressDto | null> {
  const q = normalizeLookupInput(input)
  if (!q) return null
  if (UUID_RE.test(q)) return addressRecord(q.toLowerCase())

  const attempts: Array<() => Promise<GroupAddressDto | null>> = EAN_RE.test(q)
    ? [
        async () => {
          const m = await smartMetersEanControllerFindByElectricityEanV2({ ean: q }, undefined, signal)
          return m?.addressUuid ? addressRecord(m.addressUuid) : null
        },
        async () => {
          const m = await smartMetersEanControllerFindByGasEanV2({ ean: q }, undefined, signal)
          return m?.addressUuid ? addressRecord(m.addressUuid) : null
        },
      ]
    : [
        async () => {
          const s = await sparkyControllerGetSparkyDetailsV2(q, undefined, signal)
          return s?.addressUuid
            ? addressRecord(s.addressUuid, { sparky: { uuid: s.uuid, serialNumber: s.serialNumber, boxCode: null } })
            : null
        },
        async () => {
          const f = await flintControllerGetFlintDetailsV2(q, undefined, signal)
          return f?.addressUuid
            ? addressRecord(f.addressUuid, { flint: { uuid: f.uuid, serialNumber: f.serialNumber } })
            : null
        },
        async () => {
          const s = await sparkyControllerGetSparkyDetailsByBoxCodeV2({ boxCode: q }, undefined, signal)
          return s?.addressUuid
            ? addressRecord(s.addressUuid, { sparky: { uuid: s.uuid, serialNumber: s.serialNumber, boxCode: q } })
            : null
        },
      ]

  let networkError: unknown = null
  for (const attempt of attempts) {
    if (signal?.aborted) break
    try {
      const record = await attempt()
      if (record) return record
    } catch (err) {
      if (!isAxiosError(err) || !err.response) networkError ??= err
    }
  }
  if (networkError) throw networkError
  return null
}
