import { useTranslation } from 'react-i18next'
import { CheckCircleIcon } from '@heroicons/react/24/solid'
import { PageHeader } from '@/components/PageHeader'

// Releases shown on the What's new page, newest first.
const RELEASES = [
  { key: 'v3', version: 'v1.2.0' },
  { key: 'v2', version: 'v1.1.0' },
  { key: 'v1', version: 'v1.0.0' },
]

export function WhatsNewPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t('whatsNew.eyebrow')}
        title={t('whatsNew.title')}
        subtitle={t('whatsNew.subtitle')}
        hideInspector
      />

      {RELEASES.map((release) => {
        const items = t(`whatsNew.${release.key}.items`, { returnObjects: true }) as string[]
        return (
          <div key={release.key} className="card sun-glow p-7">
            <div className="flex flex-wrap items-center gap-3">
              <span className="chip">{release.version}</span>
              <span className="text-13 text-text-gray">
                {t('whatsNew.released')} {t(`whatsNew.${release.key}.date`)}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-extrabold text-dark-blue">{t(`whatsNew.${release.key}.title`)}</h2>
            <ul className="mt-5 space-y-3">
              {(Array.isArray(items) ? items : []).map((it, i) => (
                <li key={i} className="flex gap-3 text-sm leading-160 text-text-gray">
                  <CheckCircleIcon className="mt-0.5 size-5 shrink-0 text-green" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
