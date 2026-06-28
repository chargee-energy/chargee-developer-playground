import { cn } from '@/utils/cn'

const STATUS_TONES: Record<string, string> = {
  fulfilled: 'bg-light-green text-green',
  processing: 'bg-blue/10 text-blue',
  pending: 'bg-sun-400/30 text-yellow',
  cancelled: 'bg-gray-100 text-gray-600',
  error: 'bg-red/10 text-red',
}

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-11 font-bold uppercase tracking-wide',
        STATUS_TONES[status] ?? 'bg-gray-100 text-gray-600',
      )}
    >
      {status}
    </span>
  )
}
