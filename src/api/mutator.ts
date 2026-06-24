import Axios, { type AxiosError, type AxiosRequestConfig } from 'axios'
import { useInspectorStore, nextCallId, type ApiCall } from '@/store/inspector'

// Origin only — generated paths already carry the /api/v2 prefix.
const API_ORIGIN = import.meta.env.VITE_AMPERE_API_URL || 'https://ampere.prod.thunder.chargee.io'

export const TOKEN_KEY = 'pg_access_token'
export const REFRESH_KEY = 'pg_refresh_token'

export const AXIOS_INSTANCE = Axios.create({
  baseURL: API_ORIGIN,
  headers: { 'Content-Type': 'application/json' },
})

// --- Auth: attach bearer token -------------------------------------------
AXIOS_INSTANCE.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  ;(config as any).__startedAt = performance.now()
  return config
})

// --- Inspector capture + 401 refresh/redirect ----------------------------
function recordCall(partial: Omit<ApiCall, 'id'>) {
  useInspectorStore.getState().record({ id: nextCallId(), ...partial })
}

let refreshing: Promise<string | null> | null = null

async function tryRefresh(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  try {
    const res = await Axios.post(
      `${API_ORIGIN}/api/v2/auth/refresh`,
      refreshToken ? { refreshToken } : {},
      { withCredentials: true },
    )
    const newToken = res.data?.accessToken ?? res.data?.access_token
    if (newToken) {
      localStorage.setItem(TOKEN_KEY, newToken)
      if (res.data?.refreshToken) localStorage.setItem(REFRESH_KEY, res.data.refreshToken)
      return newToken
    }
    return null
  } catch {
    return null
  }
}

AXIOS_INSTANCE.interceptors.response.use(
  (response) => {
    const cfg = response.config as any
    recordCall({
      method: (cfg.method ?? 'get').toUpperCase(),
      url: cfg.url ?? '',
      fullUrl: `${cfg.baseURL ?? ''}${cfg.url ?? ''}`,
      params: cfg.params,
      requestBody: safeParse(cfg.data),
      status: response.status,
      statusText: response.statusText,
      durationMs: cfg.__startedAt ? Math.round(performance.now() - cfg.__startedAt) : 0,
      startedAt: new Date().toISOString(),
      response: response.data,
    })
    return response
  },
  async (error: AxiosError) => {
    const cfg = (error.config ?? {}) as any
    recordCall({
      method: (cfg.method ?? 'get').toUpperCase(),
      url: cfg.url ?? '',
      fullUrl: `${cfg.baseURL ?? ''}${cfg.url ?? ''}`,
      params: cfg.params,
      requestBody: safeParse(cfg.data),
      status: error.response?.status ?? null,
      statusText: error.response?.statusText,
      durationMs: cfg.__startedAt ? Math.round(performance.now() - cfg.__startedAt) : 0,
      startedAt: new Date().toISOString(),
      response: error.response?.data,
      error: error.message,
    })

    // Attempt a single refresh-and-retry on 401, then fall back to logout.
    if (error.response?.status === 401 && !cfg.__isRetry && !cfg.url?.includes('/auth/')) {
      refreshing = refreshing ?? tryRefresh()
      const newToken = await refreshing
      refreshing = null
      if (newToken) {
        cfg.__isRetry = true
        cfg.headers = cfg.headers ?? {}
        cfg.headers.Authorization = `Bearer ${newToken}`
        return AXIOS_INSTANCE(cfg)
      }
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_KEY)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)

function safeParse(data: unknown) {
  if (typeof data !== 'string') return data
  try {
    return JSON.parse(data)
  } catch {
    return data
  }
}

// Orval mutator entry point. Generated hooks call this for every request.
export const customInstance = <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  return AXIOS_INSTANCE({ ...config, ...options }).then(({ data }) => data)
}

export default customInstance
