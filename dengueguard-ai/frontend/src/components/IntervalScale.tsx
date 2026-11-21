import { TIER_COLOR } from '@/components/RiskBadge'
import { useI18n } from '@/i18n'
import type { PredictionResult, RiskTierConfig } from '@/types/api'

/** One horizontal scale per horizon: tier zones in the background, the 90% prediction
 * interval as a bar, the point forecast as a tick, and the later-observed actual (if any). */
export function IntervalScale({ predictions, tiers, max }: { predictions: PredictionResult[]; tiers: RiskTierConfig; max: number }) {
  const { t, fmtNum, fmtDate } = useI18n()
  const th = tiers.thresholds_cases
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  const zones = [
    { tier: 'Low' as const, from: 0, to: th.medium },
    { tier: 'Medium' as const, from: th.medium, to: th.high },
    { tier: 'High' as const, from: th.high, to: th.critical },
    { tier: 'Critical' as const, from: th.critical, to: max },
  ]
  const ticks = [0, th.medium, th.high, th.critical, Math.round(max)]
  return (
    <div className="flex flex-col gap-5">
      {predictions.map((p) => (
        <div key={p.horizon_weeks} className="grid grid-cols-[4.5rem_1fr] items-center gap-4">
          <div>
            <p className="text-sm font-semibold">+{p.horizon_weeks} {t('common.week').toLowerCase()}</p>
            <p className="num text-[11px] text-muted">{fmtDate(p.target_date)}</p>
          </div>
          <div className="relative h-9" role="img" aria-label={`${t('common.predicted')} ${fmtNum(p.predicted_cases, 1)}, ${t('common.interval')} ${fmtNum(p.interval.lower, 1)}–${fmtNum(p.interval.upper, 1)}`}>
            <div className="absolute inset-x-0 top-3 flex h-3 overflow-hidden rounded-full">
              {zones.map((z) => (
                <span key={z.tier} style={{ width: `${((Math.min(z.to, max) - z.from) / max) * 100}%`, background: `color-mix(in oklab, ${TIER_COLOR[z.tier]} 16%, transparent)` }} />
              ))}
            </div>
            <span
              className="absolute top-[13px] h-2.5 rounded-full bg-ink/80 transition-[left,width] duration-[400ms] ease-[var(--ease-out-expo)]"
              style={{ left: pos(p.interval.lower), width: `calc(${pos(p.interval.upper)} - ${pos(p.interval.lower)})` }}
            />
            <span
              className="absolute top-1 h-7 w-[3px] -translate-x-1/2 rounded-full transition-[left] duration-[400ms] ease-[var(--ease-out-expo)]"
              style={{ left: pos(p.predicted_cases), background: TIER_COLOR[p.risk_tier] }}
            />
            {p.actual_cases !== null && (
              <span className="absolute top-[11px] size-3.5 -translate-x-1/2 rounded-full border-2 border-canvas bg-accent" style={{ left: pos(p.actual_cases) }} title={`${t('common.actual')}: ${p.actual_cases}`} />
            )}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[4.5rem_1fr] gap-4">
        <span />
        <div className="relative h-4 text-[10px] text-faint">
          {ticks.map((v) => <span key={v} className="num absolute -translate-x-1/2" style={{ left: pos(v) }}>{v}</span>)}
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <li className="flex items-center gap-1.5"><span className="h-3 w-[3px] rounded bg-risk-high" />{t('common.predicted')}</li>
        <li className="flex items-center gap-1.5"><span className="h-2 w-5 rounded-full bg-ink/80" />{t('common.interval')}</li>
        <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-accent" />{t('common.actual')}</li>
      </ul>
    </div>
  )
}
