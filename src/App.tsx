import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useAuthStore } from './store/auth'
import { MainLayout } from './components/layout/MainLayout'
import { Spinner } from './components/common/Spinner'

// Route components are lazy-loaded so heavy deps (e.g. charts) only ship in
// the chunks that use them, keeping the initial bundle small.
const LoginPage = lazy(() => import('./features/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const AddressesPage = lazy(() => import('./features/addresses/AddressesPage').then((m) => ({ default: m.AddressesPage })))
const DevicesPage = lazy(() => import('./features/devices/DevicesPage').then((m) => ({ default: m.DevicesPage })))
const TelemetryPage = lazy(() => import('./features/telemetry/TelemetryPage').then((m) => ({ default: m.TelemetryPage })))
const SchedulesPage = lazy(() => import('./features/schedules/SchedulesPage').then((m) => ({ default: m.SchedulesPage })))
const FlexPage = lazy(() => import('./features/flex/FlexPage').then((m) => ({ default: m.FlexPage })))
const ConsolePage = lazy(() => import('./features/console/ConsolePage').then((m) => ({ default: m.ConsolePage })))
const WhatsNewPage = lazy(() => import('./features/whats-new/WhatsNewPage').then((m) => ({ default: m.WhatsNewPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
})

function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner />
    </div>
  )
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuthStore()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-text-gray">Loading…</div>
    )
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap)
  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <PrivateRoute>
                  <MainLayout>
                    <Routes>
                      <Route path="/" element={<DashboardPage />} />
                      <Route path="/addresses" element={<AddressesPage />} />
                      <Route path="/devices" element={<DevicesPage />} />
                      <Route path="/telemetry" element={<TelemetryPage />} />
                      <Route path="/schedules" element={<SchedulesPage />} />
                      <Route path="/flex" element={<FlexPage />} />
                      <Route path="/console" element={<ConsolePage />} />
                      <Route path="/whats-new" element={<WhatsNewPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </MainLayout>
                </PrivateRoute>
              }
            />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
