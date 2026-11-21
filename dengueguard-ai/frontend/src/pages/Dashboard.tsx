import { ArrowRight, CloudRain, Droplets, Thermometer, TriangleAlert, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CaseForecastChart } from '@/components/charts/CaseForecastChart'
import { C } from '@/components/charts/theme'
import { LagRainChart } from '@/components/charts/LagRainChart'
import { DriverPanel } from '@/components/dashboard/DriverPanel'
import { Watchlist, WatchlistLink } from '@/components/dashboard/Watchlist'
import { RiskBadge } from '@/components/RiskBadge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { ErrorState, LoadingBlock, Skeleton } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { useAsync } from '@/lib/useAsync'
import { addWeeks } from '@/lib/utils'
import { api } from '@/services/api'
import { useFilters, useMetadata } from '@/state/AppData'

function Kpi({ label, icon, children, foot }: { label: string; icon: React.ReactNode; children: React.ReactNode; foot?: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">{label}</p>
        <span className="grid size-9 place-items-center rounded-full bg-panel-2 text-ink [&_svg]:size-4">{icon}</span>
      </div>
      <div>{children}</div>
      {foot && <p className="text-xs text-muted">{foot}</p>}
    </Card>
  )
}

export default function Dashboard() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const { city, ward, asOf, h, search } = useFilters()

  const cityObs = useAsync(() => api.observations({ city, from: addWeeks(asOf, -1), to: asOf }), [city, asOf])
  const all = useAsync(() => api.predictAll(city, asOf, h), [city, asOf, h])
  const horizons = useAsync(() => api.predictHorizons(ward, asOf), [ward, asOf])
  const lags = useAsync(() => api.weatherLags(ward, asOf, 26), [ward, asOf])

  const obs = cityObs.data?.observations ?? []
  const thisWeek = obs.find((o) => o.date === asOf)
  const prevWeek = obs.find((o) => o.date === addWeeks(asOf, -1))
  const delta = thisWeek && prevWeek ? thisWeek.dengue_cases - prevWeek.dengue_cases : null
  const sel = horizons.data?.predictions.find((p) => p.horizon_weeks === h)
  const wardInfo = meta?.wards.find((w) => w.ward_id === ward)
  const atRisk = all.data ? all.data.tier_counts.High + all.data.tier_counts.Critical : null

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <p className="text-sm text-muted">{t('dash.subtitle', { city, date: fmtDate(asOf, 'long') })}</p>

        <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4" aria-label="Key figures">
          <Kpi label={t('dash.observedCity')} icon={<Users />} foot={thisWeek ? t('dash.observedCityHint', { city, date: fmtDate(asOf) }) : undefined}>
            {cityObs.loading ? <Skeleton className="h-9 w-20" /> : cityObs.error ? <ErrorState error={cityObs.error} onRetry={cityObs.retry} /> : (
              <div className="flex items-baseline gap-3">
                <span className="num text-3xl font-semibold tracking-[-0.02em]">{fmtNum(thisWeek?.dengue_cases ?? null)}</span>
                {delta !== null && (
                  <span className="num text-xs text-muted">{t('dash.vsPrev', { delta: `${delta > 0 ? '+' : ''}${fmtNum(delta)}` })}</span>
                )}
              </div>
            )}
          </Kpi>
          <Kpi label={t('dash.wardsAtRisk')} icon={<TriangleAlert />} foot={all.data ? t('dash.forecastTarget', { date: fmtDate(all.data.target_date, 'long') }) : undefined}>
            {all.loading ? <Skeleton className="h-9 w-20" /> : all.error ? <ErrorState error={all.error} onRetry={all.retry} /> : (
              <div className="flex items-baseline gap-2">
                <span className="num text-3xl font-semibold tracking-[-0.02em]">{fmtNum(atRisk)}</span>
                <span className="text-xs text-muted">{t('dash.ofWards', { n: all.data?.predictions.length ?? 0 })}</span>
              </div>
            )}
          </Kpi>
          <Kpi label={t('dash.selectedForecast')} icon={<ArrowRight />} foot={sel ? `${ward} · ${t('dash.forecastTarget', { date: fmtDate(sel.target_date, 'long') })}` : undefined}>
            {horizons.loading ? <Skeleton className="h-9 w-28" /> : horizons.error ? <ErrorState error={horizons.error} onRetry={horizons.retry} /> : sel && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="num text-3xl font-semibold tracking-[-0.02em]">{fmtNum(sel.predicted_cases, 1)}</span>
                <RiskBadge tier={sel.risk_tier} />
                <span className="num w-full text-xs text-muted">{t('common.interval')}: {fmtNum(sel.interval.lower, 1)}–{fmtNum(sel.interval.upper, 1)}</span>
              </div>
            )}
          </Kpi>
          <Kpi label={t('dash.weatherNow')} icon={<CloudRain />} foot={ward}>
            {lags.loading ? <Skeleton className="h-9 w-full" /> : lags.error ? <ErrorState error={lags.error} onRetry={lags.retry} /> : lags.data && (
              <dl className="grid grid-cols-3 gap-2 text-sm">
                {[
                  { k: t('dash.rain'), v: `${fmtNum(lags.data.current.rainfall_mm, 1)}`, u: t('common.mm'), i: <CloudRain className="size-3.5" style={{ color: C.rain }} /> },
                  { k: t('dash.temp'), v: fmtNum(lags.data.current.avg_temp_c, 1), u: t('common.celsius'), i: <Thermometer className="size-3.5" style={{ color: C.temp }} /> },
                  { k: t('dash.humidity'), v: fmtNum(lags.data.current.relative_humidity_pct, 0), u: '%', i: <Droplets className="size-3.5" style={{ color: C.humidity }} /> },
                ].map((x) => (
                  <div key={x.k}>
                    <dt className="flex items-center gap-1 text-[11px] text-muted">{x.i}{x.k}</dt>
                    <dd className="num mt-0.5 font-semibold">{x.v}<span className="ml-0.5 text-xs font-normal text-muted">{x.u}</span></dd>
                  </div>
                ))}
              </dl>
            )}
          </Kpi>
        </section>

        <Card interactive={false}>
          <CardHeader
            title={t('dash.chartTitle')}
            sub={t('dash.chartSub', { ward })}
            action={
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-accent" />{t('dash.chartLegendObserved')}</li>
                <li className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-ink" />{t('dash.chartLegendForecast')}</li>
                <li className="flex items-center gap-1.5"><span className="h-3 w-px bg-ink/60" />{t('dash.chartLegendInterval')}</li>
                <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />{t('common.actual')}</li>
                <li className="flex items-center gap-1.5"><span className="h-2.5 w-1.5 rounded-sm" style={{ background: C.rainSoft }} />{t('dash.chartLegendRain')}</li>
              </ul>
            }
          />
          {lags.loading || horizons.loading ? <LoadingBlock className="h-[300px]" /> : lags.error ? <ErrorState error={lags.error} onRetry={lags.retry} /> :
            lags.data && horizons.data && <CaseForecastChart history={lags.data.series} predictions={horizons.data.predictions} />}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title={t('dash.drivers')} sub={t('dash.driversSub')} />
            {horizons.loading ? <LoadingBlock className="h-40" /> : sel?.drivers && <DriverPanel drivers={sel.drivers} />}
          </Card>
          <Card>
            <CardHeader title={t('dash.lagChart')} sub={t('dash.lagChartSub', { ward })} />
            {lags.loading ? <LoadingBlock className="h-40" /> : lags.data && <LagRainChart lags={lags.data.lags} />}
            {wardInfo && (
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line-soft pt-4 text-sm">
                <div><dt className="text-[11px] text-muted">{t('drivers.density')}</dt><dd className="num font-semibold">{fmtNum(wardInfo.population_density_sqkm)}<span className="text-xs font-normal text-muted">{t('drivers.perSqkm')}</span></dd></div>
                <div><dt className="text-[11px] text-muted">{t('drivers.waterlog')}</dt><dd className="num font-semibold">{fmtNum(wardInfo.water_logging_risk_index, 2)}</dd></div>
                <div><dt className="text-[11px] text-muted">{t('drivers.sanitation')}</dt><dd className="num font-semibold">{fmtNum(wardInfo.sanitation_score, 2)}</dd></div>
              </dl>
            )}
          </Card>
        </div>
      </div>

      <aside className="flex flex-col gap-5">
        <Card interactive={false} className="flex flex-col">
          <CardHeader title={t('dash.watchlist')} sub={t('dash.watchlistSub', { h })} action={<WatchlistLink>{t('common.seeAll')}</WatchlistLink>} />
          {all.loading ? <LoadingBlock className="h-96" /> : all.error ? <ErrorState error={all.error} onRetry={all.retry} /> : all.data && <Watchlist predictions={all.data.predictions} limit={10} />}
          <Button asChild variant="light" className="mt-4 w-full justify-between">
            <Link to={{ pathname: '/predictions', search }}>{t('nav.predictions')}<ArrowRight /></Link>
          </Button>
        </Card>
      </aside>
    </div>
  )
}
