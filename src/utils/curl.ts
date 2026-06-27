import type { ApiCall } from '@/store/inspector'

const API_ORIGIN = import.meta.env.VITE_AMPERE_API_URL || 'https://ampere.chargee.io'

/** Build a copy-pasteable cURL command for a captured request. */
export function toCurl(call: ApiCall): string {
  const parts: string[] = []
  let url = call.fullUrl || `${API_ORIGIN}${call.url}`
  if (call.params && Object.keys(call.params).length) {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(call.params)) {
      if (v !== undefined && v !== null) qs.append(k, String(v))
    }
    const sep = url.includes('?') ? '&' : '?'
    url = `${url}${sep}${qs.toString()}`
  }

  parts.push(`curl -X ${call.method} '${url}'`)
  parts.push(`  -H 'Authorization: Bearer <YOUR_TOKEN>'`)
  parts.push(`  -H 'Content-Type: application/json'`)
  if (call.requestBody && call.method !== 'GET') {
    parts.push(`  -d '${JSON.stringify(call.requestBody)}'`)
  }
  return parts.join(' \\\n')
}
