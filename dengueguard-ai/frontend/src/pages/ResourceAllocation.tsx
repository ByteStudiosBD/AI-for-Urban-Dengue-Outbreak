import { ArrowRight, Building2, Siren } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AssumptionList, Control, Disclosure, FillBar, HorizonPicker, KindTag, Segmented, SeverityBadge, StepCard, tFlag } from '@/components/ops/controls'
import { RiskBadge } from '@/components/RiskBadge'
import { Card, CardHeader } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters, useMetadata } from '@/state/AppData'
import { useOps, usePlan } from '@/state/Ops'
import type { ConsumableKey, OpsWard } from '@/types/api'

type Filter = 'all' | 'flagged' | 'critical'

function SupplyCell({ w, k }: { w: OpsWard; k: ConsumableKey }) {
  const { fmtNum } = useI18n()
  const a = w.allocated[k]
  const r = w.required[k]
  if (a === null) return <span className="text-faint">—</span>
  return (
    <div className="flex min-w-24 flex-col gap-1">
      <span className="num text-sm"><span className={cn('font-semibold', a < r && 'text-risk-critical')}>{fmtNum(a)}</span><span className="text-muted"> / {fmtNum(r)}</span></span>
      <FillBar value={a} max={r} />
    </div>
  )
}

export default function ResourceAllocation() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const { city, set, search } = useFilters()
  const { controls } = useOps()
  const q = usePlan()
  const [filter, setFilter] = useState<Filter>('flagged')
  const p = q.data

  const rows = useMemo(() => {
    const ws = (p?.wards ?? []).filter((w) => w.in_pool)
    if (filter === 'flagged') return ws.filter((w) => w.severity !== 'ok')
    if (filter === 'critical') return ws.filter((w) => w.severity === 'critical')
    return ws
  }, [p, filter])

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const pool = (p?.wards ?? []).filter((w) => w.in_pool)
  const bedsNeeded = pool.reduce((a, w) => a + w.beds.required, 0)
  const bedsShort = pool.reduce((a, w) => a + w.beds.net_deficit, 0)
  const supplyRows: Array<{ key: ConsumableKey; label: string }> = [
    { key: 'saline_bags_needed', label: t('ops.supply.saline_bags_needed') },
    { key: 'diagnostic_kits_needed', label: t('ops.supply.diagnostic_kits_needed') },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <StepCard n={1} title={t('ux.sup.s1')} sub={t('ux.sup.s1Sub')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Control id="pool" />
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted">{t('top.city')}</span>
              <Select label={t('top.city')} value={city} onValueChange={(v) => set({ city: v })} icon={<Building2 />}
                options={(meta?.cities ?? []).map((c) => ({ value: c, label: c }))} />
            </div>
            <HorizonPicker />
            <Control id="basis" />
          </div>
          <p className="text-xs text-faint">{t('ux.sup.basisHelp')}</p>
        </StepCard>

        <StepCard n={2} title={t('ux.sup.s2')} sub={t('ux.sup.s2Sub')}>
          <Control id="stock" />
          <Control id="crews" />
          <Disclosure title={t('ux.sup.advanced')} sub={t('ux.sup.advancedSub')}>
            <Control id="risk" />
            <Control id="intervention" />
          </Disclosure>
        </StepCard>
      </div>

      <StepCard n={3} title={t('ux.sup.s3')}
        sub={p ? t('ux.sup.s3Sub', { date: fmtDate(p.scenario.target_date, 'long'), h: p.scenario.horizon_weeks, pool: p.scenario.city ?? t('ops.ctl.poolAll') }) : t('common.loading')}
        action={<KindTag kind="calculated" />}
        className={cn('transition-opacity duration-200', q.pending && p && 'opacity-70')}>
        {p && p.alerts.critical > 0 && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-risk-critical/40 bg-risk-critical/8 px-4 py-3">
            <Siren className="mt-0.5 size-5 shrink-0 text-risk-critical" aria-hidden />
            <div className="text-sm">
              <p className="font-semibold text-ink">{t('ops.alloc.criticalBanner', { n: p.alerts.critical })}</p>
              <p className="text-xs text-muted">{t('ops.alloc.criticalBannerSub', { stock: controls.stock_pct })}</p>
            </div>
          </div>
        )}
        {!p ? <LoadingBlock className="h-40" /> : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-[0.05em] text-muted uppercase">
                  <th className="py-2 pr-3 font-semibold">{t('ux.sup.item')}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t('ux.sup.needed')}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t('ux.sup.available')}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t('ux.sup.allocated')}</th>
                  <th className="py-2 text-right font-semibold">{t('ux.sup.shortage')}</th>
                </tr>
              </thead>
              <tbody>
                {supplyRows.map(({ key, label }) => {
                  const s = p.supplies[key]
                  return (
                    <tr key={key} className="border-b border-line-soft">
                      <th scope="row" className="py-3 pr-3 text-left font-semibold">{label}</th>
                      <td className="num py-3 pr-3 text-right">{fmtNum(s.required)}</td>
                      <td className="num py-3 pr-3 text-right">{fmtNum(s.available)}</td>
                      <td className="num py-3 pr-3 text-right font-semibold">{fmtNum(s.allocated)}</td>
                      <td className={cn('num py-3 text-right font-semibold', s.shortfall ? 'text-risk-critical' : 'text-risk-low')}>
                        {s.shortfall ? t('ux.sup.shortBy', { n: fmtNum(s.shortfall), w: s.wards_short }) : t('ux.sup.noShortage')}
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-b border-line-soft">
                  <th scope="row" className="py-3 pr-3 text-left font-semibold">{t('ops.supply.hospital_beds_required')}</th>
                  <td className="num py-3 pr-3 text-right">{fmtNum(bedsNeeded)}</td>
                  <td colSpan={2} className="py-3 pr-3 text-right text-xs text-muted">{t('ux.sup.bedsNote')}</td>
                  <td className={cn('num py-3 text-right font-semibold', bedsShort ? 'text-risk-critical' : 'text-risk-low')}>
                    {bedsShort ? t('ux.sup.bedsShort', { n: bedsShort }) : t('ux.sup.noShortage')}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="py-3 pr-3 text-left font-semibold">{t('ux.sup.crewsRow')}</th>
                  <td colSpan={3} className="num py-3 pr-3 text-right">{t('ux.sup.crewsVal', { a: p.crews.assigned, b: p.crews.total })}</td>
                  <td className={cn('py-3 text-right text-xs font-semibold', p.crews.high_risk_wards_without_crew ? 'text-risk-medium' : 'text-risk-low')}>
                    {t('ops.alloc.crewsSub', { n: p.crews.high_risk_wards_without_crew })}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to={{ pathname: '/overflow', search }} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">{t('ux.sup.toBeds')} <ArrowRight className="size-3.5" aria-hidden /></Link>
          <Link to={{ pathname: '/dispatch', search }} className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">{t('ux.sup.toDispatch')} <ArrowRight className="size-3.5" aria-hidden /></Link>
        </div>
      </StepCard>

      <Card interactive={false} className={cn('min-w-0 transition-opacity duration-200', q.pending && p && 'opacity-70')}>
        <CardHeader
          title={t('ux.sup.wardTitle')}
          sub={t('ux.sup.wardSub')}
          action={
            <div className="w-full sm:w-96">
              <Segmented<Filter> label={t('ops.alloc.show')} value={filter} onChange={setFilter}
                options={[{ value: 'flagged', label: t('ux.sup.fShort') }, { value: 'critical', label: t('ops.alloc.fCritical') }, { value: 'all', label: t('ops.alloc.fAll') }]} />
            </div>
          }
        />
        {!p ? <LoadingBlock className="h-80" /> : rows.length === 0 ? <EmptyState message={filter === 'all' ? t('ops.alloc.none') : t('ux.sup.noneShort')} /> : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-[0.05em] text-muted uppercase">
                  <th className="py-2 pr-3 font-semibold">{t('common.ward')}</th>
                  <th className="py-2 pr-3 font-semibold">{t('risk.tier')}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t('ops.col.priority')}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t('ux.sup.colCases')}</th>
                  <th className="py-2 pr-3 font-semibold">{t('ops.col.saline')}</th>
                  <th className="py-2 pr-3 font-semibold">{t('ops.col.kits')}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t('ops.col.beds')}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t('ops.col.crews')}</th>
                  <th className="py-2 font-semibold">{t('ops.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.ward_id} className="border-b border-line-soft align-top transition-colors last:border-0 hover:bg-panel-2/50">
                    <td className="py-2.5 pr-3"><span className="font-mono text-xs font-semibold">{w.ward_id}</span><span className="block text-[11px] text-faint">{w.city}</span></td>
                    <td className="py-2.5 pr-3"><RiskBadge tier={w.risk_tier} size="sm" /></td>
                    <td className="num py-2.5 pr-3 text-right font-semibold">{fmtNum(w.priority, 0)}</td>
                    <td className="num py-2.5 pr-3 text-right"><span className="font-semibold">{fmtNum(w.planning_cases_whole)}</span>
                      <span className="block text-[11px] text-faint">{fmtNum(w.interval[0], 0)}–{fmtNum(w.interval[1], 0)}</span></td>
                    <td className="py-2.5 pr-3"><SupplyCell w={w} k="saline_bags_needed" /></td>
                    <td className="py-2.5 pr-3"><SupplyCell w={w} k="diagnostic_kits_needed" /></td>
                    <td className="num py-2.5 pr-3 text-right">{fmtNum(w.beds.required)}{w.beds.net_deficit > 0 && <span className="block text-[11px] text-risk-critical">{t('ux.sup.bedsShortCell', { n: w.beds.net_deficit })}</span>}</td>
                    <td className="num py-2.5 pr-3 text-right font-semibold">{w.crews || <span className="text-faint">0</span>}</td>
                    <td className="py-2.5">
                      <SeverityBadge severity={w.severity} />
                      {w.flags.length > 0 && <ul className="mt-1 text-[11px] leading-snug text-faint">{w.flags.map((f) => <li key={f}>{tFlag(t, f)}</li>)}</ul>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Disclosure title={t('ux.sup.howTitle')} sub={t('ux.sup.howSub')}>
        <ol className="flex list-decimal flex-col gap-2 pl-4 text-sm leading-relaxed text-muted">
          <li>{t('ops.alloc.how1')}</li><li>{t('ops.alloc.how2')}</li><li>{t('ops.alloc.how3')}</li><li>{t('ops.alloc.how4')}</li>
        </ol>
        <AssumptionList />
      </Disclosure>
    </div>
  )
}
