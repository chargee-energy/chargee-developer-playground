import Axios, { type AxiosError } from 'axios'
import { useInspectorStore, nextCallId, type ApiCall } from '@/store/inspector'

// The Order fulfillment API is a separate service with its own credentials and
// token (independent of the Ampere session).
const ORDER_ORIGIN = import.meta.env.VITE_ORDER_API_URL || 'https://order-api.chargee.io'

export const ORDER_TOKEN_KEY = 'pg_order_access_token'

export const getOrderToken = () =>
  sessionStorage.getItem(ORDER_TOKEN_KEY) ?? localStorage.getItem(ORDER_TOKEN_KEY)

export function storeOrderToken(token: string, remember = true) {
  const store = remember ? localStorage : sessionStorage
  const other = remember ? sessionStorage : localStorage
  store.setItem(ORDER_TOKEN_KEY, token)
  other.removeItem(ORDER_TOKEN_KEY)
}

export function clearOrderToken() {
  localStorage.removeItem(ORDER_TOKEN_KEY)
  sessionStorage.removeItem(ORDER_TOKEN_KEY)
}

export const ORDER_AXIOS = Axios.create({
  baseURL: ORDER_ORIGIN,
  headers: { 'Content-Type': 'application/json' },
})

ORDER_AXIOS.interceptors.request.use((config) => {
  const token = getOrderToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  ;(config as any).__startedAt = performance.now()
  return config
})

// Mirror order-API calls into the shared API Inspector (raw + cURL).
function record(cfg: any, partial: Omit<ApiCall, 'id' | 'method' | 'url' | 'fullUrl' | 'durationMs' | 'startedAt'>) {
  useInspectorStore.getState().record({
    id: nextCallId(),
    method: (cfg.method ?? 'get').toUpperCase(),
    url: cfg.url ?? '',
    fullUrl: `${cfg.baseURL ?? ''}${cfg.url ?? ''}`,
    params: cfg.params,
    durationMs: cfg.__startedAt ? Math.round(performance.now() - cfg.__startedAt) : 0,
    startedAt: new Date().toISOString(),
    ...partial,
  })
}

ORDER_AXIOS.interceptors.response.use(
  (response) => {
    record(response.config, { status: response.status, statusText: response.statusText, response: response.data })
    return response
  },
  (error: AxiosError) => {
    record(error.config ?? {}, {
      status: error.response?.status ?? null,
      statusText: error.response?.statusText,
      response: error.response?.data,
      error: error.message,
    })
    return Promise.reject(error)
  },
)

// --- Types ---------------------------------------------------------------
export interface OrderUser {
  id: string
  email: string
  firstName?: string
  lastName?: string
  montaApiUsername?: string
}

export interface OrderLoginResponse {
  accessToken: string
  user: OrderUser
}

export interface OrderAddress {
  firstName?: string | null
  lastName?: string | null
  street?: string | null
  houseNumber?: string | null
  houseNumberAddition?: string | null
  postalCode?: string | null
  city?: string | null
  countryCode?: string | null
  emailAddress?: string | null
}

export interface OrderLine {
  sku: string
  orderedQuantity?: number
}

export interface Order {
  id: string
  webshopOrderId: string
  orderData?: {
    lines?: OrderLine[]
    origin?: string
    consumerDetails?: { deliveryAddress?: OrderAddress; invoiceAddress?: OrderAddress; b2b?: boolean }
  }
  montaOrderData?: {
    montaEorderId?: number | string
    origin?: string
    shipperDescription?: string | null
    shipperCode?: string | null
    trackAndTraceCode?: string | null
    trackAndTraceLink?: string | null
    deliveryStatusDescription?: string | null
    estimatedDeliveryFrom?: string | null
    estimatedDeliveryTo?: string | null
    shipped?: string | null
    consumerDetails?: { deliveryAddress?: OrderAddress; invoiceAddress?: OrderAddress }
  }
  /**
   * Serials shipped, as an array of maps keyed by product SKU, e.g.
   * [{ GREENCHOICEFLYER: [], GREENCHOICESPARKYV3: ["v3-2023469"] }].
   * Only serialized products (Sparkies) carry serials — accessories ship with
   * empty arrays. The serial value is the Sparky box code (matches `boxCode`
   * on a group address in Ampere). Only `fulfilled` orders carry serials.
   */
  serials?: Array<Record<string, string[]>>
  status: string
  montaOrderId?: string | null
  lastSyncedAt?: string | null
  fulfilledAt?: string | null
  createdAt: string
  updatedAt?: string | null
}

export interface OrdersResponse {
  data: Order[]
  meta: { page: number; limit: number; total: number; totalPages: number }
}

// --- Endpoints -----------------------------------------------------------
export async function orderLogin(email: string, password: string): Promise<OrderLoginResponse> {
  const { data } = await ORDER_AXIOS.post<OrderLoginResponse>('/api/v1/auth/login', { email, password })
  return data
}

export async function getOrders(page = 1, limit = 20): Promise<OrdersResponse> {
  const { data } = await ORDER_AXIOS.get<OrdersResponse>('/api/v1/orders', { params: { page, limit } })
  return data
}

/**
 * Loads every order by paging through the list endpoint, so analytics and the
 * activation cross-check run over the full set (the list itself is then paged
 * client-side). Capped to avoid runaway fetches.
 */
export async function getAllOrders(): Promise<{ orders: Order[]; total: number; truncated: boolean }> {
  const PAGE = 100
  const MAX_PAGES = 50 // up to 5000 orders
  const first = await getOrders(1, PAGE)
  const totalPages = first.meta?.totalPages ?? 1
  const pages = Math.min(totalPages, MAX_PAGES)
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => getOrders(i + 2, PAGE)),
  )
  return {
    orders: [first, ...rest].flatMap((r) => r.data ?? []),
    total: first.meta?.total ?? 0,
    truncated: totalPages > MAX_PAGES,
  }
}

/** Flatten an order's serials (array of SKU→serials maps) to { product, serial }. */
export function orderSerials(order: Order): Array<{ product: string; serial: string }> {
  const out: Array<{ product: string; serial: string }> = []
  for (const entry of order.serials ?? []) {
    for (const [product, serials] of Object.entries(entry ?? {})) {
      for (const serial of serials ?? []) out.push({ product, serial })
    }
  }
  return out
}

/** The delivery address of an order (Monta first, then the webshop order). */
export function orderAddress(order: Order): OrderAddress | undefined {
  return (
    order.montaOrderData?.consumerDetails?.deliveryAddress ??
    order.orderData?.consumerDetails?.deliveryAddress
  )
}

/** Customer name from the delivery address, when known. */
export function orderCustomerName(order: Order): string {
  const a = orderAddress(order)
  return [a?.firstName, a?.lastName].filter(Boolean).join(' ')
}

/** Lowercased haystack for free-text search (name, address, serials, ids). */
export function orderSearchText(order: Order): string {
  const a = orderAddress(order)
  const parts = [
    order.webshopOrderId,
    order.montaOrderId,
    order.id,
    order.status,
    a?.firstName,
    a?.lastName,
    a?.street,
    a?.houseNumber,
    a?.houseNumberAddition,
    a?.postalCode,
    a?.city,
    a?.countryCode,
    a?.emailAddress,
    ...orderSerials(order).flatMap(({ product, serial }) => [product, serial]),
  ]
  return parts.filter(Boolean).join(' ').toLowerCase()
}
