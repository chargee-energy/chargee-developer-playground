import { useTranslation } from 'react-i18next'

export interface OrderStats {
  total: number
  pending: number
  fulfilled: number
  /** Sparkies shipped in fulfilled orders. */
  sparkies: number
  /** Of those, how many appear (activated) in the selected Ampere group. */
  activated: number
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

interface Props {
  stats: OrderStats
  hasGroup: boolean
  loading?: boolean
}

/**
 * Funnel from order to activation:
 *   Orders → Fulfilled → Activated, with the Not-activated drop-off called out.
 * Bar widths share one scale (relative to total orders) so the funnel narrows;
 * the percentage on each row is the conversion against that stage's base.
 */
export function OrdersFunnel({ stats, hasGroup, loading }: Props) {
  const { t } = useTranslation()
  const { total, pending, fulfilled, sparkies, activated } = stats
  const notActivated = Math.max(0, sparkies - activated)
  const base = Math.max(total, 1)

  const stages = [
    {
      key: 'orders',
      label: t('orders.statTotal'),
      value: total,
      width: 100,
      caption: t('orders.funnelAllOrders'),
      fill: 'bg-dark-blue',
    },
    {
      key: 'fulfilled',
      label: t('orders.statFulfilled'),
      value: fulfilled,
      width: (fulfilled / base) * 100,
      caption: t('orders.funnelOfOrders', { pct: pct(fulfilled, total) }),
      fill: 'bg-blue',
    },
    {
      key: 'activated',
      label: t('orders.statActivated'),
      value: hasGroup ? activated : null,
      width: hasGroup ? (activated / base) * 100 : 0,
      caption: hasGroup ? t('orders.funnelOfFulfilled', { pct: pct(activated, sparkies) }) : t('orders.funnelPickGroup'),
      fill: 'bg-green',
    },
    {
      key: 'notActivated',
      label: t('orders.statNotActivated'),
      value: hasGroup ? notActivated : null,
      width: hasGroup ? (notActivated / base) * 100 : 0,
      caption: hasGroup ? t('orders.funnelOfFulfilled', { pct: pct(notActivated, sparkies) }) : t('orders.funnelPickGroup'),
      fill: 'bg-orange',
    },
  ]

  return (
    <div className="card p-5">
      <div className="space-y-3">
        {stages.map((s) => (
          <div key={s.key} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 sm:grid-cols-[10rem_1fr_auto]">
            <span className="truncate text-13 font-semibold text-dark-blue">{s.label}</span>
            <div className="flex h-7 items-center justify-center rounded-full bg-beige-2/50">
              <div
                className={`h-full rounded-full ${s.fill} transition-all`}
                style={{ width: `${Math.min(100, Math.max(s.value ? 3 : 0, s.width))}%` }}
              />
            </div>
            <div className="min-w-[4.5rem] text-right">
              <span className="text-lg font-extrabold tabular-nums text-dark-blue">
                {loading ? '…' : s.value === null ? '—' : s.value}
              </span>
              <span className="ml-1 block text-11 leading-tight text-text-gray">{s.caption}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-beige-2 pt-3 text-12 text-text-gray">
        {t('orders.statPending')}:{' '}
        <span className="font-semibold text-dark-blue">{loading ? '…' : pending}</span>{' '}
        <span>({pct(pending, total)}% {t('orders.funnelOfOrdersShort')})</span>
      </div>
    </div>
  )
}
