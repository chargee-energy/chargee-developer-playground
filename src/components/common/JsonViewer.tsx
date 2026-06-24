import { useState } from 'react'
import { ChevronRightIcon } from '@heroicons/react/24/solid'
import { cn } from '@/utils/cn'

// Lightweight collapsible JSON tree — no external dependency.
function Node({ value, name, depth }: { value: unknown; name?: string; depth: number }) {
  const [open, setOpen] = useState(depth < 2)
  const isArray = Array.isArray(value)
  const isObject = value !== null && typeof value === 'object'

  if (isObject) {
    const entries = isArray
      ? (value as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>)
    const bracket = isArray ? ['[', ']'] : ['{', '}']
    return (
      <div className="font-mono text-13 leading-relaxed">
        <button
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 hover:opacity-80"
        >
          <ChevronRightIcon
            className={cn('size-3 text-gray-400 transition-transform', open && 'rotate-90')}
          />
          {name !== undefined && <span className="text-dark-purple">{name}: </span>}
          <span className="text-gray-400">
            {bracket[0]}
            {!open && `${entries.length}…${bracket[1]}`}
          </span>
        </button>
        {open && (
          <div className="border-l border-beige-2 pl-4">
            {entries.map(([k, v]) => (
              <Node key={k} name={isArray ? undefined : k} value={v} depth={depth + 1} />
            ))}
          </div>
        )}
        {open && <div className="text-gray-400">{bracket[1]}</div>}
      </div>
    )
  }

  let valueClass = 'text-dark-blue'
  if (typeof value === 'string') valueClass = 'text-green'
  else if (typeof value === 'number') valueClass = 'text-blue'
  else if (typeof value === 'boolean') valueClass = 'text-orange'
  else if (value === null) valueClass = 'text-gray-400'

  return (
    <div className="font-mono text-13 leading-relaxed">
      {name !== undefined && <span className="text-dark-purple">{name}: </span>}
      <span className={valueClass}>{typeof value === 'string' ? `"${value}"` : String(value)}</span>
    </div>
  )
}

export function JsonViewer({ data }: { data: unknown }) {
  if (data === undefined) return <p className="text-13 text-text-gray">—</p>
  return (
    <div className="max-h-[55vh] overflow-auto rounded-xl border border-beige-2 bg-cream p-4 scrollbar-thin">
      <Node value={data} depth={0} />
    </div>
  )
}
