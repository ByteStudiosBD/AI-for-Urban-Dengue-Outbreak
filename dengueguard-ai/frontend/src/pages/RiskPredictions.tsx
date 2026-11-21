import { Info } from 'lucide-react'
import { DriverPanel } from '@/components/dashboard/DriverPanel'
import { IntervalScale } from '@/components/IntervalScale'
import { RiskBadge, TIER_COLOR } from '@/components/RiskBadge'
import { Card, CardHeader } from '@/components/ui/card'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { Tooltip } from '@/components/ui/tooltip'
import { useI18n, type TKey } from '@/i18n'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useFilters, useMetadata } from '@/state/AppData'

const INPUT_ROWS: Array<{ key: string; label: TKey | string; unit: string; digits: number }> = [
  { key: 'rainfall_mm', label: 'weather.weekOf', unit: 'mm', digits: 1 },
  { key: 'rain_lag1', label: 't−1', unit: 'mm', digits: 1 },
  { key: 'rain_lag2', label: 't−2', unit: 'mm', digits: 1 },
  { key: 'rain_lag3', label: 't−3', unit: 'mm', digits: 1 },
  { key: 'rain_lag4', label: 't−4', unit: 'mm', digits: 1 },
  { key: 'rain_sum_lag1_4', label: 'weather.sumLag', unit: 'mm', digits: 1 },
  { key: 'temp_mean_4w', label: 'weather.tempMean', unit: '°C', digits: 1 },
  { key: 'humidity_mean_4w', label: 'weather.humMean', unit: '%', digits: 0 },
]

export default function RiskPredictions() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const { city, ward, asOf, h, set } = useFilters()
  const q = useAsync(() => api.predictHorizons(ward, asOf), [ward, asOf])
  const preds = q.data?.predictions ?? []
  const sel = preds.find((p) => p.horizon_weeks === h)
  const tiers = meta!.risk_tiers
  const max = Math.max(tiers.thresholds_cases.critical + 4, ...preds.map((p) => Math.max(p.interval.upper, p.actual_cases ?? 0) + 1))
  const label = (k: string) => (k.includes('.') ? t(k as TKey) : k)

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">{t('pred.subtitle', { ward, city })} · {t('top.asOf')} {fmtDate(asOf, 'long')}</p>

      <section className="grid gap-4 md:grid-cols-3" aria-label={t('pred.compare')}>
        {q.loading && !q.data
          ? [0, 1, 2].map((i) => <Card key={i}><LoadingBlock className="h-32" /></Card>)
          : preds.map((p) => (
              <button
                key={p.horizon_weeks}
                onClick={() => set({ h: p.horizon_weeks })}
                aria-pressed={p.horizon_weeks === h}
                className={cn(
                  'group flex flex-col gap-3 rounded-2xl border bg-panel p-5 text-left transition-[transform,border-color,box-shadow] duration-200 ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]',
                  p.horizon_weeks === h ? 'border-accent/70' : 'border-line-soft hover:border-line',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">{t('top.weeksAhead', { n: p.horizon_weeks })}</span>
                  <RiskBadge tier={p.risk_tier} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="num text-4xl font-semibold tracking-[-0.03em]">{fmtNum(p.predicted_cases, 1)}</span>
                  <span className="text-sm text-muted">{t('common.casesPerWeek')}</span>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-muted">{t('common.target')}</dt><dd className="num font-medium">{fmtDate(p.target_date, 'long')}</dd></div>
                  <div><dt className="text-muted">{t('common.interval')}</dt><dd className="num font-medium">{fmtNum(p.interval.lower, 1)} – {fmtNum(p.interval.upper, 1)}</dd></div>
                  <div><dt className="text-muted">{t('risk.score')}</dt><dd className="num font-medium">{fmtNum(p.risk_score, 0)} / 100</dd></div>
                  <div><dt className="text-muted">{t('common.actual')}</dt><dd className="num font-medium">{p.actual_cases === null ? t('common.notObserved') : fmtNum(p.actual_cases)}</dd></div>
                </dl>
                <Tooltip content={t(`status.${p.evaluation_status}Hint` as TKey)}>
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                    <Info className="size-3" /> {t(`status.${p.evaluation_status}` as TKey)}
                  </span>
                </Tooltip>
              </button>
            ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card interactive={false}>
          <CardHeader title={t('pred.compare')} sub={t('pred.compareSub')} />
          {preds.length > 0 && <IntervalScale predictions={preds} tiers={tiers} max={max} />}
          <p className="mt-5 border-t border-line-soft pt-4 text-xs leading-relaxed text-muted">{t('pred.intervalWhat')}</p>
        </Card>
        <Card>
          <CardHeader title={t('pred.driverFor', { h })} sub={t('dash.driversSub')} />
          {sel?.drivers ? <DriverPanel drivers={sel.drivers} /> : <LoadingBlock className="h-40" />}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title={t('pred.inputs')} sub={t('pred.inputsSub')} />
          {sel?.drivers && (() => {
            const f = Object.assign({}, ...sel.drivers.map((d) => d.features)) as Record<string, number>
            return (
              <table className="w-full text-sm">
                <tbody>
                  {INPUT_ROWS.map((r) => (
                    <tr key={r.key} className="border-b border-line-soft last:border-0">
                      <th scope="row" className="py-2 text-left font-normal text-muted">{label(r.label)}{r.key === 'rainfall_mm' ? ` ${fmtDate(asOf)}` : ''}</th>
                      <td className="num py-2 text-right font-semibold">{fmtNum(f[r.key], r.digits)} <span className="text-xs font-normal text-muted">{r.unit}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}
        </Card>
        <Card>
          <CardHeader title={t('pred.provenance')} />
          <p className="text-sm leading-relaxed text-muted">{t('pred.provenanceText', { date: fmtDate(asOf, 'long') })}</p>
          {sel && (
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line-soft pt-4 text-sm">
              <div><dt className="text-xs text-muted">{t('pred.model')}</dt><dd className="font-mono text-xs font-semibold">{sel.model}</dd></div>
              <div><dt className="text-xs text-muted">{t('pred.evalStatus')}</dt><dd className="text-xs font-semibold">{t(`status.${sel.evaluation_status}` as TKey)}</dd></div>
              {sel.test_metrics && <>
                <div><dt className="text-xs text-muted">{t('pred.testError')} · MAE</dt><dd className="num font-semibold">{fmtNum(sel.test_metrics.mae, 2)}</dd></div>
                <div><dt className="text-xs text-muted">RMSE</dt><dd className="num font-semibold">{fmtNum(sel.test_metrics.rmse, 2)}</dd></div>
              </>}
            </dl>
          )}
        </Card>
        <Card>
          <CardHeader title={t('pred.tierRule')} />
          <ul className="flex flex-col gap-2 text-sm">
            {(['Low', 'Medium', 'High', 'Critical'] as const).map((tier, i) => {
              const th = tiers.thresholds_cases
              const range = [`< ${th.medium}`, `${th.medium} – ${th.high}`, `${th.high} – ${th.critical}`, `≥ ${th.critical}`][i]
              return (
                <li key={tier} className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: TIER_COLOR[tier] }} />{t(`risk.${tier}`)}</span>
                  <span className="num text-muted">{range} {t('common.casesPerWeek')}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 border-t border-line-soft pt-3 text-[11px] leading-relaxed text-faint">{tiers.basis}. {tiers.disclaimer}</p>
          <p className="mt-2 font-mono text-[11px] text-faint">{tiers.score_formula}</p>
        </Card>
      </div>
    </div>
  )
}
