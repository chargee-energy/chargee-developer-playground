import type { ComponentType, SVGProps } from 'react'
import { SunIcon } from '@heroicons/react/24/outline'
import { AllSolarInvertersReport } from './reports/AllSolarInvertersReport'

export type ReportScope = 'group' | 'address'

export interface ReportTemplate {
  /** Stable id; i18n lives under reports.templates.<id>.{title,description}. */
  id: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  scope: ReportScope
  Component: ComponentType
}

// Add new report templates here — they appear automatically in the hub gallery.
export const reportTemplates: ReportTemplate[] = [
  { id: 'allSolarInverters', icon: SunIcon, scope: 'group', Component: AllSolarInvertersReport },
]
