import { create } from 'zustand'

// A single captured request/response, recorded by the axios interceptor in
// mutator.ts. Powers the "Raw + Docs" API Inspector drawer.
export interface ApiCall {
  id: number
  method: string
  /** Path including the /api/v2 prefix, e.g. /api/v2/groups */
  url: string
  /** Fully-qualified URL actually requested. */
  fullUrl: string
  params?: Record<string, unknown>
  requestBody?: unknown
  status: number | null
  statusText?: string
  durationMs: number
  startedAt: string
  response?: unknown
  error?: string
}

const MAX_CALLS = 50

interface InspectorState {
  calls: ApiCall[]
  lastByKey: Record<string, ApiCall>
  record: (call: ApiCall) => void
  clear: () => void
}

let counter = 0
export const nextCallId = () => ++counter

/** Stable key for a call so a view can look up "its" latest response. */
export const callKey = (method: string, url: string) => `${method} ${url}`

export const useInspectorStore = create<InspectorState>((set) => ({
  calls: [],
  lastByKey: {},
  record: (call) =>
    set((state) => ({
      calls: [call, ...state.calls].slice(0, MAX_CALLS),
      lastByKey: { ...state.lastByKey, [callKey(call.method, call.url)]: call },
    })),
  clear: () => set({ calls: [], lastByKey: {} }),
}))
