import type { ReactNode } from 'react'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <h3 className="text-lg font-bold text-dark-blue">{title}</h3>
      {description && <p className="max-w-md text-sm text-text-gray">{description}</p>}
      {action}
    </div>
  )
}
