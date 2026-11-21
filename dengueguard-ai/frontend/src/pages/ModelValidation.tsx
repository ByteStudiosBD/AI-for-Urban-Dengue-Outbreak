import { useState } from 'react'
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TooltipBox } from '@/components/charts/ChartTooltip'
import { ANIM_MS, axisProps, C } from '@/components/charts/theme'
import { Card, CardHeader } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n, type TKey } from '@/i18n'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useFilters } from '@/state/AppData'
import type { Horizon } from '@/types/api'

function days(a: string, b: string) {
  return (Date.parse(b) - Date.parse(a)) / 864e5
}

export default function ModelValidation() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { city, ward, h, set } = useFilters()
  const [scope, setScope] = useState<'all' | 'city' | 'ward'>('city')
  const [from, setFrom] = useState('2023-01-01')
  const [to, setTo] = useState('2025-12-31')
  const v = useAsync(() => api.validation(), [])
  const s = useAsync(
    () => api.validationSeries({ horizon_weeks: h, ...(scope === 'city' ? { city } : scope === 'ward' ? { ward_id: ward } : {}), from, to }),
    [h, scope, city, ward, from, to],
  )

  if (v.error) return <ErrorState error={v.error} onRetry={v.retry} />
  if (!v.data) return <LoadingBlock className="h-96" />
  const metrics = v.data.metrics
  const m = metrics.find((x) => x.horizon_weeks === h)!
  const sp = m.split
  const total = days(sp.train.target_from, sp.test.target_to)
  const seg = [
    { k: 'train', label: t('val.train'), r: sp.train, color: '#3a3a48' },
    { k: 'validation', label: t('val.validation'), r: sp.validation, color: '#8a6a2a' },
    { k: 'test', label: t('val.test'), r: sp.test, color: C.accent },
  ]
  const maxImp = Math.max(...metrics.flatMap((x) => Object.values(x.group_importance_val_mae_increase)))
  const valEnd = sp.validation.target_to

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">{t('val.subtitle')}</p>

      <Card interactive={false}>
        <CardHeader title={t('val.timeline')} sub={t('val.splitNote')} />
        <div className="flex h-11 w-full overflow-hidden rounded-xl" role="img" aria-label={seg.map((x) => `${x.label}: ${x.r.target_from} – ${x.r.target_to}`).join('; ')}>
          {seg.map((x) => (
            <div key={x.k} className="flex items-center px-3 text-xs font-semibold" style={{ width: `${(days(x.r.target_from, x.r.target_to) / total) * 100}%`, background: x.color, color: x.k === 'test' ? '#1a0a05' : '#f7f7fb' }}>
              <span className="truncate">{x.label}</span>
            </div>
          ))}
        </div>
        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
          {seg.map((x) => (
            <div key={x.k}>
              <dt className="flex items-center gap-1.5 text-muted"><span className="size-2 rounded-full" style={{ background: x.color }} />{x.label}</dt>
              <dd className="num mt-0.5 font-medium">{fmtDate(x.r.target_from, 'long')} – {fmtDate(x.r.target_to, 'long')} · {fmtNum(x.r.rows)} {t('common.n').toLowerCase()}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <section aria-label={t('val.perHorizon')} className="grid gap-4 md:grid-cols-3">
        {metrics.map((x) => {
          const imp = Math.round((1 - x.test.mae / x.test_baseline_4w_mean.mae) * 100)
          return (
            <button key={x.horizon_weeks} onClick={() => set({ h: x.horizon_weeks as Horizon })} aria-pressed={x.horizon_weeks === h}
              className={cn('flex flex-col gap-3 rounded-2xl border bg-panel p-5 text-left transition-[transform,border-color,box-shadow] duration-200 ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]',
                x.horizon_weeks === h ? 'border-accent/70' : 'border-line-soft hover:border-line')}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">{t('top.weeksAhead', { n: x.horizon_weeks })}</span>
                <span className="font-mono text-[11px] text-faint">{x.model}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted">{t('common.mae')}</p><p className="num text-3xl font-semibold tracking-[-0.02em]">{fmtNum(x.test.mae, 2)}</p></div>
                <div><p className="text-xs text-muted">{t('common.rmse')}</p><p className="num text-3xl font-semibold tracking-[-0.02em]">{fmtNum(x.test.rmse, 2)}</p></div>
              </div>
              <dl className="grid grid-cols-2 gap-2 border-t border-line-soft pt-3 text-xs">
                <div><dt className="text-muted">{t('val.baseline')}</dt><dd className="num font-medium">MAE {fmtNum(x.test_baseline_4w_mean.mae, 2)}</dd></div>
                <div><dt className="text-muted">{t('val.coverage')}</dt><dd className="num font-medium">{fmtNum((x.test.interval_coverage ?? 0) * 100, 1)}% <span className="text-faint">/ 90%</span></dd></div>
                <div><dt className="text-muted">{t('common.n')}</dt><dd className="num font-medium">{fmtNum(x.test.n)}</dd></div>
                <div><dt className="text-muted">{t('val.p90Err')}</dt><dd className="num font-medium">{fmtNum(x.test_abs_error_quantiles['0.9'], 2)}</dd></div>
              </dl>
              <p className="text-xs font-medium text-risk-low">{t('val.improvement', { pct: imp })}</p>
            </button>
          )
        })}
      </section>

      <Card interactive={false}>
        <CardHeader
          title={`${t('val.avp')} · ${t('top.weeksAhead', { n: h })}`}
          sub={`${s.data?.aggregation ?? ''}. ${s.data?.interval_note ?? ''}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Select label={t('val.filterScope')} value={scope} onValueChange={(x) => setScope(x as typeof scope)} className="w-44"
                options={[{ value: 'all', label: t('val.allWards') }, { value: 'city', label: city }, { value: 'ward', label: ward }]} />
              <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs text-muted">{t('val.from')}
                <input type="date" value={from} min="2023-01-01" max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="date-input num bg-transparent text-sm text-ink outline-none" /></label>
              <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-xs text-muted">{t('val.to')}
                <input type="date" value={to} min={from} max="2025-12-31" onChange={(e) => e.target.value && setTo(e.target.value)} className="date-input num bg-transparent text-sm text-ink outline-none" /></label>
            </div>
          }
        />
        {s.error ? <ErrorState error={s.error} onRetry={s.retry} /> : s.loading && !s.data ? <LoadingBlock className="h-80" /> : s.data && (
          <>
            {s.data.metrics && (
              <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div><dt className="text-xs text-muted">{t('common.mae')} ({scope === 'ward' ? ward : scope === 'city' ? city : t('val.allWards')})</dt><dd className="num font-semibold">{fmtNum(s.data.metrics.mae, 2)}</dd></div>
                <div><dt className="text-xs text-muted">{t('common.rmse')}</dt><dd className="num font-semibold">{fmtNum(s.data.metrics.rmse, 2)}</dd></div>
                <div><dt className="text-xs text-muted">{t('common.n')}</dt><dd className="num font-semibold">{fmtNum(s.data.metrics.n)}</dd></div>
                <div><dt className="text-xs text-muted">{t('val.coverage')}</dt><dd className="num font-semibold">{fmtNum(s.data.metrics.interval_coverage * 100, 1)}%</dd></div>
              </dl>
            )}
            <div className="h-80">
              <ResponsiveContainer>
                <ComposedChart data={s.data.series} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  {s.data.series[0] && s.data.series[0].target_date <= valEnd && (
                    <ReferenceArea x1={s.data.series[0].target_date} x2={s.data.series.filter((r) => r.target_date <= valEnd).at(-1)?.target_date} fill="#8a6a2a" fillOpacity={0.1} label={{ value: t('val.validation'), fill: C.muted, fontSize: 11, position: 'insideTopLeft' }} />
                  )}
                  <XAxis dataKey="target_date" {...axisProps} tickFormatter={(d) => fmtDate(d)} minTickGap={28} />
                  <YAxis {...axisProps} width={44} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const r = payload[0].payload as (typeof s.data.series)[number]
                    return <TooltipBox title={`${fmtDate(r.target_date, 'long')} · ${t(`status.${r.split}` as TKey)}`} rows={[
                      { label: t('common.actual'), value: fmtNum(r.actual, 0), color: C.accent },
                      { label: t('common.predicted'), value: fmtNum(r.predicted, 1), color: C.ink },
                      { label: t('common.ward'), value: fmtNum(r.wards) },
                    ]} />
                  }} />
                  <Line dataKey="actual" stroke={C.accent} strokeWidth={2} dot={false} animationDuration={ANIM_MS} />
                  <Line dataKey="predicted" stroke={C.ink} strokeWidth={1.75} strokeDasharray="4 3" dot={false} animationDuration={ANIM_MS} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-2 flex gap-4 text-[11px] text-muted">
              <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-accent" />{t('common.actual')}</li>
              <li className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-ink" />{t('common.predicted')}</li>
            </ul>
          </>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title={t('val.candidates')} sub={t('top.weeksAhead', { n: h })} />
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] text-muted"><th className="pb-2 font-medium">Model</th><th className="pb-2 text-right font-medium">MAE</th><th className="pb-2 text-right font-medium">RMSE</th></tr></thead>
            <tbody>
              {[...Object.entries(m.validation_candidates), ['baseline_4w_mean', m.validation_baseline_4w_mean] as const].map(([name, e]) => (
                <tr key={name} className="border-t border-line-soft">
                  <td className="py-2 font-mono text-xs">{name}{name === m.model && <span className="ml-2 rounded-full bg-accent/15 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-accent">{t('val.chosen')}</span>}</td>
                  <td className="num py-2 text-right">{fmtNum(e.mae, 3)}</td>
                  <td className="num py-2 text-right">{fmtNum(e.rmse, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardHeader title={t('val.importance')} sub={t('val.importanceSub')} />
          <ul className="flex flex-col gap-2.5">
            {Object.entries(m.group_importance_val_mae_increase).sort((a, b) => b[1] - a[1]).map(([g, val]) => (
              <li key={g} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-3 text-sm">
                <span className="truncate text-muted">{t(`drivers.${g}` as TKey)}</span>
                <span className="h-2 rounded-full bg-panel-2"><span className="block h-full rounded-full bg-accent transition-[width] duration-[400ms] ease-[var(--ease-out-expo)]" style={{ width: `${Math.max(0, val / maxImp) * 100}%` }} /></span>
                <span className="num text-right text-xs font-semibold">{val > 0 ? '+' : ''}{fmtNum(val, 2)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title={t('val.byCity')} sub={t('top.weeksAhead', { n: h })} />
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] text-muted"><th className="pb-2 font-medium">{t('common.city')}</th><th className="pb-2 text-right font-medium">MAE</th><th className="pb-2 text-right font-medium">RMSE</th><th className="pb-2 text-right font-medium">n</th></tr></thead>
            <tbody>
              {m.test_by_city.map((c) => (
                <tr key={c.city} className="border-t border-line-soft">
                  <td className="py-2">{c.city}</td>
                  <td className="num py-2 text-right">{fmtNum(c.mae, 2)}</td>
                  <td className="num py-2 text-right">{fmtNum(c.rmse, 2)}</td>
                  <td className="num py-2 text-right text-muted">{fmtNum(c.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card>
        <CardHeader title={t('val.caveats')} />
        <p className="max-w-[75ch] text-sm leading-relaxed text-muted">{t('val.caveatsText')}</p>
        <p className="mt-3 max-w-[75ch] text-xs text-faint">{v.data.interval.method}. {t('val.coverageNote')}</p>
      </Card>
    </div>
  )
}
