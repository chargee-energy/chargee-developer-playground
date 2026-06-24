import { create } from 'zustand'
import {
  authControllerLoginV2,
  authControllerMeV2,
  authControllerLogoutV2,
} from '@/api/generated/auth/auth'
import { TOKEN_KEY, REFRESH_KEY } from '@/api/mutator'
import type { UserDto } from '@/api/generated/model'

interface AuthState {
  user: UserDto | null
  token: string | null
  isAuthenticated: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchUser: () => Promise<void>
  bootstrap: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem(TOKEN_KEY),
  isAuthenticated: !!localStorage.getItem(TOKEN_KEY),
  loading: !!localStorage.getItem(TOKEN_KEY),

  login: async (email, password) => {
    const data = await authControllerLoginV2({ email, password })
    localStorage.setItem(TOKEN_KEY, data.accessToken)
    if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken)
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
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
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
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_KEY)
      set({ user: null, token: null, isAuthenticated: false })
    } finally {
      set({ loading: false })
    }
  },
}))
