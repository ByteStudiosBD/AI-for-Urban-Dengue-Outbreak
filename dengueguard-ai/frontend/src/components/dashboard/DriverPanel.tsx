import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useI18n, type TKey } from '@/i18n'
import type { Driver } from '@/types/api'

/** Diverging bars: how many predicted cases each factor group adds or removes versus
 * typical training-period conditions for this ward. */
export function DriverPanel({ drivers }: { drivers: Driver[] }) {
  const { t, fmtNum } = useI18n()
  const max = Math.max(0.5, ...drivers.map((d) => Math.abs(d.contribution_cases)))
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2.5">
        {drivers.map((d) => {
          const v = d.contribution_cases
          const pct = (Math.abs(v) / max) * 50
          const up = v >= 0
          return (
            <li key={d.group} className="grid grid-cols-[8.5rem_1fr_4.25rem] items-center gap-3 text-sm">
              <span className="truncate text-muted">{t(`drivers.${d.group}` as TKey)}</span>
              <div className="relative h-2.5 rounded-full bg-panel-2" aria-hidden>
                <span className="absolute top-[-3px] bottom-[-3px] left-1/2 w-px bg-line" />
                <span
                  className="absolute top-0 h-full rounded-full transition-[width,left] duration-[400ms] ease-[var(--ease-out-expo)]"
                  style={{
                    left: up ? '50%' : `${50 - pct}%`, width: `${pct}%`,
                    background: up ? 'var(--color-accent)' : 'var(--color-risk-low)',
                  }}
                />
              </div>
              <span className="num flex items-center justify-end gap-1 font-semibold" style={{ color: up ? 'var(--color-accent-soft)' : 'var(--color-risk-low)' }}>
                {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                {v > 0 ? '+' : ''}{fmtNum(v, 2)}
                <span className="sr-only">{up ? t('drivers.up') : t('drivers.down')}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-[11px] leading-relaxed text-faint">{t('drivers.note')}</p>
    </div>
  )
}
