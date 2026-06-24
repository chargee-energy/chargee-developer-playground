import { useTranslation } from 'react-i18next'

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const toggle = () => i18n.changeLanguage(i18n.language?.startsWith('nl') ? 'en' : 'nl')
  const isNl = i18n.language?.startsWith('nl')
  return (
    <button
      onClick={toggle}
      className="inline-flex size-9 items-center justify-center rounded-full text-base hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-dark-purple"
      title={isNl ? 'Switch to English' : 'Schakel naar Nederlands'}
    >
      {isNl ? '🇳🇱' : '🇬🇧'}
    </button>
  )
}
