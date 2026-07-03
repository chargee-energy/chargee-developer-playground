import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { type Column } from '@/components/common/DataTable'
import { useContextStore } from '@/store/context'
import { ReportRunner, pct, type ReportMetric } from '../ReportRunner'
import { useAllMetersReport, type MeterReportRow } from '../useAllMetersReport'

export function AllMetersReport() {
  const { t } = useTranslation()
  const { groupUuid } = useContextStore()
  const { status, progress, rows, totals, generatedAt, error, run, cancel } = useAllMetersReport(groupUuid)

  const cols: Column<MeterReportRow>[] = [
    { key: 'addressUuid', header: t('reports.col.address') },
    { key: 'sparkySerial', header: t('reports.col.sparky'), render: (r) => r.sparkySerial ?? '—' },
    { key: 'flintSerial', header: t('reports.col.flint'), render: (r) => r.flintSerial ?? '—' },
    { key: 'smartMeterType', header: t('reports.col.meterType'), render: (r) => r.smartMeterType ?? '—' },
    { key: 'meterNumber', header: t('reports.col.meterNumber'), render: (r) => r.meterNumber ?? '—' },
    { key: 'eanElectricity', header: t('reports.col.eanElectricity'), render: (r) => r.eanElectricity ?? '—' },
    { key: 'eanGas', header: t('reports.col.eanGas'), render: (r) => r.eanGas ?? '—' },
  ]

  const metrics: ReportMetric[] = useMemo(() => {
    const total = rows.length
    const withElectricity = rows.filter((r) => !!r.eanElectricity).length
    const withGas = rows.filter((r) => !!r.eanGas).length
    return [
      { label: t('reports.metrics.totalMeters'), value: total },
      {
        label: t('reports.metrics.addressCoverageMeters'),
        value: `${pct(totals.addressesWithData, totals.addresses)}%`,
        sub: t('reports.metrics.addressCoverageSub', { covered: totals.addressesWithData, total: totals.addresses }),
      },
      { label: t('reports.metrics.withElectricity'), value: `${pct(withElectricity, total)}%`, sub: `${withElectricity} / ${total}` },
      { label: t('reports.metrics.withGas'), value: `${pct(withGas, total)}%`, sub: `${withGas} / ${total}` },
    ]
  }, [rows, totals, t])

  return (
    <ReportRunner
      title={t('reports.templates.allMeters.title')}
      description={t('reports.templates.allMeters.description')}
      status={status}
      progress={progress}
      rows={rows}
      generatedAt={generatedAt}
      error={error}
      onRun={run}
      onCancel={cancel}
      columns={cols}
      rowKey={(r, i) => `${r.addressUuid}-${r.identifier}-${i}`}
      metrics={metrics}
      csvFilename={`all-meters-${new Date().toISOString().slice(0, 10)}.csv`}
      emptyMessage={t('reports.emptyMeters')}
      canRun={!!groupUuid}
    />
  )
}
