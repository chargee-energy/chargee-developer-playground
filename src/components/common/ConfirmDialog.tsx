import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useTranslation } from 'react-i18next'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  destructive,
  busy,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <Transition.Root show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-dark-blue/30 backdrop-blur-sm" />
        </Transition.Child>
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <Dialog.Panel className="card w-full max-w-md p-6">
              <div className="flex items-start gap-4">
                {destructive && (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red/10">
                    <ExclamationTriangleIcon className="size-5 text-red" />
                  </span>
                )}
                <div className="min-w-0">
                  <Dialog.Title className="text-lg font-bold text-dark-blue">{title}</Dialog.Title>
                  {message && <p className="mt-1 text-sm text-text-gray">{message}</p>}
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button className="btn-secondary" onClick={onClose} disabled={busy}>
                  {t('common.cancel')}
                </button>
                <button
                  className="btn-primary"
                  onClick={onConfirm}
                  disabled={busy}
                  style={destructive ? { backgroundColor: '#FF1F00' } : undefined}
                >
                  {confirmLabel || t('common.confirm')}
                </button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
