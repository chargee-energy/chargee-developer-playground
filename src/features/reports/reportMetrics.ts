import type { ReactNode } from 'react'

export interface ReportMetric {
  label: string
  value: ReactNode
  sub?: ReactNode
}

/** Percentage helper shared by report metrics (guards divide-by-zero). */
export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
