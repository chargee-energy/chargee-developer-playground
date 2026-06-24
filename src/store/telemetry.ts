import { create } from 'zustand'
import type { TelemetryTarget } from '@/features/telemetry/types'

// The device/address currently being inspected on the Telemetry page. Held in
// a store (not router state) so it survives the context-bar's URL updates.
interface TelemetryState {
  target: TelemetryTarget | null
  setTarget: (target: TelemetryTarget | null) => void
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  target: null,
  setTarget: (target) => set({ target }),
}))
