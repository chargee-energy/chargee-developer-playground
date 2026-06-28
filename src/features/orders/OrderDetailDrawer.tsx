import { useTranslation } from 'react-i18next'
import { ArrowTopRightOnSquareIcon, CheckCircleIcon, MapPinIcon } from '@heroicons/react/24/outline'
import { Drawer } from '@/components/common/Drawer'
import { JsonViewer } from '@/components/common/JsonViewer'
import { StatusChip } from './StatusChip'
import { orderCustomerName, orderSerials, type Order, type OrderAddress } from '@/api/orderClient'
import { fmtDateTime, shortId } from '@/utils/format'

const norm = (s: string) => s.trim().toUpperCase()

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-11 font-bold uppercase tracking-wide text-text-gray">{label}</dt>
      <dd className="mt-0.5 break-words text-13 text-dark-blue">{children ?? '—'}</dd>
    </div>
  )
}

function formatAddress(a?: OrderAddress): string {
  if (!a) return '—'
  const name = [a.firstName, a.lastName].filter(Boolean).join(' ')
  const line = [a.street, a.houseNumber, a.houseNumberAddition].filter(Boolean).join(' ')
  const city = [a.postalCode, a.city].filter(Boolean).join(' ')
  return [name, line, [city, a.countryCode].filter(Boolean).join(', ')].filter(Boolean).join('\n')
}

interface Props {
  order: Order | null
  onClose: () => void
  activated: Set<string>
  hasGroup: boolean
  onJump: (serial: string) => void
}

export function OrderDetailDrawer({ order, onClose, activated, hasGroup, onJump }: Props) {
  const { t } = useTranslation()
  const monta = order?.montaOrderData
  const delivery = monta?.consumerDetails?.deliveryAddress ?? order?.orderData?.consumerDetails?.deliveryAddress
  const lines = order?.orderData?.lines ?? []
  const serials = order ? orderSerials(order) : []

  return (
    <Drawer
      open={!!order}
      onClose={onClose}
      title={(order && orderCustomerName(order)) || order?.webshopOrderId || (order ? shortId(order.id) : '')}
      subtitle={
        order ? (
          <span className="inline-flex items-center gap-2">
            <StatusChip status={order.status} />
            <code className="font-mono text-11 text-text-gray">{order.webshopOrderId || shortId(order.id)}</code>
          </span>
        ) : undefined
      }
    >
      {order && (
        <div className="space-y-6">
          {/* Summary */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label={t('orders.created')}>{fmtDateTime(order.createdAt)}</Field>
            <Field label={t('orders.status')}>{order.status}</Field>
            {order.fulfilledAt && <Field label={t('orders.fulfilled')}>{fmtDateTime(order.fulfilledAt)}</Field>}
            {order.lastSyncedAt && <Field label={t('orders.lastSynced')}>{fmtDateTime(order.lastSyncedAt)}</Field>}
            {order.montaOrderId && <Field label={t('orders.montaOrder')}>{order.montaOrderId}</Field>}
            {(order.orderData?.origin || monta?.origin) && (
              <Field label={t('orders.origin')}>{order.orderData?.origin || monta?.origin}</Field>
            )}
          </dl>

          {/* Delivery */}
          {delivery && (
            <section className="rounded-xl border border-beige-2 p-4">
              <h3 className="mb-3 text-13 font-bold text-dark-blue">{t('orders.deliveryAddress')}</h3>
              <p className="whitespace-pre-line text-13 text-dark-blue">{formatAddress(delivery)}</p>
              {delivery.emailAddress && (
                <p className="mt-1 text-13 text-text-gray">{delivery.emailAddress}</p>
              )}
            </section>
          )}

          {/* Shipping */}
          {monta && (monta.trackAndTraceCode || monta.shipperDescription || monta.estimatedDeliveryFrom) && (
            <section className="rounded-xl border border-beige-2 p-4">
              <h3 className="mb-3 text-13 font-bold text-dark-blue">{t('orders.shipping')}</h3>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
                {monta.shipperDescription && <Field label={t('orders.shipper')}>{monta.shipperDescription}</Field>}
                {monta.shipped && <Field label={t('orders.shipped')}>{fmtDateTime(monta.shipped)}</Field>}
                {(monta.estimatedDeliveryFrom || monta.estimatedDeliveryTo) && (
                  <Field label={t('orders.estimatedDelivery')}>
                    {[monta.estimatedDeliveryFrom, monta.estimatedDeliveryTo]
                      .filter(Boolean)
                      .map((d) => fmtDateTime(d as string))
                      .join(' – ')}
                  </Field>
                )}
                {monta.deliveryStatusDescription && (
                  <Field label={t('orders.deliveryStatus')}>{monta.deliveryStatusDescription}</Field>
                )}
                {monta.trackAndTraceCode && (
                  <Field label={t('orders.trackAndTrace')}>
                    {monta.trackAndTraceLink ? (
                      <a
                        href={monta.trackAndTraceLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-dark-purple hover:underline"
                      >
                        {monta.trackAndTraceCode}
                        <ArrowTopRightOnSquareIcon className="size-3.5" />
                      </a>
                    ) : (
                      <span className="font-mono">{monta.trackAndTraceCode}</span>
                    )}
                  </Field>
                )}
              </dl>
            </section>
          )}

          {/* Lines */}
          {lines.length > 0 && (
            <section>
              <h3 className="mb-2 text-13 font-bold text-dark-blue">{t('orders.lines')}</h3>
              <ul className="divide-y divide-beige-2/60 rounded-xl border border-beige-2">
                {lines.map((l, i) => (
                  <li key={`${l.sku}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="font-mono text-13 text-dark-blue">{l.sku}</span>
                    <span className="text-13 text-text-gray">× {l.orderedQuantity ?? 1}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Serials + activation */}
          {serials.length > 0 && (
            <section>
              <h3 className="mb-2 text-13 font-bold text-dark-blue">{t('orders.serials')}</h3>
              <ul className="divide-y divide-beige-2/60 rounded-xl border border-beige-2">
                {serials.map(({ product, serial }) => {
                  const isActive = activated.has(norm(serial))
                  return (
                    <li key={`${product}-${serial}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
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
                          <button className="btn-ghost text-12 text-dark-purple" onClick={() => onJump(serial)}>
                            <MapPinIcon className="size-4" />
                            {t('orders.viewInAmpere')}
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {/* Raw */}
          <section>
            <h3 className="mb-2 text-13 font-bold text-dark-blue">{t('inspector.response')}</h3>
            <JsonViewer data={order} />
          </section>
        </div>
      )}
    </Drawer>
  )
}
