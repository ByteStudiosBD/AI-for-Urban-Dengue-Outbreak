import { CircleCheck, FlaskConical, OctagonX, ShieldCheck, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { useI18n, type TKey } from '@/i18n'
import { cn } from '@/lib/utils'
import { useAsync } from '@/lib/useAsync'
import { api } from '@/services/api'
import type { Severity } from '@/types/api'

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
const SEV_ICON = { critical: OctagonX, warning: TriangleAlert, ok: CircleCheck }

/** Supplies status: Enough / Short / Very short. Always icon + word + colour. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useI18n()
  const c = SEV_COLOR[severity]
  const Icon = SEV_ICON[severity]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-semibold whitespace-nowrap"
      style={{ color: c, borderColor: `color-mix(in oklab, ${c} 40%, transparent)`, background: `color-mix(in oklab, ${c} 12%, transparent)` }}>
      <Icon aria-hidden className="size-4" />
      {t(`ops.sev.${severity}`)}
    </span>
  )
}

/** Visible label on every screen that shows assumption-based numbers. */
function AssumptionNote({ kind, children }: { kind: 'assumption' | 'scenario' | 'derived'; children: ReactNode }) {
  const { t } = useI18n()
  const Icon = kind === 'derived' ? ShieldCheck : FlaskConical
  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13px] leading-relaxed',
      kind === 'derived' ? 'border-risk-low/30 bg-risk-low/5' : 'border-risk-medium/35 bg-risk-medium/5')}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', kind === 'derived' ? 'text-risk-low' : 'text-risk-medium')} />
      <p className="text-muted"><span className="font-semibold text-ink">{t(`ops.kind.${kind}`)}: </span>{children}</p>
    </div>
  )
}

export function tFlag(t: (k: TKey) => string, f: string) {
  const k = `ops.flag.${f}` as TKey
  const s = t(k)
  return s === k ? f : s
}

/** The four Phase 2 assumptions, translated, with the fitted rates read from the API. */
export function AssumptionList() {
  const { t } = useI18n()
  const { data } = useAsync(() => api.opsAssumptions(), [])
  const r = data?.rates
  const items = [
    { id: 'supply_rates', kind: 'derived' as const, text: r ? t('ops.assume.supply_rates', {
      s: r.saline_bags_needed.rate.toFixed(3), k: r.diagnostic_kits_needed.rate.toFixed(3), b: r.hospital_beds_required.rate.toFixed(3),
      n: data!.rows_checked.toLocaleString('en') }) : '…' },
    { id: 'capacity', kind: 'assumption' as const, text: t('ops.assume.capacity') },
    { id: 'stock', kind: 'scenario' as const, text: t('ops.assume.stock') },
    { id: 'crews', kind: 'scenario' as const, text: t('ops.assume.crews') },
  ]
  return <div className="flex flex-col gap-3">{items.map((a) => <AssumptionNote key={a.id} kind={a.kind}>{a.text}</AssumptionNote>)}</div>
}
