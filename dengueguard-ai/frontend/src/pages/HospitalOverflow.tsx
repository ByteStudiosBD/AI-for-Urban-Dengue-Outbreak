import { ArrowRight, BedDouble, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { AssumptionList, Kpi, ScenarioPanel, Segmented } from '@/components/ops/controls'
import { RiskBadge } from '@/components/RiskBadge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters } from '@/state/AppData'
import { useOps, usePlan } from '@/state/Ops'
import type { OpsCity } from '@/types/api'

function UtilBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? 'var(--color-risk-critical)' : pct >= 85 ? 'var(--color-risk-medium)' : 'var(--color-risk-low)'
  return (
    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-panel-2" aria-hidden>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}

function CityCard({ c, active, onSelect }: { c: OpsCity; active: boolean; onSelect: () => void }) {
  const { t, fmtNum } = useI18n()
  const demandPct = c.demand_vs_capacity_pct ?? 0
  return (
    <button onClick={onSelect} aria-pressed={active}
      className={cn('flex flex-col gap-3 rounded-2xl border bg-panel p-4 text-left transition-[transform,border-color,box-shadow] duration-200 ease-[var(--ease-out-expo)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]',
        active ? 'border-accent/70' : 'border-line-soft hover:border-line')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{c.city}</span>
        <span className={cn('num text-xs font-semibold', c.net_deficit > 0 ? 'text-risk-critical' : 'text-risk-low')}>
          {c.net_deficit > 0 ? t('ops.ovf.deficitN', { n: c.net_deficit }) : t('ops.ovf.covered')}
        </span>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[11px] text-muted">
          <span>{t('ops.ovf.demandVsCap')}</span><span className="num font-semibold text-ink">{fmtNum(demandPct, 0)}%</span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-panel-2">
          <div className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${Math.min(100, demandPct)}%`, background: demandPct > 100 ? 'var(--color-risk-critical)' : demandPct > 85 ? 'var(--color-risk-medium)' : 'var(--color-risk-low)' }} />
        </div>
      </div>
      <dl className="num grid grid-cols-3 gap-2 text-[11px]">
        <div><dt className="text-muted">{t('ops.ovf.required')}</dt><dd className="text-sm font-semibold">{fmtNum(c.beds_required)}</dd></div>
        <div><dt className="text-muted">{t('ops.ovf.capacity')}</dt><dd className="text-sm font-semibold">{fmtNum(c.bed_capacity)}</dd></div>
        <div><dt className="text-muted">{t('ops.ovf.headroom')}</dt><dd className="text-sm font-semibold">{fmtNum(c.headroom_after_routing)}</dd></div>
        <div><dt className="text-muted">{t('ops.ovf.routed')}</dt><dd className="text-sm font-semibold">{fmtNum(c.patients_routed)}</dd></div>
        <div className="col-span-2"><dt className="text-muted">{t('ops.ovf.utilAfter')}</dt><dd className="text-sm font-semibold">{c.utilisation_pct === null ? '—' : `${fmtNum(c.utilisation_pct, 1)}%`}</dd></div>
      </dl>
    </button>
  )
}

export default function HospitalOverflow() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { city, set } = useFilters()
  const { controls, setControls } = useOps()
  const q = usePlan()
  const p = q.data
  const [scope, setScope] = useState<'city' | 'all'>('city')

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const wards = (p?.wards ?? []).filter((w) => w.city === city).sort((a, b) => b.beds.required - b.beds.capacity - (a.beds.required - a.beds.capacity))
  const transfers = (p?.transfers ?? []).filter((x) => scope === 'all' || x.city === city)
  const tot = p?.cities.reduce((a, c) => ({ req: a.req + c.beds_required, cap: a.cap + c.bed_capacity, occ: a.occ + c.beds_occupied_after_routing, routed: a.routed + c.patients_routed, def: a.def + c.net_deficit }), { req: 0, cap: 0, occ: 0, routed: 0, def: 0 })
  const overrides = controls.capacity_overrides
  const setCap = (ward: string, v: number | null) => {
    const next = { ...overrides }
    if (v === null || Number.isNaN(v)) delete next[ward]
    else next[ward] = Math.max(0, Math.min(999, Math.round(v)))
    setControls({ capacity_overrides: next })
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <ScenarioPanel show={['basis', 'capacity', 'intervention']}
        footer={Object.keys(overrides).length > 0 && (
          <Button size="sm" variant="secondary" onClick={() => setControls({ capacity_overrides: {} })}>
            <RotateCcw /> {t('ops.ovf.clearOverrides', { n: Object.keys(overrides).length })}
          </Button>
        )} />

      <div className={cn('flex min-w-0 flex-col gap-5 transition-opacity duration-200', q.pending && p && 'opacity-70')}>
        <p className="text-sm text-muted">{p ? t('ops.ovf.subtitle', { date: fmtDate(p.scenario.target_date, 'long'), h: p.scenario.horizon_weeks }) : t('common.loading')}</p>
        <AssumptionList only={['capacity']} />

        <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4" aria-label={t('ops.ovf.kpis')}>
          {!tot ? [0, 1, 2, 3].map((i) => <Card key={i}><LoadingBlock className="h-24" /></Card>) : <>
            <Kpi label={t('ops.ovf.kBeds')} icon={<BedDouble />} value={<>{fmtNum(tot.req)}<span className="text-base font-normal text-muted"> / {fmtNum(tot.cap)}</span></>} sub={t('ops.ovf.kBedsSub')} />
            <Kpi label={t('ops.ovf.kRouted')} value={fmtNum(tot.routed)} sub={t('ops.ovf.kRoutedSub', { n: p!.transfers.length })} />
            <Kpi label={t('ops.ovf.kDeficit')} value={fmtNum(tot.def)} tone={tot.def ? 'bad' : 'good'} sub={t('ops.ovf.kDeficitSub')} />
            <Kpi label={t('ops.ovf.kUtil')} value={tot.cap ? `${fmtNum((100 * tot.occ) / tot.cap, 0)}%` : '—'} sub={t('ops.ovf.kUtilSub')} />
          </>}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-5" aria-label={t('ops.ovf.cities')}>
          {p?.cities.map((c) => <CityCard key={c.city} c={c} active={c.city === city} onSelect={() => set({ city: c.city })} />)}
        </section>

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card interactive={false} className="min-w-0">
            <CardHeader title={t('ops.ovf.wardTable', { city })} sub={t('ops.ovf.wardTableSub')} />
            {!p ? <LoadingBlock className="h-72" /> : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] tracking-[0.05em] text-muted uppercase">
                      <th className="py-2 pr-3 font-semibold">{t('common.ward')}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{t('ops.ovf.required')}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{t('ops.ovf.capacityEdit')}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{t('ops.ovf.out')}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{t('ops.ovf.in')}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{t('ops.ovf.net')}</th>
                      <th className="py-2 font-semibold">{t('ops.ovf.util')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wards.map((w) => (
                      <tr key={w.ward_id} className="border-b border-line-soft last:border-0 hover:bg-panel-2/50">
                        <td className="py-2 pr-3"><span className="font-mono text-xs font-semibold">{w.ward_id}</span> <RiskBadge tier={w.risk_tier} size="sm" className="ml-1" /></td>
                        <td className={cn('num py-2 pr-3 text-right font-semibold', w.beds.required > w.beds.capacity && 'text-risk-critical')}>{fmtNum(w.beds.required)}</td>
                        <td className="py-2 pr-3 text-right">
                          <input type="number" min={0} max={999} aria-label={t('ops.ovf.capacityFor', { ward: w.ward_id })}
                            value={overrides[w.ward_id] ?? w.beds.capacity}
                            onChange={(e) => setCap(w.ward_id, e.target.value === '' ? null : Number(e.target.value))}
                            className={cn('num h-8 w-16 rounded-lg border bg-canvas px-2 text-right text-sm', w.beds.capacity_overridden ? 'border-accent text-accent' : 'border-line')} />
                          {w.beds.capacity_overridden && <span className="block text-[10px] text-faint">{t('ops.ovf.baseline', { n: w.beds.capacity_baseline })}</span>}
                        </td>
                        <td className="num py-2 pr-3 text-right">{w.beds.routed_out || <span className="text-faint">0</span>}</td>
                        <td className="num py-2 pr-3 text-right">{w.beds.routed_in || <span className="text-faint">0</span>}</td>
                        <td className={cn('num py-2 pr-3 text-right font-semibold', w.beds.net_deficit > 0 ? 'text-risk-critical' : 'text-faint')}>{w.beds.net_deficit}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2"><UtilBar pct={w.beds.utilisation_pct ?? 0} />
                            <span className="num text-xs text-muted">{w.beds.utilisation_pct === null ? '—' : `${fmtNum(w.beds.utilisation_pct, 0)}%`}</span></div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card interactive={false}>
            <CardHeader title={t('ops.ovf.transfers')} sub={t('ops.ovf.transfersSub')}
              action={<div className="w-60"><Segmented label={t('ops.ovf.scope')} value={scope} onChange={setScope}
                options={[{ value: 'city', label: city }, { value: 'all', label: t('ops.ctl.poolAll') }]} /></div>} />
            {!p ? <LoadingBlock className="h-40" /> : transfers.length === 0 ? <EmptyState message={t('ops.ovf.noTransfers')} /> : (
              <ul className="flex flex-col gap-2">
                {transfers.map((x, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-line-soft bg-canvas/40 px-3 py-2 text-sm">
                    <span className="font-mono text-xs font-semibold">{x.from_ward}</span>
                    <ArrowRight className="size-4 shrink-0 text-accent" />
                    <span className="font-mono text-xs font-semibold">{x.to_ward}</span>
                    <span className="num ml-auto font-semibold">{t(x.patients === 1 ? 'ops.ovf.patientOne' : 'ops.ovf.patients', { n: x.patients })}</span>
                    {scope === 'all' && <span className="hidden text-[11px] text-faint sm:inline">{x.city}</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 border-t border-line-soft pt-3 text-xs leading-relaxed text-muted">{t('ops.ovf.rule')}</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
