import { BedDouble, Droplets, FlaskConical, Minus, Plus, ShieldPlus, SprayCan } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { TooltipBox } from '@/components/charts/ChartTooltip'
import { ANIM_MS, axisProps, C } from '@/components/charts/theme'
import { Control, Disclosure, KindTag, Kpi, Segmented, StepCard } from '@/components/ops/controls'
import { RiskBadge } from '@/components/RiskBadge'
import { Card } from '@/components/ui/card'
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
  const visible = showAll ? ranking : ranking.slice(0, 8)
  const best = ranking.find((r) => r.crews > 0)

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
    <div className={cn('flex flex-col gap-5 transition-opacity duration-200', q.pending && p && 'opacity-70')}>
      <p role="note" className="flex items-start gap-2.5 rounded-xl border border-risk-medium/35 bg-risk-medium/5 px-3.5 py-2.5 text-sm">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-risk-medium" aria-hidden />
        <span><span className="font-semibold text-ink">{t('ux.mos.disclaimer')}</span> <span className="text-muted">{t('ux.mos.disclaimerMore', { e: controls.effect_per_crew_pct })}</span></span>
      </p>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <StepCard n={1} title={t('ux.mos.s1')} sub={t('ux.mos.s1Sub')}>
          <Control id="crews" />
          <Control id="pool" />
          <Segmented label={t('ops.sim.mode')} value={manual ? 'manual' : 'optimised'} onChange={setMode}
            options={[{ value: 'optimised', label: t('ux.mos.auto') }, { value: 'manual', label: t('ux.mos.manual') }]} />
          <p className="text-xs leading-relaxed text-muted">{manual ? t('ops.sim.manualHint', { used, total: controls.total_crews }) : t('ops.sim.optimisedHint')}</p>
          {manual && used > controls.total_crews && (
            <p role="alert" className="rounded-xl border border-risk-critical/40 bg-risk-critical/8 px-3 py-2 text-xs font-medium text-ink">{t('ops.sim.overBudget', { used, total: controls.total_crews })}</p>
          )}
          <Disclosure title={t('ux.mos.assumptions')} sub={t('ux.mos.assumptionsSub')}>
            <Control id="effect" />
            <Control id="maxCrews" />
            <Control id="basis" />
            <p className="text-xs leading-relaxed text-muted">{t('ops.sim.formula')}</p>
          </Disclosure>
        </StepCard>

        <StepCard n={2} title={t('ux.mos.s2')} sub={t('ux.mos.s2Sub')} action={<KindTag kind="hypothetical" />}>
          <p className="rounded-xl bg-panel-2/60 px-3 py-2 text-xs leading-relaxed text-muted">
            {best ? t('ux.mos.roiExplain', { ward: best.ward_id, n: fmtNum(best.roi_cases_per_crew ?? 0, 1) }) : t('ux.mos.roiExplainNone')}
          </p>
          {!sim ? <LoadingBlock className="h-64" /> : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[620px] text-sm">
                <thead><tr className="border-b border-line text-left text-[11px] tracking-[0.05em] text-muted uppercase">
                  <th className="py-2 pr-3 font-semibold">#</th><th className="py-2 pr-3 font-semibold">{t('common.ward')}</th>
                  <th className="py-2 pr-3 font-semibold">{t('risk.tier')}</th><th className="py-2 pr-3 text-center font-semibold">{t('ops.col.crews')}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t('ux.mos.colPrevented')}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t('ux.mos.colPerCrew')}</th>
                  <th className="py-2 text-right font-semibold">{t('ux.mos.colFirst')}</th></tr></thead>
                <tbody>
                  {visible.map((r, i) => (
                    <tr key={r.ward_id} className={cn('border-b border-line-soft last:border-0 hover:bg-panel-2/50', r.crews > 0 && 'bg-accent/[0.04]')}>
                      <td className="num py-2 pr-3 text-faint">{i + 1}</td>
                      <td className="py-2 pr-3"><span className="font-mono text-xs font-semibold">{r.ward_id}</span><span className="block text-[11px] text-faint">{r.city}</span></td>
                      <td className="py-2 pr-3"><RiskBadge tier={r.risk_tier} size="sm" /></td>
                      <td className="py-2 pr-3">
                        {manual ? (
                          <div className="flex items-center justify-center gap-1">
                            <button aria-label={t('ops.sim.remove', { ward: r.ward_id })} onClick={() => bump(r.ward_id, -1)} disabled={!dep[r.ward_id]} className="grid size-8 place-items-center rounded-lg border border-line text-muted hover:text-ink disabled:opacity-30"><Minus className="size-3.5" /></button>
                            <span className="num w-6 text-center font-semibold">{dep[r.ward_id] ?? 0}</span>
                            <button aria-label={t('ops.sim.add', { ward: r.ward_id })} onClick={() => bump(r.ward_id, 1)} disabled={(dep[r.ward_id] ?? 0) >= controls.max_crews_per_ward} className="grid size-8 place-items-center rounded-lg border border-line text-muted hover:text-ink disabled:opacity-30"><Plus className="size-3.5" /></button>
                          </div>
                        ) : <p className="num text-center font-semibold">{r.crews || <span className="text-faint">0</span>}</p>}
                      </td>
                      <td className="num py-2 pr-3 text-right font-semibold text-risk-low">{r.cases_prevented ? fmtNum(r.cases_prevented, 1) : <span className="font-normal text-faint">0</span>}</td>
                      <td className="num py-2 pr-3 text-right font-semibold">{r.roi_cases_per_crew === null ? <span className="font-normal text-faint">—</span> : fmtNum(r.roi_cases_per_crew, 1)}</td>
                      <td className="num py-2 text-right text-muted">{fmtNum(r.first_crew_roi, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ranking.length > 8 && (
                <button onClick={() => setShowAll((v) => !v)} className="mt-3 text-xs font-semibold text-accent hover:underline">
                  {showAll ? t('ux.mos.showLess') : t('ops.sim.showAll', { n: ranking.length })}
                </button>
              )}
            </div>
          )}
        </StepCard>
      </div>

      <StepCard n={3} title={t('ux.mos.s3')} sub={p ? t('ux.mos.s3Sub', { date: fmtDate(p.scenario.as_of, 'long') }) : ''} action={<KindTag kind="hypothetical" />}>
        <section aria-label={t('ops.sim.kpis')} className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {!sim ? [0, 1, 2, 3].map((i) => <Card key={i}><LoadingBlock className="h-24" /></Card>) : <>
            <Kpi label={t('ops.sim.prevented')} icon={<ShieldPlus />} tone={sim.total_cases_prevented > 0 ? 'good' : undefined} value={fmtNum(sim.total_cases_prevented, 1)} sub={t('ops.sim.preventedSub')} />
            <Kpi label={t('ux.mos.kSaline')} icon={<Droplets />} value={fmtNum(saline)} sub={t('ops.sim.salineSub')} />
            <Kpi label={t('ux.mos.kBeds')} icon={<BedDouble />} value={fmtNum(beds)} sub={t('ops.sim.bedsSub')} />
            <Kpi label={t('ops.sim.roi')} icon={<SprayCan />} value={sim.roi_cases_per_crew === null ? '—' : fmtNum(sim.roi_cases_per_crew, 1)} sub={t('ops.sim.roiSub', { n: p!.crews.assigned })} />
          </>}
        </section>
        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <p className="text-sm font-semibold">{t('ux.mos.chart')}</p>
              <div className="w-60"><Segmented<Metric> label={t('ops.sim.metric')} value={metric} onChange={setMetric}
                options={[{ value: 'cases', label: t('ops.sim.mCases') }, { value: 'beds', label: t('ops.sim.mBeds') }, { value: 'saline', label: t('ops.sim.mSaline') }]} /></div>
            </div>
            {!sim ? <LoadingBlock className="h-60" /> : (
              <div className="h-60" role="img" aria-label={t('ux.mos.chart')}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} barGap={4} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke={C.grid} />
                    <XAxis dataKey="name" {...axisProps} />
                    <YAxis {...axisProps} allowDecimals={false} />
                    <RTooltip cursor={{ fill: 'var(--color-chart-cursor)' }} content={({ active, payload }) => active && payload?.length ? (
                      <TooltipBox title={`${payload[0].payload.name} · ${fmtDate(payload[0].payload.date)}`} rows={[
                        { label: t('ux.mos.without'), value: fmtNum(payload[0].payload.baseline, metric === 'cases' ? 1 : 0), color: C.faint },
                        { label: t('ux.mos.with'), value: fmtNum(payload[0].payload.scenario, metric === 'cases' ? 1 : 0), color: C.accent },
                      ]} />) : null} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: 'var(--color-muted)' }}
                      formatter={(v) => (v === 'baseline' ? t('ux.mos.without') : t('ux.mos.with'))} />
                    <Bar dataKey="baseline" fill={C.faint} radius={[6, 6, 0, 0]} animationDuration={ANIM_MS} />
                    <Bar dataKey="scenario" fill={C.accent} radius={[6, 6, 0, 0]} animationDuration={ANIM_MS} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          {sim && (
            <table className="w-full self-start text-sm">
              <caption className="mb-2 text-left text-sm font-semibold">{t('ops.sim.perHorizon')}</caption>
              <thead><tr className="border-b border-line text-left text-[11px] tracking-[0.05em] text-muted uppercase">
                <th className="py-2 font-semibold">{t('common.horizon')}</th><th className="py-2 text-right font-semibold">{t('ops.sim.mCases')}</th>
                <th className="py-2 text-right font-semibold">{t('ops.sim.mBeds')}</th><th className="py-2 text-right font-semibold">{t('ops.sim.mSaline')}</th></tr></thead>
              <tbody>
                {sim.per_horizon.map((h) => (
                  <tr key={h.horizon_weeks} className="border-b border-line-soft last:border-0">
                    <td className="py-2"><span className="font-semibold">+{h.horizon_weeks}</span> <span className="text-xs text-faint">{fmtDate(h.target_date)}</span></td>
                    <td className="num py-2 text-right">{fmtNum(h.cases_baseline, 0)} → <b>{fmtNum(h.cases_scenario, 0)}</b></td>
                    <td className="num py-2 text-right">{h.beds_baseline} → <b>{h.beds_scenario}</b></td>
                    <td className="num py-2 text-right">{h.saline_baseline} → <b>{h.saline_scenario}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </StepCard>
    </div>
  )
}
