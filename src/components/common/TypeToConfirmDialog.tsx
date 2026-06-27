import { Fragment, useEffect, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useTranslation } from 'react-i18next'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'

interface TypeToConfirmDialogProps {
  open: boolean
  title: string
  body: string
  /** The exact word the user must type to enable confirmation (e.g. group name). */
  confirmWord: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}

/** A warning dialog that only enables its action once the user types a word. */
export function TypeToConfirmDialog({
  open,
  title,
  body,
  confirmWord,
  confirmLabel,
  onConfirm,
  onClose,
}: TypeToConfirmDialogProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')

  useEffect(() => {
    if (open) setValue('')
  }, [open])

  const matches = !!confirmWord && value.trim() === confirmWord.trim()

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
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange/10">
                  <ExclamationTriangleIcon className="size-5 text-orange" />
                </span>
                <div className="min-w-0">
                  <Dialog.Title className="text-lg font-bold text-dark-blue">{title}</Dialog.Title>
                  <p className="mt-1 text-sm leading-160 text-text-gray">{body}</p>
                </div>
              </div>

              <div className="mt-5">
                <label className="label" htmlFor="confirm-word">
                  {t('common.groupName')}
                </label>
                <p className="mb-1.5 text-13 text-text-gray">
                  {t('common.typeGroupToConfirm', { name: confirmWord })}
                </p>
                <input
                  id="confirm-word"
                  className="input"
                  value={value}
                  autoComplete="off"
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && matches) onConfirm()
                  }}
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button className="btn-secondary" onClick={onClose}>
                  {t('common.cancel')}
                </button>
                <button className="btn-primary" onClick={onConfirm} disabled={!matches}>
                  {confirmLabel || t('common.continue')}
                </button>
              </div>
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
