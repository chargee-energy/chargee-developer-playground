import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CodeBracketIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import sunSmile from '@/assets/brand/sun_smile.svg'
import { ApiInspector } from './common/ApiInspector'

interface PageHeaderProps {
  eyebrow?: string
  title: string
  subtitle?: ReactNode
  action?: ReactNode
  /** When set, renders a "Back" button above the title. */
  onBack?: () => void
  /** The primary request behind this page, preselected in the inspector. */
  primaryCall?: { method: string; url: string }
  /** Hide the Raw + Docs button (e.g. on pages with no API call). */
  hideInspector?: boolean
}

/** Editorial page header with the signature "Raw + Docs" inspector trigger. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
  onBack,
  primaryCall,
  hideInspector,
}: PageHeaderProps) {
  const { t } = useTranslation()
  const [inspectorOpen, setInspectorOpen] = useState(false)

  return (
    <header className="reveal flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {onBack && (
          <button onClick={onBack} className="btn-ghost mb-2 -ml-2">
            <ArrowLeftIcon className="size-4" />
            {t('common.back')}
          </button>
        )}
        {eyebrow && (
          <div className="mb-3 flex items-center gap-2">
            <img src={sunSmile} alt="" aria-hidden className="size-5" />
            <span className="text-xs font-bold uppercase tracking-[0.24em] text-orange">
              {eyebrow}
            </span>
          </div>
        )}
        <h1 className="display text-42 font-extrabold text-dark-blue">{title}</h1>
        {subtitle && (
          <div className="mt-3 max-w-2xl text-base leading-160 text-text-gray">{subtitle}</div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {action}
        {!hideInspector && (
          <button onClick={() => setInspectorOpen(true)} className="btn-secondary px-3 sm:px-5" title={t('common.viewRaw')}>
            <CodeBracketIcon className="size-4" />
            <span className="hidden sm:inline">{t('common.viewRaw')}</span>
          </button>
        )}
      </div>
      {!hideInspector && (
        <ApiInspector
          open={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
          primary={primaryCall}
        />
      )}
    </header>
  )
}
