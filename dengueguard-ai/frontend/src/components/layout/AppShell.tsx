import { ShieldAlert } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n, type TKey } from '@/i18n'
import { useMetadata } from '@/state/AppData'
import { PageTransition } from './PageTransition'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { SiteFooter } from './SiteFooter'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { AnalysisTabs } from './AnalysisTabs'

const TITLES: Record<string, TKey> = {
  '/risk': 'ro.title', '/data': 'data.title',
  '/dashboard': 'nav.overview', '/predictions': 'nav.predictions', '/heatmap': 'heat.title',
  '/weather': 'nav.weather', '/validation': 'nav.validation',
  '/home': 'nav.home', '/analysis': 'ux.nav.analysis',
  '/allocation': 'ux.nav.supplies', '/overflow': 'ux.nav.beds', '/simulator': 'ux.nav.mosquito', '/dispatch': 'ux.nav.dispatch',
}

export function AppShell() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const { meta, error, retry } = useMetadata()
  const [menu, setMenu] = useState(false)
  const title = t(TITLES[pathname] ?? 'notFound.title')
  useEffect(() => {
    document.title = `${title} · DengueGuard AI`
  }, [title])

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">Skip to content</a>
      <Sidebar mobileOpen={menu} onClose={() => setMenu(false)} />
      <div className="flex min-h-dvh flex-col lg:pl-[88px]">
        <TopBar title={title} onMenu={() => setMenu(true)} />
        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {error ? (
            <ErrorState error={error} onRetry={retry} />
          ) : !meta ? (
            <LoadingBlock className="h-80" />
          ) : (
            <RouteErrorBoundary key={pathname}>
              <AnalysisTabs />
              <Suspense fallback={<LoadingBlock className="h-80" />}>
                <PageTransition key={pathname}>
                  <Outlet />
                </PageTransition>
              </Suspense>
            </RouteErrorBoundary>
          )}
          <p className="mt-10 flex items-start gap-2 border-t border-line-soft pt-4 text-xs text-faint">
            <ShieldAlert className="mt-px size-3.5 shrink-0" /> {t('common.disclaimer')}
          </p>
        </main>
        <SiteFooter />
      </div>
    </div>
  )
}
