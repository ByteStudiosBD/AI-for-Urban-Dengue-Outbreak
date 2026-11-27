import { BedDouble, Boxes, House, Microscope, Send, SprayCan, UserRound, X } from 'lucide-react'
import { motion } from 'motion/react'
import { NavLink, useLocation } from 'react-router-dom'
import { useI18n, type TKey } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters, useSession } from '@/state/AppData'
import { Logo } from '@/components/Logo'

/** Technical Phase 1 pages, grouped under "Advanced Analysis". Routes are unchanged. */
export const ADVANCED: Array<{ to: string; key: TKey; desc: TKey }> = [
  { to: '/risk', key: 'nav.riskOverview', desc: 'ux.adv.risk' },
  { to: '/dashboard', key: 'nav.overview', desc: 'ux.adv.dashboard' },
  { to: '/predictions', key: 'nav.predictions', desc: 'ux.adv.predictions' },
  { to: '/heatmap', key: 'nav.heatmap', desc: 'ux.adv.heatmap' },
  { to: '/weather', key: 'nav.weather', desc: 'ux.adv.weather' },
  { to: '/validation', key: 'nav.validation', desc: 'ux.adv.validation' },
  { to: '/data', key: 'nav.viewData', desc: 'ux.adv.data' },
]

/** Task-based primary navigation for healthcare staff. */
export const NAV: Array<{ to: string; key: TKey; short: TKey; icon: typeof House; match?: string[] }> = [
  { to: '/home', key: 'nav.home', short: 'ux.navShort.home', icon: House },
  { to: '/allocation', key: 'ux.nav.supplies', short: 'ux.navShort.supplies', icon: Boxes },
  { to: '/overflow', key: 'ux.nav.beds', short: 'ux.navShort.beds', icon: BedDouble },
  { to: '/simulator', key: 'ux.nav.mosquito', short: 'ux.navShort.mosquito', icon: SprayCan },
  { to: '/dispatch', key: 'ux.nav.dispatch', short: 'ux.navShort.dispatch', icon: Send },
  { to: '/analysis', key: 'ux.nav.analysis', short: 'ux.navShort.analysis', icon: Microscope, match: ADVANCED.map((a) => a.to) },
]

function RailLink({ to, label, short, icon: Icon, search, expanded, match, onNavigate }: {
  to: string; label: string; short: string; icon: typeof House; search: string; expanded: boolean; match?: string[]; onNavigate?: () => void
}) {
  const { pathname } = useLocation()
  const active = pathname.startsWith(to) || !!match?.some((m) => pathname.startsWith(m))
  return (
    <NavLink
      to={{ pathname: to, search }}
      onClick={onNavigate}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      title={expanded ? undefined : label}
      className={cn(
        'group relative flex items-center rounded-xl transition-[color,background-color,transform] duration-[180ms] ease-[var(--ease-out-expo)]',
        expanded ? 'h-11 w-full gap-3 px-3' : 'w-[72px] flex-col justify-center gap-1 px-1 py-2',
        active ? 'bg-panel-2 text-ink' : 'text-muted hover:-translate-y-px hover:bg-panel hover:text-ink',
      )}
    >
      {active && (
        <motion.span
          layoutId="rail-active"
          transition={{ type: 'spring', stiffness: 520, damping: 40 }}
          className={cn('absolute w-[3px] rounded-full bg-accent', expanded ? 'top-2 bottom-2 -left-3' : 'top-3 bottom-3 -left-[8px]')}
        />
      )}
      <Icon aria-hidden className={cn('size-5 shrink-0 transition-transform duration-[180ms] group-hover:scale-105', active && 'text-accent')} />
      {expanded
        ? <span className="text-sm font-medium">{label}</span>
        : <span aria-hidden className="text-center text-[10.5px] leading-tight font-semibold">{short}</span>}
    </NavLink>
  )
}

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { search } = useFilters()
  const { session } = useSession()
  const profileLabel = session ? t('nav.profile') : t('nav.login')

  const items = (expanded: boolean) => (
    <>
      <nav aria-label={t('nav.mainNav')} className={cn('flex flex-col gap-1', expanded ? 'items-stretch' : 'items-center')}>
        {NAV.map((n) => (
          <RailLink key={n.to} to={n.to} label={t(n.key)} short={t(n.short)} icon={n.icon} match={n.match}
            search={search} expanded={expanded} onNavigate={onClose} />
        ))}
      </nav>
      <div className={cn('mt-auto flex flex-col gap-1.5', expanded ? 'items-stretch' : 'items-center')}>
        <RailLink to="/login" label={profileLabel} short={profileLabel} icon={UserRound} search={search} expanded={expanded} onNavigate={onClose} />
      </div>
    </>
  )

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center gap-6 overflow-y-auto border-r border-line-soft bg-rail py-5 lg:flex">
        <NavLink to={{ pathname: '/home', search }} aria-label={t('app.name')} className="rounded-xl"><Logo /></NavLink>
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
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-8 overflow-y-auto border-r border-line bg-rail p-5 transition-transform duration-300 ease-[var(--ease-out-expo)] lg:hidden',
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
