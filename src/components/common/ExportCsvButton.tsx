import { useTranslation } from 'react-i18next'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { downloadCsv } from '@/utils/csv'

/** Exports the given reading rows (raw API values) to a CSV download. */
export function ExportCsvButton({ rows, filename }: { rows: Record<string, any>[]; filename: string }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      className="btn-ghost"
      disabled={rows.length === 0}
      onClick={() => downloadCsv(filename, rows)}
    >
      <ArrowDownTrayIcon className="size-4" />
      {t('common.exportCsv')}
    </button>
  )
}
