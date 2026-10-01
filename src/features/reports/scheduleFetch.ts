import { isAxiosError } from 'axios'
import { AbortedError } from '@/utils/concurrency'

/** Which of the two per-inverter schedule endpoints a read came from. */
export type ScheduleKind = 'flex' | 'schedule'

export interface ScheduleFetchFailure {
  addressUuid: string
  inverterId: string
  kind: ScheduleKind
  /** HTTP status, or null for a transport-level failure. */
  status: number | null
}

export interface InverterScheduleRef {
  addressUuid: string
  inverterId: string
}

/**
 * Read one inverter's schedules without letting that one inverter sink the scan.
 *
 * The two endpoints disagree about how to say "none": `/schedules` returns an
 * empty page, `/flex/schedules` answers 404 "Flex schedule not found". An
 * inverter that was replaced and left listed — still `isSteerable`, long
 * disconnected — hits that path routinely while keeping the historical schedules
 * from before it died, so 404 is read as an empty list rather than an error.
 *
 * Other failures are contained to their own inverter for the same reason: these
 * scans fan out over every steerable inverter in a group, and one flaky device
 * must not abort the rest. They are collected into `failures` instead of thrown,
 * so callers can say the scan was partial — a report that quietly swallowed
 * errors would show "no curtailment" for a day that had plenty. Aborts still
 * propagate, so cancelling a run stays immediate.
 */
export async function readSchedules<T>(
  load: () => Promise<{ results?: T[] }>,
  ref: InverterScheduleRef,
  kind: ScheduleKind,
  failures: ScheduleFetchFailure[],
  signal: AbortSignal,
): Promise<T[]> {
  try {
    return (await load()).results ?? []
  } catch (err) {
    if (signal.aborted || err instanceof AbortedError) throw err
    const status = isAxiosError(err) ? (err.response?.status ?? null) : null
    if (status === 404) return []
    failures.push({ addressUuid: ref.addressUuid, inverterId: ref.inverterId, kind, status })
    return []
  }
}
