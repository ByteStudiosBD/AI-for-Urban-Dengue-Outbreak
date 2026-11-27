import { Activity, ArrowRight, ChartNoAxesCombined, CloudRain, Database, Grid3x3, LayoutDashboard, Radar } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ADVANCED } from '@/components/layout/Sidebar'
import { Card } from '@/components/ui/card'
import { useI18n } from '@/i18n'
import { useFilters } from '@/state/AppData'

const ICONS: Record<string, typeof Radar> = {
  '/risk': Radar, '/dashboard': LayoutDashboard, '/predictions': Activity, '/heatmap': Grid3x3,
  '/weather': CloudRain, '/validation': ChartNoAxesCombined, '/data': Database,
}

/** Hub for the technical Phase 1 tools: forecasting method, intervals, validation, raw data. */
export default function AdvancedAnalysis() {
  const { t } = useI18n()
  const { search } = useFilters()
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-3xl text-sm leading-relaxed text-muted">{t('ux.adv.intro')}</p>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ADVANCED.map((a) => {
          const Icon = ICONS[a.to]
          return (
            <li key={a.to}>
              <Link to={{ pathname: a.to, search }} className="group block h-full rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <Card className="flex h-full flex-col gap-3">
                  <span className="grid size-10 place-items-center rounded-full bg-panel-2 text-ink"><Icon className="size-5" aria-hidden /></span>
                  <h2 className="text-[15px] font-semibold text-ink">{t(a.key)}</h2>
                  <p className="text-sm leading-relaxed text-muted">{t(a.desc)}</p>
                  <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-accent">
                    {t('ux.adv.open')} <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                  </span>
                </Card>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
