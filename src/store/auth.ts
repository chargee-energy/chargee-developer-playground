import { create } from 'zustand'
import {
  authControllerLoginV2,
  authControllerMeV2,
  authControllerLogoutV2,
} from '@/api/generated/auth/auth'
import { getToken, storeTokens, clearTokens } from '@/api/mutator'
import type { UserDto } from '@/api/generated/model'

interface AuthState {
  user: UserDto | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  login: (email: string, password: string, remember?: boolean) => Promise<void>
  logout: () => Promise<void>
  fetchUser: () => Promise<void>
  bootstrap: () => Promise<void>
}

const initialToken = getToken()

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: initialToken,
  isAuthenticated: !!initialToken,
  loading: !!initialToken,

  login: async (email, password, remember = true) => {
    const data = await authControllerLoginV2({ email, password })
    storeTokens(data.accessToken, data.refreshToken, remember)
    set({
      token: data.accessToken,
      isAuthenticated: true,
      user: {
        uuid: data.uuid,
        role: data.role,
        email: data.email,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        loginAt: data.loginAt,
        deletedAt: data.deletedAt,
      },
    })
  },

  logout: async () => {
    try {
      await authControllerLogoutV2()
    } catch {
      // best-effort server-side logout; clear locally regardless
    }
    clearTokens()
    set({ user: null, token: null, isAuthenticated: false, loading: false })
  },

  fetchUser: async () => {
    const user = await authControllerMeV2()
    set({ user, isAuthenticated: true })
  },

  // Validate an existing token on app start.
  bootstrap: async () => {
    if (!get().token) {
      set({ loading: false })
      return
    }
    try {
      await get().fetchUser()
    } catch {
      clearTokens()
      set({ user: null, token: null, isAuthenticated: false })
    } finally {
      set({ loading: false })
    }
  },
}))

// Internal Chargee roles that aren't limited to assigned groups. Compared as
// strings: the generated role enum predates `support` (`npm run api:sync`).
const UNSCOPED_ROLES = ['admin', 'support']
// Roles whose write requests the API rejects.
const READ_ONLY_ROLES = ['support']

const hasRole = (roles: string[]) => (s: AuthState) => roles.includes(String(s.user?.role ?? ''))

/** Whether the user can look up any single address, not just their groups'. */
export const useCanLookupAddresses = () => useAuthStore(hasRole(UNSCOPED_ROLES))

/** Whether the user can only read, so write actions should be disabled. */
export const useIsReadOnly = () => useAuthStore(hasRole(READ_ONLY_ROLES))
