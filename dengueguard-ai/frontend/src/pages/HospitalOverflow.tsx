import { ArrowRight, BedDouble, CircleCheck, Hospital, Info, RotateCcw, Shuffle, UserX } from 'lucide-react'
import { useState } from 'react'
import { Control, Disclosure, HorizonPicker, KindTag, Kpi, Segmented } from '@/components/ops/controls'
import { RiskBadge } from '@/components/RiskBadge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters } from '@/state/AppData'
import { useOps, usePlan } from '@/state/Ops'
import type { OpsCity } from '@/types/api'

function UtilBar({ pct, className }: { pct: number; className?: string }) {
  const color = pct > 100 ? 'var(--color-risk-critical)' : pct >= 85 ? 'var(--color-risk-medium)' : 'var(--color-risk-low)'
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-panel-2', className)} aria-hidden>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}

function CityRow({ c, active, onSelect }: { c: OpsCity; active: boolean; onSelect: () => void }) {
  const { t, fmtNum } = useI18n()
  const pct = c.demand_vs_capacity_pct ?? 0
  return (
    <button onClick={onSelect} aria-pressed={active}
      className={cn('grid w-full grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_repeat(3,minmax(0,0.6fr))]',
        active ? 'border-accent/70 bg-panel-2' : 'border-line-soft hover:border-line hover:bg-panel-2/50')}>
      <span className="text-sm font-semibold">{c.city}</span>
      <span className="flex items-center gap-2"><UtilBar pct={pct} className="flex-1" /><span className="num w-10 text-right text-xs text-muted">{fmtNum(pct, 0)}%</span></span>
      <span className="num hidden text-right text-xs sm:block"><span className="text-muted">{t('ux.beds.need')} </span>{fmtNum(c.beds_required)}</span>
      <span className="num hidden text-right text-xs sm:block"><span className="text-muted">{t('ux.beds.cap')} </span>{fmtNum(c.bed_capacity)}</span>
      <span className={cn('num text-right text-xs font-semibold', c.net_deficit > 0 ? 'text-risk-critical' : 'text-risk-low')}>
        {c.net_deficit > 0 ? t('ux.beds.short', { n: c.net_deficit }) : t('ops.ovf.covered')}
      </span>
    </button>
  )
}

export default function HospitalOverflow() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { city, set } = useFilters()
  const { controls, setControls } = useOps()
  const q = usePlan()
  const p = q.data
  const [scope, setScope] = useState<'city' | 'all'>('all')

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const tot = p?.cities.reduce((a, c) => ({ req: a.req + c.beds_required, cap: a.cap + c.bed_capacity, routed: a.routed + c.patients_routed, def: a.def + c.net_deficit }),
    { req: 0, cap: 0, routed: 0, def: 0 })
  const short = (p?.wards ?? []).filter((w) => w.beds.required > w.beds.capacity && (scope === 'all' || w.city === city))
    .sort((a, b) => (b.beds.required - b.beds.capacity) - (a.beds.required - a.beds.capacity))
  const transfers = (p?.transfers ?? []).filter((x) => scope === 'all' || x.city === city)
  const cityWards = (p?.wards ?? []).filter((w) => w.city === city).sort((a, b) => a.ward_id.localeCompare(b.ward_id))
  const overrides = controls.capacity_overrides
  const setCap = (ward: string, v: number | null) => {
    const next = { ...overrides }
    if (v === null || Number.isNaN(v)) delete next[ward]
    else next[ward] = Math.max(0, Math.min(999, Math.round(v)))
    setControls({ capacity_overrides: next })
  }

  return (
    <div className={cn('flex flex-col gap-5 transition-opacity duration-200', q.pending && p && 'opacity-70')}>
      <Card interactive={false} className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
          <HorizonPicker />
          <Control id="basis" />
          <Segmented label={t('ux.beds.scope')} value={scope} onChange={setScope}
            options={[{ value: 'all', label: t('ux.beds.allCities') }, { value: 'city', label: city }]} />
        </div>
        <p className="flex items-start gap-2 rounded-xl border border-risk-medium/35 bg-risk-medium/5 px-3 py-2 text-xs text-muted">
          <Info className="mt-px size-4 shrink-0 text-risk-medium" aria-hidden />
          <span><span className="font-semibold text-ink">{t('ux.beds.capNote')}</span> {t('ux.beds.capNoteMore')}</span>
        </p>
      </Card>

      <section aria-label={t('ops.ovf.kpis')} className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {!tot ? [0, 1, 2, 3].map((i) => <Card key={i}><LoadingBlock className="h-24" /></Card>) : <>
          <Kpi label={t('ux.beds.kNeed')} icon={<BedDouble />} value={fmtNum(tot.req)} sub={p ? t('ux.beds.kNeedSub', { date: fmtDate(p.scenario.target_date, 'long') }) : ''} />
          <Kpi label={t('ux.beds.kCap')} icon={<Hospital />} value={fmtNum(tot.cap)} sub={t('ux.beds.kCapSub', { n: controls.capacity_scale_pct })} />
          <Kpi label={t('ux.beds.kMoved')} icon={<Shuffle />} value={fmtNum(tot.routed)} sub={t('ops.ovf.kRoutedSub', { n: p!.transfers.length })} />
          <Kpi label={t('ux.beds.kLeft')} icon={<UserX />} tone={tot.def ? 'bad' : 'good'} value={fmtNum(tot.def)} sub={t('ops.ovf.kDeficitSub')} />
        </>}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card interactive={false} className="min-w-0">
          <CardHeader title={t('ux.beds.q1')} sub={t('ux.beds.q1Sub')} action={<KindTag kind="calculated" />} />
          {!p ? <LoadingBlock className="h-48" /> : (
            <div className="flex flex-col gap-2">
              {p.cities.map((c) => <CityRow key={c.city} c={c} active={c.city === city} onSelect={() => set({ city: c.city })} />)}
              {short.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-semibold text-muted">{t('ux.beds.overWards', { n: short.length })}</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {short.map((w) => (
                      <li key={w.ward_id} className="flex items-center gap-1.5 rounded-lg border border-risk-critical/35 bg-risk-critical/5 px-2 py-1 text-xs">
                        <span className="font-mono font-semibold">{w.ward_id}</span>
                        <span className="num text-muted">{w.beds.required}/{w.beds.capacity}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-2 flex items-center gap-2 text-sm text-muted"><CircleCheck className="size-4 text-risk-low" aria-hidden /> {t('ux.beds.noneOver')}</p>
              )}
            </div>
          )}
        </Card>

        <Card interactive={false} className="min-w-0">
          <CardHeader title={t('ux.beds.q2')} sub={t('ux.beds.q2Sub')} action={<KindTag kind="calculated" />} />
          {!p ? <LoadingBlock className="h-48" /> : transfers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">
              <p>{t('ops.ovf.noTransfers')}</p>
              {tot && tot.def === 0 && controls.capacity_scale_pct >= 100 && <p className="mt-2 text-xs text-faint">{t('ux.beds.tryStress')}</p>}
            </div>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] tracking-[0.05em] text-muted uppercase">
                    <th className="py-2 pr-3 font-semibold">{t('ux.beds.from')}</th>
                    <th aria-hidden className="py-2 pr-3" />
                    <th className="py-2 pr-3 font-semibold">{t('ux.beds.to')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('ux.beds.patients')}</th>
                    <th className="py-2 font-semibold">{t('ops.col.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((x, i) => (
                    <tr key={i} className="border-b border-line-soft last:border-0">
                      <td className="py-2.5 pr-3"><span className="font-mono text-xs font-semibold">{x.from_ward}</span></td>
                      <td aria-hidden className="py-2.5 pr-3"><ArrowRight className="size-4 text-accent" /></td>
                      <td className="py-2.5 pr-3"><span className="font-mono text-xs font-semibold">{x.to_ward}</span></td>
                      <td className="num py-2.5 pr-3 text-right font-semibold">{x.patients}</td>
                      <td className="py-2.5 text-xs text-muted">{t('ux.beds.planned', { city: x.city })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 border-t border-line-soft pt-3 text-xs leading-relaxed text-muted">{t('ux.beds.rule')}</p>
        </Card>
      </div>

      <Card interactive={false}>
        <CardHeader title={t('ux.beds.q3')} sub={t('ux.beds.q3Sub')} />
        {!p ? <LoadingBlock className="h-24" /> : (
          <ul className="grid gap-3 sm:grid-cols-3 2xl:grid-cols-5">
            {p.cities.map((c) => (
              <li key={c.city} className="rounded-xl border border-line-soft p-3">
                <p className="text-xs text-muted">{c.city}</p>
                <p className={cn('num text-2xl font-semibold', c.net_deficit ? 'text-risk-critical' : 'text-risk-low')}>{fmtNum(c.net_deficit)}</p>
                <p className="num text-[11px] text-faint">{t('ux.beds.freeLeft', { n: c.headroom_after_routing, u: c.utilisation_pct === null ? '—' : fmtNum(c.utilisation_pct, 0) })}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Disclosure title={t('ux.beds.edit')} sub={t('ux.beds.editSub')}>
        <Control id="capacity" />
        <Control id="intervention" />
        {Object.keys(overrides).length > 0 && (
          <Button size="sm" variant="secondary" className="self-start" onClick={() => setControls({ capacity_overrides: {} })}>
            <RotateCcw /> {t('ops.ovf.clearOverrides', { n: Object.keys(overrides).length })}
          </Button>
        )}
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">{t('ops.ovf.wardTable', { city })} · {t('ops.ovf.wardTableSub')}</p>
          {!p ? <LoadingBlock className="h-40" /> : (
            <div className="-mx-3.5 overflow-x-auto px-3.5">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] tracking-[0.05em] text-muted uppercase">
                    <th className="py-2 pr-3 font-semibold">{t('common.ward')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('ux.beds.need')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('ops.ovf.capacityEdit')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('ops.ovf.out')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('ops.ovf.in')}</th>
                    <th className="py-2 pr-3 text-right font-semibold">{t('ux.beds.leftCol')}</th>
                    <th className="py-2 font-semibold">{t('ops.ovf.util')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cityWards.map((w) => (
                    <tr key={w.ward_id} className="border-b border-line-soft last:border-0 hover:bg-panel-2/50">
                      <td className="py-2 pr-3"><span className="font-mono text-xs font-semibold">{w.ward_id}</span> <RiskBadge tier={w.risk_tier} size="sm" className="ml-1" /></td>
                      <td className={cn('num py-2 pr-3 text-right font-semibold', w.beds.required > w.beds.capacity && 'text-risk-critical')}>{w.beds.required}</td>
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
                      <td className="py-2"><div className="flex items-center gap-2"><UtilBar pct={w.beds.utilisation_pct ?? 0} className="w-20" />
                        <span className="num text-xs text-muted">{w.beds.utilisation_pct === null ? '—' : `${fmtNum(w.beds.utilisation_pct, 0)}%`}</span></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Disclosure>
    </div>
  )
}
