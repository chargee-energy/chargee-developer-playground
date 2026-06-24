import { Fragment, useMemo, useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useTranslation } from 'react-i18next'
import { XMarkIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { useInspectorStore, type ApiCall } from '@/store/inspector'
import { resolveEndpoint, docUrlFor } from '@/api/endpoints'
import { JsonViewer } from './JsonViewer'
import { StatusBadge, MethodBadge } from './StatusBadge'
import { CopyButton } from './CopyButton'
import { toCurl } from '@/utils/curl'
import { fmtTime } from '@/utils/format'
import { cn } from '@/utils/cn'

interface ApiInspectorProps {
  open: boolean
  onClose: () => void
  /** Optional method+url to preselect the relevant call. */
  primary?: { method: string; url: string }
}

export function ApiInspector({ open, onClose, primary }: ApiInspectorProps) {
  const { t } = useTranslation()
  const calls = useInspectorStore((s) => s.calls)
  const clear = useInspectorStore((s) => s.clear)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Preselect the call matching the current view (or the most recent one).
  useEffect(() => {
    if (!open) return
    const match = primary
      ? calls.find((c) => c.method === primary.method.toUpperCase() && c.url === primary.url)
      : undefined
    setSelectedId((match ?? calls[0])?.id ?? null)
  }, [open, primary, calls])

  const selected = useMemo(
    () => calls.find((c) => c.id === selectedId) ?? calls[0] ?? null,
    [calls, selectedId],
  )

  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-in-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-300"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-dark-blue/30 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-300"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-screen max-w-2xl">
                  <div className="flex h-full flex-col bg-white shadow-xl">
                    {/* Header */}
                    <div className="flex items-start justify-between border-b border-beige-2 px-6 py-5">
                      <div>
                        <Dialog.Title className="text-lg font-bold text-dark-blue">
                          {t('inspector.title')}
                        </Dialog.Title>
                        <p className="text-13 text-text-gray">{t('inspector.subtitle')}</p>
                      </div>
                      <button onClick={onClose} className="btn-ghost" aria-label={t('common.close')}>
                        <XMarkIcon className="size-5" />
                      </button>
                    </div>

                    <div className="flex min-h-0 flex-1">
                      {/* Recent calls list */}
                      <aside className="w-56 shrink-0 overflow-y-auto border-r border-beige-2 scrollbar-thin">
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-11 font-bold uppercase tracking-wide text-text-gray">
                            {t('inspector.recentCalls')}
                          </span>
                          <button onClick={clear} className="text-11 text-dark-purple hover:underline">
                            {t('inspector.clear')}
                          </button>
                        </div>
                        {calls.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setSelectedId(c.id)}
                            className={cn(
                              'flex w-full flex-col gap-1 border-b border-beige-2/60 px-3 py-2 text-left transition-colors hover:bg-beige',
                              selected?.id === c.id && 'bg-light-purple-3',
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <MethodBadge method={c.method} />
                              <StatusBadge status={c.status} />
                            </div>
                            <span className="truncate font-mono text-11 text-text-gray">
                              {c.url.replace('/api/v2', '')}
                            </span>
                          </button>
                        ))}
                      </aside>

                      {/* Detail */}
                      <div className="min-w-0 flex-1 overflow-y-auto p-6 scrollbar-thin">
                        {selected ? (
                          <CallDetail call={selected} />
                        ) : (
                          <p className="py-10 text-center text-sm text-text-gray">
                            {t('inspector.noCall')}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}

function CallDetail({ call }: { call: ApiCall }) {
  const { t } = useTranslation()
  const endpoint = resolveEndpoint(call.method, call.url)

  return (
    <div className="space-y-5">
      {/* Request line */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <MethodBadge method={call.method} />
          <StatusBadge status={call.status} />
          <span className="text-13 text-text-gray">{call.durationMs} ms · {fmtTime(call.startedAt)}</span>
        </div>
        <code className="block break-all rounded-lg bg-cream px-3 py-2 font-mono text-13 text-dark-blue">
          {call.fullUrl}
        </code>
        {endpoint && (
          <p className="text-13 text-text-gray">
            <span className="chip mr-2">{endpoint.tag}</span>
            {endpoint.summary || endpoint.operationId}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <CopyButton text={JSON.stringify(call.response, null, 2)} label={t('common.copyJson')} />
        <CopyButton text={toCurl(call)} label={t('common.copyCurl')} />
        {endpoint && (
          <a href={docUrlFor(endpoint)} target="_blank" rel="noreferrer" className="btn-ghost">
            <ArrowTopRightOnSquareIcon className="size-4" />
            {t('common.viewDocs')}
          </a>
        )}
      </div>

      {/* Params */}
      {call.params && Object.keys(call.params).length > 0 && (
        <section>
          <h4 className="mb-2 text-13 font-bold text-dark-blue">{t('inspector.request')}</h4>
          <JsonViewer data={call.params} />
        </section>
      )}

      {/* Response */}
      <section>
        <h4 className="mb-2 text-13 font-bold text-dark-blue">{t('inspector.response')}</h4>
        {call.error && <p className="mb-2 text-13 text-red">{call.error}</p>}
        <JsonViewer data={call.response} />
      </section>
    </div>
  )
}
