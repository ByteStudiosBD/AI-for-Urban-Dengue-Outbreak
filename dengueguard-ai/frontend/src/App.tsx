import { MotionConfig } from 'motion/react'
import { Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { PageTransition } from '@/components/layout/PageTransition'
import { RouteErrorBoundary } from '@/components/layout/RouteErrorBoundary'
import { TooltipProvider } from '@/components/ui/tooltip'
import { I18nProvider } from '@/i18n'
import { lazyPage } from '@/lib/lazyPage'
import { MetadataProvider, SessionProvider } from '@/state/AppData'

const LandingPage = lazyPage(() => import('@/pages/LandingPage'))
const LoginPage = lazyPage(() => import('@/pages/LoginPage'))
const RiskOverview = lazyPage(() => import('@/pages/RiskOverview'))
const ViewData = lazyPage(() => import('@/pages/ViewData'))
const Dashboard = lazyPage(() => import('@/pages/Dashboard'))
const RiskPredictions = lazyPage(() => import('@/pages/RiskPredictions'))
const WardRiskHeatmap = lazyPage(() => import('@/pages/WardRiskHeatmap'))
const WeatherData = lazyPage(() => import('@/pages/WeatherData'))
const ModelValidation = lazyPage(() => import('@/pages/ModelValidation'))
const NotFound = lazyPage(() => import('@/pages/NotFound'))

// Routes are not keyed by pathname: the app shell (sidebar, top bar) stays mounted
// while moving between dashboard pages, and each page loads inside the shell's own
// Suspense boundary (see AppShell), so a page that is still loading shows a skeleton
// in the content area instead of blanking the whole screen.
export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <I18nProvider>
        <SessionProvider>
          <MetadataProvider>
            <TooltipProvider>
              <RouteErrorBoundary>
                <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
                  <Routes>
                    <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
                    <Route path="/login" element={<PageTransition><LoginPage /></PageTransition>} />
                    <Route element={<AppShell />}>
                      <Route path="/risk" element={<RiskOverview />} />
                      <Route path="/data" element={<ViewData />} />
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/predictions" element={<RiskPredictions />} />
                      <Route path="/heatmap" element={<WardRiskHeatmap />} />
                      <Route path="/weather" element={<WeatherData />} />
                      <Route path="/validation" element={<ModelValidation />} />
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Routes>
                </Suspense>
              </RouteErrorBoundary>
            </TooltipProvider>
          </MetadataProvider>
        </SessionProvider>
      </I18nProvider>
    </MotionConfig>
  )
}
