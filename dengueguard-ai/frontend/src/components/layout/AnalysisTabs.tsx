import { Microscope } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters } from '@/state/AppData'
import { ADVANCED } from './Sidebar'

/** Secondary navigation shown on the technical pages grouped under Advanced Analysis. */
export function AnalysisTabs() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const { search } = useFilters()
  if (!ADVANCED.some((a) => pathname.startsWith(a.to)) && pathname !== '/analysis') return null
  return (
    <nav aria-label={t('ux.nav.analysis')} className="-mx-4 mb-5 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <ul className="flex w-max items-center gap-1 rounded-xl border border-line-soft bg-panel p-1">
        <li>
          <NavLink to={{ pathname: '/analysis', search }} end
            className={({ isActive }) => cn('flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors duration-150',
              isActive ? 'bg-ink text-canvas' : 'text-muted hover:text-ink')}>
            <Microscope className="size-3.5" aria-hidden /> {t('ux.adv.all')}
          </NavLink>
        </li>
        {ADVANCED.map((a) => (
          <li key={a.to}>
            <NavLink to={{ pathname: a.to, search }}
              className={({ isActive }) => cn('flex h-8 items-center rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition-colors duration-150',
                isActive ? 'bg-ink text-canvas' : 'text-muted hover:text-ink')}>
              {t(a.key)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
