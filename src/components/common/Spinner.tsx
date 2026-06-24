import { cn } from '@/utils/cn'

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-block size-5 animate-spin rounded-full border-2 border-beige-2 border-t-dark-purple',
        className,
      )}
      role="status"
      aria-label="loading"
    />
  )
}
