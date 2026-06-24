import { Fragment, useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import {
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  MapPinIcon,
  CpuChipIcon,
  CalendarDaysIcon,
  BoltIcon,
  CommandLineIcon,
} from '@heroicons/react/24/outline'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/auth'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { ContextBar } from './ContextBar'
import { useContextSync } from '@/hooks/useContextSync'
import logo from '@/assets/logo.svg'
import { cn } from '@/utils/cn'

const navigation = [
  { key: 'dashboard', href: '/', icon: HomeIcon },
  { key: 'addresses', href: '/addresses', icon: MapPinIcon },
  { key: 'devices', href: '/devices', icon: CpuChipIcon },
  { key: 'schedules', href: '/schedules', icon: CalendarDaysIcon },
  { key: 'flex', href: '/flex', icon: BoltIcon },
  { key: 'console', href: '/console', icon: CommandLineIcon },
]

export function MainLayout({ children }: { children: React.ReactNode }) {
  useContextSync()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { logout, user } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {navigation.map((item) => {
        const active = location.pathname === item.href
        const Icon = item.icon
        return (
          <Link
            key={item.key}
            to={item.href}
            onClick={onNavigate}
            className={cn(
              'group flex items-center gap-3 rounded-full px-3 py-2.5 text-sm font-semibold transition-colors',
              active ? 'bg-dark-blue text-beige' : 'text-gray-600 hover:bg-gray-100 hover:text-ink',
            )}
          >
            <Icon className="size-5 shrink-0" />
            {t(`navigation.${item.key}`)}
          </Link>
        )
      })}
    </nav>
  )

  const UserBox = () => (
    <div className="flex items-center justify-between gap-2 border-t border-beige-2 p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-dark-blue">{user?.email}</p>
        <button onClick={handleLogout} className="text-13 text-text-gray hover:text-dark-purple">
          {t('auth.signOut')}
        </button>
      </div>
      <LanguageSwitcher />
    </div>
  )

  return (
    <div className="min-h-screen bg-cream">
      {/* Mobile sidebar */}
      <Transition.Root show={sidebarOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50 lg:hidden" onClose={setSidebarOpen}>
          <div className="fixed inset-0 bg-dark-blue/40" />
          <div className="fixed inset-0 z-40 flex">
            <Transition.Child
              as={Fragment}
              enter="transition ease-in-out duration-300 transform"
              enterFrom="-translate-x-full"
              enterTo="translate-x-0"
              leave="transition ease-in-out duration-300 transform"
              leaveFrom="translate-x-0"
              leaveTo="-translate-x-full"
            >
              <Dialog.Panel className="relative flex w-full max-w-xs flex-1 flex-col bg-white">
                <div className="absolute right-0 top-0 -mr-12 pt-2">
                  <button
                    className="flex size-10 items-center justify-center rounded-full"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <XMarkIcon className="size-6 text-white" />
                  </button>
                </div>
                <div className="flex items-center px-4 py-5">
                  <img className="h-8 w-auto" src={logo} alt="Chargee" />
                </div>
                <NavLinks onNavigate={() => setSidebarOpen(false)} />
                <UserBox />
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </Dialog>
      </Transition.Root>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex min-h-0 flex-1 flex-col border-r border-beige-2 bg-white">
          <div className="flex items-center gap-2 px-5 py-5">
            <img className="h-8 w-auto" src={logo} alt="Chargee" />
            <span className="text-13 font-bold text-dark-blue">{t('app.name')}</span>
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto">
            <NavLinks />
          </div>
          <UserBox />
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 flex-col lg:pl-64">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-beige-2 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
          <button
            className="btn-ghost lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label={t('navigation.openSidebar')}
          >
            <Bars3Icon className="size-6" />
          </button>
          <ContextBar />
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
