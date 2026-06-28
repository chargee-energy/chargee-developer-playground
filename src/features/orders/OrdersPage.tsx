import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowRightOnRectangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { PageHeader } from '@/components/PageHeader'
import { DataState } from '@/components/common/DataState'
import { Pagination } from '@/components/common/Pagination'
import { Spinner } from '@/components/common/Spinner'
import { useOrderAuthStore } from '@/store/orderAuth'
import { useContextStore } from '@/store/context'
import { useGroupAddresses } from '@/hooks/useGroupAddresses'
import { getOrders, orderSerials, type Order } from '@/api/orderClient'
import { fmtDate, shortId } from '@/utils/format'
import { cn } from '@/utils/cn'

const PAGE_SIZE = 20
const norm = (s: string) => s.trim().toUpperCase()

const STATUS_TONES: Record<string, string> = {
  fulfilled: 'bg-light-green text-green',
  processing: 'bg-blue/10 text-blue',
  pending: 'bg-sun-400/30 text-yellow',
  cancelled: 'bg-gray-100 text-gray-600',
  error: 'bg-red/10 text-red',
}

function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-11 font-bold uppercase tracking-wide',
        STATUS_TONES[status] ?? 'bg-gray-100 text-gray-600',
      )}
    >
      {status}
    </span>
  )
}

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  sparkySku: z.string().min(1),
})
type FormValues = z.infer<typeof schema>

export function OrdersPage() {
  const { t } = useTranslation()
  const { connected, user, sparkySku, login, setSparkySku, disconnect } = useOrderAuthStore()
  const { groupUuid } = useContextStore()
  const [page, setPage] = useState(1)

  const ordersQuery = useQuery({
    queryKey: ['orders', page],
    queryFn: () => getOrders(page, PAGE_SIZE),
    enabled: connected,
  })
  const orders = ordersQuery.data?.data ?? []
  const meta = ordersQuery.data?.meta

  // Cross-check: a shipped Sparky serial is the box code. If it shows up on a
  // group address in Ampere (box code or serial number), it has been activated.
  const { addresses } = useGroupAddresses(groupUuid, connected && !!groupUuid)
  const activated = useMemo(() => {
    const set = new Set<string>()
    for (const a of addresses) {
      if (a.sparky?.boxCode) set.add(norm(a.sparky.boxCode))
      if (a.sparky?.serialNumber) set.add(norm(a.sparky.serialNumber))
      if (a.flint?.serialNumber) set.add(norm(a.flint.serialNumber))
    }
    return set
  }, [addresses])

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
      await login(values.email, values.password, values.sparkySku, remember)
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
            <div>
              <label className="label" htmlFor="order-sku">
                {t('orders.sparkySku')}
              </label>
              <input
                id="order-sku"
                type="text"
                spellCheck={false}
                placeholder={t('orders.sparkySkuPlaceholder')}
                className="input font-mono"
                {...register('sparkySku')}
              />
              <p className="mt-1 text-12 leading-150 text-text-gray">{t('orders.sparkySkuHint')}</p>
              {errors.sparkySku && <p className="mt-1 text-13 text-red">{errors.sparkySku.message}</p>}
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

      <div className="card flex flex-wrap items-end gap-x-4 gap-y-2 p-4">
        <div className="min-w-[14rem] flex-1">
          <label className="label" htmlFor="sku-edit">
            {t('orders.sparkySku')}
          </label>
          <input
            id="sku-edit"
            type="text"
            spellCheck={false}
            placeholder={t('orders.sparkySkuPlaceholder')}
            className="input font-mono"
            value={sparkySku}
            onChange={(e) => setSparkySku(e.target.value)}
          />
        </div>
        <p className="flex-1 basis-full text-12 leading-150 text-text-gray sm:basis-0">{t('orders.sparkySkuHint')}</p>
      </div>

      {!groupUuid && <p className="text-13 text-text-gray">{t('orders.activationHint')}</p>}

      <DataState
        isLoading={ordersQuery.isLoading}
        error={ordersQuery.error}
        isEmpty={orders.length === 0}
        emptyMessage={t('orders.empty')}
        onRetry={() => ordersQuery.refetch()}
      >
        <div className="space-y-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              activated={activated}
              hasGroup={!!groupUuid}
              sparkySku={sparkySku}
            />
          ))}
        </div>
        <Pagination page={page} pageCount={meta?.totalPages ?? 1} onChange={setPage} />
      </DataState>
    </div>
  )
}

function OrderCard({
  order,
  activated,
  hasGroup,
  sparkySku,
}: {
  order: Order
  activated: Set<string>
  hasGroup: boolean
  sparkySku: string
}) {
  const { t } = useTranslation()
  const serials = orderSerials(order)
  const sku = norm(sparkySku)
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-dark-blue">
            {order.webshopOrderId || shortId(order.id)}
          </p>
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
              // Only the configured Sparky SKU is matched against Ampere.
              const isSparky = !sku || norm(product) === sku
              const isActive = activated.has(norm(serial))
              return (
                <li key={`${product}-${serial}`} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate font-mono text-13 text-dark-blue">
                    <span className="text-text-gray">{product}</span> {serial}
                  </span>
                  {hasGroup && isSparky ? (
                    isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-light-green px-2 py-0.5 text-11 font-bold text-green">
                        <CheckCircleIcon className="size-3.5" />
                        {t('orders.activated')}
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-11 font-bold text-gray-500">
                        {t('orders.notActivated')}
                      </span>
                    )
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
