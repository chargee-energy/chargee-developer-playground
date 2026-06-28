import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRightOnRectangleIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/common/DataState'
import { Pagination } from '@/components/common/Pagination'
import { Spinner } from '@/components/common/Spinner'
import { ExportCsvButton } from '@/components/common/ExportCsvButton'
import { useOrderAuthStore } from '@/store/orderAuth'
import { useContextStore } from '@/store/context'
import { useGroupAddresses } from '@/hooks/useGroupAddresses'
import {
  getAllOrders,
  orderAddress,
  orderAddressLine,
  orderCustomerName,
  orderSearchText,
  orderSerials,
  type Order,
} from '@/api/orderClient'
import type { GroupAddressDto } from '@/api/generated/model'
import { fmtDate, shortId } from '@/utils/format'
import { cn } from '@/utils/cn'
import { StatusChip } from './StatusChip'
import { OrderDetailDrawer } from './OrderDetailDrawer'
import { OrdersFunnel } from './OrdersFunnel'

const PAGE_SIZE = 20
const STALE_DAYS = 5
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000
const norm = (s: string) => s.trim().toUpperCase()

type OrderFilter = 'all' | 'fulfilled' | 'pending' | 'activated' | 'stale'

const orderIsActivated = (order: Order, activated: Set<string>) =>
  orderSerials(order).some((s) => activated.has(norm(s.serial)))

/** Shipped (fulfilled) but not activated, and ordered more than 5 days ago. */
const orderIsStale = (order: Order, activated: Set<string>, threshold: number) =>
  order.status === 'fulfilled' &&
  orderSerials(order).length > 0 &&
  !orderIsActivated(order, activated) &&
  new Date(order.createdAt).getTime() < threshold

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
  const [filter, setFilter] = useState<OrderFilter>('all')
  const [search, setSearch] = useState('')

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
    const threshold = Date.now() - STALE_MS
    const total = orders.length
    const fulfilled = orders.filter((o) => o.status === 'fulfilled')
    const pending = orders.filter((o) => o.status === 'pending').length
    const fulfilledSerials = fulfilled.flatMap((o) => orderSerials(o).map((s) => s.serial))
    const activatedCount = fulfilledSerials.filter((s) => activated.has(norm(s))).length
    const stale = orders.filter((o) => orderIsStale(o, activated, threshold)).length
    return {
      total,
      pending,
      fulfilled: fulfilled.length,
      sparkies: fulfilledSerials.length,
      activated: activatedCount,
      stale,
    }
  }, [orders, activated])

  const jumpToAddress = (serial: string) => {
    const rec = addressBySerial.get(norm(serial))
    if (!rec) return
    setAddress(rec.uuid, rec)
    setSelected(null)
    navigate('/devices')
  }

  // Counts per filter (for the chip badges).
  const counts = useMemo(() => {
    const threshold = Date.now() - STALE_MS
    return {
      all: orders.length,
      fulfilled: orders.filter((o) => o.status === 'fulfilled').length,
      pending: orders.filter((o) => o.status === 'pending').length,
      activated: orders.filter((o) => orderIsActivated(o, activated)).length,
      stale: orders.filter((o) => orderIsStale(o, activated, threshold)).length,
    }
  }, [orders, activated])

  // Apply the active status/activation filter, then the free-text search.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const threshold = Date.now() - STALE_MS
    return orders.filter((o) => {
      if (filter === 'fulfilled' && o.status !== 'fulfilled') return false
      if (filter === 'pending' && o.status !== 'pending') return false
      if (filter === 'activated' && !orderIsActivated(o, activated)) return false
      if (filter === 'stale' && !orderIsStale(o, activated, threshold)) return false
      if (q && !orderSearchText(o).includes(q)) return false
      return true
    })
  }, [orders, filter, search, activated])

  // CSV rows for the current (filtered) result set.
  const csvRows = useMemo(
    () =>
      filtered.map((o) => ({
        webshopOrderId: o.webshopOrderId,
        montaOrderId: o.montaOrderId ?? '',
        status: o.status,
        createdAt: o.createdAt,
        fulfilledAt: o.fulfilledAt ?? '',
        recipient: orderCustomerName(o),
        email: orderAddress(o)?.emailAddress ?? '',
        address: orderAddressLine(o),
        serials: orderSerials(o)
          .map((s) => s.serial)
          .join(' '),
        activated: orderSerials(o).some((s) => activated.has(norm(s.serial))) ? 'yes' : 'no',
      })),
    [filtered, activated],
  )

  // Reset to the first page whenever the result set changes.
  useEffect(() => setPage(1), [filter, search])

  // Client-side pagination over the filtered set.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageOrders = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

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

      {/* Analytics funnel: order → fulfilled → activated */}
      <OrdersFunnel stats={stats} hasGroup={!!groupUuid} loading={ordersQuery.isLoading} />

      {/* Search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-sm sm:flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-text-gray" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('orders.searchPlaceholder')}
            className="input pl-10"
            aria-label={t('orders.searchPlaceholder')}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'fulfilled', 'pending', 'activated', 'stale'] as const).map((key) => {
            const disabled = (key === 'activated' || key === 'stale') && !groupUuid
            const active = filter === key
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                onClick={() => setFilter(key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-13 font-semibold transition-colors',
                  active
                    ? 'bg-dark-purple text-white'
                    : 'border border-beige-2 bg-white text-text-gray hover:bg-light-purple-3 hover:text-dark-purple',
                  disabled && 'cursor-not-allowed opacity-40 hover:bg-white hover:text-text-gray',
                )}
                title={disabled ? t('orders.funnelPickGroup') : undefined}
              >
                {t(`orders.filter_${key}`)}
                <span className={cn('text-11 font-bold', active ? 'text-white/80' : 'text-text-gray')}>
                  {counts[key]}
                </span>
              </button>
            )
          })}
          <span className="mx-1 hidden h-5 w-px bg-beige-2 sm:block" />
          <ExportCsvButton rows={csvRows} filename={`orders-${filter}.csv`} />
        </div>
      </div>

      <DataState
        isLoading={ordersQuery.isLoading}
        error={ordersQuery.error}
        isEmpty={filtered.length === 0}
        emptyMessage={orders.length === 0 ? t('orders.empty') : t('common.noResults')}
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
  const name = orderCustomerName(order)
  const addressLine = orderAddressLine(order)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card block w-full p-5 text-left transition-shadow hover:shadow-lg"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-dark-blue">{name || order.webshopOrderId || shortId(order.id)}</p>
          {addressLine && <p className="truncate text-13 text-text-gray">{addressLine}</p>}
          <p className="text-11 text-text-gray">
            {t('orders.created')} {fmtDate(order.createdAt)}
            {' · '}
            <span className="font-mono">{order.webshopOrderId || shortId(order.id)}</span>
            {order.montaOrderId ? ` · ${t('orders.montaOrder')} ${order.montaOrderId}` : ''}
          </p>
        </div>
        <StatusChip status={order.status} />
      </div>

      {serials.length > 0 && (
        <div className="mt-4">
          <ul className="divide-y divide-beige-2/60">
            {serials.map(({ product, serial }) => {
              const isActive = activated.has(norm(serial))
              return (
                <li key={`${product}-${serial}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                  <span className="min-w-0 truncate font-mono text-13 text-dark-blue">{serial}</span>
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
