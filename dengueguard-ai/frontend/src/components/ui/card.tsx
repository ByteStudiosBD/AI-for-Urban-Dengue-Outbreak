import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, interactive = true, ...props }: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line-soft bg-panel p-5 transition-[transform,border-color,box-shadow] duration-200 ease-[var(--ease-out-expo)]',
        interactive && 'hover:-translate-y-0.5 hover:border-line hover:shadow-[var(--shadow-lift)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ title, sub, action, id }: { title: ReactNode; sub?: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  )
}
