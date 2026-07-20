import type { ComponentType, SVGProps } from 'react'
import {
  SunIcon,
  TruckIcon,
  PowerIcon,
  FireIcon,
  Battery50Icon,
  Battery100Icon,
  BoltIcon,
  ScaleIcon,
  BoltSlashIcon,
} from '@heroicons/react/24/outline'
import { AllSolarInvertersReport } from './reports/AllSolarInvertersReport'
import { AllVehiclesReport } from './reports/AllVehiclesReport'
import { AllChargersReport } from './reports/AllChargersReport'
import { AllHvacsReport } from './reports/AllHvacsReport'
import { AllBatteriesReport } from './reports/AllBatteriesReport'
import { AllMetersReport } from './reports/AllMetersReport'
import { BenchmarkReport } from './reports/BenchmarkReport'
import { BatteryReport } from './reports/BatteryReport'
import { GroupCurtailmentReport } from './reports/GroupCurtailmentReport'

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
  { id: 'benchmark', icon: ScaleIcon, scope: 'address', Component: BenchmarkReport },
  { id: 'batteryAdvice', icon: Battery100Icon, scope: 'address', Component: BatteryReport },
  { id: 'allSolarInverters', icon: SunIcon, scope: 'group', Component: AllSolarInvertersReport },
  { id: 'allVehicles', icon: TruckIcon, scope: 'group', Component: AllVehiclesReport },
  { id: 'allChargers', icon: PowerIcon, scope: 'group', Component: AllChargersReport },
  { id: 'allHvacs', icon: FireIcon, scope: 'group', Component: AllHvacsReport },
  { id: 'allBatteries', icon: Battery50Icon, scope: 'group', Component: AllBatteriesReport },
  { id: 'allMeters', icon: BoltIcon, scope: 'group', Component: AllMetersReport },
  { id: 'groupCurtailment', icon: BoltSlashIcon, scope: 'group', Component: GroupCurtailmentReport },
]
