import { Database, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ComposedChart, ErrorBar, Line, LineChart, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { TooltipBox } from '@/components/charts/ChartTooltip'
import { ANIM_MS, axisProps, C } from '@/components/charts/theme'
import { DriverPanel } from '@/components/dashboard/DriverPanel'
import { RiskBadge } from '@/components/RiskBadge'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n, type TKey } from '@/i18n'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useFilters, useMetadata } from '@/state/AppData'
import type { Horizon } from '@/types/api'
import { OVERVIEW_COLOR_NAME, OVERVIEW_FILL } from './overviewColors'
import { RecordsTable } from './RecordsTable'

type Tab = 'overview' | 'drivers' | 'trends' | 'records'
const TABS: Array<{ id: Tab; key: TKey }> = [
  { id: 'overview', key: 'ro.tabOverview' },
  { id: 'drivers', key: 'ro.tabDrivers' },
  { id: 'trends', key: 'ro.tabTrends' },
  { id: 'records', key: 'ro.tabRecords' },
]

function Stat({ label, value, unit, hint }: { label: string; value: string; unit?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line-soft bg-panel-2/60 px-3 py-2" title={hint}>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="num mt-0.5 text-sm font-semibold text-ink">{value}{unit && <span className="ml-1 text-xs font-normal text-muted">{unit}</span>}</dd>
    </div>
  )
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">{title}</h3>
        {sub && <p className="text-[11px] text-muted">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

/**
 * Everything the app knows about one dataset ward, for the selected reference week and
 * horizon. All numbers come from the API (model inference + original records); nothing is
 * computed or invented here beyond formatting.
 */
export function WardDetailPanel({ wardId, onClose }: { wardId: string; onClose: () => void }) {
  const { t, fmtNum, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const { asOf, h, set, search } = useFilters()
  const [tab, setTab] = useState<Tab>('overview')
  const info = meta?.wards.find((w) => w.ward_id === wardId)

  const preds = useAsync(() => api.predictHorizons(wardId, asOf), [wardId, asOf])
  const lags = useAsync(() => (tab === 'drivers' || tab === 'trends' ? api.weatherLags(wardId, asOf, 52) : null), [wardId, asOf, tab === 'drivers' || tab === 'trends'])
  const cur = preds.data?.predictions.find((p) => p.horizon_weeks === h)

  const trend = useMemo(() => {
    if (!lags.data || !preds.data) return []
    const observed = lags.data.series.map((s) => ({ date: s.date, observed: s.dengue_cases }))
    const fc = preds.data.predictions.map((p) => ({
      date: p.target_date, forecast: p.predicted_cases,
      err: [p.predicted_cases - p.interval.lower, p.interval.upper - p.predicted_cases] as [number, number],
    }))
    return [...observed, ...fc]
  }, [lags.data, preds.data])

  const dataLink = `${search}&dward=${encodeURIComponent(wardId)}`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-line-soft px-5 pt-5 pb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-muted uppercase">{info?.city ?? cur?.city}</p>
          <h2 className="truncate font-mono text-lg font-semibold text-ink">{wardId}</h2>
          <p className="mt-0.5 text-[11px] text-faint">{t('ro.idNote')}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label={t('ro.close')} className="-mr-2 shrink-0"><X /></Button>
      </header>

      <div role="tablist" aria-label={wardId} className="grid grid-cols-4 border-b border-line-soft px-2">
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cn('relative min-w-0 px-1 py-2.5 text-center text-[11px] leading-tight font-semibold transition-colors', tab === x.id ? 'text-ink' : 'text-muted hover:text-ink')}
          >
            {t(x.key)}
            {tab === x.id && <span aria-hidden className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {preds.error ? <ErrorState error={preds.error} onRetry={preds.retry} /> : !preds.data || !cur ? <LoadingBlock className="h-72" /> : (
          <div className="flex flex-col gap-5">
            {tab === 'overview' && (
              <>
                <dl className="grid grid-cols-3 gap-2">
                  <Stat label={t('ro.refWeek')} value={fmtDate(cur.as_of, 'long')} />
                  <Stat label={t('ro.horizon')} value={t('top.weeksAhead', { n: h })} />
                  <Stat label={t('common.target')} value={fmtDate(cur.target_date, 'long')} />
                </dl>

                <div className="rounded-2xl border border-line-soft bg-panel-2/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-muted">{t('ro.exactTier')}</span>
                    <span className="flex items-center gap-1.5 text-[11px] text-faint">
                      <span aria-hidden className="size-2.5 rounded-sm" style={{ background: OVERVIEW_FILL[cur.risk_tier] }} />
                      {t('ro.overviewColor', { color: t(`ro.${OVERVIEW_COLOR_NAME[cur.risk_tier]}`) })}
                    </span>
                  </div>
                  <RiskBadge tier={cur.risk_tier} className="mt-2 px-3 py-1.5 text-sm" />
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[11px] text-muted">{t('ro.predictedCases')}</p>
                      <p className="num text-2xl font-semibold text-ink">{fmtNum(cur.predicted_cases, 1)}</p>
                      <p className="num text-[11px] text-muted">{t('common.interval')}: {fmtNum(cur.interval.lower, 1)}–{fmtNum(cur.interval.upper, 1)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted">{t('ro.score')}</p>
                      <p className="num text-2xl font-semibold text-ink">{fmtNum(cur.risk_score, 0)}<span className="text-sm font-normal text-muted"> / 100</span></p>
                      <div className="mt-1.5 h-1.5 rounded-full bg-panel" aria-hidden>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, cur.risk_score)}%`, background: OVERVIEW_FILL[cur.risk_tier] }} />
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 border-t border-line-soft pt-3 text-xs text-muted">
                    {t('ro.actualTarget')}: <span className="num font-semibold text-ink">{cur.actual_cases === null ? t('common.notObserved') : fmtNum(cur.actual_cases, 0)}</span>
                    <span className="mx-1.5 text-faint">·</span>
                    <span title={t(`status.${cur.evaluation_status}Hint` as TKey)}>{t(`status.${cur.evaluation_status}` as TKey)}</span>
                  </p>
                </div>

                <Section title={t('ro.allHorizons')}>
                  <table className="w-full text-xs">
                    <thead className="text-left text-[11px] text-muted">
                      <tr><th className="pb-1.5 font-medium">{t('common.horizon')}</th><th className="pb-1.5 font-medium">{t('common.target')}</th><th className="pb-1.5 text-right font-medium">{t('common.predicted')}</th><th className="pb-1.5 pl-3 font-medium">{t('risk.tier')}</th></tr>
                    </thead>
                    <tbody>
                      {preds.data.predictions.map((p) => (
                        <tr key={p.horizon_weeks} className={cn('border-t border-line-soft', p.horizon_weeks === h && 'bg-panel-2/70')}>
                          <td className="py-1.5"><button onClick={() => set({ h: p.horizon_weeks as Horizon })} className="rounded font-semibold hover:text-accent" aria-pressed={p.horizon_weeks === h}>+{p.horizon_weeks} {t('common.week').toLowerCase()}</button></td>
                          <td className="num py-1.5 text-muted">{fmtDate(p.target_date)}</td>
                          <td className="num py-1.5 text-right">{fmtNum(p.predicted_cases, 1)} <span className="text-faint">({fmtNum(p.interval.lower, 1)}–{fmtNum(p.interval.upper, 1)})</span></td>
                          <td className="py-1.5 pl-3"><RiskBadge tier={p.risk_tier} size="sm" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              </>
            )}

            {tab === 'drivers' && (
              <>
                <Section title={t('ro.driversTitle', { h })} sub={t('dash.driversSub')}>
                  <DriverPanel drivers={cur.drivers ?? []} />
                </Section>
                {lags.error ? <ErrorState error={lags.error} onRetry={lags.retry} /> : !lags.data ? <LoadingBlock className="h-40" /> : (
                  <>
                    <Section title={t('ro.currentWeather')} sub={fmtDate(lags.data.as_of, 'long')}>
                      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <Stat label={t('ro.rainfall')} value={fmtNum(lags.data.current.rainfall_mm, 1)} unit={t('common.mm')} />
                        <Stat label={t('ro.avgTemp')} value={fmtNum(lags.data.current.avg_temp_c, 1)} unit={t('common.celsius')} />
                        <Stat label={t('ro.humidity')} value={fmtNum(lags.data.current.relative_humidity_pct, 1)} unit={t('common.percent')} />
                        <Stat label={t('ro.maxTemp')} value={fmtNum(lags.data.current.max_temp_c, 1)} unit={t('common.celsius')} />
                        <Stat label={t('ro.minTemp')} value={fmtNum(lags.data.current.min_temp_c, 1)} unit={t('common.celsius')} />
                      </dl>
                    </Section>
                    <Section title={t('ro.lags')}>
                      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {lags.data.lags.map((l) => (
                          <Stat key={l.lag_weeks} label={t('ro.lagN', { n: l.lag_weeks, date: fmtDate(l.week) })} value={fmtNum(l.rainfall_mm, 1)} unit={t('common.mm')} />
                        ))}
                      </dl>
                    </Section>
                    <Section title={t('ro.rolling')}>
                      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <Stat label={t('ro.rain2')} value={fmtNum(lags.data.rolling.rain_sum_2w, 1)} unit={t('common.mm')} />
                        <Stat label={t('ro.rain3')} value={fmtNum(lags.data.rolling.rain_sum_3w, 1)} unit={t('common.mm')} />
                        <Stat label={t('ro.rain4')} value={fmtNum(lags.data.rolling.rain_sum_4w, 1)} unit={t('common.mm')} />
                        <Stat label={t('ro.rainLag14')} value={fmtNum(lags.data.rolling.rain_sum_lag1_4, 1)} unit={t('common.mm')} />
                        <Stat label={t('ro.temp4')} value={fmtNum(lags.data.rolling.temp_mean_4w, 1)} unit={t('common.celsius')} />
                        <Stat label={t('ro.hum4')} value={fmtNum(lags.data.rolling.humidity_mean_4w, 1)} unit={t('common.percent')} />
                      </dl>
                    </Section>
                  </>
                )}
                {info && (
                  <Section title={t('ro.vulnerability')}>
                    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Stat label={t('drivers.density')} value={fmtNum(info.population_density_sqkm, 0)} unit={t('drivers.perSqkm')} hint="population_density_sqkm" />
                      <Stat label={t('drivers.waterlog')} value={String(info.water_logging_risk_index)} hint="water_logging_risk_index" />
                      <Stat label={t('drivers.sanitation')} value={String(info.sanitation_score)} hint="sanitation_score" />
                    </dl>
                  </Section>
                )}
              </>
            )}

            {tab === 'trends' && (lags.error ? <ErrorState error={lags.error} onRetry={lags.retry} /> : !lags.data ? <LoadingBlock className="h-72" /> : (
              <>
                <Section title={t('ro.casesTrend')} sub={t('ro.casesTrendSub')}>
                  <div className="h-52">
                    <ResponsiveContainer>
                      <ComposedChart data={trend} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke={C.grid} vertical={false} />
                        <XAxis dataKey="date" {...axisProps} minTickGap={40} tickFormatter={(d) => fmtDate(d)} />
                        <YAxis {...axisProps} allowDecimals={false} />
                        <Tooltip cursor={{ fill: 'var(--color-chart-cursor)' }} content={({ active, payload }) => active && payload?.length ? (
                          <TooltipBox title={fmtDate(String(payload[0].payload.date), 'long')} rows={payload.filter((p) => p.value !== undefined && p.dataKey !== 'err').map((p) => ({
                            label: p.dataKey === 'observed' ? t('ro.observedCases') : t('ro.forecast'), value: fmtNum(Number(p.value), p.dataKey === 'observed' ? 0 : 1), color: p.dataKey === 'observed' ? C.accent : C.ink,
                          }))} />
                        ) : null} />
                        <Bar dataKey="observed" fill={C.accent} radius={[2, 2, 0, 0]} isAnimationActive animationDuration={ANIM_MS} />
                        <Scatter dataKey="forecast" fill={C.ink} isAnimationActive={false}>
                          <ErrorBar dataKey="err" width={4} stroke={C.muted} direction="y" />
                        </Scatter>
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="flex flex-wrap gap-4 text-[11px] text-muted">
                    <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-sm" style={{ background: C.accent }} />{t('ro.observedCases')}</span>
                    <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ background: C.ink }} />{t('ro.forecast')} · {t('common.interval')}</span>
                  </p>
                </Section>
                <Section title={t('ro.weatherTrend')} sub={t('ro.weatherTrendSub')}>
                  <div className="h-36">
                    <ResponsiveContainer>
                      <BarChart data={lags.data.series} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke={C.grid} vertical={false} />
                        <XAxis dataKey="date" {...axisProps} minTickGap={40} tickFormatter={(d) => fmtDate(d)} />
                        <YAxis {...axisProps} />
                        <Tooltip cursor={{ fill: 'var(--color-chart-cursor)' }} content={({ active, payload }) => active && payload?.length ? (
                          <TooltipBox title={fmtDate(String(payload[0].payload.date), 'long')} rows={[{ label: t('ro.rainfall'), value: `${fmtNum(Number(payload[0].value), 1)} ${t('common.mm')}`, color: C.rain }]} />
                        ) : null} />
                        <Bar dataKey="rainfall_mm" fill={C.rain} radius={[2, 2, 0, 0]} isAnimationActive animationDuration={ANIM_MS} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="h-36">
                    <ResponsiveContainer>
                      <LineChart data={lags.data.series} margin={{ top: 6, right: 0, left: -18, bottom: 0 }}>
                        <CartesianGrid stroke={C.grid} vertical={false} />
                        <XAxis dataKey="date" {...axisProps} minTickGap={40} tickFormatter={(d) => fmtDate(d)} />
                        <YAxis yAxisId="t" {...axisProps} domain={['auto', 'auto']} />
                        <YAxis yAxisId="h" orientation="right" {...axisProps} domain={['auto', 'auto']} />
                        <Tooltip content={({ active, payload }) => active && payload?.length ? (
                          <TooltipBox title={fmtDate(String(payload[0].payload.date), 'long')} rows={[
                            { label: t('ro.avgTemp'), value: `${fmtNum(payload[0].payload.avg_temp_c, 1)} ${t('common.celsius')}`, color: C.temp },
                            { label: t('ro.humidity'), value: `${fmtNum(payload[0].payload.relative_humidity_pct, 1)} ${t('common.percent')}`, color: C.humidity },
                          ]} />
                        ) : null} />
                        <Line yAxisId="t" dataKey="avg_temp_c" stroke={C.temp} dot={false} strokeWidth={1.75} isAnimationActive animationDuration={ANIM_MS} />
                        <Line yAxisId="h" dataKey="relative_humidity_pct" stroke={C.humidity} dot={false} strokeWidth={1.75} isAnimationActive animationDuration={ANIM_MS} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="flex flex-wrap gap-4 text-[11px] text-muted">
                    <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-sm" style={{ background: C.rain }} />{t('ro.rainfall')} ({t('common.mm')})</span>
                    <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ background: C.temp }} />{t('ro.avgTemp')} ({t('common.celsius')})</span>
                    <span className="flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ background: C.humidity }} />{t('ro.humidity')} ({t('common.percent')})</span>
                  </p>
                </Section>
              </>
            ))}

            {tab === 'records' && (
              <Section title={t('ro.tabRecords')} sub={t('ro.recordsSub')}>
                <RecordsTable key={wardId} fixedWard={wardId} compact />
                <Button asChild variant="secondary" size="sm" className="w-fit">
                  <Link to={{ pathname: '/data', search: dataLink }}><Database />{t('ro.openInData')}</Link>
                </Button>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
