import { Info } from 'lucide-react'
import { useState } from 'react'
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TooltipBox } from '@/components/charts/ChartTooltip'
import { ANIM_MS, axisProps, C } from '@/components/charts/theme'
import { Card, CardHeader } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { useAsync } from '@/lib/useAsync'
import { addWeeks } from '@/lib/utils'
import { api } from '@/services/api'
import { useFilters } from '@/state/AppData'

const LAG_COLORS = ['#7FA8F5', '#5B8DEF', '#3F6FD1', '#2F549F']

export default function WeatherData() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { ward, asOf } = useFilters()
  const [weeks, setWeeks] = useState('26')
  const [lagShown, setLagShown] = useState<number[]>([2, 3])
  const lags = useAsync(() => api.weatherLags(ward, asOf, Number(weeks)), [ward, asOf, weeks])
  const obs = useAsync(() => api.observations({ ward_id: ward, from: addWeeks(asOf, -Number(weeks) + 1), to: asOf }), [ward, asOf, weeks])

  if (lags.error) return <ErrorState error={lags.error} onRetry={lags.retry} />
  const series = lags.data?.series ?? []
  const tempRows = obs.data?.observations ?? []

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('weather.subtitle', { ward })} · {t('top.asOf')} {fmtDate(asOf, 'long')}</p>
        <Select label={t('weather.range')} value={weeks} onValueChange={setWeeks}
          options={['12', '26', '52'].map((w) => ({ value: w, label: t('weather.weeks', { n: w }) }))} className="w-40" />
      </div>

      <Card interactive={false}>
        <CardHeader
          title={t('weather.rainTitle')}
          sub={`${t("weather.rainSub")} · mm`}
          action={
            <div role="group" aria-label={t('weather.lagWeeks')} className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4].map((k) => {
                const on = lagShown.includes(k)
                return (
                  <button key={k} aria-pressed={on} onClick={() => setLagShown((s) => (on ? s.filter((x) => x !== k) : [...s, k]))}
                    className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors duration-150"
                    style={{ borderColor: on ? LAG_COLORS[k - 1] : 'var(--color-line)', color: on ? 'var(--color-ink)' : 'var(--color-muted)' }}>
                    <span className="h-0.5 w-3 rounded" style={{ background: LAG_COLORS[k - 1] }} />t−{k}
                  </button>
                )
              })}
            </div>
          }
        />
        {lags.loading && !lags.data ? <LoadingBlock className="h-72" /> : (
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => fmtDate(d)} minTickGap={24} />
                <YAxis {...axisProps} width={48} />
                <Tooltip cursor={{ fill: 'var(--color-chart-cursor)' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const r = payload[0].payload as (typeof series)[number]
                  return <TooltipBox title={`${t('weather.weekOf')} ${fmtDate(r.date, 'long')}`} rows={[
                    { label: t('dash.rain'), value: `${fmtNum(r.rainfall_mm, 1)} mm`, color: C.accent },
                    ...[1, 2, 3, 4].filter((k) => lagShown.includes(k)).map((k) => ({
                      label: `t−${k}`, value: `${fmtNum(r[`rain_lag${k}` as 'rain_lag1'], 1)} mm`, color: LAG_COLORS[k - 1],
                    })),
                    { label: t('weather.sum4'), value: `${fmtNum(r.rain_sum_4w, 1)} mm` },
                  ]} />
                }} />
                <Bar dataKey="rainfall_mm" fill={C.accent} fillOpacity={0.75} radius={[3, 3, 0, 0]} maxBarSize={14} animationDuration={ANIM_MS} />
                {[1, 2, 3, 4].filter((k) => lagShown.includes(k)).map((k) => (
                  <Line key={k} type="monotone" dataKey={`rain_lag${k}`} stroke={LAG_COLORS[k - 1]} strokeWidth={2} dot={false} animationDuration={ANIM_MS} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('weather.tempTitle')} sub={`°C · ${t('weather.avg')} / ${t('weather.max')} / ${t('weather.min')}`} />
          {obs.loading && !obs.data ? <LoadingBlock className="h-56" /> : obs.error ? <ErrorState error={obs.error} onRetry={obs.retry} /> : (
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={tempRows} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => fmtDate(d)} minTickGap={24} />
                  <YAxis {...axisProps} width={40} domain={['dataMin - 2', 'dataMax + 2']} tickFormatter={(v) => fmtNum(v)} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const r = payload[0].payload as (typeof tempRows)[number]
                    return <TooltipBox title={fmtDate(r.date, 'long')} rows={[
                      { label: t('weather.max'), value: `${fmtNum(r.max_temp_c, 1)} °C`, color: C.accent },
                      { label: t('weather.avg'), value: `${fmtNum(r.avg_temp_c, 1)} °C`, color: C.temp },
                      { label: t('weather.min'), value: `${fmtNum(r.min_temp_c, 1)} °C`, color: C.muted },
                    ]} />
                  }} />
                  <Line dataKey="max_temp_c" stroke={C.accent} strokeWidth={1.5} dot={false} animationDuration={ANIM_MS} />
                  <Line dataKey="avg_temp_c" stroke={C.temp} strokeWidth={2.5} dot={false} animationDuration={ANIM_MS} />
                  <Line dataKey="min_temp_c" stroke={C.muted} strokeWidth={1.5} dot={false} animationDuration={ANIM_MS} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title={t('weather.humTitle')} sub="%" />
          {lags.loading && !lags.data ? <LoadingBlock className="h-56" /> : (
            <div className="h-56">
              <ResponsiveContainer>
                <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                  <defs>
                    <linearGradient id="hum" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.humidity} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.humidity} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => fmtDate(d)} minTickGap={24} />
                  <YAxis {...axisProps} width={40} domain={[30, 100]} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const r = payload[0].payload as (typeof series)[number]
                    return <TooltipBox title={fmtDate(r.date, 'long')} rows={[{ label: t('dash.humidity'), value: `${fmtNum(r.relative_humidity_pct, 1)} %`, color: C.humidity }]} />
                  }} />
                  <Area dataKey="relative_humidity_pct" stroke={C.humidity} strokeWidth={2} fill="url(#hum)" animationDuration={ANIM_MS} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title={t('weather.lagTable')} sub={`${ward} · ${fmtDate(asOf, 'long')}`} />
          {lags.data && (
            <div className="grid gap-6 sm:grid-cols-2">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] text-muted"><th className="pb-2 font-medium">{t('weather.lagWeeks')}</th><th className="pb-2 font-medium">{t('weather.weekOf')}</th><th className="pb-2 text-right font-medium">{t('dash.rain')}</th></tr></thead>
                <tbody>
                  {lags.data.lags.map((l) => (
                    <tr key={l.lag_weeks} className="border-t border-line-soft">
                      <td className="py-2 font-semibold">t−{l.lag_weeks}</td>
                      <td className="num py-2 text-muted">{fmtDate(l.week)}</td>
                      <td className="num py-2 text-right font-semibold">{fmtNum(l.rainfall_mm, 1)} <span className="text-xs font-normal text-muted">mm</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="flex flex-col text-sm">
                <dt className="pb-2 text-[11px] text-muted">{t('weather.rolling')}</dt>
                {([['sum2', 'rain_sum_2w', 'mm'], ['sum3', 'rain_sum_3w', 'mm'], ['sum4', 'rain_sum_4w', 'mm'], ['sumLag', 'rain_sum_lag1_4', 'mm'], ['tempMean', 'temp_mean_4w', '°C'], ['humMean', 'humidity_mean_4w', '%']] as const).map(([k, f, u]) => (
                  <div key={k} className="flex justify-between border-t border-line-soft py-2">
                    <dt className="text-muted">{t(`weather.${k}`)}</dt>
                    <dd className="num font-semibold">{fmtNum(lags.data!.rolling[f], 1)} <span className="text-xs font-normal text-muted">{u}</span></dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title={t('weather.why')} />
          <p className="flex gap-3 text-sm leading-relaxed text-muted"><Info className="mt-0.5 size-4 shrink-0 text-accent" />{t('weather.whyText')}</p>
        </Card>
      </div>
    </div>
  )
}
