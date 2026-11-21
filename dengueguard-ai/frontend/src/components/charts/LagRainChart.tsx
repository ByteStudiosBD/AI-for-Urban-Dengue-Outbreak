import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useI18n } from '@/i18n'
import type { WeatherLag } from '@/types/api'
import { TooltipBox } from './ChartTooltip'
import { ANIM_MS, axisProps, C } from './theme'

export function LagRainChart({ lags, height = 200 }: { lags: WeatherLag[]; height?: number }) {
  const { t, fmtDate, fmtNum } = useI18n()
  const data = lags.map((l) => ({ ...l, label: `t−${l.lag_weeks}` }))
  const max = Math.max(...data.map((d) => d.rainfall_mm ?? 0))
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 18, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} width={44} />
          <Tooltip
            cursor={{ fill: 'var(--color-chart-cursor)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as WeatherLag
              return <TooltipBox title={`${t('weather.lagWeeks')} ${d.lag_weeks} · ${fmtDate(d.week, 'long')}`} rows={[{ label: t('dash.rain'), value: `${fmtNum(d.rainfall_mm, 1)} ${t('common.mm')}`, color: C.rain }]} />
            }}
          />
          <Bar dataKey="rainfall_mm" radius={[6, 6, 0, 0]} maxBarSize={44} animationDuration={ANIM_MS}>
            {data.map((d) => <Cell key={d.lag_weeks} fill={d.rainfall_mm === max && max > 0 ? C.rain : C.rainSoft} />)}
            <LabelList dataKey="rainfall_mm" position="top" fill={C.muted} fontSize={11} formatter={(v) => fmtNum(Number(v), 0)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
