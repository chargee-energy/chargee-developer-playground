import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Spinner } from '@/components/common/Spinner'
import { useContextStore } from '@/store/context'
import { lookupAddress } from '@/utils/addressLookup'

/**
 * Finds one address by UUID, sparky/flint serial, box code or EAN and makes it
 * the selected address. Meant for roles without a group limit — for anyone
 * else, addresses outside their groups come back as not found.
 */
export function AddressLookup({ onFound }: { onFound?: () => void }) {
  const { t } = useTranslation()
  const selectLookedUpAddress = useContextStore((s) => s.selectLookedUpAddress)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const q = query.trim()
    if (!q || busy) return
    setBusy(true)
    setError(null)
    try {
      const record = await lookupAddress(q)
      if (record) {
        selectLookedUpAddress(record)
        setQuery('')
        onFound?.()
      } else {
        setError(t('context.lookupNotFound'))
      }
    } catch {
      setError(t('common.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col items-center gap-1 sm:items-start">
      <div className="flex h-9 items-center gap-1 rounded-full border border-beige-2 bg-white pl-3 pr-1">
        <MagnifyingGlassIcon className="size-4 shrink-0 text-text-gray" />
        <input
          className="h-7 w-44 border-0 bg-transparent px-1 font-mono text-13 text-dark-blue focus:ring-0 sm:w-64"
          placeholder={t('context.lookupPlaceholder')}
          aria-label={t('context.lookupPlaceholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setError(null)
          }}
        />
        <button
          type="submit"
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-dark-blue px-3 text-13 font-semibold text-beige transition-colors hover:bg-dark-purple disabled:opacity-40 disabled:hover:bg-dark-blue"
          disabled={!query.trim() || busy}
        >
          {busy && <Spinner className="size-3 border-beige border-t-white" />}
          {t('context.lookup')}
        </button>
      </div>
      {error && <p className="px-3 text-11 font-semibold text-red">{error}</p>}
    </form>
  )
}
