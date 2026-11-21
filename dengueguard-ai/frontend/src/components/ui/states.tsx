import { AlertTriangle, RotateCw } from 'lucide-react'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { Button } from './button'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-lg', className)} />
}

export function LoadingBlock({ className }: { className?: string }) {
  const { t } = useI18n()
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col gap-3', className)}>
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-full min-h-24 w-full" />
    </div>
  )
}

export function ErrorState({ error, onRetry, className }: { error: Error; onRetry?: () => void; className?: string }) {
  const { t } = useI18n()
  const network = (error as { code?: string }).code === 'network'
  return (
    <div role="alert" className={cn('flex flex-col items-start gap-3 rounded-xl border border-risk-critical/30 bg-risk-critical/5 p-4', className)}>
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <AlertTriangle className="size-4 text-risk-critical" />
        {network ? t('common.apiDown') : t('common.error')}
      </div>
      <p className="text-xs text-muted">{error.message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          <RotateCw /> {t('common.retry')}
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ message }: { message?: string }) {
  const { t } = useI18n()
  return <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{message ?? t('common.empty')}</p>
}
