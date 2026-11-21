import { AnimatePresence, MotionConfig } from 'motion/react'
import { lazy, Suspense } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { PageTransition } from '@/components/layout/PageTransition'
import { TooltipProvider } from '@/components/ui/tooltip'
import { I18nProvider } from '@/i18n'
import { MetadataProvider, SessionProvider } from '@/state/AppData'

const LandingPage = lazy(() => import('@/pages/LandingPage'))
const LoginPage = lazy(() => import('@/pages/LoginPage'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const RiskPredictions = lazy(() => import('@/pages/RiskPredictions'))
const WardRiskHeatmap = lazy(() => import('@/pages/WardRiskHeatmap'))
const WeatherData = lazy(() => import('@/pages/WeatherData'))
const ModelValidation = lazy(() => import('@/pages/ModelValidation'))
const NotFound = lazy(() => import('@/pages/NotFound'))

export default function App() {
  const location = useLocation()
  return (
    <MotionConfig reducedMotion="user">
      <I18nProvider>
        <SessionProvider>
          <MetadataProvider>
            <TooltipProvider>
              <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
                <AnimatePresence mode="wait" initial={false}>
                  <Routes location={location} key={location.pathname}>
                    <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
                    <Route path="/login" element={<PageTransition><LoginPage /></PageTransition>} />
                    <Route element={<AppShell />}>
                      <Route path="/dashboard" element={<Dashboard />} />
                      <Route path="/predictions" element={<RiskPredictions />} />
                      <Route path="/heatmap" element={<WardRiskHeatmap />} />
                      <Route path="/weather" element={<WeatherData />} />
                      <Route path="/validation" element={<ModelValidation />} />
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Routes>
                </AnimatePresence>
              </Suspense>
            </TooltipProvider>
          </MetadataProvider>
        </SessionProvider>
      </I18nProvider>
    </MotionConfig>
  )
}
