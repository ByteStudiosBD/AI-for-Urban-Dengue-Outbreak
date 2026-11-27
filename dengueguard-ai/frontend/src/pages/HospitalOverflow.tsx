import { ArrowRight, CircleCheck, Info, Pencil, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { BedsField, BigAnswer, Choice, HowCalculated, NumberField, PageIntro, PlanBar, Section, ShowMore } from '@/components/ops/simple'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters, useMetadata } from '@/state/AppData'
import { useOps, usePlan } from '@/state/Ops'

function UseBar({ pct }: { pct: number }) {
  const color = pct > 100 ? 'var(--color-risk-critical)' : pct >= 85 ? 'var(--color-risk-medium)' : 'var(--color-risk-low)'
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-panel-2" aria-hidden>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}

export default function HospitalOverflow() {
  const { t, fmtNum } = useI18n()
  const { meta } = useMetadata()
  const { city, set } = useFilters()
  const { controls, setControls } = useOps()
  const q = usePlan()
  const p = q.data
  const [editing, setEditing] = useState(false)
  const [moreFull, setMoreFull] = useState(false)
  const pats = (n: number) => t(n === 1 ? 's.beds.pat1' : 's.beds.patN', { n })
  const wards = p?.wards ?? []
  // wards whose patients do not all fit: they send patients to other wards in the same city
  const over = wards.filter((w) => w.beds.required > w.beds.capacity)
  // every ward at or over its limit, worst first
  const full = wards.filter((w) => w.beds.required > 0 && w.beds.required >= w.beds.capacity)
    .sort((a, b) => (b.beds.required - b.beds.capacity) - (a.beds.required - a.beds.capacity) || b.beds.required - a.beds.required)
  const fullest = [...wards].filter((w) => w.beds.capacity > 0).sort((a, b) => b.beds.required / b.beds.capacity - a.beds.required / a.beds.capacity)[0]

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const tot = p?.cities.reduce((a, c) => ({ req: a.req + c.beds_required, cap: a.cap + c.bed_capacity, moved: a.moved + c.patients_routed, def: a.def + c.net_deficit }),
    { req: 0, cap: 0, moved: 0, def: 0 })
  const cityWards = (p?.wards ?? []).filter((w) => w.city === city).sort((a, b) => a.ward_id.localeCompare(b.ward_id))
  const overrides = controls.capacity_overrides
  // a typed bed total is stored as overrides for every ward; only count wards the officer edited one by one
  const nEdits = controls.beds_total === null ? Object.keys(overrides).length : 0
  const setCap = (ward: string, v: number) => setControls({ capacity_overrides: { ...overrides, [ward]: v }, beds_total: null })

  return (
    <div className="flex flex-col gap-5">
      <PlanBar />
      <PageIntro>{t('s.beds.intro')}</PageIntro>

      {!p || !tot ? <LoadingBlock className="h-40" /> : (
        <div className={cn('flex flex-col gap-5 transition-opacity', q.pending && 'opacity-70')}>
          <BigAnswer tone={tot.def ? 'bad' : 'good'}
            title={tot.def ? (tot.moved ? t(tot.def === 1 ? 's.beds.ansBad1Moved' : 's.beds.ansBadMoved', { d: tot.def, mp: pats(tot.moved) }) : t(tot.def === 1 ? 's.beds.ansBad1' : 's.beds.ansBad', { d: tot.def }))
              : tot.moved ? t('s.beds.ansMoved', { mp: pats(tot.moved) }) : t('s.beds.ansOk')}>
            {t('s.beds.ansSub', { req: fmtNum(tot.req), cap: fmtNum(tot.cap) })}
          </BigAnswer>
          <p className="flex items-start gap-2 text-[13px] text-muted"><Info className="mt-0.5 size-4 shrink-0 text-risk-medium" aria-hidden /> {t('s.beds.honest')}</p>

          <div className="grid gap-5 xl:grid-cols-2">
            <Section title={t('s.beds.moveTitle')} sub={t('s.beds.moveSub')}>
              {p.transfers.length === 0 ? (
                <div className="flex flex-col gap-3 text-[15px]">
                  <p className="flex items-start gap-2 text-ink"><CircleCheck className="mt-0.5 size-5 shrink-0 text-risk-low" aria-hidden />
                    {over.length === 0 ? t('s.beds.noMovesWhy') : t('s.beds.noReceiver')}</p>
                  {fullest && over.length === 0 && (
                    <p className="text-[13px] text-muted">{t('s.beds.fullest', { ward: fullest.ward_id, a: fullest.beds.required, b: fullest.beds.capacity })}</p>
                  )}
                  {over.length === 0 && controls.capacity_scale_pct > 75 && (
                    <Button className="h-11 self-start" onClick={() => setControls({ capacity_scale_pct: 75, capacity_overrides: {}, beds_total: null })}>{t('s.beds.tryFewer')}</Button>
                  )}
                </div>
              ) : (
                <ol className="flex flex-col gap-2">
                  {p.transfers.map((x, i) => (
                    <li key={i} className="flex items-start gap-3 rounded-xl border border-line-soft p-3">
                      <span aria-hidden className="num grid size-8 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-bold text-accent-ink">{i + 1}</span>
                      <div className="min-w-0 text-[15px] leading-relaxed">
                        <p className="text-ink">
                          {t(x.patients === 1 ? 's.beds.move1' : 's.beds.moveN', { n: x.patients })}{' '}
                          <span className="font-mono font-semibold">{x.from_ward}</span>
                          <ArrowRight aria-label={t('s.beds.to')} className="mx-1.5 inline size-4 text-accent" />
                          <span className="font-mono font-semibold">{x.to_ward}</span>
                        </p>
                        <p className="text-[13px] text-muted">{t('s.beds.sameCity', { city: x.city })}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            <Section title={t('s.beds.cityTitle')} sub={t('s.beds.citySub')}>
              <ul className="flex flex-col gap-3">
                {p.cities.map((c) => (
                  <li key={c.city} className="rounded-xl border border-line-soft p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[15px] font-semibold">{c.city}</p>
                      <p className={cn('text-[15px] font-semibold', c.net_deficit ? 'text-risk-critical' : 'text-risk-low')}>
                        {c.net_deficit ? t('s.beds.noBedN', { n: c.net_deficit }) : t('s.beds.allBed')}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <UseBar pct={c.utilisation_pct ?? 0} />
                      <span className="num shrink-0 text-[13px] text-muted">{t('s.beds.inUse', { a: c.beds_occupied_after_routing, b: c.bed_capacity })}</span>
                    </div>
                    <p className="num mt-1.5 text-[13px] text-muted">
                      {t('s.beds.cityFacts', { free: c.headroom_after_routing, moved: c.patients_routed, u: c.utilisation_pct === null ? '—' : fmtNum(c.utilisation_pct, 0) })}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        </div>
      )}

      {p && (
        <Section title={t('s.beds.fullTitle')} sub={t('s.beds.fullSub')} className={cn('transition-opacity', q.pending && 'opacity-70')}>
          {full.length === 0 ? <p className="text-[15px] text-muted">{t('s.beds.noneFull')}</p> : (
            <div className="flex flex-col">
              <ul>
                {(moreFull ? full : full.slice(0, 8)).map((w) => {
                  const excess = w.beds.required - w.beds.capacity
                  const to = p.transfers.filter((x) => x.from_ward === w.ward_id).map((x) => x.to_ward).join(', ')
                  return (
                    <li key={w.ward_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-soft py-3 last:border-0">
                      <div className="min-w-40 flex-1 basis-40">
                        <p className="font-mono text-[15px] font-semibold">{w.ward_id}</p>
                        <p className="text-[13px] text-muted">{w.city}</p>
                      </div>
                      <p className="num text-[15px]">{t('s.beds.needsHas', { a: w.beds.required, b: w.beds.capacity })}</p>
                      <p className={cn('text-[15px] font-semibold', w.beds.net_deficit ? 'text-risk-critical' : excess > 0 ? 'text-accent' : 'text-risk-medium')}>
                        {excess <= 0 ? t('s.beds.exactlyFull')
                          : [w.beds.routed_out ? t('s.beds.movedTo', { n: w.beds.routed_out, to }) : '', w.beds.net_deficit ? t('s.beds.stillNo', { n: w.beds.net_deficit }) : '']
                            .filter(Boolean).join(' · ')}
                      </p>
                    </li>
                  )
                })}
              </ul>
              <ShowMore shown={8} total={full.length} open={moreFull} onClick={() => setMoreFull((v) => !v)} />
            </div>
          )}
        </Section>
      )}

      <Section title={t('s.beds.editTitle')} sub={t('s.beds.editSub')}
        action={<Button className="h-11" aria-expanded={editing} onClick={() => setEditing((v) => !v)}><Pencil /> {editing ? t('s.beds.editClose') : t('s.beds.editOpen')}</Button>}>
        {editing ? (
          <div className="flex flex-col gap-6">
            <BedsField />
            <Choice<string> label={t('s.beds.pickCity')} value={city} onChange={(v) => set({ city: v })}
              options={(meta?.cities ?? []).map((c) => ({ value: c, label: c }))} />
            {nEdits > 0 && (
              <Button className="h-11 self-start" onClick={() => setControls({ capacity_overrides: {}, beds_total: null })}><RotateCcw /> {t('s.beds.undo', { n: nEdits })}</Button>
            )}
            {!p ? <LoadingBlock className="h-40" /> : (
              <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {cityWards.map((w) => (
                  <li key={w.ward_id} className={cn('rounded-xl border p-3', w.beds.capacity_overridden && controls.beds_total === null ? 'border-accent/60' : 'border-line-soft')}>
                    <NumberField size="md" label={w.ward_id} help={t('s.beds.wardHelp', { need: w.beds.required, base: w.beds.capacity_baseline })}
                      value={overrides[w.ward_id] ?? w.beds.capacity} min={0} max={999} onChange={(v) => setCap(w.ward_id, v)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-[15px] text-muted">{nEdits ? t('s.beds.editsActive', { n: nEdits }) : t('s.beds.editHint', { n: tot?.cap ?? '…' })}</p>
        )}
      </Section>

      <HowCalculated>
        <p>{t('ux.beds.rule')}</p>
        <p>{t('ux.beds.capNote')} {t('ux.beds.capNoteMore')}</p>
      </HowCalculated>
    </div>
  )
}
