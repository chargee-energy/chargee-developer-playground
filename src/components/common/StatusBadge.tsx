import { cn } from '@/utils/cn'

/** Colored pill for an HTTP status code or a method verb. */
export function StatusBadge({ status }: { status: number | null }) {
  const tone =
    status === null
      ? 'bg-gray-100 text-gray-600'
      : status < 300
        ? 'bg-light-green text-green'
        : status < 400
          ? 'bg-sun-400/30 text-yellow'
          : 'bg-red/10 text-red'
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-13 font-bold', tone)}>
      {status ?? 'ERR'}
    </span>
  )
}

const METHOD_TONES: Record<string, string> = {
  GET: 'bg-blue/10 text-blue',
  POST: 'bg-green/10 text-green',
  PUT: 'bg-orange/10 text-orange',
  PATCH: 'bg-orange/10 text-orange',
  DELETE: 'bg-red/10 text-red',
}

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-11 font-bold tracking-wide',
        METHOD_TONES[method] ?? 'bg-gray-100 text-gray-600',
      )}
    >
      {method}
    </span>
  )
}
