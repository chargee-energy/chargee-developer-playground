import Axios, { type AxiosError } from 'axios'
import { useInspectorStore, nextCallId, type ApiCall } from '@/store/inspector'
import { mapWithConcurrency } from '@/utils/concurrency'

// EnergyZero exposes Dutch EPEX day-ahead prices through a public, keyless API
// (the same source flex.energie.energyzero.nl uses).
const ENERGY_ZERO_ORIGIN = 'https://api.energyzero.nl'

interface EnergyZeroPrice {
  price: number
  readingDate: string
}

interface EnergyZeroResponse {
  Prices: EnergyZeroPrice[]
  average?: number
  fromDate?: string
  tillDate?: string
}

const EZ_AXIOS = Axios.create({ baseURL: ENERGY_ZERO_ORIGIN })

EZ_AXIOS.interceptors.request.use((config) => {
  ;(config as any).__startedAt = performance.now()
  return config
})

// Mirror price calls into the shared API Inspector, like the Order API client.
function record(cfg: any, partial: Omit<ApiCall, 'id' | 'method' | 'url' | 'fullUrl' | 'durationMs' | 'startedAt'>) {
  useInspectorStore.getState().record({
    id: nextCallId(),
    method: (cfg.method ?? 'get').toUpperCase(),
    url: cfg.url ?? '',
    fullUrl: `${cfg.baseURL ?? ''}${cfg.url ?? ''}`,
    params: cfg.params,
    durationMs: cfg.__startedAt ? Math.round(performance.now() - cfg.__startedAt) : 0,
    startedAt: new Date().toISOString(),
    ...partial,
  })
}

EZ_AXIOS.interceptors.response.use(
  (response) => {
    record(response.config, { status: response.status, statusText: response.statusText, response: response.data })
    return response
  },
  (error: AxiosError) => {
    record(error.config ?? {}, {
      status: error.response?.status ?? null,
      statusText: error.response?.statusText,
      response: error.response?.data,
      error: error.message,
    })
    return Promise.reject(error)
  },
)

/** Hourly prices for [fromDate, tillDate); interval=4 = hourly, usageType=1 = electricity consumption. */
async function getEnergyPrices(fromDate: string, tillDate: string, signal?: AbortSignal): Promise<EnergyZeroPrice[]> {
  const res = await EZ_AXIOS.get<EnergyZeroResponse>('/v1/energyprices', {
    params: { fromDate, tillDate, interval: 4, usageType: 1, inclBtw: true },
    signal,
  })
  return res.data.Prices ?? []
}

/** Round to UTC hour start so price keys line up with the hourly energy slots. */
function priceHourKey(iso: string): string {
  const d = new Date(iso)
  d.setUTCMinutes(0, 0, 0)
  return d.toISOString()
}

/** Split [from, to) into calendar-month windows to keep each request small. */
function monthWindows(from: Date, to: Date): Array<{ fromDate: string; tillDate: string }> {
  const windows: Array<{ fromDate: string; tillDate: string }> = []
  let cursor = new Date(from)
  while (cursor < to) {
    const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
    const end = next < to ? next : to
    windows.push({ fromDate: cursor.toISOString(), tillDate: end.toISOString() })
    cursor = end
  }
  return windows
}

/**
 * Fetch hourly EPEX (EnergyZero) prices for a period and return them as a map
 * of UTC hour ISO string to EUR/kWh (incl. BTW). Long ranges are chunked by
 * month; progress is reported per completed request.
 */
export async function fetchHourlyPrices(
  from: Date,
  to: Date,
  opts: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void } = {},
): Promise<Map<string, number>> {
  const windows = monthWindows(from, to)
  const perWindow = await mapWithConcurrency(
    windows,
    2,
    (w) => getEnergyPrices(w.fromDate, w.tillDate, opts.signal),
    { signal: opts.signal, onProgress: opts.onProgress },
  )
  const map = new Map<string, number>()
  for (const prices of perWindow) {
    for (const p of prices) map.set(priceHourKey(p.readingDate), p.price)
  }
  return map
}

/** Number of requests `fetchHourlyPrices` will make for a period (for progress bars). */
export function priceRequestCount(from: Date, to: Date): number {
  return monthWindows(from, to).length
}
