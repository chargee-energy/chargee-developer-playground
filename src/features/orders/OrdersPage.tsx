import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowRightOnRectangleIcon, CheckCircleIcon, MapPinIcon } from '@heroicons/react/24/outline'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/common/DataState'
import { Pagination } from '@/components/common/Pagination'
import { Spinner } from '@/components/common/Spinner'
import { useOrderAuthStore } from '@/store/orderAuth'
import { useContextStore } from '@/store/context'
import { useGroupAddresses } from '@/hooks/useGroupAddresses'
import { getAllOrders, orderSerials, type Order } from '@/api/orderClient'
import type { GroupAddressDto } from '@/api/generated/model'
import { fmtDate, shortId } from '@/utils/format'
import { StatusChip } from './StatusChip'
import { OrderDetailDrawer } from './OrderDetailDrawer'

const PAGE_SIZE = 20
const norm = (s: string) => s.trim().toUpperCase()

const schema = z.object({ email: z.string().email(), password: z.string().min(1) })
type FormValues = z.infer<typeof schema>

export function OrdersPage() {
  const { t } = useTranslation()
  const { connected, user, login, disconnect } = useOrderAuthStore()
  const { groupUuid } = useContextStore()
  const setAddress = useContextStore((s) => s.setAddress)
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Order | null>(null)

  const ordersQuery = useQuery({
    queryKey: ['all-orders'],
    queryFn: getAllOrders,
    enabled: connected,
  })
  const orders = useMemo(() => ordersQuery.data?.orders ?? [], [ordersQuery.data])

  // Map each Ampere group serial/box-code → its address, so a shipped serial
  // can be flagged as activated and linked straight to its Ampere address.
  const { addresses } = useGroupAddresses(groupUuid, connected && !!groupUuid)
  const addressBySerial = useMemo(() => {
    const m = new Map<string, GroupAddressDto>()
    for (const a of addresses) {
      if (a.sparky?.boxCode) m.set(norm(a.sparky.boxCode), a)
      if (a.sparky?.serialNumber) m.set(norm(a.sparky.serialNumber), a)
      if (a.flint?.serialNumber) m.set(norm(a.flint.serialNumber), a)
    }
    return m
  }, [addresses])
  const activated = useMemo(() => new Set(addressBySerial.keys()), [addressBySerial])

  // Analytics over the full order set.
  const stats = useMemo(() => {
    const total = orders.length
    const fulfilled = orders.filter((o) => o.status === 'fulfilled')
    const pending = orders.filter((o) => o.status === 'pending').length
    const fulfilledSerials = fulfilled.flatMap((o) => orderSerials(o).map((s) => s.serial))
    const activatedCount = fulfilledSerials.filter((s) => activated.has(norm(s))).length
    return {
      total,
      pending,
      fulfilled: fulfilled.length,
      sparkies: fulfilledSerials.length,
      activated: activatedCount,
    }
  }, [orders, activated])

  const jumpToAddress = (serial: string) => {
    const rec = addressBySerial.get(norm(serial))
    if (!rec) return
    setAddress(rec.uuid, rec)
    setSelected(null)
    navigate('/devices')
  }

  // Client-side pagination over the full set.
  const pageCount = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))
  const pageOrders = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // --- Connect form ---
  const [serverError, setServerError] = useState('')
  const [remember, setRemember] = useState(true)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onConnect = async (values: FormValues) => {
    setServerError('')
    try {
      await login(values.email, values.password, remember)
    } catch (err: any) {
      setServerError(err?.response?.data?.message || t('orders.connectError'))
    }
  }

  if (!connected) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow={t('orders.eyebrow')} title={t('orders.title')} subtitle={t('orders.subtitle')} hideInspector />
        <div className="card max-w-md p-6">
          <h2 className="text-lg font-bold text-dark-blue">{t('orders.connectTitle')}</h2>
          <p className="mt-2 text-13 leading-160 text-text-gray">{t('orders.connectBody')}</p>
          <form onSubmit={handleSubmit(onConnect)} className="mt-5 space-y-4">
            <div>
              <label className="label" htmlFor="order-email">
                {t('auth.email')}
              </label>
              <input id="order-email" type="email" autoComplete="email" className="input" {...register('email')} />
              {errors.email && <p className="mt-1 text-13 text-red">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label" htmlFor="order-password">
                {t('auth.password')}
              </label>
              <input
                id="order-password"
                type="password"
                autoComplete="current-password"
                className="input"
                {...register('password')}
              />
              {errors.password && <p className="mt-1 text-13 text-red">{errors.password.message}</p>}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-13 text-text-gray">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-4 rounded border-beige-2 text-dark-purple focus:ring-dark-purple"
              />
              {t('auth.rememberMe')}
            </label>
            {serverError && <p className="rounded-xl bg-red/10 px-3 py-2 text-13 text-red">{serverError}</p>}
            <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
              {isSubmitting && <Spinner className="size-4 border-beige border-t-white" />}
              {isSubmitting ? t('orders.connecting') : t('orders.connect')}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('orders.eyebrow')}
        title={t('orders.title')}
        subtitle={user?.email ? t('orders.connectedAs', { email: user.email }) : t('orders.subtitle')}
        primaryCall={{ method: 'GET', url: '/api/v1/orders' }}
        action={
          <button className="btn-secondary" onClick={disconnect}>
            <ArrowRightOnRectangleIcon className="size-4" />
            {t('orders.disconnect')}
          </button>
        }
      />

      {/* Analytics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t('orders.statTotal')} value={stats.total} loading={ordersQuery.isLoading} />
        <StatTile
          label={t('orders.statPending')}
          value={stats.pending}
          pct={pct(stats.pending, stats.total)}
          loading={ordersQuery.isLoading}
        />
        <StatTile
          label={t('orders.statFulfilled')}
          value={stats.fulfilled}
          pct={pct(stats.fulfilled, stats.total)}
          loading={ordersQuery.isLoading}
        />
        <StatTile
          label={t('orders.statActivated')}
          value={groupUuid ? `${stats.activated} / ${stats.sparkies}` : '—'}
          pct={groupUuid ? pct(stats.activated, stats.sparkies) : undefined}
          loading={ordersQuery.isLoading}
          hint={groupUuid ? undefined : t('orders.activationHint')}
        />
      </div>

      <DataState
        isLoading={ordersQuery.isLoading}
        error={ordersQuery.error}
        isEmpty={orders.length === 0}
        emptyMessage={t('orders.empty')}
        onRetry={() => ordersQuery.refetch()}
      >
        <div className="space-y-4">
          {pageOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              activated={activated}
              hasGroup={!!groupUuid}
              onOpen={() => setSelected(order)}
              onJump={jumpToAddress}
            />
          ))}
        </div>
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </DataState>

      <OrderDetailDrawer
        order={selected}
        onClose={() => setSelected(null)}
        activated={activated}
        hasGroup={!!groupUuid}
        onJump={jumpToAddress}
      />
    </div>
  )
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

function StatTile({
  label,
  value,
  pct,
  hint,
  loading,
}: {
  label: string
  value: number | string
  pct?: number
  hint?: string
  loading?: boolean
}) {
  return (
    <div className="rounded-2xl border border-beige-2 bg-cream p-4">
      <p className="text-11 font-bold uppercase tracking-wide text-text-gray">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold text-dark-blue">{loading ? '…' : value}</span>
        {!loading && pct !== undefined && <span className="text-13 font-semibold text-text-gray">{pct}%</span>}
      </div>
      {hint && <p className="mt-1 text-11 leading-150 text-text-gray">{hint}</p>}
    </div>
  )
}

function OrderCard({
  order,
  activated,
  hasGroup,
  onOpen,
  onJump,
}: {
  order: Order
  activated: Set<string>
  hasGroup: boolean
  onOpen: () => void
  onJump: (serial: string) => void
}) {
  const { t } = useTranslation()
  const serials = orderSerials(order)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card block w-full p-5 text-left transition-shadow hover:shadow-lg"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-dark-blue">{order.webshopOrderId || shortId(order.id)}</p>
          <p className="text-13 text-text-gray">
            {t('orders.created')} {fmtDate(order.createdAt)}
            {order.montaOrderId ? ` · ${t('orders.montaOrder')} ${order.montaOrderId}` : ''}
          </p>
        </div>
        <StatusChip status={order.status} />
      </div>

      {serials.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-11 font-bold uppercase tracking-wide text-text-gray">{t('orders.serials')}</p>
          <ul className="divide-y divide-beige-2/60">
            {serials.map(({ product, serial }) => {
              const isActive = activated.has(norm(serial))
              return (
                <li key={`${product}-${serial}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate font-mono text-13 text-dark-blue">
                    <span className="text-text-gray">{product}</span> {serial}
                  </span>
                  <div className="flex items-center gap-2">
                    {hasGroup &&
                      (isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-light-green px-2 py-0.5 text-11 font-bold text-green">
                          <CheckCircleIcon className="size-3.5" />
                          {t('orders.activated')}
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-11 font-bold text-gray-500">
                          {t('orders.notActivated')}
                        </span>
                      ))}
                    {isActive && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="btn-ghost text-12 text-dark-purple"
                        onClick={(e) => {
                          e.stopPropagation()
                          onJump(serial)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation()
                            onJump(serial)
                          }
                        }}
                      >
                        <MapPinIcon className="size-4" />
                        {t('orders.viewInAmpere')}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </button>
  )
}
