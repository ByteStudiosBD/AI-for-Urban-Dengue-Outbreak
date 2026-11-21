import type { ReactNode } from 'react'

export function TooltipBox({ title, rows }: { title: ReactNode; rows: Array<{ label: ReactNode; value: ReactNode; color?: string }> }) {
  return (
    <div className="min-w-44 rounded-xl border border-line bg-[#14141c]/95 px-3 py-2.5 text-xs shadow-[var(--shadow-lift)] backdrop-blur">
      <p className="mb-1.5 font-semibold text-ink">{title}</p>
      <dl className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-muted">
              {r.color && <span aria-hidden className="size-2 rounded-full" style={{ background: r.color }} />}
              {r.label}
            </dt>
            <dd className="num font-semibold text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
