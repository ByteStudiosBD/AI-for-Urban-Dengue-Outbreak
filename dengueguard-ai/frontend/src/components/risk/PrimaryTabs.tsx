import { Database, LayoutGrid } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters } from '@/state/AppData'

/** The two primary views: Risk Overview (default) and View Data. Filters carry over via the URL. */
export function PrimaryTabs({ dataSearch }: { dataSearch?: string }) {
  const { t } = useI18n()
  const { search } = useFilters()
  const tabs = [
    { to: '/risk', label: t('nav.riskOverview'), icon: LayoutGrid, search },
    { to: '/data', label: t('nav.viewData'), icon: Database, search: dataSearch ?? search },
  ]
  return (
    <nav aria-label={t('nav.primaryViews')} className="inline-flex w-fit self-start rounded-xl border border-line bg-panel p-1">
      {tabs.map(({ to, label, icon: Icon, search: s }) => (
        <NavLink
          key={to}
          to={{ pathname: to, search: s }}
          className={({ isActive }) => cn(
            'inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors duration-150 [&_svg]:size-4',
            isActive ? 'bg-panel-2 text-ink shadow-[inset_0_0_0_1px_var(--color-line)]' : 'text-muted hover:text-ink',
          )}
        >
          <Icon aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
