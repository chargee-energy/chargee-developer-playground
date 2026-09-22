import { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useContextStore } from '@/store/context'

// Two-way sync between the selected group/address and the URL query string,
// so any view is shareable/bookmarkable. Run once in the layout.
export function useContextSync() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { groupUuid, addressUuid, setGroup, setAddress } = useContextStore()
  const hydrated = useRef(false)

  // Hydrate store from URL on first mount.
  useEffect(() => {
    const g = searchParams.get('group')
    const a = searchParams.get('address')
    if (g) setGroup(g)
    if (a) setAddress(a)
    hydrated.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reflect store changes back into the URL.
  useEffect(() => {
    if (!hydrated.current) return
    // Read the live URL, not this render's location. Store updates render right
    // away while router updates run as a transition, so when a page selects an
    // address and navigates in the same tick (lookup or "View devices" →
    // /devices), this effect still sees the old path. Writing the params
    // against it would replace the new entry and undo the navigation.
    const { pathname, search, hash } = window.location
    const next = new URLSearchParams(search)
    if (groupUuid) next.set('group', groupUuid)
    else next.delete('group')
    if (addressUuid) next.set('address', addressUuid)
    else next.delete('address')
    const query = next.toString()
    if (query !== new URLSearchParams(search).toString()) {
      navigate({ pathname, search: query ? `?${query}` : '', hash }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupUuid, addressUuid])
}
