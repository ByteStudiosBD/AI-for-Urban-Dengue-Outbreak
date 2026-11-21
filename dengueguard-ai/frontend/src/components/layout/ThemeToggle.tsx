import { Moon, Sun } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useTheme } from '@/state/theme'

/**
 * Pill-shaped dark/light switch. role="switch": Space/Enter toggle it, aria-checked = light on.
 * `variant="glass"` is for use on top of the homepage hero photo.
 */
export function ThemeToggle({ className, variant = 'default' }: { className?: string; variant?: 'default' | 'glass' }) {
  const { t } = useI18n()
  const { theme, toggle } = useTheme()
  const light = theme === 'light'
  const glass = variant === 'glass'
  return (
    <Tooltip content={t('top.themeHint')}>
      <button
        type="button"
        role="switch"
        aria-checked={light}
        aria-label={t('top.lightTheme')}
        onClick={toggle}
        className={cn(
          'relative inline-flex h-10 w-[4.5rem] shrink-0 items-center justify-between rounded-full border px-2.5 transition-colors duration-200',
          glass ? 'border-white/20 bg-black/40 text-white/70 backdrop-blur hover:border-white/40' : 'border-line bg-panel text-muted hover:border-line-strong',
          className,
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-1 left-1 size-8 rounded-full shadow-sm transition-transform duration-200 ease-[var(--ease-out-expo)]',
            light ? 'translate-x-[2rem] bg-accent' : 'translate-x-0 bg-accent',
          )}
        />
        <Moon aria-hidden className={cn('relative z-10 size-4 transition-colors', !light ? 'text-accent-ink' : '')} />
        <Sun aria-hidden className={cn('relative z-10 size-4 transition-colors', light ? 'text-accent-ink' : '')} />
      </button>
    </Tooltip>
  )
}
