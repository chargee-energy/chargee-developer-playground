import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useAuthStore } from './store/auth'
import { MainLayout } from './components/layout/MainLayout'
import { LoginPage } from './features/auth/LoginPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { AddressesPage } from './features/addresses/AddressesPage'
import { DevicesPage } from './features/devices/DevicesPage'
import { TelemetryPage } from './features/telemetry/TelemetryPage'
import { SchedulesPage } from './features/schedules/SchedulesPage'
import { FlexPage } from './features/flex/FlexPage'
import { ConsolePage } from './features/console/ConsolePage'
import { WhatsNewPage } from './features/whats-new/WhatsNewPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
})

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuthStore()
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-text-gray">
        Loading…
      </div>
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
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
