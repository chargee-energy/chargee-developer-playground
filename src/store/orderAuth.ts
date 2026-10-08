import { create } from 'zustand'
import {
  orderLogin,
  getOrderToken,
  storeOrderToken,
  clearOrderToken,
  onOrderSessionExpired,
  type OrderUser,
} from '@/api/orderClient'

// Connection state for the optional Order fulfillment API — separate from the
// Ampere session, with its own credentials and token.
interface OrderAuthState {
  connected: boolean
  user: OrderUser | null
  /** Set when the token expired mid-session, so the form can say why. */
  expired: boolean
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  disconnect: () => void
}

export const useOrderAuthStore = create<OrderAuthState>((set) => ({
  connected: !!getOrderToken(),
  user: null,
  expired: false,

  login: async (email, password, remember = true) => {
    const data = await orderLogin(email, password)
    storeOrderToken(data.accessToken, remember)
    set({ connected: true, user: data.user, expired: false })
  },

  disconnect: () => {
    clearOrderToken()
    set({ connected: false, user: null, expired: false })
  },
}))

// An expired Order token drops straight back to the connect form.
onOrderSessionExpired(() => {
  if (useOrderAuthStore.getState().connected) {
    useOrderAuthStore.setState({ connected: false, user: null, expired: true })
  }
})
