import { create } from 'zustand'

// A generated report kept in memory so users can leave the Reports page and come
// back without re-running the (potentially long) generation. Keyed by a caller
// chosen string, e.g. `allSolarInverters:<groupUuid>`, so switching group or
// report type keeps its own cached result.
export interface ReportCacheEntry<T = unknown> {
  data: T
  /** ISO timestamp of when the report finished generating. */
  generatedAt: string
}

interface ReportCacheState {
  entries: Record<string, ReportCacheEntry>
  getEntry: <T>(key: string) => ReportCacheEntry<T> | undefined
  setEntry: <T>(key: string, data: T, generatedAt?: string) => void
  clearEntry: (key: string) => void
}

export const useReportCache = create<ReportCacheState>((set, get) => ({
  entries: {},
  getEntry: <T,>(key: string) => get().entries[key] as ReportCacheEntry<T> | undefined,
  setEntry: (key, data, generatedAt = new Date().toISOString()) =>
    set((s) => ({ entries: { ...s.entries, [key]: { data, generatedAt } } })),
  clearEntry: (key) =>
    set((s) => {
      const next = { ...s.entries }
      delete next[key]
      return { entries: next }
    }),
}))
