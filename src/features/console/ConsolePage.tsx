import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowTopRightOnSquareIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { PageHeader } from '@/components/PageHeader'
import { JsonViewer } from '@/components/common/JsonViewer'
import { StatusBadge, MethodBadge } from '@/components/common/StatusBadge'
import { Spinner } from '@/components/common/Spinner'
import { API_ENDPOINTS, docUrlFor, endpointsByTag, type ApiEndpoint } from '@/api/endpoints'
import { AXIOS_INSTANCE, TOKEN_KEY, REFRESH_KEY } from '@/api/mutator'

interface RunResult {
  status: number | null
  durationMs: number
  data: unknown
  error?: string
}

// Spec-derived example text for an endpoint's query params and request body.
function examplesFor(e?: ApiEndpoint) {
  return {
    query: e?.queryExample ? JSON.stringify(e.queryExample, null, 2) : '',
    body: e?.bodyExample !== undefined ? JSON.stringify(e.bodyExample, null, 2) : '',
  }
}

export function ConsolePage() {
  const { t } = useTranslation()
  const grouped = useMemo(() => endpointsByTag(), [])
  const firstEndpoint = API_ENDPOINTS[0]
  const [opId, setOpId] = useState(firstEndpoint?.operationId ?? '')
  const endpoint = useMemo(() => API_ENDPOINTS.find((e) => e.operationId === opId), [opId])

  const pathParams = useMemo(
    () => (endpoint ? Array.from(endpoint.path.matchAll(/\{([^}]+)\}/g)).map((m) => m[1]) : []),
    [endpoint],
  )
  const [pathValues, setPathValues] = useState<Record<string, string>>({})
  const [queryText, setQueryText] = useState(() => examplesFor(firstEndpoint).query)
  const [bodyText, setBodyText] = useState(() => examplesFor(firstEndpoint).body)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)

  const selectEndpoint = (id: string) => {
    const ep = API_ENDPOINTS.find((e) => e.operationId === id)
    const ex = examplesFor(ep)
    setOpId(id)
    setPathValues({})
    setResult(null)
    setQueryText(ex.query)
    setBodyText(ex.body)
  }

  const isWrite = endpoint && endpoint.method !== 'GET'

  const send = async () => {
    if (!endpoint) return
    setSending(true)
    setResult(null)
    let url = endpoint.path
    for (const p of pathParams) url = url.replace(`{${p}}`, encodeURIComponent(pathValues[p] ?? ''))

    let params: unknown
    let data: unknown
    try {
      params = queryText.trim() ? JSON.parse(queryText) : undefined
      data = bodyText.trim() ? JSON.parse(bodyText) : undefined
    } catch (e: any) {
      setResult({ status: null, durationMs: 0, data: null, error: `Invalid JSON: ${e.message}` })
      setSending(false)
      return
    }

    const start = performance.now()
    try {
      const res = await AXIOS_INSTANCE({ method: endpoint.method, url, params: params as any, data })
      // Persist a token returned by /auth/login or /auth/refresh so the rest of
      // the session (and further console calls) use it.
      const tok = (res.data as any)?.accessToken ?? (res.data as any)?.access_token
      if (tok) {
        localStorage.setItem(TOKEN_KEY, tok)
        const refresh = (res.data as any)?.refreshToken
        if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
      }
      setResult({ status: res.status, durationMs: Math.round(performance.now() - start), data: res.data })
    } catch (e: any) {
      setResult({
        status: e.response?.status ?? null,
        durationMs: Math.round(performance.now() - start),
        data: e.response?.data,
        error: e.message,
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('console.eyebrow')}
        title={t('console.title')}
        subtitle={t('console.subtitle')}
        hideInspector
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Request builder */}
        <div className="card space-y-4 p-5">
          <div>
            <label className="label">{t('console.selectEndpoint')}</label>
            <select
              className="input"
              value={opId}
              onChange={(e) => selectEndpoint(e.target.value)}
            >
              {Object.entries(grouped).map(([tag, eps]) => (
                <optgroup key={tag} label={tag}>
                  {eps.map((e) => (
                    <option key={e.operationId} value={e.operationId}>
                      {e.method} {e.path.replace('/api/v2', '')}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {endpoint && (
            <div className="flex flex-wrap items-center gap-2">
              <MethodBadge method={endpoint.method} />
              <code className="break-all font-mono text-13 text-dark-blue">{endpoint.path}</code>
              <a href={docUrlFor(endpoint)} target="_blank" rel="noreferrer" className="btn-ghost">
                <ArrowTopRightOnSquareIcon className="size-4" />
                {t('common.viewDocs')}
              </a>
            </div>
          )}

          {isWrite && (
            <p className="rounded-xl bg-orange/10 px-3 py-2 text-13 text-orange">
              {t('console.writeWarning', { method: endpoint!.method })}
            </p>
          )}

          {pathParams.length > 0 && (
            <div className="space-y-2">
              <p className="label">{t('console.pathParams')}</p>
              {pathParams.map((p) => (
                <div key={p}>
                  <label className="mb-1 block text-11 font-semibold text-text-gray">{p}</label>
                  <input
                    className="input"
                    value={pathValues[p] ?? ''}
                    onChange={(e) => setPathValues((prev) => ({ ...prev, [p]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="label">{t('console.queryParams')}</label>
            <textarea
              className="input h-20 py-2 font-mono text-13"
              placeholder={'{ "limit": 50, "offset": 0 }'}
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
            />
          </div>

          {isWrite && (
            <div>
              <label className="label">{t('console.body')}</label>
              <textarea
                className="input h-28 py-2 font-mono text-13"
                placeholder={'{ }'}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
              />
            </div>
          )}

          <button className="btn-primary w-full" onClick={send} disabled={sending || !endpoint}>
            {sending ? <Spinner className="size-4 border-beige border-t-white" /> : <PaperAirplaneIcon className="size-4" />}
            {sending ? t('console.sending') : t('console.send')}
          </button>
        </div>

        {/* Response */}
        <div className="card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-13 font-bold text-dark-blue">{t('console.response')}</h3>
            {result && (
              <div className="flex items-center gap-2 text-13 text-text-gray">
                <StatusBadge status={result.status} />
                <span>{result.durationMs} ms</span>
              </div>
            )}
          </div>
          {result?.error && <p className="text-13 text-red">{result.error}</p>}
          {result ? (
            <JsonViewer data={result.data} />
          ) : (
            <p className="py-10 text-center text-sm text-text-gray">{t('console.noResponse')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
