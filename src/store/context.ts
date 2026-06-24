import { create } from 'zustand'
import type { GroupAddressDto } from '@/api/generated/model'

// The selected place in the user → group → address hierarchy. Synced to the
// URL (?group=&address=) by useContextSync so links are shareable.
interface ContextState {
  groupUuid: string | null
  groupName: string | null
  addressUuid: string | null
  /** The full selected address record (sparky + flint live here). */
  addressRecord: GroupAddressDto | null
  /** Serial of the address's sparky, when known (powers sparky telemetry). */
  addressSerial: string | null
  setGroup: (uuid: string | null, name?: string | null) => void
  setAddress: (uuid: string | null, record?: GroupAddressDto | null) => void
  reset: () => void
}

export const useContextStore = create<ContextState>((set) => ({
  groupUuid: null,
  groupName: null,
  addressUuid: null,
  addressRecord: null,
  addressSerial: null,
  setGroup: (uuid, name = null) =>
    // Changing group clears the selected address.
    set({ groupUuid: uuid, groupName: name, addressUuid: null, addressRecord: null, addressSerial: null }),
  setAddress: (uuid, record = null) =>
    set({ addressUuid: uuid, addressRecord: record, addressSerial: record?.sparky?.serialNumber ?? null }),
  reset: () =>
    set({ groupUuid: null, groupName: null, addressUuid: null, addressRecord: null, addressSerial: null }),
}))
