import { Bar, CartesianGrid, ComposedChart, ErrorBar, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useI18n } from '@/i18n'
import { addWeeks } from '@/lib/utils'
import type { PredictionResult, WeatherLagResponse } from '@/types/api'
import { TooltipBox } from './ChartTooltip'
import { ANIM_MS, axisProps, C } from './theme'

interface Row {
  date: string
  observed?: number
  rain?: number
  forecast?: number | null
  err?: [number, number]
  lower?: number
  upper?: number
  actualLater?: number | null
  h?: number
}

/** Observed weekly cases up to the reference week, then the model's 2/3/4-week forecasts
 * with their 90% prediction intervals drawn as whiskers (no interpolated band between horizons). */
export function CaseForecastChart({ history, predictions, height = 300 }: {
  history: WeatherLagResponse['series']
  predictions: PredictionResult[]
  height?: number
}) {
  const { t, fmtDate, fmtNum } = useI18n()
  const asOf = history.at(-1)?.date
  const rows: Row[] = history.map((s) => ({ date: s.date, observed: s.dengue_cases, rain: s.rainfall_mm }))
  if (asOf && rows.length) {
    rows[rows.length - 1].forecast = rows[rows.length - 1].observed
    rows.push({ date: addWeeks(asOf, 1), forecast: null })
    for (const p of [...predictions].sort((a, b) => a.horizon_weeks - b.horizon_weeks)) {
      rows.push({
        date: p.target_date, forecast: p.predicted_cases, lower: p.interval.lower, upper: p.interval.upper,
        err: [p.predicted_cases - p.interval.lower, p.interval.upper - p.predicted_cases], actualLater: p.actual_cases, h: p.horizon_weeks,
      })
    }
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 10, right: 4, bottom: 0, left: -18 }}>
          <defs>
            <filter id="glow" x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={(d) => fmtDate(d)} minTickGap={28} />
          <YAxis yAxisId="cases" {...axisProps} allowDecimals={false} width={44} />
          <YAxis yAxisId="rain" orientation="right" {...axisProps} width={36} hide />
          <Tooltip
            cursor={{ stroke: C.line }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const r = payload[0].payload as Row
              const rows: Array<{ label: string; value: string; color?: string }> = []
              if (r.observed !== undefined) rows.push({ label: t('dash.chartLegendObserved'), value: fmtNum(r.observed), color: C.accent })
              if (r.rain !== undefined) rows.push({ label: t('dash.chartLegendRain'), value: fmtNum(r.rain, 1), color: C.rainSoft })
              if (r.h) {
                rows.push({ label: `${t('common.predicted')} (+${r.h})`, value: fmtNum(r.forecast ?? null, 1), color: C.ink })
                rows.push({ label: t('common.interval'), value: `${fmtNum(r.lower, 1)} – ${fmtNum(r.upper, 1)}` })
                rows.push({ label: t('common.actual'), value: r.actualLater === null || r.actualLater === undefined ? t('common.notObserved') : fmtNum(r.actualLater) })
              }
              return rows.length ? <TooltipBox title={fmtDate(r.date, 'long')} rows={rows} /> : null
            }}
          />
          <Bar yAxisId="rain" dataKey="rain" fill={C.rainSoft} fillOpacity={0.35} radius={[3, 3, 0, 0]} maxBarSize={10} animationDuration={ANIM_MS} />
          {asOf && <ReferenceLine yAxisId="cases" x={asOf} stroke={C.muted} strokeDasharray="2 4" />}
          <Line
            yAxisId="cases" type="monotone" dataKey="observed" stroke={C.accent} strokeWidth={2.5} dot={false}
            activeDot={{ r: 5, fill: C.ink, stroke: C.accent, strokeWidth: 2 }} filter="url(#glow)" animationDuration={ANIM_MS}
          />
          <Line
            yAxisId="cases" type="linear" dataKey="forecast" stroke={C.ink} strokeWidth={2} strokeDasharray="5 5" connectNulls
            dot={{ r: 4, fill: C.canvasDot, stroke: C.ink, strokeWidth: 2 }} activeDot={{ r: 6 }} animationDuration={ANIM_MS}
          >
            <ErrorBar dataKey="err" width={8} stroke={C.ink} strokeOpacity={0.55} strokeWidth={1.5} direction="y" />
          </Line>
          <Line yAxisId="cases" dataKey="actualLater" stroke="none" dot={{ r: 3.5, fill: C.accent, stroke: 'none' }} activeDot={false} isAnimationActive={false} legendType="none" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
