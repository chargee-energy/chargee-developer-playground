import { Fragment, type ReactNode } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useTranslation } from 'react-i18next'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  /** Rendered in the header, right of the title (e.g. action buttons). */
  headerAction?: ReactNode
  children: ReactNode
}

/** Reusable right-side slide-over panel. */
export function Drawer({ open, onClose, title, subtitle, headerAction, children }: DrawerProps) {
  const { t } = useTranslation()
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
              <Dialog.Panel className="pointer-events-auto w-screen max-w-xl">
                <div className="flex h-full flex-col bg-white shadow-xl">
                  <div className="flex items-start justify-between gap-3 border-b border-beige-2 px-6 py-5">
                    <div className="min-w-0">
                      <Dialog.Title className="truncate text-2xl font-extrabold text-dark-blue">
                        {title}
                      </Dialog.Title>
                      {subtitle && <div className="mt-0.5 text-13 text-text-gray">{subtitle}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {headerAction}
                      <button onClick={onClose} className="btn-ghost" aria-label={t('common.close')}>
                        <XMarkIcon className="size-5" />
                      </button>
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-6 scrollbar-thin">{children}</div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
