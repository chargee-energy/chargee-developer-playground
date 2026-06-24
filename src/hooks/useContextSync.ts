import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useContextStore } from '@/store/context'

// Two-way sync between the selected group/address and the URL query string,
// so any view is shareable/bookmarkable. Run once in the layout.
export function useContextSync() {
  const [searchParams, setSearchParams] = useSearchParams()
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
    const next = new URLSearchParams(searchParams)
    if (groupUuid) next.set('group', groupUuid)
    else next.delete('group')
    if (addressUuid) next.set('address', addressUuid)
    else next.delete('address')
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupUuid, addressUuid])
}
