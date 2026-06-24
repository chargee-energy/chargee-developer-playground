import type { ReactNode } from 'react'

/** A titled card section with an optional right-aligned control slot. */
export function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-13 font-bold text-dark-blue">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

export function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      className="input h-9 w-auto py-1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
