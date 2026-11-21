import { Link } from 'react-router-dom'
import { RiskBadge } from '@/components/RiskBadge'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters } from '@/state/AppData'
import type { PredictionResult } from '@/types/api'

export function Watchlist({ predictions, limit }: { predictions: PredictionResult[]; limit?: number }) {
  const { fmtNum, t } = useI18n()
  const { ward, set } = useFilters()
  const rows = limit ? predictions.slice(0, limit) : predictions
  return (
    <ol className="flex flex-col">
      {rows.map((p, i) => (
        <li key={p.ward_id} className="border-b border-line-soft last:border-0">
          <button
            onClick={() => set({ ward: p.ward_id })}
            aria-current={p.ward_id === ward}
            className={cn(
              'group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-150 hover:bg-panel-2',
              p.ward_id === ward && 'bg-panel-2',
            )}
          >
            <span className="num w-5 text-xs text-faint">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className={cn('block truncate rounded-full text-sm font-medium', p.ward_id === ward && 'text-accent')}>{p.ward_id}</span>
              <span className="num text-xs text-muted">
                {fmtNum(p.predicted_cases, 1)} <span className="text-faint">({fmtNum(p.interval.lower, 1)}–{fmtNum(p.interval.upper, 1)})</span> {t('common.cases')}
              </span>
            </span>
            <RiskBadge tier={p.risk_tier} size="sm" />
          </button>
        </li>
      ))}
    </ol>
  )
}

export function WatchlistLink({ children }: { children: React.ReactNode }) {
  const { search } = useFilters()
  return <Link to={{ pathname: '/heatmap', search }} className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline">{children}</Link>
}
