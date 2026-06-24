import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardIcon, CheckIcon } from '@heroicons/react/24/outline'
import { cn } from '@/utils/cn'

export function CopyButton({
  text,
  label,
  compact,
}: {
  text: string
  label?: string
  /** Icon-only, smaller — for inline use next to an id. */
  compact?: boolean
}) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  if (compact) {
    return (
      <button
        onClick={copy}
        type="button"
        title={copied ? t('common.copied') : t('common.copy')}
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-md text-text-gray transition-colors hover:bg-gray-100 hover:text-ink',
          copied && 'text-green',
        )}
      >
        {copied ? <CheckIcon className="size-3.5" /> : <ClipboardIcon className="size-3.5" />}
      </button>
    )
  }

  return (
    <button onClick={copy} className="btn-ghost" type="button">
      {copied ? <CheckIcon className="size-4 text-green" /> : <ClipboardIcon className="size-4" />}
      {copied ? t('common.copied') : label || t('common.copy')}
    </button>
  )
}
