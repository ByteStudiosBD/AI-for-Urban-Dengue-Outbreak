import { BedDouble, Droplets, Minus, Plus, ShieldPlus, SprayCan } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { TooltipBox } from '@/components/charts/ChartTooltip'
import { ANIM_MS, axisProps, C } from '@/components/charts/theme'
import { AssumptionNote, Kpi, ScenarioPanel, Segmented } from '@/components/ops/controls'
import { RiskBadge } from '@/components/RiskBadge'
import { Card, CardHeader } from '@/components/ui/card'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useOps, usePlan } from '@/state/Ops'

type Metric = 'cases' | 'beds' | 'saline'

export default function InterventionSimulator() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { controls, setControls } = useOps()
  const q = usePlan()
  const p = q.data
  const [metric, setMetric] = useState<Metric>('cases')
  const [showAll, setShowAll] = useState(false)
  const manual = controls.deployment !== null
  const dep = controls.deployment ?? {}
  const used = Object.values(dep).reduce((a, b) => a + b, 0)

  const chart = useMemo(() => (p?.simulation.per_horizon ?? []).map((h) => ({
    name: t('top.weeksAhead', { n: h.horizon_weeks }), date: h.target_date,
    baseline: metric === 'cases' ? h.cases_baseline : metric === 'beds' ? h.beds_baseline : h.saline_baseline,
    scenario: metric === 'cases' ? h.cases_scenario : metric === 'beds' ? h.beds_scenario : h.saline_scenario,
  })), [p, metric, t])

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const sim = p?.simulation
  const beds = sim?.per_horizon.reduce((a, h) => a + h.beds_baseline - h.beds_scenario, 0) ?? 0
  const saline = sim?.per_horizon.reduce((a, h) => a + h.saline_baseline - h.saline_scenario, 0) ?? 0
  const ranking = (sim?.ranking ?? []).filter((r) => p!.scenario.city === null || r.city === p!.scenario.city)
  const visible = showAll ? ranking : ranking.slice(0, 15)

  const setMode = (m: 'optimised' | 'manual') => {
    if (m === 'optimised') setControls({ deployment: null })
    else setControls({ deployment: Object.fromEntries((p?.wards ?? []).filter((w) => w.crews > 0).map((w) => [w.ward_id, w.crews])) })
  }
  const bump = (ward: string, d: number) => {
    const next = { ...dep, [ward]: Math.max(0, Math.min(controls.max_crews_per_ward, (dep[ward] ?? 0) + d)) }
    if (!next[ward]) delete next[ward]
    setControls({ deployment: next })
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <ScenarioPanel show={['pool', 'crews', 'effect', 'maxCrews', 'basis']}
        footer={
          <div className="flex flex-col gap-2">
            <Segmented label={t('ops.sim.mode')} value={manual ? 'manual' : 'optimised'} onChange={setMode}
              options={[{ value: 'optimised', label: t('ops.sim.optimised') }, { value: 'manual', label: t('ops.sim.manual') }]} />
            <p className="text-[11px] leading-relaxed text-faint">{manual ? t('ops.sim.manualHint', { used, total: controls.total_crews }) : t('ops.sim.optimisedHint')}</p>
          </div>
        } />

      <div className={cn('flex min-w-0 flex-col gap-5 transition-opacity duration-200', q.pending && p && 'opacity-70')}>
        <p className="text-sm text-muted">{p ? t('ops.sim.subtitle', { date: fmtDate(p.scenario.as_of, 'long') }) : t('common.loading')}</p>
        <AssumptionNote kind="scenario">{t('ops.sim.label', { e: controls.effect_per_crew_pct })}</AssumptionNote>
        {manual && used > controls.total_crews && (
          <p role="alert" className="rounded-xl border border-risk-critical/40 bg-risk-critical/8 px-3 py-2 text-xs font-medium text-ink">{t('ops.sim.overBudget', { used, total: controls.total_crews })}</p>
        )}

        <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4" aria-label={t('ops.sim.kpis')}>
          {!sim ? [0, 1, 2, 3].map((i) => <Card key={i}><LoadingBlock className="h-24" /></Card>) : <>
            <Kpi label={t('ops.sim.prevented')} icon={<ShieldPlus />} tone={sim.total_cases_prevented > 0 ? 'good' : undefined} value={fmtNum(sim.total_cases_prevented, 1)} sub={t('ops.sim.preventedSub')} />
            <Kpi label={t('ops.sim.roi')} icon={<SprayCan />} value={sim.roi_cases_per_crew === null ? '—' : fmtNum(sim.roi_cases_per_crew, 2)} sub={t('ops.sim.roiSub', { n: p!.crews.assigned })} />
            <Kpi label={t('ops.sim.beds')} icon={<BedDouble />} value={fmtNum(beds)} sub={t('ops.sim.bedsSub')} />
            <Kpi label={t('ops.sim.saline')} icon={<Droplets />} value={fmtNum(saline)} sub={t('ops.sim.salineSub')} />
          </>}
        </section>

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Card interactive={false}>
            <CardHeader title={t('ops.sim.chart')} sub={t('ops.sim.chartSub')}
              action={<div className="w-60"><Segmented<Metric> label={t('ops.sim.metric')} value={metric} onChange={setMetric}
                options={[{ value: 'cases', label: t('ops.sim.mCases') }, { value: 'beds', label: t('ops.sim.mBeds') }, { value: 'saline', label: t('ops.sim.mSaline') }]} /></div>} />
            {!sim ? <LoadingBlock className="h-64" /> : (
              <div className="h-64" role="img" aria-label={t('ops.sim.chart')}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} barGap={4} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="name" {...axisProps} />
                    <YAxis {...axisProps} allowDecimals={false} />
                    <RTooltip cursor={{ fill: 'var(--color-chart-cursor)' }} content={({ active, payload }) => active && payload?.length ? (
                      <TooltipBox title={`${payload[0].payload.name} · ${fmtDate(payload[0].payload.date)}`} rows={[
                        { label: t('ops.sim.noAction'), value: fmtNum(payload[0].payload.baseline, metric === 'cases' ? 1 : 0), color: C.faint },
                        { label: t('ops.sim.withCrews'), value: fmtNum(payload[0].payload.scenario, metric === 'cases' ? 1 : 0), color: C.accent },
                      ]} />) : null} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--color-muted)' }}
                      formatter={(v) => (v === 'baseline' ? t('ops.sim.noAction') : t('ops.sim.withCrews'))} />
                    <Bar dataKey="baseline" fill={C.faint} radius={[6, 6, 0, 0]} animationDuration={ANIM_MS} />
                    <Bar dataKey="scenario" fill={C.accent} radius={[6, 6, 0, 0]} animationDuration={ANIM_MS} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card interactive={false}>
            <CardHeader title={t('ops.sim.perHorizon')} />
            {!sim ? <LoadingBlock className="h-40" /> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-line text-left text-[11px] tracking-[0.05em] text-muted uppercase">
                  <th className="py-2 font-semibold">{t('common.horizon')}</th><th className="py-2 text-right font-semibold">{t('ops.sim.mCases')}</th>
                  <th className="py-2 text-right font-semibold">{t('ops.sim.mBeds')}</th><th className="py-2 text-right font-semibold">{t('ops.sim.mSaline')}</th>
                  <th className="py-2 text-right font-semibold">{t('ops.sim.overCap')}</th></tr></thead>
                <tbody>
                  {sim.per_horizon.map((h) => (
                    <tr key={h.horizon_weeks} className="border-b border-line-soft last:border-0">
                      <td className="py-2"><span className="font-semibold">+{h.horizon_weeks}</span> <span className="text-xs text-faint">{fmtDate(h.target_date)}</span></td>
                      <td className="num py-2 text-right">{fmtNum(h.cases_baseline, 0)} → <b>{fmtNum(h.cases_scenario, 0)}</b></td>
                      <td className="num py-2 text-right">{h.beds_baseline} → <b>{h.beds_scenario}</b></td>
                      <td className="num py-2 text-right">{h.saline_baseline} → <b>{h.saline_scenario}</b></td>
                      <td className="num py-2 text-right">{h.wards_over_capacity_baseline} → <b>{h.wards_over_capacity_scenario}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-4 border-t border-line-soft pt-3 text-xs leading-relaxed text-muted">{t('ops.sim.formula')}</p>
          </Card>
        </div>

        <Card interactive={false} className="min-w-0">
          <CardHeader title={t('ops.sim.ranking')} sub={t('ops.sim.rankingSub')} />
          {!sim ? <LoadingBlock className="h-72" /> : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="border-b border-line text-left text-[11px] tracking-[0.05em] text-muted uppercase">
                  <th className="py-2 pr-3 font-semibold">#</th><th className="py-2 pr-3 font-semibold">{t('common.ward')}</th>
                  <th className="py-2 pr-3 font-semibold">{t('risk.tier')}</th><th className="py-2 pr-3 text-center font-semibold">{t('ops.col.crews')}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t('ops.sim.window')}</th><th className="py-2 pr-3 text-right font-semibold">{t('ops.sim.prevCol')}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t('ops.sim.roiCol')}</th><th className="py-2 text-right font-semibold">{t('ops.sim.firstCrew')}</th></tr></thead>
                <tbody>
                  {visible.map((r, i) => (
                    <tr key={r.ward_id} className={cn('border-b border-line-soft last:border-0 hover:bg-panel-2/50', r.crews > 0 && 'bg-accent/[0.04]')}>
                      <td className="num py-2 pr-3 text-faint">{i + 1}</td>
                      <td className="py-2 pr-3"><span className="font-mono text-xs font-semibold">{r.ward_id}</span><span className="block text-[11px] text-faint">{r.city}</span></td>
                      <td className="py-2 pr-3"><RiskBadge tier={r.risk_tier} size="sm" /></td>
                      <td className="py-2 pr-3">
                        {manual ? (
                          <div className="flex items-center justify-center gap-1">
                            <button aria-label={t('ops.sim.remove', { ward: r.ward_id })} onClick={() => bump(r.ward_id, -1)} disabled={!dep[r.ward_id]} className="grid size-7 place-items-center rounded-lg border border-line text-muted hover:text-ink disabled:opacity-30"><Minus className="size-3.5" /></button>
                            <span className="num w-6 text-center font-semibold">{dep[r.ward_id] ?? 0}</span>
                            <button aria-label={t('ops.sim.add', { ward: r.ward_id })} onClick={() => bump(r.ward_id, 1)} disabled={(dep[r.ward_id] ?? 0) >= controls.max_crews_per_ward} className="grid size-7 place-items-center rounded-lg border border-line text-muted hover:text-ink disabled:opacity-30"><Plus className="size-3.5" /></button>
                          </div>
                        ) : <p className="num text-center font-semibold">{r.crews || <span className="text-faint">0</span>}</p>}
                      </td>
                      <td className="num py-2 pr-3 text-right">{fmtNum(r.cases_window_baseline, 1)}</td>
                      <td className="num py-2 pr-3 text-right font-semibold text-risk-low">{r.cases_prevented ? fmtNum(r.cases_prevented, 1) : <span className="font-normal text-faint">0</span>}</td>
                      <td className="num py-2 pr-3 text-right font-semibold">{r.roi_cases_per_crew === null ? <span className="font-normal text-faint">—</span> : fmtNum(r.roi_cases_per_crew, 2)}</td>
                      <td className="num py-2 text-right text-muted">{fmtNum(r.first_crew_roi, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ranking.length > 15 && (
                <button onClick={() => setShowAll((v) => !v)} className="mt-3 text-xs font-semibold text-accent hover:underline">
                  {showAll ? t('ops.sim.showLess') : t('ops.sim.showAll', { n: ranking.length })}
                </button>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
