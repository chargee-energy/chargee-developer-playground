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
  /**
   * Fill in the name for the already-selected group. Hydrating from the URL
   * gives us a uuid but no name, so this backfills it once the groups load —
   * without touching the selected address the way `setGroup` does.
   */
  setGroupName: (name: string | null) => void
  setAddress: (uuid: string | null, record?: GroupAddressDto | null) => void
  /**
   * Select an address found by direct lookup. It may sit outside the selected
   * group, so the group is cleared to keep the context consistent.
   */
  selectLookedUpAddress: (record: GroupAddressDto) => void
  /**
   * Fill in devices discovered after selection (the group scan finds the
   * sparky a flint lookup could not return), keeping what is already known.
   */
  mergeAddressDevices: (record: GroupAddressDto) => void
  /**
   * Select a group without clearing the address, for when the address is
   * already chosen and its group is only discovered afterwards.
   */
  selectGroupForAddress: (uuid: string, name?: string | null) => void
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
  setGroupName: (name) => set({ groupName: name }),
  setAddress: (uuid, record = null) =>
    set({ addressUuid: uuid, addressRecord: record, addressSerial: record?.sparky?.serialNumber ?? null }),
  selectLookedUpAddress: (record) =>
    set((state) => {
      // A lookup only knows the device it was found by, so keep the devices
      // earlier lookups found for the same address (e.g. its sparky, then its flint).
      const known = state.addressUuid === record.uuid ? state.addressRecord : null
      const merged: GroupAddressDto = {
        ...record,
        sparky: record.sparky ?? known?.sparky ?? null,
        flint: record.flint ?? known?.flint ?? null,
      }
      return {
        groupUuid: null,
        groupName: null,
        addressUuid: merged.uuid,
        addressRecord: merged,
        addressSerial: merged.sparky?.serialNumber ?? null,
      }
    }),
  mergeAddressDevices: (record) =>
    set((state) => {
      if (state.addressUuid !== record.uuid) return state
      const known = state.addressRecord
      const merged: GroupAddressDto = {
        ...(known ?? record),
        uuid: record.uuid,
        // Field-wise, incoming first: a group listing is the richer source.
        // `GET /sparkies/{sn}` carries no box code, so a serial lookup leaves
        // it null and only the group listing can fill it in.
        sparky: record.sparky
          ? { ...known?.sparky, ...record.sparky, boxCode: record.sparky.boxCode ?? known?.sparky?.boxCode ?? null }
          : (known?.sparky ?? null),
        flint: record.flint ? { ...known?.flint, ...record.flint } : (known?.flint ?? null),
      }
      return { addressRecord: merged, addressSerial: merged.sparky?.serialNumber ?? null }
    }),
  selectGroupForAddress: (uuid, name = null) => set({ groupUuid: uuid, groupName: name }),
  reset: () =>
    set({ groupUuid: null, groupName: null, addressUuid: null, addressRecord: null, addressSerial: null }),
}))
