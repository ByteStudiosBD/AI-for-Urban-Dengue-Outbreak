import { ArrowRight, BedDouble, Boxes, CircleCheck, Hospital, Info, Send, Siren, SprayCan, WifiOff } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { KindTag, Kpi, SeverityBadge } from '@/components/ops/controls'
import { RiskBadge, TIER_COLOR, TIER_MARK } from '@/components/RiskBadge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n, type TKey } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters } from '@/state/AppData'
import { usePlan } from '@/state/Ops'
import type { OpsWard, RiskTier } from '@/types/api'

const isUrgent = (w: OpsWard) => w.severity === 'critical' || w.risk_tier === 'Critical'

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

export default function OpsHome() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { search, city } = useFilters()
  const q = usePlan()
  const p = q.data
  const [picked, setPicked] = useState<string | null>(null)

  const wards = useMemo(() => p?.wards ?? [], [p])
  const urgent = useMemo(() => wards.filter(isUrgent).sort((a, b) =>
    (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1) || b.priority - a.priority), [wards])
  const byCity = useMemo(() => {
    const m = new Map<string, OpsWard[]>()
    for (const w of [...wards].sort((a, b) => a.ward_id.localeCompare(b.ward_id))) m.set(w.city, [...(m.get(w.city) ?? []), w])
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [wards])
  const sel = wards.find((w) => w.ward_id === picked) ?? null

  // a link to another page with this ward selected (city + ward live in the URL filters)
  const wardLink = (pathname: string, w: OpsWard) => {
    const s = new URLSearchParams(search)
    s.set('city', w.city)
    s.set('ward', w.ward_id)
    return { pathname, search: `?${s}` }
  }

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const bedShort = p?.cities.reduce((a, c) => a + c.net_deficit, 0) ?? 0
  const overCap = p?.cities.reduce((a, c) => a + c.wards_over_capacity, 0) ?? 0
  const salShort = p?.supplies.saline_bags_needed.shortfall ?? 0
  const kitShort = p?.supplies.diagnostic_kits_needed.shortfall ?? 0

  const actions = [
    { to: '/allocation', icon: Boxes, label: t('ux.home.qaSupplies'), sub: t('ux.home.qaSuppliesSub') },
    { to: '/overflow', icon: BedDouble, label: t('ux.home.qaBeds'), sub: t('ux.home.qaBedsSub') },
    { to: '/simulator', icon: SprayCan, label: t('ux.home.qaCrews'), sub: t('ux.home.qaCrewsSub') },
    { to: '/dispatch', icon: Send, label: t('ux.home.qaDispatch'), sub: t('ux.home.qaDispatchSub') },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* what this screen is based on: historical data + model forecast + planning settings */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line-soft bg-panel px-4 py-3 text-xs text-muted">
        <span className="flex items-center gap-1.5"><Info className="size-4 text-faint" aria-hidden />
          {p ? t('ux.home.basis', { week: fmtDate(p.scenario.as_of, 'long'), target: fmtDate(p.scenario.target_date, 'long'), h: p.scenario.horizon_weeks }) : t('common.loading')}</span>
        <span className="flex items-center gap-1.5"><WifiOff className="size-4 text-risk-low" aria-hidden /> {t('ux.home.local')}</span>
      </div>

      {/* 1. summary */}
      <section aria-label={t('ux.home.summary')} className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {!p ? [0, 1, 2, 3].map((i) => <Card key={i}><LoadingBlock className="h-24" /></Card>) : <>
          <Kpi label={t('ux.home.kUrgent')} icon={<Siren />} tone={urgent.length ? 'bad' : 'good'} value={fmtNum(urgent.length)}
            sub={t('ux.home.kUrgentSub', { a: p.alerts.critical, b: wards.filter((w) => w.risk_tier === 'Critical').length })} />
          <Kpi label={t('ux.home.kBeds')} icon={<Hospital />} tone={bedShort ? 'bad' : 'good'} value={fmtNum(bedShort)}
            sub={bedShort ? t('ux.home.kBedsSub', { n: overCap }) : t('ux.home.kBedsOk')} />
          <Kpi label={t('ux.home.kSupplies')} icon={<Boxes />} tone={salShort + kitShort ? 'bad' : 'good'}
            value={salShort + kitShort ? <>{fmtNum(salShort)}<span className="text-base font-normal text-muted"> {t('ux.home.bags')}</span></> : t('ux.home.none')}
            sub={salShort + kitShort ? t('ux.home.kSuppliesSub', { s: fmtNum(salShort), k: fmtNum(kitShort) }) : t('ux.home.kSuppliesOk', { n: p.scenario.stock_pct })} />
          <Kpi label={t('ux.home.kCrews')} icon={<SprayCan />} value={<>{fmtNum(p.crews.assigned)}<span className="text-base font-normal text-muted"> / {fmtNum(p.crews.total)}</span></>}
            sub={t('ux.home.kCrewsSub', { n: p.crews.high_risk_wards_without_crew })} />
        </>}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* 2. urgent wards */}
        <Card interactive={false} className="min-w-0">
          <CardHeader title={t('ux.home.urgentTitle')} sub={t('ux.home.urgentSub')} action={<KindTag kind="calculated" />} />
          {!p ? <LoadingBlock className="h-64" /> : urgent.length === 0 ? (
            <div className="flex items-start gap-3 rounded-xl border border-risk-low/30 bg-risk-low/5 p-4 text-sm">
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-risk-low" aria-hidden />
              <p className="text-muted"><span className="font-semibold text-ink">{t('ux.home.noUrgent')}</span> {t('ux.home.noUrgentSub')}</p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-line-soft">
              {urgent.slice(0, 6).map((w) => (
                <li key={w.ward_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-32">
                    <p className="font-mono text-sm font-semibold">{w.ward_id}</p>
                    <p className="text-[11px] text-faint">{w.city}</p>
                  </div>
                  <RiskBadge tier={w.risk_tier} size="sm" />
                  <p className="min-w-40 flex-1 text-sm text-ink">{primaryNeed(w, t)}</p>
                  <Button asChild size="sm" variant="secondary"><Link to={wardLink('/dispatch', w)} state={{ focusWard: w.ward_id }}>{t('ux.home.viewActions')} <ArrowRight /></Link></Button>
                </li>
              ))}
            </ul>
          )}
          {urgent.length > 6 && (
            <Link to={{ pathname: '/allocation', search }} className="mt-3 inline-flex text-xs font-semibold text-accent hover:underline">{t('ux.home.seeAllUrgent', { n: urgent.length })}</Link>
          )}
        </Card>

        {/* 3. ward overview: schematic tiles, not a map */}
        <Card interactive={false} className="min-w-0">
          <CardHeader title={t('ux.home.overviewTitle')} sub={t('ux.home.overviewSub')} action={<KindTag kind="prediction" />} />
          {!p ? <LoadingBlock className="h-64" /> : (
            <div className="flex flex-col gap-4">
              {byCity.map(([c, ws]) => (
                <div key={c}>
                  <p className={cn('mb-1.5 text-xs font-semibold', c === city ? 'text-ink' : 'text-muted')}>{c}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ws.map((w) => (
                      <button key={w.ward_id} onClick={() => setPicked(w.ward_id === picked ? null : w.ward_id)}
                        aria-pressed={w.ward_id === picked}
                        aria-label={`${w.ward_id}, ${t(`risk.${w.risk_tier}`)}${w.severity !== 'ok' ? `, ${t(`ops.sev.${w.severity}`)}` : ''}`}
                        className={cn('relative grid size-9 place-items-center rounded-lg border text-[10px] font-bold transition-[transform,box-shadow] duration-150 hover:-translate-y-px hover:shadow-[var(--shadow-lift)]',
                          w.ward_id === picked ? 'ring-2 ring-accent ring-offset-2 ring-offset-panel' : '')}
                        style={{ background: `color-mix(in oklab, ${TIER_COLOR[w.risk_tier]} 22%, transparent)`, borderColor: `color-mix(in oklab, ${TIER_COLOR[w.risk_tier]} 55%, transparent)`, color: TIER_COLOR[w.risk_tier] }}>
                        {w.ward_id.match(/(\d+)$/)?.[1]}
                        {w.severity !== 'ok' && <span aria-hidden className="absolute -top-1 -right-1 grid size-3.5 place-items-center rounded-full bg-risk-critical text-[8px] text-white">!</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line-soft pt-3 text-[11px] text-muted">
                {(['Low', 'Medium', 'High', 'Critical'] as RiskTier[]).map((tier) => (
                  <span key={tier} className="flex items-center gap-1.5">
                    <span aria-hidden className="grid size-3.5 place-items-center rounded text-[8px] font-bold" style={{ background: `color-mix(in oklab, ${TIER_COLOR[tier]} 30%, transparent)`, color: TIER_COLOR[tier] }}>{TIER_MARK[tier]}</span>
                    {t(`risk.${tier}`)}
                  </span>
                ))}
                <span className="flex items-center gap-1.5"><span aria-hidden className="grid size-3.5 place-items-center rounded-full bg-risk-critical text-[8px] text-white">!</span>{t('ux.home.legendShort')}</span>
              </div>
              <p className="text-[11px] text-faint">{t('ux.home.schematic')}</p>
              {sel && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-canvas/40 p-3">
                  <div className="min-w-32"><p className="font-mono text-sm font-semibold">{sel.ward_id}</p><p className="text-[11px] text-faint">{sel.city}</p></div>
                  <RiskBadge tier={sel.risk_tier} size="sm" />
                  <SeverityBadge severity={sel.severity} />
                  <p className="min-w-40 flex-1 text-sm">{t('ux.home.selCases', { n: sel.planning_cases_whole })} · {primaryNeed(sel, t)}</p>
                  <Button asChild size="sm" variant="primary"><Link to={wardLink('/dispatch', sel)} state={{ focusWard: sel.ward_id }}>{t('ux.home.viewActions')} <ArrowRight /></Link></Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* 4. quick actions */}
      <section aria-labelledby="qa-title">
        <h2 id="qa-title" className="mb-3 text-[15px] font-semibold text-ink">{t('ux.home.qaTitle')}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {actions.map((a) => (
            <li key={a.to}>
              <Link to={{ pathname: a.to, search }} className="group flex h-full items-center gap-4 rounded-2xl border border-line-soft bg-panel p-4 transition-[transform,border-color,box-shadow] duration-200 ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent"><a.icon className="size-5" aria-hidden /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink">{a.label}</span><span className="block text-xs text-muted">{a.sub}</span></span>
                <ArrowRight className="size-4 text-muted transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
