import { ChevronRight, FlaskConical, Info, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip } from '@/components/ui/tooltip'
import { useI18n, type TKey } from '@/i18n'
import { cn } from '@/lib/utils'
import { useOps, type OpsControls } from '@/state/Ops'
import { useAsync } from '@/lib/useAsync'
import { api } from '@/services/api'
import { useFilters } from '@/state/AppData'
import type { Severity } from '@/types/api'

/* ---------------- primitives ---------------- */
export function Slider({ label, value, min, max, step = 1, onChange, format, hint }: {
  label: string; value: number; min: number; max: number; step?: number
  onChange: (v: number) => void; format?: (v: number) => string; hint?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="flex flex-col gap-2">
      <span className="flex items-baseline justify-between gap-3 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-muted">
          {label}
          {hint && <Tooltip content={hint}><Info className="size-3.5 text-faint" aria-label={hint} /></Tooltip>}
        </span>
        <span className="num text-sm font-semibold text-ink">{format ? format(value) : value}</span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ops-range" style={{ '--fill': `${pct}%` } as React.CSSProperties}
      />
      <span className="num flex justify-between text-[10px] text-faint"><span>{format ? format(min) : min}</span><span>{format ? format(max) : max}</span></span>
    </label>
  )
}

export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-line bg-canvas p-1">
        {options.map((o) => (
          <button
            key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
            className={cn('h-8 truncate rounded-lg px-2 text-xs font-semibold whitespace-nowrap transition-colors duration-150', value === o.value ? 'bg-ink text-canvas' : 'text-muted hover:text-ink')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-accent)]" />
      <span><span className="font-medium text-ink">{label}</span>{hint && <span className="mt-0.5 block text-faint">{hint}</span>}</span>
    </label>
  )
}

export function FillBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, (100 * value) / max) : 100
  const color = pct >= 100 ? 'var(--color-risk-low)' : pct >= 75 ? 'var(--color-risk-medium)' : pct >= 50 ? 'var(--color-risk-high)' : 'var(--color-risk-critical)'
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-panel-2', className)} aria-hidden>
      <div className="h-full rounded-full transition-[width] duration-300 ease-[var(--ease-out-expo)]" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

const SEV_COLOR: Record<Severity, string> = { critical: 'var(--color-risk-critical)', warning: 'var(--color-risk-medium)', ok: 'var(--color-risk-low)' }

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useI18n()
  const c = SEV_COLOR[severity]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ color: c, borderColor: `color-mix(in oklab, ${c} 40%, transparent)`, background: `color-mix(in oklab, ${c} 12%, transparent)` }}>
      {severity === 'critical' ? <TriangleAlert className="size-3" /> : <span aria-hidden className="size-1.5 rounded-full" style={{ background: c }} />}
      {t(`ops.sev.${severity}`)}
    </span>
  )
}

export function Kpi({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'good'; icon?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">{label}</p>
        {icon && <span className="grid size-8 place-items-center rounded-full bg-panel-2 text-ink [&_svg]:size-4">{icon}</span>}
      </div>
      <p className={cn('num text-3xl font-semibold tracking-[-0.02em]', tone === 'bad' && 'text-risk-critical', tone === 'good' && 'text-risk-low')}>{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </Card>
  )
}

/** Visible label on every screen that shows assumption-based numbers. */
export function AssumptionNote({ kind, children }: { kind: 'assumption' | 'scenario' | 'derived'; children: ReactNode }) {
  const { t } = useI18n()
  const Icon = kind === 'derived' ? ShieldCheck : FlaskConical
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed',
      kind === 'derived' ? 'border-risk-low/30 bg-risk-low/5' : 'border-risk-medium/35 bg-risk-medium/5')}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', kind === 'derived' ? 'text-risk-low' : 'text-risk-medium')} />
      <p className="text-muted"><span className="font-semibold text-ink">{t(`ops.kind.${kind}`)}: </span>{children}</p>
    </div>
  )
}

/* ---------------- scenario controls ---------------- */
export type ControlId = 'pool' | 'stock' | 'basis' | 'risk' | 'crews' | 'effect' | 'maxCrews' | 'capacity' | 'intervention'

/** One scenario control, bound to the shared scenario state. Pages arrange these freely. */
export function Control({ id }: { id: ControlId }) {
  const { t } = useI18n()
  const { controls: c, setControls: set } = useOps()
  const { city } = useFilters()
  const pct = (v: number) => `${v}%`
  switch (id) {
    case 'pool': return <Segmented<OpsControls['pool']> label={t('ops.ctl.pool')} value={c.pool} onChange={(v) => set({ pool: v })}
      options={[{ value: 'all', label: t('ops.ctl.poolAll') }, { value: 'city', label: city }]} />
    case 'stock': return <Slider label={t('ops.ctl.stock')} hint={t('ops.ctl.stockHint')} value={c.stock_pct} min={30} max={100} format={pct} onChange={(v) => set({ stock_pct: v })} />
    case 'basis': return <Segmented<OpsControls['demand_basis']> label={t('ops.ctl.basis')} value={c.demand_basis} onChange={(v) => set({ demand_basis: v })}
      options={[{ value: 'expected', label: t('ops.ctl.basisExpected') }, { value: 'upper', label: t('ops.ctl.basisUpper') }]} />
    case 'risk': return <Slider label={t('ops.ctl.riskWeight')} hint={t('ops.ctl.riskWeightHint')} value={Math.round(c.risk_weight * 100)} min={0} max={100} step={5}
      format={(v) => `${v} / ${100 - v}`} onChange={(v) => set({ risk_weight: v / 100 })} />
    case 'crews': return <Slider label={t('ops.ctl.crews')} value={c.total_crews} min={0} max={60} onChange={(v) => set({ total_crews: v, deployment: null })} />
    case 'effect': return <Slider label={t('ops.ctl.effect')} hint={t('ops.ctl.effectHint')} value={c.effect_per_crew_pct} min={0} max={30} format={pct} onChange={(v) => set({ effect_per_crew_pct: v })} />
    case 'maxCrews': return <Slider label={t('ops.ctl.maxCrews')} value={c.max_crews_per_ward} min={1} max={6} onChange={(v) => set({ max_crews_per_ward: v })} />
    case 'capacity': return <Slider label={t('ops.ctl.capacity')} hint={t('ops.ctl.capacityHint')} value={c.capacity_scale_pct} min={50} max={150} step={5} format={pct} onChange={(v) => set({ capacity_scale_pct: v })} />
    case 'intervention': return <Toggle label={t('ops.ctl.withIntervention')} hint={t('ops.ctl.withInterventionHint')} checked={c.plan_with_intervention} onChange={(v) => set({ plan_with_intervention: v })} />
  }
}

/** Forecast horizon picker (writes the shared ?h= filter, same as the top bar). */
export function HorizonPicker() {
  const { t } = useI18n()
  const { h, set } = useFilters()
  return (
    <Segmented<string> label={t('ux.horizon')} value={String(h)} onChange={(v) => set({ h: Number(v) as 2 | 3 | 4 })}
      options={[2, 3, 4].map((n) => ({ value: String(n), label: t('top.wk', { n }) }))} />
  )
}

/** Numbered step with a title, used to turn each operations page into a short workflow. */
export function StepCard({ n, title, sub, children, action, className }: {
  n: number; title: string; sub?: string; children: ReactNode; action?: ReactNode; className?: string
}) {
  return (
    <Card interactive={false} className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span aria-hidden className="num grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-ink">{n}</span>
          <div>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink"><span className="sr-only">{`Step ${n}: `}</span>{title}</h2>
            {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </Card>
  )
}

/** Collapsed-by-default section for secondary settings (native <details>: keyboard accessible). */
export function Disclosure({ title, sub, children, defaultOpen = false }: { title: string; sub?: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-line-soft bg-canvas/40">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-ink hover:bg-panel-2/60 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 text-muted transition-transform duration-150 group-open:rotate-90" />
        <span>{title}</span>
        {sub && <span className="ml-auto hidden text-xs font-normal text-faint sm:inline">{sub}</span>}
      </summary>
      <div className="flex flex-col gap-5 border-t border-line-soft px-3.5 py-4">{children}</div>
    </details>
  )
}

export type DataKind = 'historical' | 'prediction' | 'assumption' | 'calculated' | 'hypothetical'
/** Small text tag that says what kind of number a block shows (never colour alone). */
export function KindTag({ kind }: { kind: DataKind }) {
  const { t } = useI18n()
  return <span className="inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold tracking-[0.04em] text-muted uppercase">{t(`ux.kind.${kind}`)}</span>
}

/** One-line summary of the scenario other pages use, with a link to change it. */
export function ScenarioSummary({ editTo }: { editTo?: string }) {
  const { t, fmtDate } = useI18n()
  const { controls: c, reset } = useOps()
  const { asOf, h, city, search } = useFilters()
  const chips = [
    t('ux.sum.week', { date: fmtDate(asOf, 'long'), h }),
    c.pool === 'city' ? city : t('ops.ctl.poolAll'),
    t('ux.sum.stock', { n: c.stock_pct }),
    t('ux.sum.crews', { n: c.total_crews }),
    t('ux.sum.capacity', { n: c.capacity_scale_pct }),
    c.demand_basis === 'upper' ? t('ops.ctl.basisUpper') : t('ops.ctl.basisExpected'),
  ]
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line-soft bg-panel px-4 py-2.5 text-xs text-muted">
      <span className="font-semibold text-ink">{t('ux.sum.title')}</span>
      {chips.map((s) => <span key={s} className="num rounded-full bg-panel-2 px-2.5 py-1">{s}</span>)}
      <span className="ml-auto flex items-center gap-1">
        {editTo && <Button asChild size="sm" variant="ghost"><Link to={{ pathname: editTo, search }}>{t('ux.sum.change')}</Link></Button>}
        <Button size="sm" variant="ghost" onClick={reset}><RotateCcw /> {t('ops.ctl.reset')}</Button>
      </span>
    </div>
  )
}

export function tFlag(t: (k: TKey) => string, f: string) {
  const k = `ops.flag.${f}` as TKey
  const s = t(k)
  return s === k ? f : s
}

/** The four Phase 2 assumptions, translated, with the fitted rates read from the API. */
export function AssumptionList({ only }: { only?: Array<'supply_rates' | 'capacity' | 'stock' | 'crews'> }) {
  const { t } = useI18n()
  const { data } = useAsync(() => api.opsAssumptions(), [])
  const r = data?.rates
  const items = [
    { id: 'supply_rates' as const, kind: 'derived' as const, text: r ? t('ops.assume.supply_rates', {
      s: r.saline_bags_needed.rate.toFixed(3), k: r.diagnostic_kits_needed.rate.toFixed(3), b: r.hospital_beds_required.rate.toFixed(3),
      n: data!.rows_checked.toLocaleString('en') }) : '…' },
    { id: 'capacity' as const, kind: 'assumption' as const, text: t('ops.assume.capacity') },
    { id: 'stock' as const, kind: 'scenario' as const, text: t('ops.assume.stock') },
    { id: 'crews' as const, kind: 'scenario' as const, text: t('ops.assume.crews') },
  ].filter((a) => !only || only.includes(a.id))
  return <div className="flex flex-col gap-3">{items.map((a) => <AssumptionNote key={a.id} kind={a.kind}>{a.text}</AssumptionNote>)}</div>
}
