import { ArrowRight, BedDouble, Boxes, CircleCheck, Send, SprayCan, WifiOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SeverityBadge } from '@/components/ops/controls'
import { PageIntro, PlanBar, Section } from '@/components/ops/simple'
import { RiskBadge, TIER_COLOR, TIER_MARK } from '@/components/RiskBadge'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n, type TKey } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters } from '@/state/AppData'
import { usePlan } from '@/state/Ops'
import type { OpsWard, RiskTier } from '@/types/api'

/** The ward's most pressing need, in plain words, from the calculated plan. */
function primaryNeed(w: OpsWard, t: (k: TKey, v?: Record<string, string | number>) => string) {
  if (w.beds.net_deficit > 0) return t(w.beds.net_deficit === 1 ? 'ux.need.bed1' : 'ux.need.beds', { n: w.beds.net_deficit })
  const sal = w.allocated.saline_bags_needed !== null ? w.required.saline_bags_needed - w.allocated.saline_bags_needed : 0
  const kit = w.allocated.diagnostic_kits_needed !== null ? w.required.diagnostic_kits_needed - w.allocated.diagnostic_kits_needed : 0
  if (sal > 0) return t('ux.need.saline', { n: sal })
  if (kit > 0) return t('ux.need.kits', { n: kit })
  if (w.flags.includes('high_risk_no_crew')) return t('ux.need.crew')
  return t('ux.need.watch', { n: w.planning_cases_whole })
}

function Todo({ n, icon: Icon, done, title, sub, to, cta, search }: {
  n: number; icon: typeof Boxes; done: boolean; title: string; sub?: string; to: string; cta: string; search: string
}) {
  const { t } = useI18n()
  return (
    <li className={cn('flex flex-wrap items-center gap-4 rounded-2xl border bg-panel p-4 sm:p-5', done ? 'border-line-soft' : 'border-risk-critical/35')}>
      <span aria-hidden className={cn('num grid size-11 shrink-0 place-items-center rounded-full text-lg font-bold', done ? 'bg-risk-low/15 text-risk-low' : 'bg-accent text-accent-ink')}>
        {done ? <CircleCheck className="size-6" /> : n}
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <p className="flex items-start gap-2 text-[17px] leading-snug font-semibold text-ink"><Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />{title}</p>
        {sub && <p className="mt-1 text-[15px] text-muted">{sub}</p>}
        {done && <p className="sr-only">{t('s.home.doneSr')}</p>}
      </div>
      <Button asChild variant={done ? 'secondary' : 'primary'} size="lg" className="w-full sm:w-auto">
        <Link to={{ pathname: to, search }}>{cta} <ArrowRight /></Link>
      </Button>
    </li>
  )
}

export default function OpsHome() {
  const { t, fmtNum } = useI18n()
  const { search, city } = useFilters()
  const q = usePlan()
  const p = q.data
  const [picked, setPicked] = useState<string | null>(null)

  const wards = useMemo(() => p?.wards ?? [], [p])
  const byCity = useMemo(() => {
    const m = new Map<string, OpsWard[]>()
    for (const w of [...wards].sort((a, b) => a.ward_id.localeCompare(b.ward_id))) m.set(w.city, [...(m.get(w.city) ?? []), w])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [wards])
  const sel = wards.find((w) => w.ward_id === picked) ?? null

  const wardLink = (pathname: string, w: OpsWard) => {
    const s = new URLSearchParams(search)
    s.set('city', w.city)
    s.set('ward', w.ward_id)
    return { pathname, search: `?${s}` }
  }

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const sal = p?.supplies.saline_bags_needed
  const kit = p?.supplies.diagnostic_kits_needed
  const moved = p?.cities.reduce((a, c) => a + c.patients_routed, 0) ?? 0
  const noBed = p?.cities.reduce((a, c) => a + c.net_deficit, 0) ?? 0
  const noTeam = p?.crews.high_risk_wards_without_crew ?? 0
  const flagged = wards.filter((w) => w.severity !== 'ok').length

  return (
    <div className="flex flex-col gap-5">
      <PlanBar />
      <div>
        <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{t('s.home.title')}</h2>
        <PageIntro>{t('s.home.intro')}</PageIntro>
      </div>

      {!p || !sal || !kit ? <LoadingBlock className="h-80" /> : (
        <ol className={cn('flex flex-col gap-3 transition-opacity', q.pending && 'opacity-70')} aria-label={t('s.home.title')}>
          <Todo n={1} icon={Boxes} search={search} to="/allocation" cta={t('s.home.cta1')}
            done={sal.shortfall + kit.shortfall === 0}
            title={sal.shortfall ? t('s.home.t1', { w: sal.wards_short, n: fmtNum(sal.shortfall) }) : kit.shortfall ? t('s.home.t1kits', { w: kit.wards_short, n: fmtNum(kit.shortfall) }) : t('s.home.t1ok')}
            sub={sal.shortfall && kit.shortfall ? t('s.home.t1sub', { n: fmtNum(kit.shortfall) }) : sal.shortfall + kit.shortfall === 0 ? t('s.home.t1okSub', { n: Math.round(p.scenario.stock_pct) }) : undefined} />
          <Todo n={2} icon={BedDouble} search={search} to="/overflow" cta={t('s.home.cta2')}
            done={noBed === 0 && moved === 0}
            title={noBed && !moved ? t('s.home.t2noMove', { dp: t(noBed === 1 ? 's.beds.pat1' : 's.beds.patN', { n: noBed }) }) : moved && !noBed ? t('s.home.t2moveOnly', { mp: t(moved === 1 ? 's.beds.pat1' : 's.beds.patN', { n: moved }) }) : noBed || moved ? t('s.home.t2', { mp: t(moved === 1 ? 's.beds.pat1' : 's.beds.patN', { n: moved }), dp: t(noBed === 1 ? 's.beds.pat1' : 's.beds.patN', { n: noBed }) }) : t('s.home.t2ok')}
            sub={noBed === 0 && moved > 0 ? t('s.home.t2allOk') : undefined} />
          <Todo n={3} icon={SprayCan} search={search} to="/simulator" cta={t('s.home.cta3')}
            done={noTeam === 0}
            title={noTeam ? t('s.home.t3', { n: noTeam }) : t('s.home.t3ok')}
            sub={t('s.home.t3sub', { a: p.crews.assigned, b: p.crews.total })} />
          <Todo n={4} icon={Send} search={search} to="/dispatch" cta={t('s.home.cta4')}
            done={flagged === 0}
            title={flagged ? t('s.home.t4', { n: flagged }) : t('s.home.t4ok')}
            sub={t('s.home.t4sub')} />
        </ol>
      )}

      <Section title={t('s.home.mapTitle')} sub={t('s.home.mapSub')}>
        {!p ? <LoadingBlock className="h-64" /> : (
          <div className="flex flex-col gap-5">
            {byCity.map(([c, ws]) => (
              <div key={c}>
                <p className={cn('mb-2 text-[15px] font-semibold', c === city ? 'text-ink' : 'text-muted')}>{c}</p>
                <div className="flex flex-wrap gap-2">
                  {ws.map((w) => (
                    <button key={w.ward_id} onClick={() => setPicked(w.ward_id === picked ? null : w.ward_id)}
                      aria-pressed={w.ward_id === picked}
                      aria-label={`${w.ward_id}, ${t('s.home.riskLabel', { r: t(`risk.${w.risk_tier}`) })}${w.severity !== 'ok' ? `, ${t(`ops.sev.${w.severity}`)}` : ''}`}
                      className={cn('relative grid h-11 min-w-11 place-items-center rounded-xl border px-1.5 text-[13px] font-bold transition-transform duration-150 hover:-translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                        w.ward_id === picked && 'ring-2 ring-accent ring-offset-2 ring-offset-panel')}
                      style={{ background: `color-mix(in oklab, ${TIER_COLOR[w.risk_tier]} 22%, transparent)`, borderColor: `color-mix(in oklab, ${TIER_COLOR[w.risk_tier]} 55%, transparent)`, color: TIER_COLOR[w.risk_tier] }}>
                      {w.ward_id.match(/(\d+)$/)?.[1]}
                      {w.severity !== 'ok' && <span aria-hidden className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-risk-critical text-[10px] text-white">!</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {sel ? (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/50 bg-canvas/40 p-4">
                <div className="min-w-40">
                  <p className="font-mono text-[15px] font-semibold">{sel.ward_id}</p>
                  <p className="text-[13px] text-muted">{sel.city}</p>
                </div>
                <RiskBadge tier={sel.risk_tier} />
                <SeverityBadge severity={sel.severity} />
                <p className="min-w-48 flex-1 text-[15px]">{t('ux.home.selCases', { n: sel.planning_cases_whole })} · {primaryNeed(sel, t)}</p>
                <Button asChild variant="primary" className="h-11"><Link to={wardLink('/dispatch', sel)} state={{ focusWard: sel.ward_id }}><Send /> {t('s.home.sendMsg')}</Link></Button>
              </div>
            ) : <p className="text-[13px] text-muted">{t('s.home.tapWard')}</p>}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line-soft pt-4 text-[13px] text-muted">
              <span className="font-semibold text-ink">{t('s.home.legend')}</span>
              {(['Low', 'Medium', 'High', 'Critical'] as RiskTier[]).map((tier) => (
                <span key={tier} className="flex items-center gap-1.5">
                  <span aria-hidden className="grid h-5 min-w-5 place-items-center rounded px-0.5 text-[9px] font-bold" style={{ background: `color-mix(in oklab, ${TIER_COLOR[tier]} 30%, transparent)`, color: TIER_COLOR[tier] }}>{TIER_MARK[tier]}</span>
                  {t('s.home.riskLabel', { r: t(`risk.${tier}`) })}
                </span>
              ))}
              <span className="flex items-center gap-1.5"><span aria-hidden className="grid size-4 place-items-center rounded-full bg-risk-critical text-[10px] text-white">!</span>{t('s.home.legendShort')}</span>
            </div>
          </div>
        )}
      </Section>

      <p className="flex items-center gap-2 text-[13px] text-muted"><WifiOff className="size-4 text-risk-low" aria-hidden /> {t('ux.home.local')}</p>
    </div>
  )
}
