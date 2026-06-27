import { useTranslation } from 'react-i18next'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import { PageHeader } from '@/components/PageHeader'

export function WhatsNewPage() {
  const { t } = useTranslation()
  const items = t('whatsNew.v1.items', { returnObjects: true }) as string[]

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('whatsNew.eyebrow')}
        title={t('whatsNew.title')}
        subtitle={t('whatsNew.subtitle')}
        hideInspector
      />

      <div className="card sun-glow p-7">
        <div className="flex flex-wrap items-center gap-3">
          <span className="chip">v1.0.0</span>
          <span className="text-13 text-text-gray">
            {t('whatsNew.released')} {t('whatsNew.v1.date')}
          </span>
        </div>
        <h2 className="mt-3 text-xl font-extrabold text-dark-blue">{t('whatsNew.v1.title')}</h2>
        <ul className="mt-5 space-y-3">
          {(Array.isArray(items) ? items : []).map((it, i) => (
            <li key={i} className="flex gap-3 text-sm leading-160 text-text-gray">
              <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-green" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
