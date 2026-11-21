import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { RiskTier } from '@/types/api'

export const TIER_COLOR: Record<RiskTier, string> = {
  Low: 'var(--color-risk-low)',
  Medium: 'var(--color-risk-medium)',
  High: 'var(--color-risk-high)',
  Critical: 'var(--color-risk-critical)',
}
/** Text marker so tiers never depend on colour alone. */
export const TIER_MARK: Record<RiskTier, string> = { Low: 'L', Medium: 'M', High: 'H', Critical: 'C' }

export function RiskBadge({ tier, size = 'md', className }: { tier: RiskTier; size?: 'sm' | 'md'; className?: string }) {
  const { t } = useI18n()
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        className,
      )}
      style={{ color: TIER_COLOR[tier], borderColor: `color-mix(in oklab, ${TIER_COLOR[tier]} 40%, transparent)`, background: `color-mix(in oklab, ${TIER_COLOR[tier]} 12%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: TIER_COLOR[tier] }} />
      {t(`risk.${tier}`)}
    </span>
  )
}
