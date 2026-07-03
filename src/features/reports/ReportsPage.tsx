import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import { PageHeader } from '@/components/PageHeader'
import { EmptyState } from '@/components/common/EmptyState'
import { useContextStore } from '@/store/context'
import { reportTemplates } from './reportRegistry'

export function ReportsPage() {
  const { t } = useTranslation()
  const { groupUuid } = useContextStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (!groupUuid) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t('reports.eyebrow')} title={t('reports.title')} hideInspector />
        <EmptyState title={t('reports.selectGroupFirst')} />
      </div>
    )
  }

  const selected = reportTemplates.find((r) => r.id === selectedId) ?? null

  if (selected) {
    const Report = selected.Component
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t('reports.eyebrow')}
          title={t(`reports.templates.${selected.id}.title`)}
          subtitle={t(`reports.templates.${selected.id}.description`)}
          onBack={() => setSelectedId(null)}
          hideInspector
        />
        <Report />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('reports.eyebrow')}
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        hideInspector
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {reportTemplates.map((tpl) => {
          const Icon = tpl.icon
          return (
            <button
              key={tpl.id}
              onClick={() => setSelectedId(tpl.id)}
              className="card group flex flex-col gap-3 p-5 text-left transition-colors hover:bg-beige/60"
            >
              <div className="flex size-10 items-center justify-center rounded-full bg-light-purple-3 text-dark-purple">
                <Icon className="size-5" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-dark-blue">{t(`reports.templates.${tpl.id}.title`)}</p>
                <p className="mt-1 text-13 leading-160 text-text-gray">
                  {t(`reports.templates.${tpl.id}.description`)}
                </p>
              </div>
              <span className="mt-auto inline-flex items-center gap-1 text-13 font-semibold text-dark-purple">
                {t('reports.open')}
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
