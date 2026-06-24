export type TelemetryKind = 'sparky' | 'solar' | 'smartMeter' | 'charger' | 'addressEnergy'

export interface TelemetryTarget {
  kind: TelemetryKind
  addressUuid: string
  /** Serial number for sparky; device identifier otherwise; addressUuid for addressEnergy. */
  identifier: string
  label?: string
  /**
   * Solar only: whether the inverter is steerable/live. Non-steerable (cloud)
   * inverters expose production via the aggregated interval endpoint instead of
   * the realtime energy/production endpoint.
   */
  steerable?: boolean
}
