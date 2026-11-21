import { ChevronLeft, ChevronRight, Info, RotateCcw, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RiskBadge, TIER_MARK } from '@/components/RiskBadge'
import { CRITICAL_PATTERN, NO_PREDICTION_FILL, OVERVIEW_FILL, TIERS } from '@/components/risk/overviewColors'
import { PrimaryTabs } from '@/components/risk/PrimaryTabs'
import { WardDetailPanel } from '@/components/risk/WardDetailPanel'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingBlock } from '@/components/ui/states'
import { Tooltip } from '@/components/ui/tooltip'
import { useI18n, type TKey } from '@/i18n'
import { useAsync } from '@/lib/useAsync'
import { addWeeks, cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useFilters, useMetadata } from '@/state/AppData'
import type { Horizon, PredictionResult, RiskTier, WardInfo } from '@/types/api'

type Layer = 'cases' | 'score' | 'none'

function WardTile({ w, p, selected, layer, onSelect }: {
  w: WardInfo; p: PredictionResult | undefined; selected: boolean; layer: Layer; onSelect: () => void
}) {
  const { t, fmtNum, fmtDate } = useI18n()
  const fill = p ? OVERVIEW_FILL[p.risk_tier] : NO_PREDICTION_FILL
  const critical = p?.risk_tier === 'Critical'
  const label = p
    ? `${w.ward_id}, ${w.city}: ${t(`risk.${p.risk_tier}`)}, ${fmtNum(p.predicted_cases, 1)} ${t('common.casesPerWeek')}`
    : `${w.ward_id}, ${w.city}: ${t('ro.noPrediction')}`
  const tip = (
    <div className="flex flex-col gap-1">
      <p className="font-semibold">{w.ward_id} · {w.city}</p>
      {p ? (
        <>
          <RiskBadge tier={p.risk_tier} size="sm" className="w-fit" />
          <p><span className="num font-semibold">{fmtNum(p.predicted_cases, 1)}</span> {t('common.casesPerWeek')} <span className="num text-muted">({fmtNum(p.interval.lower, 1)}–{fmtNum(p.interval.upper, 1)})</span></p>
          <p className="text-muted">{t('common.target')}: {fmtDate(p.target_date, 'long')}</p>
        </>
      ) : <p className="text-muted">{t('ro.noPrediction')}</p>}
    </div>
  )
  return (
    <Tooltip content={tip}>
      <button
        onClick={onSelect}
        aria-label={label}
        aria-pressed={selected}
        className={cn(
          'relative flex h-[72px] w-full min-w-0 flex-col justify-between overflow-hidden rounded-lg p-2 text-left transition-[transform,box-shadow,filter] duration-150 ease-[var(--ease-out-expo)] hover:z-10 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[var(--shadow-lift)]',
          critical && 'shadow-[inset_0_0_0_2px_rgba(255,255,255,0.92)]',
          selected && 'z-10 ring-2 ring-ink ring-offset-2 ring-offset-canvas',
          p ? 'text-[#0b0b10]' : 'text-ink',
        )}
        style={{ background: critical ? `${CRITICAL_PATTERN}, ${fill}` : fill }}
      >
        <span className="flex items-start justify-between gap-1">
          <span className="truncate font-mono text-[11px] font-semibold">{w.ward_id}</span>
          <span aria-hidden className={cn('grid size-4 shrink-0 place-items-center rounded text-[9px] font-bold', critical ? 'bg-[#0b0b10] text-white' : 'bg-black/15')}>
            {p ? TIER_MARK[p.risk_tier] : '–'}
          </span>
        </span>
        <span className="num text-[13px] leading-none font-semibold">
          {!p ? <span className="text-[10px] font-medium text-ink/80">{t('ro.noPrediction')}</span>
            : layer === 'cases' ? <>{fmtNum(p.predicted_cases, 1)} <span className="text-[10px] font-medium opacity-70">{t('ro.perWeek')}</span></>
            : layer === 'score' ? <>{fmtNum(p.risk_score, 0)} <span className="text-[10px] font-medium opacity-70">/ 100</span></>
            : null}
        </span>
      </button>
    </Tooltip>
  )
}

function Legend() {
  const { t } = useI18n()
  const item = (bg: string, label: string, extra?: string) => (
    <li className="flex items-center gap-2">
      <span aria-hidden className={cn('h-4 w-6 rounded', extra)} style={{ background: bg }} />
      <span>{label}</span>
    </li>
  )
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line-soft bg-panel px-4 py-3">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink" aria-label={t('ro.legend')}>
        {item(OVERVIEW_FILL.Low, t('ro.legendLow'))}
        {item(OVERVIEW_FILL.Medium, t('ro.legendMedium'))}
        {item(OVERVIEW_FILL.High, t('ro.legendRed'))}
        {item(`${CRITICAL_PATTERN}, ${OVERVIEW_FILL.Critical}`, t('ro.legendCritical'), 'shadow-[inset_0_0_0_2px_rgba(255,255,255,0.92)]')}
        {item(NO_PREDICTION_FILL, t('ro.legendNone'))}
      </ul>
      <p className="text-[11px] text-muted">{t('ro.legendNote')}</p>
    </div>
  )
}

export default function RiskOverview() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const { ward, asOf, h, set } = useFilters()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [tiers, setTiers] = useState<Set<RiskTier>>(() => new Set(TIERS))
  const [layer, setLayer] = useState<Layer>('cases')
  const [showFilters, setShowFilters] = useState(false)

  const cityFilter = params.get('rcity') ?? ''
  const panelOpen = params.get('panel') === '1'
  const patchParams = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) v === null ? next.delete(k) : next.set(k, v)
      return next
    }, { replace: true })

  // One request scores all 60 wards for the chosen reference week and horizon (model output, cached).
  const all = useAsync(() => (asOf ? api.predictAll(null, asOf, h) : null), [asOf, h])
  const byWard = useMemo(() => new Map((all.data?.predictions ?? []).map((p) => [p.ward_id, p])), [all.data])

  const cities = meta?.cities ?? []
  const wards = meta?.wards ?? []
  const needle = q.trim().toLowerCase()
  const allTiers = tiers.size === TIERS.length
  const visible = wards.filter((w) => {
    if (cityFilter && w.city !== cityFilter) return false
    if (needle && !w.ward_id.toLowerCase().includes(needle)) return false
    const p = byWard.get(w.ward_id)
    return p ? tiers.has(p.risk_tier) : allTiers
  })
  const scope = wards.filter((w) => !cityFilter || w.city === cityFilter)
  const tierCount = (tier: RiskTier) => scope.filter((w) => byWard.get(w.ward_id)?.risk_tier === tier).length

  const select = (w: WardInfo) => patchParams({ city: w.city, ward: w.ward_id, panel: '1' })
  const close = () => patchParams({ panel: null })
  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen])

  const weeks = meta?.available_weeks ?? []
  const wi = weeks.indexOf(asOf)
  const resetFilters = () => { setQ(''); setTiers(new Set(TIERS)); setLayer('cases'); patchParams({ rcity: null }) }

  const filtersPanel = (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('ro.window')}</legend>
        <label className="text-xs text-muted" htmlFor="ro-week">{t('ro.refWeek')}</label>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-9" disabled={wi <= 0} onClick={() => set({ asOf: weeks[wi - 1] })} aria-label={t('top.prevWeek')}><ChevronLeft /></Button>
          <input
            id="ro-week" type="date" value={asOf} min={meta?.as_of_range.min} max={meta?.as_of_range.max}
            onChange={(e) => e.target.value && set({ asOf: e.target.value })}
            className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel-2 px-2 text-sm text-ink [color-scheme:dark] focus-visible:border-accent focus-visible:outline-none"
          />
          <Button size="icon" variant="ghost" className="size-9" disabled={wi < 0 || wi >= weeks.length - 1} onClick={() => set({ asOf: weeks[wi + 1] })} aria-label={t('top.nextWeek')}><ChevronRight /></Button>
        </div>
        <span className="text-xs text-muted" id="ro-h">{t('ro.horizon')}</span>
        <div role="radiogroup" aria-labelledby="ro-h" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-panel-2 p-1">
          {([2, 3, 4] as Horizon[]).map((n) => (
            <button key={n} role="radio" aria-checked={h === n} onClick={() => set({ h: n })}
              className={cn('h-8 rounded-lg text-xs font-semibold transition-colors', h === n ? 'bg-ink text-canvas' : 'text-muted hover:text-ink')}>
              {t('top.wk', { n })}
            </button>
          ))}
        </div>
        {asOf && <p className="text-[11px] text-ink">{t('ro.targetWeek', { date: fmtDate(addWeeks(asOf, h), 'long') })}</p>}
        <p className="text-[11px] text-faint">{t('ro.windowNote')}</p>
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('ro.city')}</legend>
        {['', ...cities].map((c) => {
          const n = c ? wards.filter((w) => w.city === c).length : wards.length
          const active = cityFilter === c
          return (
            <button key={c || 'all'} onClick={() => patchParams({ rcity: c || null })} aria-pressed={active}
              className={cn('flex h-8 items-center justify-between rounded-lg px-2.5 text-left text-sm transition-colors', active ? 'bg-panel-2 text-ink' : 'text-muted hover:bg-panel-2/60 hover:text-ink')}>
              <span className="flex items-center gap-2">
                <span aria-hidden className={cn('size-1.5 rounded-full', active ? 'bg-accent' : 'bg-line')} />
                {c || t('ro.allCities')}
              </span>
              <span className="num text-[11px] text-faint">{n}</span>
            </button>
          )
        })}
      </fieldset>

      <label className="relative flex flex-col gap-1">
        <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">{t('ro.search')}</span>
        <Search aria-hidden className="pointer-events-none absolute bottom-2.5 left-2.5 size-4 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="DNCC_Ward_05" maxLength={32}
          className="h-9 rounded-lg border border-line bg-panel-2 pr-2 pl-8 font-mono text-sm text-ink placeholder:text-faint focus-visible:border-accent focus-visible:outline-none" />
      </label>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('ro.tiers')}</legend>
        {TIERS.map((tier) => (
          <label key={tier} className="flex h-8 cursor-pointer items-center justify-between rounded-lg px-2.5 text-sm text-ink hover:bg-panel-2/60">
            <span className="flex items-center gap-2.5">
              <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={tiers.has(tier)}
                onChange={() => setTiers((s) => { const n = new Set(s); if (n.has(tier)) n.delete(tier); else n.add(tier); return n })} />
              <span aria-hidden className="h-3 w-4 rounded-sm" style={{ background: tier === 'Critical' ? `${CRITICAL_PATTERN}, ${OVERVIEW_FILL[tier]}` : OVERVIEW_FILL[tier] }} />
              {t(`risk.${tier}`)}
            </span>
            <span className="num text-[11px] text-faint">{all.data ? tierCount(tier) : '–'}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">{t('ro.layer')}</legend>
        <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-panel-2 p-1">
          {([['cases', 'ro.layerCases'], ['score', 'ro.layerScore'], ['none', 'ro.layerNone']] as Array<[Layer, TKey]>).map(([v, k]) => (
            <button key={v} role="radio" aria-checked={layer === v} onClick={() => setLayer(v)}
              className={cn('min-h-8 rounded-lg px-1 text-[11px] leading-tight font-semibold transition-colors', layer === v ? 'bg-ink text-canvas' : 'text-muted hover:text-ink')}>
              {t(k)}
            </button>
          ))}
        </div>
      </fieldset>

      <Button size="sm" variant="ghost" onClick={resetFilters} className="w-fit"><RotateCcw />{t('ro.reset')}</Button>
    </div>
  )

  const selectedInfo = wards.find((w) => w.ward_id === ward)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PrimaryTabs />
        <Button size="sm" variant="secondary" className="lg:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} aria-controls="ro-filters">
          <SlidersHorizontal />{showFilters ? t('ro.hideFilters') : t('ro.showFilters')}
        </Button>
      </div>

      <div className={cn('grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]', panelOpen && 'xl:grid-cols-[250px_minmax(0,1fr)_420px]')}>
        <aside id="ro-filters" aria-label={t('ro.filters')}
          className={cn('rounded-2xl border border-line-soft bg-panel p-4 lg:sticky lg:top-4 lg:block', showFilters ? 'block' : 'hidden')}>
          {filtersPanel}
        </aside>

        <section aria-labelledby="ro-title" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="ro-title" className="text-lg font-semibold tracking-[-0.01em] text-ink">{t('ro.schematicTitle')}</h2>
              {all.data && (
                <p className="text-xs text-muted">
                  {t('ro.forecastFor', { h, date: fmtDate(all.data.target_date, 'long') })} · {t('top.asOf')} {fmtDate(all.data.as_of, 'long')}
                  {all.data.predictions[0] && <> · {t(`status.${all.data.predictions[0].evaluation_status}` as TKey)}</>}
                </p>
              )}
            </div>
            <p className="num text-xs text-muted" aria-live="polite">{t('ro.shown', { n: visible.length, total: wards.length })}</p>
          </div>

          <Legend />
          <p className="flex items-start gap-2 text-[11px] text-faint"><Info className="mt-px size-3.5 shrink-0" />{t('ro.schematicNote')} {t('ro.tileHint')}</p>

          {all.error ? <ErrorState error={all.error} onRetry={all.retry} /> : !all.data ? <LoadingBlock className="h-96" /> : visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">{t('ro.noMatch')}</p>
          ) : (
            <div className={cn('flex flex-col gap-4 transition-opacity', all.loading && 'opacity-60')} aria-busy={all.loading}>
              {cities.map((c) => {
                const ws = visible.filter((w) => w.city === c)
                if (!ws.length) return null
                return (
                  <section key={c} aria-label={c} className="rounded-2xl border border-line-soft bg-[#0e0e15] p-4">
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{c}</h3>
                      <span className="flex items-center gap-3 text-[11px] text-muted">
                        {TIERS.map((tier) => {
                          const n = ws.filter((w) => byWard.get(w.ward_id)?.risk_tier === tier).length
                          return n ? <span key={tier} className="num flex items-center gap-1"><span aria-hidden className="size-2 rounded-sm" style={{ background: OVERVIEW_FILL[tier] }} />{TIER_MARK[tier]} {n}</span> : null
                        })}
                        <span className="num">{t('ro.wards', { n: ws.length })}</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2">
                      {ws.map((w) => (
                        <WardTile key={w.ward_id} w={w} p={byWard.get(w.ward_id)} layer={layer}
                          selected={panelOpen && w.ward_id === ward} onSelect={() => select(w)} />
                      ))}
                    </div>
                  </section>
                )
              })}
              <p className="num text-[11px] text-faint">{fmtNum(all.data.total_predicted_cases, 1)} {t('common.cases')} · {t('ro.forecastFor', { h, date: fmtDate(all.data.target_date, 'long') })}</p>
            </div>
          )}
        </section>

        {panelOpen && selectedInfo && (
          <>
            <div className="fixed inset-0 z-40 bg-black/60 xl:hidden" onClick={close} aria-hidden />
            <aside
              aria-label={selectedInfo.ward_id}
              className={cn(
                'fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl border border-line bg-panel shadow-[var(--shadow-lift)]',
                'sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-2xl',
                'xl:sticky xl:top-4 xl:z-auto xl:h-[calc(100dvh-2rem)] xl:w-auto xl:rounded-2xl xl:shadow-none',
              )}
            >
              <WardDetailPanel wardId={selectedInfo.ward_id} onClose={close} />
            </aside>
          </>
        )}
      </div>
    </div>
  )
}
