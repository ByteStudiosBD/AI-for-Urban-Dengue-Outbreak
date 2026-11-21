import * as P from '@radix-ui/react-popover'
import { MapPinned, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters, useMetadata } from '@/state/AppData'

/** Search across all 60 wards; picking one also switches the city. */
export function WardSearch() {
  const { t } = useI18n()
  const { meta } = useMetadata()
  const { ward, set } = useFilters()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (meta?.wards ?? []).filter((w) => !s || w.ward_id.toLowerCase().includes(s) || w.city.toLowerCase().includes(s))
  }, [meta, q])

  const choose = (id: string) => {
    const w = meta?.wards.find((x) => x.ward_id === id)
    if (w) set({ city: w.city, ward: w.ward_id })
    setOpen(false)
    setQ('')
  }

  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger
        aria-label={t('top.ward')}
        className="inline-flex h-10 min-w-0 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm text-ink transition-colors duration-150 hover:border-[#4a4a58] hover:bg-panel-2 data-[state=open]:border-accent"
      >
        <MapPinned className="size-4 text-muted" />
        <span className="truncate font-medium">{ward}</span>
        <Search className="ml-1 size-3.5 text-faint" />
      </P.Trigger>
      <P.Portal>
        <P.Content sideOffset={6} align="start" className="z-50 w-72 rounded-xl border border-line bg-[#15151e] p-2 shadow-[var(--shadow-lift)] data-[state=open]:animate-[pop-in_180ms_var(--ease-out-expo)]">
          <label className="flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5">
            <Search className="size-4 text-faint" />
            <span className="sr-only">{t('top.searchWard')}</span>
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0) }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
                if (e.key === 'Enter' && results[active]) choose(results[active].ward_id)
              }}
              placeholder={t('top.searchWard')}
              role="combobox"
              aria-expanded
              aria-controls="ward-results"
              aria-activedescendant={results[active] ? `ward-opt-${results[active].ward_id}` : undefined}
              className="h-9 w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint"
            />
          </label>
          <ul id="ward-results" role="listbox" className="mt-2 max-h-72 overflow-y-auto">
            {results.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t('top.noWardMatch')}</li>}
            {results.map((w, i) => (
              <li
                key={w.ward_id}
                id={`ward-opt-${w.ward_id}`}
                role="option"
                aria-selected={w.ward_id === ward}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(w.ward_id)}
                className={cn('flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm', i === active && 'bg-panel-2', w.ward_id === ward && 'text-accent')}
              >
                <span className="font-medium">{w.ward_id}</span>
                <span className="text-xs text-muted">{w.city}</span>
              </li>
            ))}
          </ul>
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}
