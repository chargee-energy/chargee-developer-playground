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

// SVG geometry (drawn in a fixed viewBox, stretched to fit the card width).
const W = 1000
const H = 220
const PAD_TOP = 14
const GAP = 16

interface Props {
  stats: OrderStats
  hasGroup: boolean
  loading?: boolean
}

/**
 * Flowing area funnel: Orders → Fulfilled → Activated. Each segment's height is
 * proportional to its value and the tops curve into one another for a waterfall
 * look; precise figures sit underneath. Not-activated and pending are surfaced
 * as secondary stats, and the activation rate as a callout.
 */
export function OrdersFunnel({ stats, hasGroup, loading }: Props) {
  const { t } = useTranslation()
  const { total, pending, fulfilled, sparkies, activated } = stats
  const notActivated = Math.max(0, sparkies - activated)

  const stages = [
    {
      key: 'orders',
      label: t('orders.statTotal'),
      value: total,
      caption: t('orders.funnelAllOrders'),
      color: '#1D1543',
    },
    {
      key: 'fulfilled',
      label: t('orders.statFulfilled'),
      value: fulfilled,
      caption: t('orders.funnelOfOrders', { pct: pct(fulfilled, total) }),
      color: '#6245DE',
    },
    {
      key: 'activated',
      label: t('orders.statActivated'),
      value: hasGroup ? activated : null,
      caption: hasGroup ? t('orders.funnelOfFulfilled', { pct: pct(activated, sparkies) }) : t('orders.funnelPickGroup'),
      color: '#8A6FE8',
    },
  ]

  const maxV = Math.max(total, 1)
  const n = stages.length
  const segW = (W - GAP * (n - 1)) / n
  const usable = H - PAD_TOP
  const hOf = (v: number | null) => (v == null ? 6 : Math.max(6, (v / maxV) * usable))
  const yOf = (v: number | null) => H - hOf(v)

  const paths = stages.map((s, i) => {
    const x0 = i * (segW + GAP)
    const x1 = x0 + segW
    const yL = yOf(stages[i - 1]?.value ?? s.value)
    const yR = yOf(s.value)
    const cx = x0 + segW * 0.5
    // Soft rounded top corners for an on-brand feel.
    const r = Math.min(14, (H - yL) / 2, (H - yR) / 2, segW / 2)
    const d =
      `M${x0},${H} L${x0},${yL + r} Q${x0},${yL} ${x0 + r},${yL} ` +
      `C${cx},${yL} ${cx},${yR} ${x1 - r},${yR} Q${x1},${yR} ${x1},${yR + r} L${x1},${H} Z`
    return { d, key: s.key, color: s.color }
  })

  return (
    <div className="card p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <p className="text-11 font-bold uppercase tracking-wide text-text-gray">{t('orders.funnelTitle')}</p>
        <div className="rounded-20 bg-light-purple-3 px-4 py-2">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-dark-purple">
              {loading || !hasGroup ? '—' : `${pct(activated, sparkies)}%`}
            </span>
          </div>
          <p className="text-11 font-semibold leading-tight text-dark-purple/70">
            {t('orders.funnelActivationRate')}
          </p>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-40 w-full"
        role="img"
        aria-label={t('orders.funnelTitle')}
      >
        {paths.map((p) => (
          <path key={p.key} d={p.d} fill={p.color} opacity={loading ? 0.25 : 1} />
        ))}
      </svg>

      {/* Figures aligned under each segment */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {stages.map((s) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className="text-3xl font-extrabold tabular-nums" style={{ color: s.color }}>
              {loading ? '…' : s.value == null ? '—' : s.value}
            </span>
            <div className="min-w-0">
              <p className="truncate text-13 font-semibold leading-tight text-dark-blue">{s.label}</p>
              <p className="truncate text-11 italic leading-tight text-text-gray">{s.caption}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-beige-2 pt-3 text-12 text-text-gray">
        <span>
          {t('orders.statNotActivated')}:{' '}
          <span className="font-semibold text-orange">{loading || !hasGroup ? '—' : notActivated}</span>
          {hasGroup && !loading && <> ({pct(notActivated, sparkies)}% {t('orders.funnelOfFulfilledShort')})</>}
        </span>
        <span>
          {t('orders.statPending')}:{' '}
          <span className="font-semibold text-dark-blue">{loading ? '—' : pending}</span>
          {!loading && <> ({pct(pending, total)}% {t('orders.funnelOfOrdersShort')})</>}
        </span>
      </div>
    </div>
  )
}
