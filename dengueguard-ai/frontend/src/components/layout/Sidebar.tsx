import { Activity, ChartNoAxesCombined, CloudRain, Database, Grid3x3, House, LayoutDashboard, LayoutGrid, UserRound, X } from 'lucide-react'
import { motion } from 'motion/react'
import { NavLink, useLocation } from 'react-router-dom'
import { Tooltip } from '@/components/ui/tooltip'
import { useI18n, type TKey } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters, useSession } from '@/state/AppData'
import { Logo } from '@/components/Logo'

export const NAV: Array<{ to: string; key: TKey; icon: typeof House }> = [
  { to: '/', key: 'nav.home', icon: House },
  { to: '/risk', key: 'nav.riskOverview', icon: LayoutGrid },
  { to: '/data', key: 'nav.viewData', icon: Database },
  { to: '/dashboard', key: 'nav.overview', icon: LayoutDashboard },
  { to: '/predictions', key: 'nav.predictions', icon: Activity },
  { to: '/heatmap', key: 'nav.heatmap', icon: Grid3x3 },
  { to: '/weather', key: 'nav.weather', icon: CloudRain },
  { to: '/validation', key: 'nav.validation', icon: ChartNoAxesCombined },
]

function RailLink({ to, label, icon: Icon, search, expanded, onNavigate }: {
  to: string; label: string; icon: typeof House; search: string; expanded: boolean; onNavigate?: () => void
}) {
  const { pathname } = useLocation()
  const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
  const link = (
    <NavLink
      to={{ pathname: to, search: to === '/' ? '' : search }}
      onClick={onNavigate}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-11 items-center gap-3 rounded-xl px-3 transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease-out-expo)]',
        expanded ? 'w-full' : 'w-11 justify-center px-0',
        active ? 'bg-panel-2 text-ink' : 'text-faint hover:-translate-y-px hover:bg-panel hover:text-ink',
      )}
    >
      {active && (
        <motion.span
          layoutId="rail-active"
          transition={{ type: 'spring', stiffness: 520, damping: 40 }}
          className={cn('absolute top-2 bottom-2 w-[3px] rounded-full bg-accent', expanded ? '-left-3' : '-left-[14px]')}
        />
      )}
      <Icon className={cn('size-5 shrink-0 transition-transform duration-[180ms] group-hover:scale-105', active && 'text-accent')} />
      {expanded && <span className="text-sm font-medium">{label}</span>}
    </NavLink>
  )
  return expanded ? link : <Tooltip content={label} side="right">{link}</Tooltip>
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { search } = useFilters()
  const { session } = useSession()
  const profileLabel = session ? t('nav.profile') : t('nav.login')

  const items = (expanded: boolean) => (
    <>
      <nav aria-label={t('nav.mainNav')} className={cn('flex flex-col gap-1.5', expanded ? 'items-stretch' : 'items-center')}>
        {NAV.map((n) => (
          <RailLink key={n.to} to={n.to} label={t(n.key)} icon={n.icon} search={search} expanded={expanded} onNavigate={onClose} />
        ))}
      </nav>
      <div className={cn('mt-auto flex flex-col gap-1.5', expanded ? 'items-stretch' : 'items-center')}>
        <RailLink to="/login" label={profileLabel} icon={UserRound} search={search} expanded={expanded} onNavigate={onClose} />
      </div>
    </>
  )

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[76px] flex-col items-center gap-8 border-r border-line-soft bg-rail py-5 lg:flex">
        <NavLink to="/" aria-label={t('app.name')} className="rounded-xl"><Logo /></NavLink>
        {items(false)}
      </aside>
      {/* mobile / tablet drawer */}
      <div
        className={cn('fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 lg:hidden', mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={onClose}
        aria-hidden
      />
      <aside
        aria-hidden={!mobileOpen}
        inert={!mobileOpen}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-8 border-r border-line bg-rail p-5 transition-transform duration-300 ease-[var(--ease-out-expo)] lg:hidden',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><Logo /><span className="font-semibold">{t('app.name')}</span></div>
          <button onClick={onClose} aria-label={t('nav.closeMenu')} className="rounded-lg p-2 text-muted hover:bg-panel hover:text-ink"><X className="size-5" /></button>
        </div>
        {items(true)}
      </aside>
    </>
  )
}
