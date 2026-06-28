import { create } from 'zustand'
import {
  orderLogin,
  getOrderToken,
  storeOrderToken,
  clearOrderToken,
  getOrderSku,
  storeOrderSku,
  clearOrderSku,
  ORDER_TOKEN_KEY,
  type OrderUser,
} from '@/api/orderClient'

// Connection state for the optional Order fulfillment API — separate from the
// Ampere session, with its own credentials and token. The Sparky SKU is a
// per-customer setting used to pick which serials to match against Ampere.
interface OrderAuthState {
  connected: boolean
  user: OrderUser | null
  sparkySku: string
  login: (email: string, password: string, sparkySku: string, remember?: boolean) => Promise<void>
  setSparkySku: (sku: string) => void
  disconnect: () => void
}

export const useOrderAuthStore = create<OrderAuthState>((set) => ({
  connected: !!getOrderToken(),
  user: null,
  sparkySku: getOrderSku(),

  login: async (email, password, sparkySku, remember = true) => {
    const data = await orderLogin(email, password)
    storeOrderToken(data.accessToken, remember)
    storeOrderSku(sparkySku.trim(), remember)
    set({ connected: true, user: data.user, sparkySku: sparkySku.trim() })
  },

  setSparkySku: (sku) => {
    // Persist to wherever the token currently lives (remember-me vs session).
    const remember = !!localStorage.getItem(ORDER_TOKEN_KEY)
    storeOrderSku(sku.trim(), remember)
    set({ sparkySku: sku.trim() })
  },

  disconnect: () => {
    clearOrderToken()
    clearOrderSku()
    set({ connected: false, user: null, sparkySku: '' })
  },
}))
