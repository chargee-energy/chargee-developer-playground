import { API_ENDPOINTS, type ApiEndpoint } from './endpoints.generated'

export type { ApiEndpoint }
export { API_ENDPOINTS }

const DOCS_BASE = import.meta.env.VITE_AMPERE_DOCS_URL || 'https://ampere.prod.thunder.chargee.io/api/v2'

// Precompile a matcher per endpoint: turn /api/v2/groups/{group_uuid}/addresses
// into a regex so we can map a concrete request URL back to its operation.
interface CompiledEndpoint extends ApiEndpoint {
  regex: RegExp
}

const compiled: CompiledEndpoint[] = API_ENDPOINTS.map((e) => ({
  ...e,
  regex: new RegExp(
    '^' + e.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{[^}]+\\\}/g, '[^/]+') + '$',
  ),
}))

/** Swagger UI deep link for an operation, e.g. .../api/v2#/Groups/GroupController_getGroups_v2 */
export function docUrlFor(endpoint: Pick<ApiEndpoint, 'tag' | 'operationId'>): string {
  return `${DOCS_BASE}#/${endpoint.tag}/${endpoint.operationId}`
}

/** Resolve a concrete request (method + path) back to its OpenAPI operation. */
export function resolveEndpoint(method: string, url: string): ApiEndpoint | null {
  const path = url.split('?')[0]
  const m = method.toUpperCase()
  const match = compiled.find((e) => e.method === m && e.regex.test(path))
  return match ?? null
}

export function endpointsByTag(): Record<string, ApiEndpoint[]> {
  return API_ENDPOINTS.reduce<Record<string, ApiEndpoint[]>>((acc, e) => {
    ;(acc[e.tag] ??= []).push(e)
    return acc
  }, {})
}
