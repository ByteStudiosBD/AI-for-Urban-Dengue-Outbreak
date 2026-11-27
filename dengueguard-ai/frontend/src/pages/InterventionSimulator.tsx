import { FlaskConical, Minus, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { TooltipBox } from '@/components/charts/ChartTooltip'
import { ANIM_MS, axisProps, C } from '@/components/charts/theme'
import { BigAnswer, Choice, HowCalculated, PageIntro, PlanBar, Section, ShowMore, TeamsField } from '@/components/ops/simple'
import { RiskBadge } from '@/components/RiskBadge'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useOps, usePlan } from '@/state/Ops'

type Metric = 'cases' | 'beds' | 'saline'
const PAGE = 8

export default function InterventionSimulator() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { controls, setControls } = useOps()
  const q = usePlan()
  const p = q.data
  const [metric, setMetric] = useState<Metric>('cases')
  const [more, setMore] = useState(false)
  const manual = controls.deployment !== null
  const dep = controls.deployment ?? {}
  const used = Object.values(dep).reduce((a, b) => a + b, 0)

  const chart = useMemo(() => (p?.simulation.per_horizon ?? []).map((h) => ({
    name: t('s.set.inN', { n: h.horizon_weeks }), date: h.target_date,
    baseline: metric === 'cases' ? h.cases_baseline : metric === 'beds' ? h.beds_baseline : h.saline_baseline,
    scenario: metric === 'cases' ? h.cases_scenario : metric === 'beds' ? h.beds_scenario : h.saline_scenario,
  })), [p, metric, t])

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const sim = p?.simulation
  const beds = sim?.per_horizon.reduce((a, h) => a + h.beds_baseline - h.beds_scenario, 0) ?? 0
  const saline = sim?.per_horizon.reduce((a, h) => a + h.saline_baseline - h.saline_scenario, 0) ?? 0
  const ranking = (sim?.ranking ?? []).filter((r) => p!.scenario.city === null || r.city === p!.scenario.city)
  // automatic mode lists only wards that get teams; manual mode lists every ward, best first
  // ranked by intervention ROI: cases prevented per crew, or the first crew's ROI for a ward without one
  const roi = (r: (typeof ranking)[number]) => r.roi_cases_per_crew ?? r.first_crew_roi
  const list = (manual ? ranking : ranking.filter((r) => r.crews > 0)).slice().sort((a, b) => roi(b) - roi(a))
  const visible = more ? list : list.slice(0, PAGE)

  const setMode = (m: 'auto' | 'manual') => {
    if (m === 'auto') setControls({ deployment: null })
    else setControls({ deployment: Object.fromEntries((p?.wards ?? []).filter((w) => w.crews > 0).map((w) => [w.ward_id, w.crews])) })
  }
  const bump = (ward: string, d: number) => {
    // the server rejects a deployment above the team total or the per-ward limit, so never build one
    if (d > 0 && used >= controls.total_crews) return
    const next = { ...dep, [ward]: Math.max(0, Math.min(controls.max_crews_per_ward, (dep[ward] ?? 0) + d)) }
    if (!next[ward]) delete next[ward]
    setControls({ deployment: next })
  }
  const step = 'grid size-11 place-items-center rounded-xl border border-line bg-panel text-ink hover:bg-panel-2 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

  return (
    <div className="flex flex-col gap-5">
      <PlanBar />
      <PageIntro>{t('s.mos.intro')}</PageIntro>
      <p role="note" className="flex items-start gap-2 text-[13px] text-muted">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-risk-medium" aria-hidden />
        <span><span className="font-semibold text-ink">{t('ux.mos.disclaimer')}</span> {t('s.mos.effectNote', { e: controls.effect_per_crew_pct })}</span>
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border border-line-soft bg-panel p-5"><TeamsField size="md" /></div>
          <div className="rounded-2xl border border-line-soft bg-panel p-5">
            <Choice<'auto' | 'manual'> label={t('s.mos.mode')} value={manual ? 'manual' : 'auto'} onChange={setMode} className="sm:grid-cols-2"
              options={[{ value: 'auto', label: t('s.mos.auto') }, { value: 'manual', label: t('s.mos.manual') }]} />
            <p className="mt-3 text-[13px] text-muted">{manual ? t('s.mos.manualHelp') : t('s.mos.autoHelp')}</p>
            {manual && (
              <p className={cn('num mt-3 rounded-xl px-3 py-2 text-[15px] font-semibold', used > controls.total_crews ? 'bg-risk-critical/10 text-risk-critical' : 'bg-panel-2 text-ink')} role="status">
                {t('s.mos.used', { u: used, n: controls.total_crews })}{used > controls.total_crews && ` — ${t('s.mos.over')}`}
              </p>
            )}
          </div>
        </div>

        {!p || !sim ? <LoadingBlock className="h-40" /> : (
          <div className={cn('flex flex-col gap-5 transition-opacity', q.pending && 'opacity-70')}>
            <BigAnswer tone={p.crews.assigned ? 'good' : 'info'}
              title={p.crews.assigned ? t('s.mos.ans', { a: p.crews.assigned, n: fmtNum(sim.total_cases_prevented, 0) }) : t('s.mos.ansNone')}>
              {p.crews.assigned ? t('s.mos.ansSub', { r: sim.roi_cases_per_crew === null ? '—' : fmtNum(sim.roi_cases_per_crew, 1) }) : t('s.mos.ansNoneSub')}
            </BigAnswer>

            <Section title={t('s.mos.whatTitle')} sub={t('s.mos.whatSub')}>
              <dl className="mb-5 grid grid-cols-3 gap-3">
                {[[t('s.mos.wCases'), fmtNum(sim.total_cases_prevented, 0)], [t('s.mos.wSaline'), fmtNum(saline)], [t('s.mos.wBeds'), fmtNum(beds)]].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-line-soft p-3">
                    <dt className="text-[13px] text-muted">{k}</dt>
                    <dd className="num text-2xl font-semibold text-risk-low">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mb-3 max-w-md">
                <Choice<Metric> label={t('s.mos.chartShow')} value={metric} onChange={setMetric}
                  options={[{ value: 'cases', label: t('ops.sim.mCases') }, { value: 'beds', label: t('ops.sim.mBeds') }, { value: 'saline', label: t('ops.sim.mSaline') }]} className="grid-cols-3" />
              </div>
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
                    <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 14, color: 'var(--color-muted)' }}
                      formatter={(v) => (v === 'baseline' ? t('ux.mos.without') : t('ux.mos.with'))} />
                    <Bar dataKey="baseline" fill={C.faint} radius={[6, 6, 0, 0]} animationDuration={ANIM_MS} />
                    <Bar dataKey="scenario" fill={C.accent} radius={[6, 6, 0, 0]} animationDuration={ANIM_MS} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 grid gap-2 sm:grid-cols-3">
                {sim.per_horizon.map((h) => (
                  <li key={h.horizon_weeks} className="num rounded-xl bg-panel-2/50 px-3 py-2 text-[13px] text-muted">
                    <span className="font-semibold text-ink">{t('s.set.inN', { n: h.horizon_weeks })}</span>: {t('s.mos.perWeek', { a: fmtNum(h.cases_baseline, 0), b: fmtNum(h.cases_scenario, 0) })}
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        )}
      </div>

      <Section title={manual ? t('s.mos.listManual') : t('s.mos.listAuto')} sub={manual ? t('s.mos.listManualSub', { m: controls.max_crews_per_ward }) : t('s.mos.listAutoSub')}
        className={cn('transition-opacity', q.pending && p && 'opacity-70')}>
        {!sim ? <LoadingBlock className="h-60" /> : list.length === 0 ? (
          <p className="text-[15px] text-muted">{t('s.mos.noTeamsYet')}</p>
        ) : (
          <div className="flex flex-col">
            <ol>
              {visible.map((r, i) => (
                <li key={r.ward_id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-soft py-3 last:border-0', r.crews > 0 && manual && 'bg-accent/[0.04]')}>
                  <span aria-hidden className="num w-6 text-[15px] text-muted">{i + 1}</span>
                  <div className="min-w-40 flex-1 basis-40">
                    <p className="font-mono text-[15px] font-semibold">{r.ward_id}</p>
                    <p className="text-[13px] text-muted">{r.city}</p>
                  </div>
                  <RiskBadge tier={r.risk_tier} size="sm" />
                  <p className="min-w-44 text-[15px]">
                    {r.crews > 0 ? t('s.mos.stops', { n: fmtNum(r.cases_prevented, 1) }) : <span className="text-muted">{t('s.mos.couldStop', { n: fmtNum(r.first_crew_roi, 1) })}</span>}
                  </p>
                  {/* the value the list is ranked by: cases prevented per crew (ROI); a ward without a team shows its first team's ROI */}
                  <p className="num min-w-28 text-[15px] font-semibold text-accent" title={t('s.mos.roiLabel')}>
                    <span className="sr-only">{t('s.mos.roiLabel')}: </span>
                    {t('s.mos.perTeam', { r: fmtNum(roi(r), 1) })}
                  </p>
                  {manual ? (
                    <div className="flex items-center gap-2" role="group" aria-label={t('s.mos.teamsFor', { ward: r.ward_id })}>
                      <button className={step} aria-label={t('ops.sim.remove', { ward: r.ward_id })} onClick={() => bump(r.ward_id, -1)} disabled={!dep[r.ward_id]}><Minus className="size-5" /></button>
                      <span className="num w-8 text-center text-lg font-semibold" aria-live="polite">{dep[r.ward_id] ?? 0}</span>
                      <button className={step} aria-label={t('ops.sim.add', { ward: r.ward_id })} onClick={() => bump(r.ward_id, 1)} disabled={(dep[r.ward_id] ?? 0) >= controls.max_crews_per_ward || used >= controls.total_crews}><Plus className="size-5" /></button>
                    </div>
                  ) : (
                    <p className="num text-[15px] font-semibold">{t(r.crews === 1 ? 's.mos.team1' : 's.mos.teamN', { n: r.crews })}</p>
                  )}
                </li>
              ))}
            </ol>
            <ShowMore shown={PAGE} total={list.length} open={more} onClick={() => setMore((v) => !v)} />
          </div>
        )}
      </Section>

      <HowCalculated>
        <p>{t('ops.sim.formula')}</p>
        <p>{t('ux.mos.disclaimerMore', { e: controls.effect_per_crew_pct })}</p>
      </HowCalculated>
    </div>
  )
}
