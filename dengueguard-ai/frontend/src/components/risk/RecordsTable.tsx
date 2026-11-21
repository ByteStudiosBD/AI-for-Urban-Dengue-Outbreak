import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, RotateCcw, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useMetadata } from '@/state/AppData'
import type { RecordsQuery } from '@/types/api'

const PAGE_SIZES = [25, 50, 100, 200]
const ALL = '__all__'

const inputCls =
  'h-10 rounded-xl border border-line bg-panel px-3 text-sm text-ink placeholder:text-faint transition-colors duration-150 hover:border-line-strong focus-visible:border-accent focus-visible:outline-none'

/**
 * The original dataset, one server-side page at a time. Column names and cell values are
 * shown exactly as the API returns them from the source file (no rounding, null stays null).
 * Used full-page in View Data and, with `fixedWard`, inside the ward details panel.
 */
export function RecordsTable({ fixedWard, initialCity, initialWard, compact = false }: {
  fixedWard?: string
  initialCity?: string
  initialWard?: string
  compact?: boolean
}) {
  const { t, fmtNum, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const [city, setCity] = useState(initialCity ?? '')
  const [ward, setWard] = useState(initialWard ?? '')
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState('date')
  const [order, setOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(compact ? 25 : 50)

  // Typing in the search box only queries the server once the user pauses.
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q.trim()), 300)
    return () => clearTimeout(id)
  }, [q])
  useEffect(() => setPage(1), [qDebounced])

  // Filters that change the result set always return to page 1.
  const reset1 = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(1) }

  const filters: Omit<RecordsQuery, 'page' | 'page_size'> = fixedWard
    ? { ward_id: fixedWard, from: from || undefined, to: to || undefined, sort, order }
    : { city: city || undefined, ward_id: ward || undefined, q: qDebounced || undefined, from: from || undefined, to: to || undefined, sort, order }
  const query: RecordsQuery = { ...filters, page, page_size: size }
  const key = JSON.stringify(query)
  const res = useAsync(() => api.records(query), [key])
  const data = res.data

  const wardOptions = useMemo(() => {
    const ws = (meta?.wards ?? []).filter((w) => !city || w.city === city)
    return [{ value: ALL, label: t('data.allWards') }, ...ws.map((w) => ({ value: w.ward_id, label: w.ward_id }))]
  }, [meta, city, t])

  const toggleSort = (col: string) => {
    if (sort === col) setOrder(order === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setOrder(col === 'date' ? 'asc' : 'desc') }
    setPage(1)
  }

  const clear = () => {
    setCity(''); setWard(''); setQ(''); setQDebounced(''); setFrom(''); setTo('')
    setSort('date'); setOrder('asc'); setPage(1)
  }

  const cell = (col: string, v: string | number | null) => {
    if (v === null || v === undefined) return <span className="text-faint italic">{t('data.nullValue')}</span>
    if (col === 'date') return <span title={String(v)}>{String(v)}</span>
    if (typeof v === 'number') return String(v) // exact stored value, no rounding
    return v
  }

  const lo = data ? (data.page - 1) * data.page_size + 1 : 0
  const hi = data ? Math.min(data.total, data.page * data.page_size) : 0

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className={cn('flex flex-wrap items-end gap-2', compact && 'gap-1.5')}>
        {!fixedWard && (
          <>
            <Select
              label={t('data.city')}
              value={city || ALL}
              onValueChange={(v) => { setCity(v === ALL ? '' : v); setWard(''); setPage(1) }}
              options={[{ value: ALL, label: t('data.allCities') }, ...(meta?.cities ?? []).map((c) => ({ value: c, label: c }))]}
              className="w-40"
            />
            <Select label={t('data.ward')} value={ward || ALL} onValueChange={reset1((v: string) => setWard(v === ALL ? '' : v))} options={wardOptions} className="w-44" />
            <label className="relative">
              <span className="sr-only">{t('data.search')}</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('data.search')} className={cn(inputCls, 'w-44 pl-9')} maxLength={64} />
            </label>
          </>
        )}
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t('data.from')}
          <input type="date" value={from} min={meta?.coverage.date_min} max={meta?.coverage.date_max} onChange={(e) => reset1(setFrom)(e.target.value)} className={cn(inputCls, compact && 'h-9 text-xs')} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          {t('data.to')}
          <input type="date" value={to} min={meta?.coverage.date_min} max={meta?.coverage.date_max} onChange={(e) => reset1(setTo)(e.target.value)} className={cn(inputCls, compact && 'h-9 text-xs')} />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={clear}><RotateCcw />{t('data.reset')}</Button>
          <Button asChild size="sm" variant="secondary">
            <a href={api.recordsCsvUrl(filters)} download title={t('data.downloadHint')}><Download />{t('data.download')}</a>
          </Button>
        </div>
      </div>

      {res.error ? <ErrorState error={res.error} onRetry={res.retry} /> : !data ? <LoadingBlock className="h-64" /> : data.total === 0 ? <EmptyState message={t('data.none')} /> : (
        <>
          <div className={cn('relative overflow-auto rounded-xl border border-line-soft', compact ? 'max-h-[420px]' : 'max-h-[65dvh]', res.loading && 'opacity-60')} aria-busy={res.loading}>
            <table className="w-full min-w-max border-collapse text-left text-xs">
              <caption className="sr-only">{t('data.table')}</caption>
              <thead className="sticky top-0 z-10 bg-panel-2">
                <tr>
                  {data.columns.map((col) => {
                    const active = sort === col
                    const Icon = active ? (order === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
                    return (
                      <th key={col} scope="col" aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'} className="border-b border-line px-3 py-2 font-semibold whitespace-nowrap text-muted">
                        <button onClick={() => toggleSort(col)} className={cn('inline-flex items-center gap-1 rounded hover:text-ink', active && 'text-ink')} aria-label={t('data.sortBy', { col })}>
                          <code className="font-mono text-[11px]">{col}</code>
                          <Icon aria-hidden className={cn('size-3', !active && 'opacity-40')} />
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={`${row.ward_id}-${row.date}`} className="border-b border-line-soft odd:bg-ink/[0.025] hover:bg-panel-2">
                    {data.columns.map((col) => (
                      <td key={col} className={cn('px-3 py-1.5 whitespace-nowrap', typeof row[col] === 'number' ? 'num text-right' : 'text-ink')}>{cell(col, row[col])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <p aria-live="polite">{t('data.showing', { from: fmtNum(lo, 0), to: fmtNum(hi, 0), total: fmtNum(data.total, 0) })}</p>
            <div className="flex items-center gap-2">
              <Select label={t('data.pageSize')} value={String(size)} onValueChange={(v) => { setSize(Number(v)); setPage(1) }} options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))} className="h-8 w-20 text-xs" />
              <Button size="icon" variant="ghost" className="size-8" onClick={() => setPage(1)} disabled={page <= 1} aria-label={t('data.first')}><ChevronsLeft /></Button>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label={t('data.prev')}><ChevronLeft /></Button>
              <span className="num whitespace-nowrap">{t('data.page', { page: fmtNum(data.page, 0), pages: fmtNum(data.pages, 0) })}</span>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => setPage(page + 1)} disabled={page >= data.pages} aria-label={t('data.next')}><ChevronRight /></Button>
              <Button size="icon" variant="ghost" className="size-8" onClick={() => setPage(data.pages)} disabled={page >= data.pages} aria-label={t('data.last')}><ChevronsRight /></Button>
            </div>
          </div>
          {!compact && meta && <p className="text-[11px] text-faint">{fmtDate(meta.coverage.date_min, 'long')} – {fmtDate(meta.coverage.date_max, 'long')}</p>}
        </>
      )}
    </div>
  )
}
