import Axios, { type AxiosError, type AxiosRequestConfig } from 'axios'
import { useInspectorStore, nextCallId, type ApiCall } from '@/store/inspector'
import type { JwtWithUserDto } from '@/api/generated/model'

// Origin only — generated paths already carry the /api/v2 prefix.
const API_ORIGIN = import.meta.env.VITE_AMPERE_API_URL || 'https://ampere.chargee.io'

export const TOKEN_KEY = 'pg_access_token'
export const REFRESH_KEY = 'pg_refresh_token'
/** Path the user was on when a session died, so login can return them to it. */
const LOGIN_NEXT_KEY = 'pg_login_next'

// Refresh this far ahead of expiry so a request never races the clock.
const REFRESH_SKEW_MS = 60_000

// Auth endpoints that must never themselves trigger a refresh. `/auth/me` is
// deliberately absent: a reload on an expired access token has to be able to
// refresh instead of forcing a re-login.
const AUTH_FLOW_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout']
const isAuthFlowUrl = (url?: string) => !!url && AUTH_FLOW_PATHS.some((p) => url.includes(p))

// --- Token storage --------------------------------------------------------
// "Remember me" persists in localStorage (survives restarts); otherwise the
// session lives in sessionStorage (cleared when the tab closes). Reads check
// both so the rest of the app doesn't care which was used.
const read = (key: string) => sessionStorage.getItem(key) ?? localStorage.getItem(key)
const currentStore = () =>
  localStorage.getItem(TOKEN_KEY) !== null ? localStorage : sessionStorage

export const getToken = () => read(TOKEN_KEY)
export const getRefreshToken = () => read(REFRESH_KEY)

/**
 * Persist tokens. `remember` picks the store when signing in; omit it to keep
 * the session wherever it already lives (so a refresh never promotes a
 * tab-only session into localStorage).
 */
export function storeTokens(accessToken: string, refreshToken?: string | null, remember?: boolean) {
  const store = remember === undefined ? currentStore() : remember ? localStorage : sessionStorage
  const other = store === localStorage ? sessionStorage : localStorage
  store.setItem(TOKEN_KEY, accessToken)
  other.removeItem(TOKEN_KEY)
  if (refreshToken) {
    store.setItem(REFRESH_KEY, refreshToken)
    other.removeItem(REFRESH_KEY)
  }
  scheduleRefresh()
  notifySession(accessToken)
}

export function clearTokens() {
  for (const s of [localStorage, sessionStorage]) {
    s.removeItem(TOKEN_KEY)
    s.removeItem(REFRESH_KEY)
  }
  if (timer !== null) clearTimeout(timer)
  timer = null
  notifySession(null)
}

// --- Session change notifications ----------------------------------------
// The token layer swaps tokens on its own (background refresh) and can decide
// a session is over, so the auth store subscribes instead of polling.
type SessionListener = (accessToken: string | null) => void
const sessionListeners = new Set<SessionListener>()

/** Subscribe to token changes. `null` means the session ended. */
export function onSessionChange(fn: SessionListener) {
  sessionListeners.add(fn)
  return () => sessionListeners.delete(fn)
}

const notifySession = (token: string | null) => {
  for (const fn of sessionListeners) fn(token)
}

/** Where to send the user after signing in again, when we kicked them out. */
export const getLoginRedirect = () => sessionStorage.getItem(LOGIN_NEXT_KEY)
export const clearLoginRedirect = () => sessionStorage.removeItem(LOGIN_NEXT_KEY)

/** The session is genuinely over: drop it and remember where the user was. */
function endSession() {
  const { pathname, search } = window.location
  // First caller wins: a burst of 401s all land here, and only the earliest
  // one still knows the page the user was actually looking at.
  if (!pathname.startsWith('/login') && !sessionStorage.getItem(LOGIN_NEXT_KEY)) {
    sessionStorage.setItem(LOGIN_NEXT_KEY, `${pathname}${search}`)
  }
  clearTokens()
}

// --- Expiry ---------------------------------------------------------------
/** Expiry read straight out of the access token's `exp` claim, in ms. */
function tokenExpiryMs(token: string | null): number | null {
  const payload = token?.split('.')[1]
  if (!payload) return null
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json?.exp === 'number' ? json.exp * 1000 : null
  } catch {
    return null
  }
}

/** ms until the access token expires, or null when the token doesn't say. */
const msUntilExpiry = () => {
  const at = tokenExpiryMs(getToken())
  return at === null ? null : at - Date.now()
}

/** True once the access token is inside the skew window (or already expired). */
const isNearExpiry = () => {
  const ms = msUntilExpiry()
  return ms !== null && ms <= REFRESH_SKEW_MS
}

export const AXIOS_INSTANCE = Axios.create({
  baseURL: API_ORIGIN,
  headers: { 'Content-Type': 'application/json' },
})

// --- Inspector capture ----------------------------------------------------
function recordCall(partial: Omit<ApiCall, 'id'>) {
  useInspectorStore.getState().record({ id: nextCallId(), ...partial })
}

// --- Refresh --------------------------------------------------------------
let refreshing: Promise<string | null> | null = null
let timer: ReturnType<typeof setTimeout> | null = null

/** Exchange the refresh token for a new pair, sharing one call across callers. */
function refreshSession(): Promise<string | null> {
  refreshing ??= exchangeRefreshToken().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function exchangeRefreshToken(): Promise<string | null> {
  const refreshToken = getRefreshToken()
  // Nothing to exchange — the session can only be restored by signing in.
  if (!refreshToken) {
    endSession()
    return null
  }

  const url = '/api/v2/auth/refresh'
  const startedAt = performance.now()
  const base = {
    method: 'POST',
    url,
    fullUrl: `${API_ORIGIN}${url}`,
    requestBody: { refreshToken: '<REFRESH_TOKEN>' },
    startedAt: new Date().toISOString(),
  }
  try {
    // A bare axios call on purpose: no bearer header (the API reads the refresh
    // token from the body only) and no `withCredentials` — the API answers with
    // `Access-Control-Allow-Origin: *` and no `Access-Control-Allow-Credentials`,
    // so a credentialed request makes the browser discard the response and
    // every refresh "fails".
    const res = await Axios.post<JwtWithUserDto>(`${API_ORIGIN}${url}`, { refreshToken })
    recordCall({
      ...base,
      status: res.status,
      statusText: res.statusText,
      durationMs: Math.round(performance.now() - startedAt),
      response: { ...res.data, accessToken: '<ACCESS_TOKEN>', refreshToken: '<REFRESH_TOKEN>' },
    })
    const accessToken = res.data?.accessToken
    if (!accessToken) {
      endSession()
      return null
    }
    storeTokens(accessToken, res.data.refreshToken)
    return accessToken
  } catch (err) {
    const error = err as AxiosError
    const status = error.response?.status ?? null
    recordCall({
      ...base,
      status,
      statusText: error.response?.statusText,
      durationMs: Math.round(performance.now() - startedAt),
      response: error.response?.data,
      error: error.message,
    })
    // 401/403 means the refresh token itself is spent, so the user has to sign
    // in again — unless another tab rotated it while this call was in flight,
    // in which case the rejection is about the old token, not the session.
    // Anything else (offline, 5xx, CORS) is transient: keep the tokens so the
    // next attempt can still recover the session.
    if (status === 401 || status === 403) {
      if (getRefreshToken() !== refreshToken) return getToken()
      endSession()
    }
    return null
  }
}

/**
 * Keep the session alive in the background: refresh just before the access
 * token expires. That also rotates the refresh token, so a tab left open (or a
 * user who comes back tomorrow) doesn't land on the login page. When the token
 * doesn't carry an expiry there is nothing to schedule against, and the 401
 * retry below remains the safety net.
 */
function scheduleRefresh() {
  if (timer !== null) clearTimeout(timer)
  timer = null
  if (!getToken() || !getRefreshToken()) return
  const ms = msUntilExpiry()
  if (ms === null) return
  timer = setTimeout(
    () => {
      timer = null
      void refreshSession()
    },
    Math.max(ms - Math.min(REFRESH_SKEW_MS, ms / 2), 0),
  )
}

// Timers don't fire reliably in a throttled or sleeping tab, so re-check when
// the user comes back: without this, a tab left open overnight still has to
// discover the expiry through a failed request.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return
  if (getToken() && getRefreshToken() && isNearExpiry()) void refreshSession()
  else scheduleRefresh()
})

// Another tab may have refreshed; adopt its timing instead of racing it for
// the (single-use) refresh token.
window.addEventListener('storage', (e) => {
  if (e.key === TOKEN_KEY || e.key === REFRESH_KEY) scheduleRefresh()
})

scheduleRefresh()

// --- Auth: attach bearer token -------------------------------------------
AXIOS_INSTANCE.interceptors.request.use(async (config) => {
  // Renew ahead of expiry — and wait for a renewal already in flight — so
  // requests don't have to discover expiry through a 401.
  if (getToken() && !isAuthFlowUrl(config.url)) {
    if (refreshing) await refreshing
    else if (isNearExpiry() && getRefreshToken()) await refreshSession()
  }
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  ;(config as any).__startedAt = performance.now()
  return config
})

// --- Inspector capture + 401 refresh/retry -------------------------------
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

    // Refresh once and retry on 401. Whether the session survives is decided
    // in `exchangeRefreshToken`: only a rejected refresh token ends it, so a
    // network blip or a 5xx no longer costs the user their session.
    // Nothing left to exchange means the session was already ended by an
    // earlier failure in this burst — don't re-run the teardown per request.
    const recoverable = !!getRefreshToken() || !!getToken()
    if (error.response?.status === 401 && recoverable && !cfg.__isRetry && !isAuthFlowUrl(cfg.url)) {
      const newToken = await refreshSession()
      if (newToken) {
        cfg.__isRetry = true
        cfg.headers = cfg.headers ?? {}
        cfg.headers.Authorization = `Bearer ${newToken}`
        return AXIOS_INSTANCE(cfg)
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
