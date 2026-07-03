interface MapOptions {
  /** Called after each item resolves, with how many are done and the total. */
  onProgress?: (done: number, total: number) => void
  /** Abort the run; in-flight requests finish but no new ones are started. */
  signal?: AbortSignal
  /** Minimum delay between successive starts within a worker, to spread load. */
  minDelayMs?: number
}

/** Raised when a run is aborted via the provided AbortSignal. */
export class AbortedError extends Error {
  constructor() {
    super('Aborted')
    this.name = 'AbortedError'
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Maps over `items` running at most `limit` calls of `fn` in parallel — a small
 * in-house alternative to p-limit. Preserves input order in the returned array,
 * reports progress as items complete, and can be aborted mid-run. An optional
 * `minDelayMs` staggers each worker's requests to avoid bursts on the backend.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  opts: MapOptions = {},
): Promise<R[]> {
  const { onProgress, signal, minDelayMs = 0 } = opts
  const results = new Array<R>(items.length)
  let cursor = 0
  let done = 0

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      if (signal?.aborted) throw new AbortedError()
      const index = cursor++
      if (index >= items.length) return
      if (minDelayMs > 0 && index >= limit) await sleep(minDelayMs)
      results[index] = await fn(items[index], index)
      done++
      onProgress?.(done, items.length)
    }
  })

  await Promise.all(workers)
  return results
}
