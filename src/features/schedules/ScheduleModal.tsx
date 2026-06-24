import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { useTranslation } from 'react-i18next'
import { XMarkIcon } from '@heroicons/react/24/outline'
import type { CreateScheduleDto } from '@/api/generated/model'
import { Spinner } from '@/components/common/Spinner'

interface ScheduleModalProps {
  open: boolean
  busy?: boolean
  onClose: () => void
  onSubmit: (dto: CreateScheduleDto) => void
}

export function ScheduleModal({ open, busy, onClose, onSubmit }: ScheduleModalProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'powerlimit' | 'zeroExport'>('powerlimit')
  const [powerLimit, setPowerLimit] = useState(50)
  const [time, setTime] = useState('')

  const submit = () => {
    const iso = time ? new Date(time).toISOString() : new Date().toISOString()
    const dto =
      mode === 'powerlimit'
        ? ({ powerlimit: powerLimit, time: iso } as unknown as CreateScheduleDto)
        : ({ zeroExport: true, time: iso } as unknown as CreateScheduleDto)
    onSubmit(dto)
  }

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
          <Dialog.Panel className="card w-full max-w-md p-6">
            <div className="mb-4 flex items-start justify-between">
              <Dialog.Title className="text-lg font-bold text-dark-blue">
                {t('schedules.createTitle')}
              </Dialog.Title>
              <button className="btn-ghost" onClick={onClose}>
                <XMarkIcon className="size-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">{t('schedules.mode')}</label>
                <div className="flex gap-2">
                  <button
                    className={mode === 'powerlimit' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}
                    onClick={() => setMode('powerlimit')}
                  >
                    {t('schedules.powerLimit')}
                  </button>
                  <button
                    className={mode === 'zeroExport' ? 'btn-primary flex-1' : 'btn-secondary flex-1'}
                    onClick={() => setMode('zeroExport')}
                  >
                    {t('schedules.zeroExport')}
                  </button>
                </div>
              </div>

              {mode === 'powerlimit' && (
                <div>
                  <label className="label" htmlFor="pl">
                    {t('schedules.powerLimit')}
                  </label>
                  <input
                    id="pl"
                    type="number"
                    min={0}
                    max={100}
                    className="input"
                    value={powerLimit}
                    onChange={(e) => setPowerLimit(Number(e.target.value))}
                  />
                </div>
              )}

              <div>
                <label className="label" htmlFor="time">
                  {t('schedules.time')}
                </label>
                <input
                  id="time"
                  type="datetime-local"
                  className="input"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>

              <p className="text-11 text-text-gray">{t('schedules.noUpdateNote')}</p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button className="btn-secondary" onClick={onClose} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button className="btn-primary" onClick={submit} disabled={busy}>
                {busy && <Spinner className="size-4 border-beige border-t-white" />}
                {t('common.create')}
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </Transition.Root>
  )
}
