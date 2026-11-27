import { Boxes, Droplets, Siren, SprayCan, TestTube } from 'lucide-react'
import { useMemo, useState } from 'react'
import { AssumptionList, FillBar, Kpi, ScenarioPanel, Segmented, SeverityBadge, tFlag } from '@/components/ops/controls'
import { RiskBadge } from '@/components/RiskBadge'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
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
  const { controls } = useOps()
  const q = usePlan()
  const [filter, setFilter] = useState<Filter>('all')
  const p = q.data

  const rows = useMemo(() => {
    const ws = (p?.wards ?? []).filter((w) => w.in_pool)
    if (filter === 'flagged') return ws.filter((w) => w.severity !== 'ok')
    if (filter === 'critical') return ws.filter((w) => w.severity === 'critical')
    return ws
  }, [p, filter])

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const s = p?.supplies
  const sal = s?.saline_bags_needed
  const kit = s?.diagnostic_kits_needed

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <ScenarioPanel show={['pool', 'stock', 'basis', 'risk', 'crews', 'intervention']} />

      <div className={cn('flex min-w-0 flex-col gap-5 transition-opacity duration-200', q.pending && p && 'opacity-70')}>
        <p className="text-sm text-muted">
          {p ? t('ops.alloc.subtitle', { date: fmtDate(p.scenario.target_date, 'long'), h: p.scenario.horizon_weeks, pool: p.scenario.city ?? t('ops.ctl.poolAll') }) : t('common.loading')}
        </p>

        {p && p.alerts.critical > 0 && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl border border-risk-critical/40 bg-risk-critical/8 px-4 py-3">
            <Siren className="mt-0.5 size-5 shrink-0 text-risk-critical" />
            <div className="text-sm">
              <p className="font-semibold text-ink">{t('ops.alloc.criticalBanner', { n: p.alerts.critical })}</p>
              <p className="text-xs text-muted">{t('ops.alloc.criticalBannerSub', { stock: controls.stock_pct })}</p>
            </div>
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4" aria-label={t('ops.alloc.kpis')}>
          {!p ? [0, 1, 2, 3].map((i) => <Card key={i}><LoadingBlock className="h-24" /></Card>) : <>
            <Kpi label={t('ops.supply.saline_bags_needed')} icon={<Droplets />} tone={sal!.shortfall ? 'bad' : undefined}
              value={<>{fmtNum(sal!.allocated)}<span className="text-base font-normal text-muted"> / {fmtNum(sal!.required)}</span></>}
              sub={sal!.shortfall ? t('ops.alloc.short', { n: fmtNum(sal!.shortfall), w: sal!.wards_short }) : t('ops.alloc.fullyMet')} />
            <Kpi label={t('ops.supply.diagnostic_kits_needed')} icon={<TestTube />} tone={kit!.shortfall ? 'bad' : undefined}
              value={<>{fmtNum(kit!.allocated)}<span className="text-base font-normal text-muted"> / {fmtNum(kit!.required)}</span></>}
              sub={kit!.shortfall ? t('ops.alloc.short', { n: fmtNum(kit!.shortfall), w: kit!.wards_short }) : t('ops.alloc.fullyMet')} />
            <Kpi label={t('ops.alloc.crews')} icon={<SprayCan />}
              value={<>{fmtNum(p.crews.assigned)}<span className="text-base font-normal text-muted"> / {fmtNum(p.crews.total)}</span></>}
              sub={t('ops.alloc.crewsSub', { n: p.crews.high_risk_wards_without_crew })} />
            <Kpi label={t('ops.alloc.alerts')} icon={<Boxes />} tone={p.alerts.critical ? 'bad' : 'good'}
              value={fmtNum(p.alerts.critical)} sub={t('ops.alloc.alertsSub', { n: p.alerts.warning })} />
          </>}
        </section>

        <Card interactive={false} className="min-w-0">
          <CardHeader
            title={t('ops.alloc.table')}
            sub={t('ops.alloc.tableSub')}
            action={
              <div className="w-64">
                <Segmented<Filter> label={t('ops.alloc.show')} value={filter} onChange={setFilter}
                  options={[{ value: 'all', label: t('ops.alloc.fAll') }, { value: 'flagged', label: t('ops.alloc.fFlagged') }, { value: 'critical', label: t('ops.alloc.fCritical') }]} />
              </div>
            }
          />
          {!p ? <LoadingBlock className="h-80" /> : rows.length === 0 ? <EmptyState message={t('ops.alloc.none')} /> : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] tracking-[0.05em] text-muted uppercase">
                    <th className="py-2 pr-3 font-semibold">{t('common.ward')}</th>
                    <th className="py-2 pr-3 font-semibold">{t('risk.tier')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('ops.col.priority')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('ops.col.density')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('ops.col.cases')}</th>
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
                      <td className="num py-2.5 pr-3 text-right font-semibold">{fmtNum(w.priority, 1)}</td>
                      <td className="num py-2.5 pr-3 text-right text-muted">{fmtNum(w.population_density_sqkm)}</td>
                      <td className="num py-2.5 pr-3 text-right"><span className="font-semibold">{fmtNum(w.planning_cases_whole)}</span>
                        <span className="block text-[11px] text-faint">{fmtNum(w.interval[0], 1)}–{fmtNum(w.interval[1], 1)}</span></td>
                      <td className="py-2.5 pr-3"><SupplyCell w={w} k="saline_bags_needed" /></td>
                      <td className="py-2.5 pr-3"><SupplyCell w={w} k="diagnostic_kits_needed" /></td>
                      <td className="num py-2.5 pr-3 text-right">{fmtNum(w.beds.required)}{w.beds.net_deficit > 0 && <span className="block text-[11px] text-risk-critical">−{w.beds.net_deficit}</span>}</td>
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

        <div className="grid gap-5 lg:grid-cols-2">
          <Card interactive={false}>
            <CardHeader title={t('ops.alloc.howTitle')} />
            <ol className="flex list-decimal flex-col gap-2 pl-4 text-sm leading-relaxed text-muted">
              <li>{t('ops.alloc.how1')}</li><li>{t('ops.alloc.how2')}</li><li>{t('ops.alloc.how3')}</li><li>{t('ops.alloc.how4')}</li>
            </ol>
          </Card>
          <AssumptionList />
        </div>
      </div>
    </div>
  )
}
