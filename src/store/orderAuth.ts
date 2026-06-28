import { create } from 'zustand'
import { orderLogin, getOrderToken, storeOrderToken, clearOrderToken, type OrderUser } from '@/api/orderClient'

// Connection state for the optional Order fulfillment API — separate from the
// Ampere session, with its own credentials and token.
interface OrderAuthState {
  connected: boolean
  user: OrderUser | null
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  disconnect: () => void
}

export const useOrderAuthStore = create<OrderAuthState>((set) => ({
  connected: !!getOrderToken(),
  user: null,

  login: async (email, password, remember = true) => {
    const data = await orderLogin(email, password)
    storeOrderToken(data.accessToken, remember)
    set({ connected: true, user: data.user })
  },

  disconnect: () => {
    clearOrderToken()
    set({ connected: false, user: null })
  },
}))
