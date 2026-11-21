import { ChevronLeft, ChevronRight, Database, Info, Layers, Minus, Plus, RotateCcw, Scan, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
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
import type { Horizon, PredictAllResponse, PredictionResult, RiskTier, WardInfo } from '@/types/api'

type Layer = 'cases' | 'score' | 'none'
const LAYERS: Layer[] = ['cases', 'score', 'none']
const LAYER_KEY: Record<Layer, TKey> = { cases: 'ro.layerCases', score: 'ro.layerScore', none: 'ro.layerNone' }
/** "Zoom" only changes tile size; tiles have no geographic position to zoom into. */
const ZOOM = [
  { min: 92, h: 58 },
  { min: 118, h: 72 },
  { min: 148, h: 84 },
  { min: 188, h: 96 },
]

function useMinWidth(px: number) {
  const q = `(min-width: ${px}px)`
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setOk(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [q])
  return ok
}

/* ------------------------------------------------------------------ building blocks */

function PaneHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line bg-[#0c0c11] px-4">
      <h2 className="truncate text-[15px] font-semibold text-ink">{title}</h2>
      {action}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="border-b border-line-soft bg-[#0f0f15] px-4 py-2 text-[13px] font-semibold text-ink">{children}</h3>
}

function Dot({ color, hollow, stripes }: { color: string; hollow?: boolean; stripes?: boolean }) {
  return (
    <span aria-hidden className="size-2.5 shrink-0 rounded-full"
      style={hollow ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : { background: stripes ? `${CRITICAL_PATTERN}, ${color}` : color, boxShadow: stripes ? 'inset 0 0 0 1px #fff' : undefined }} />
  )
}

function WardTile({ w, p, selected, layer, height, onSelect }: {
  w: WardInfo; p: PredictionResult | undefined; selected: boolean; layer: Layer; height: number; onSelect: () => void
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
        style={{ height, background: critical ? `${CRITICAL_PATTERN}, ${fill}` : fill }}
        className={cn(
          'relative flex w-full min-w-0 flex-col justify-between overflow-hidden rounded-[6px] p-2 text-left transition-[transform,box-shadow,filter,opacity] duration-150 ease-[var(--ease-out-expo)] hover:z-10 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.9)]',
          critical && 'shadow-[inset_0_0_0_2px_rgba(255,255,255,0.92)]',
          selected && 'z-10 ring-2 ring-white ring-offset-2 ring-offset-[#101016]',
          p ? 'text-[#0b0b10]' : 'text-ink',
        )}
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

/** Histogram of the model's predicted weekly cases across the wards in view, with the
 * existing tier thresholds drawn as markers. Real model output only. */
function CaseHistogram({ preds, th }: { preds: PredictionResult[]; th: { medium: number; high: number; critical: number } }) {
  const { t, fmtNum } = useI18n()
  if (!preds.length) return null
  const vals = preds.map((p) => p.predicted_cases)
  const max = Math.max(th.critical + 2, Math.ceil(Math.max(...vals)))
  const binW = Math.max(1, Math.ceil(max / 24))
  const nBins = Math.ceil(max / binW)
  const counts = Array.from({ length: nBins }, (_, i) => vals.filter((v) => v >= i * binW && (v < (i + 1) * binW || (i === nBins - 1 && v <= max))).length)
  const top = Math.max(1, ...counts)
  const W = 232, H = 64, bw = W / nBins
  const x = (v: number) => (v / (nBins * binW)) * W
  const tierAt = (v: number): RiskTier => (v >= th.critical ? 'Critical' : v >= th.high ? 'High' : v >= th.medium ? 'Medium' : 'Low')
  return (
    <div className="px-4 py-3">
      <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full" role="img" aria-label={`${t('ro.distribution')}: ${vals.length} ${t('common.ward').toLowerCase()}`}>
        {counts.map((c, i) => c > 0 && (
          <rect key={i} x={i * bw + 0.5} width={Math.max(1, bw - 1)} y={H - (c / top) * H} height={(c / top) * H}
            fill={OVERVIEW_FILL[tierAt(i * binW)]} opacity={0.9} rx={1} />
        ))}
        {([['M', th.medium], ['H', th.high], ['C', th.critical]] as Array<[string, number]>).map(([m, v]) => (
          <g key={m}>
            <line x1={x(v)} x2={x(v)} y1={0} y2={H} stroke="#ffffff" strokeOpacity={0.35} strokeDasharray="2 2" />
            <text x={x(v) + 2} y={8} fill="#9b9baa" fontSize={8} fontWeight={700}>{m}</text>
          </g>
        ))}
        <line x1={0} x2={W} y1={H} y2={H} stroke="#30303b" />
        <text x={0} y={H + 11} fill="#9b9baa" fontSize={9}>0</text>
        <text x={W / 2} y={H + 11} fill="#9b9baa" fontSize={9} textAnchor="middle">{t('ro.distributionAxis')}</text>
        <text x={W} y={H + 11} fill="#9b9baa" fontSize={9} textAnchor="end">{fmtNum(nBins * binW, 0)}</text>
      </svg>
      <p className="mt-1 text-[11px] text-faint">{t('ro.distributionSub', { n: vals.length })}</p>
    </div>
  )
}

function InfoSummary({ data, scope, byWard, onSelect }: {
  data: PredictAllResponse; scope: WardInfo[]; byWard: Map<string, PredictionResult>; onSelect: (w: WardInfo) => void
}) {
  const { t, fmtNum, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const { search } = useFilters()
  const preds = scope.map((w) => byWard.get(w.ward_id)).filter((p): p is PredictionResult => !!p)
  const count = (tier: RiskTier) => preds.filter((p) => p.risk_tier === tier).length
  const top = [...preds].sort((a, b) => b.predicted_cases - a.predicted_cases).slice(0, 6)
  const row = (label: string, value: ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[13px]"><dt className="text-muted">{label}</dt><dd className="num text-right text-ink">{value}</dd></div>
  )
  return (
    <div className="flex flex-col">
      <div className="px-4 py-4">
        <p className="text-base font-semibold text-ink">{t('app.name')}</p>
        <p className="text-xs text-muted">{t('app.tagline')}</p>
      </div>
      <SectionTitle>{t('ro.summary')}</SectionTitle>
      <dl className="px-4 py-2">
        {row(t('ro.refWeek'), fmtDate(data.as_of, 'long'))}
        {row(t('ro.horizon'), t('top.weeksAhead', { n: data.horizon_weeks }))}
        {row(t('common.target'), fmtDate(data.target_date, 'long'))}
        {data.predictions[0] && row(t('pred.evalStatus'), t(`status.${data.predictions[0].evaluation_status}` as TKey))}
      </dl>
      <SectionTitle>{t('ro.tierCounts')}</SectionTitle>
      <ul className="px-4 py-2">
        {TIERS.map((tier) => (
          <li key={tier} className="flex items-center justify-between py-1 text-[13px]">
            <span className="flex items-center gap-2.5 text-ink"><Dot color={OVERVIEW_FILL[tier]} stripes={tier === 'Critical'} />{t(`risk.${tier}`)}</span>
            <span className="num text-ink">{count(tier)}</span>
          </li>
        ))}
        <li className="mt-1 flex items-center justify-between border-t border-line-soft pt-2 text-[13px]"><span className="text-muted">{t('ro.alertsCount')}</span><span className="num text-ink">{count('High') + count('Critical')}</span></li>
        <li className="flex items-center justify-between py-1 text-[13px]"><span className="text-muted">{t('ro.totalPredicted')}</span><span className="num text-ink">{fmtNum(preds.reduce((s, p) => s + p.predicted_cases, 0), 1)}</span></li>
      </ul>
      <SectionTitle>{t('ro.topWards')}</SectionTitle>
      <ol className="px-2 py-1.5">
        {top.map((p) => {
          const w = scope.find((x) => x.ward_id === p.ward_id)!
          return (
            <li key={p.ward_id}>
              <button onClick={() => onSelect(w)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-panel-2">
                <span className="flex min-w-0 items-center gap-2.5"><Dot color={OVERVIEW_FILL[p.risk_tier]} stripes={p.risk_tier === 'Critical'} /><span className="truncate font-mono text-xs text-ink">{p.ward_id}</span></span>
                <span className="num shrink-0 text-xs text-muted">{fmtNum(p.predicted_cases, 1)} · {t(`risk.${p.risk_tier}`)}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {meta && (
        <>
          <SectionTitle>{t('ro.modelInfo')}</SectionTitle>
          <dl className="px-4 py-2">
            {row(t('top.wk', { n: data.horizon_weeks }), <code className="font-mono text-xs">{meta.models[String(data.horizon_weeks)]}</code>)}
          </dl>
          <SectionTitle>{t('ro.dataInfo')}</SectionTitle>
          <p className="px-4 py-2 text-xs leading-relaxed text-muted">{t('ro.dataInfoText', { from: fmtDate(meta.coverage.date_min, 'long'), to: fmtDate(meta.coverage.date_max, 'long') })}</p>
        </>
      )}
      <div className="flex flex-col gap-3 px-4 py-4">
        <p className="flex items-start gap-2 text-xs text-muted"><Info className="mt-px size-3.5 shrink-0" />{t('ro.selectHint')}</p>
        <Button asChild size="sm" variant="secondary" className="w-fit"><Link to={{ pathname: '/data', search }}><Database />{t('nav.viewData')}</Link></Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ page */

export default function RiskOverview() {
  const { t, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const { ward, asOf, h, set } = useFilters()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [tiers, setTiers] = useState<Set<RiskTier>>(() => new Set(TIERS))
  const [layer, setLayer] = useState<Layer>('cases')
  const [zoom, setZoom] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const wide = useMinWidth(1280)

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
  const visiblePreds = visible.map((w) => byWard.get(w.ward_id)).filter((p): p is PredictionResult => !!p)

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
  const resetAll = () => { setQ(''); setTiers(new Set(TIERS)); setLayer('cases'); setZoom(1); patchParams({ rcity: null, panel: null }) }
  const selectedInfo = panelOpen ? wards.find((w) => w.ward_id === ward) : undefined
  const z = ZOOM[zoom]

  /* ---------- left pane: data layers / filters */
  const leftPane = (
    <div className="flex flex-col">
      <SectionTitle>{t('ro.window')}</SectionTitle>
      <div className="flex flex-col gap-2 px-4 py-3">
        <label className="text-xs text-muted" htmlFor="ro-week">{t('ro.refWeek')}</label>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-8" disabled={wi <= 0} onClick={() => set({ asOf: weeks[wi - 1] })} aria-label={t('top.prevWeek')}><ChevronLeft /></Button>
          <input
            id="ro-week" type="date" value={asOf} min={meta?.as_of_range.min} max={meta?.as_of_range.max}
            onChange={(e) => e.target.value && set({ asOf: e.target.value })}
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-black px-2 text-[13px] text-ink [color-scheme:dark] focus-visible:border-accent focus-visible:outline-none"
          />
          <Button size="icon" variant="ghost" className="size-8" disabled={wi < 0 || wi >= weeks.length - 1} onClick={() => set({ asOf: weeks[wi + 1] })} aria-label={t('top.nextWeek')}><ChevronRight /></Button>
        </div>
        <span className="text-xs text-muted" id="ro-h">{t('ro.horizon')}</span>
        <div role="radiogroup" aria-labelledby="ro-h" className="grid grid-cols-3 gap-1 rounded-md border border-line bg-black p-0.5">
          {([2, 3, 4] as Horizon[]).map((n) => (
            <button key={n} role="radio" aria-checked={h === n} onClick={() => set({ h: n })}
              className={cn('h-7 rounded text-xs font-semibold transition-colors', h === n ? 'bg-ink text-canvas' : 'text-muted hover:text-ink')}>
              {t('top.wk', { n })}
            </button>
          ))}
        </div>
        {asOf && <p className="text-xs text-ink">{t('ro.targetWeek', { date: fmtDate(addWeeks(asOf, h), 'long') })}</p>}
        <p className="text-[11px] text-faint">{t('ro.windowNote')}</p>
      </div>

      <SectionTitle>{t('ro.city')}</SectionTitle>
      <ul className="py-1">
        {['', ...cities].map((c) => {
          const n = c ? wards.filter((w) => w.city === c).length : wards.length
          const active = cityFilter === c
          return (
            <li key={c || 'all'}>
              <button onClick={() => patchParams({ rcity: c || null })} aria-pressed={active}
                className={cn('flex w-full items-center justify-between px-4 py-1.5 text-left text-[13px] transition-colors', active ? 'bg-panel-2 text-ink' : 'text-muted hover:bg-panel/60 hover:text-ink')}>
                <span className="flex items-center gap-2.5"><Dot color={active ? 'var(--color-accent)' : '#6e6e7c'} hollow={!active} />{c || t('ro.allCities')}</span>
                <span className="num text-[11px] text-faint">{n}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <SectionTitle>{t('ro.search')}</SectionTitle>
      <label className="relative block px-4 py-3">
        <span className="sr-only">{t('ro.search')}</span>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-6.5 size-4 -translate-y-1/2 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="DNCC_Ward_05" maxLength={32}
          className="h-8 w-full rounded-md border border-line bg-black pr-2 pl-8 font-mono text-[13px] text-ink placeholder:text-faint focus-visible:border-accent focus-visible:outline-none" />
      </label>

      <SectionTitle>{t('ro.tiers')}</SectionTitle>
      <ul className="py-1">
        {TIERS.map((tier) => {
          const on = tiers.has(tier)
          return (
            <li key={tier}>
              <button role="checkbox" aria-checked={on}
                onClick={() => setTiers((s) => { const n = new Set(s); if (n.has(tier)) n.delete(tier); else n.add(tier); return n })}
                className={cn('flex w-full items-center justify-between px-4 py-1.5 text-left text-[13px] transition-colors hover:bg-panel/60', on ? 'text-ink' : 'text-faint')}>
                <span className="flex items-center gap-2.5"><Dot color={OVERVIEW_FILL[tier]} hollow={!on} stripes={on && tier === 'Critical'} />{t(`risk.${tier}`)}</span>
                <span className="num text-[11px] text-faint">{all.data ? tierCount(tier) : '–'}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {all.data && meta && (
        <div className="mx-3 mb-3 rounded-lg border border-line-soft bg-[#121219]">
          <p className="px-4 pt-3 text-xs font-semibold text-ink">{t('ro.distribution')}</p>
          <CaseHistogram preds={visiblePreds} th={meta.risk_tiers.thresholds_cases} />
        </div>
      )}

      <SectionTitle>{t('ro.layer')}</SectionTitle>
      <div role="radiogroup" aria-label={t('ro.layer')} className="flex flex-col py-1">
        {LAYERS.map((v) => (
          <button key={v} role="radio" aria-checked={layer === v} onClick={() => setLayer(v)}
            className={cn('flex items-center gap-2.5 px-4 py-1.5 text-left text-[13px] transition-colors hover:bg-panel/60', layer === v ? 'text-ink' : 'text-muted')}>
            <Dot color={layer === v ? 'var(--color-accent)' : '#6e6e7c'} hollow={layer !== v} />{t(LAYER_KEY[v])}
          </button>
        ))}
      </div>
    </div>
  )

  /* ---------- centre: schematic canvas */
  const ctrl = (label: string, icon: ReactNode, onClick: () => void, disabled = false) => (
    <Tooltip content={label} side="left">
      <button onClick={onClick} disabled={disabled} aria-label={label}
        className="grid size-9 place-items-center border-b border-line bg-black/85 text-ink backdrop-blur transition-colors last:border-b-0 hover:bg-panel-2 disabled:text-faint [&_svg]:size-4">
        {icon}
      </button>
    </Tooltip>
  )

  const canvas = (
    <section aria-labelledby="ro-title" className="relative flex min-h-[520px] min-w-0 flex-col bg-[#101016] lg:min-h-0">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-2 border-b border-line-soft bg-black/40 px-4 py-2.5 pr-16">
        <div className="min-w-0">
          <h2 id="ro-title" className="text-[15px] font-semibold text-ink">{t('ro.schematicTitle')}</h2>
          {all.data && (
            <p className="text-xs text-muted">
              {t('ro.forecastFor', { h, date: fmtDate(all.data.target_date, 'long') })} · {t('top.asOf')} {fmtDate(all.data.as_of, 'long')}
              {all.data.predictions[0] && <> · {t(`status.${all.data.predictions[0].evaluation_status}` as TKey)}</>}
            </p>
          )}
        </div>
        <p className="num text-xs text-muted" aria-live="polite">{t('ro.shown', { n: visible.length, total: wards.length })}</p>
      </div>

      {/* map-style floating controls */}
      <div role="group" aria-label={t('ro.canvasControls')} className="absolute top-3 right-3 z-20 flex flex-col overflow-hidden rounded-md border border-line shadow-[0_8px_24px_-10px_rgba(0,0,0,0.9)]">
        {ctrl(t('ro.zoomIn'), <Plus />, () => setZoom((v) => Math.min(ZOOM.length - 1, v + 1)), zoom >= ZOOM.length - 1)}
        {ctrl(t('ro.zoomOut'), <Minus />, () => setZoom((v) => Math.max(0, v - 1)), zoom <= 0)}
        {ctrl(`${t('ro.cycleLabel')}: ${t(LAYER_KEY[layer])}`, <Layers />, () => setLayer(LAYERS[(LAYERS.indexOf(layer) + 1) % LAYERS.length]))}
        {ctrl(t('ro.resetView'), <Scan />, resetAll)}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pr-16"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
        {all.error ? <ErrorState error={all.error} onRetry={all.retry} /> : !all.data ? <LoadingBlock className="h-96" /> : visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">{t('ro.noMatch')}</p>
        ) : (
          <div className={cn('flex flex-col gap-4 transition-opacity', all.loading && 'opacity-60')} aria-busy={all.loading}>
            {cities.map((c) => {
              const ws = visible.filter((w) => w.city === c)
              if (!ws.length) return null
              return (
                <section key={c} aria-label={c} className="rounded-lg border border-line-soft bg-black/55 p-3 backdrop-blur-[1px]">
                  <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-[13px] font-semibold tracking-wide text-ink uppercase">{c}</h3>
                    <span className="flex items-center gap-3 text-[11px] text-muted">
                      {TIERS.map((tier) => {
                        const n = ws.filter((w) => byWard.get(w.ward_id)?.risk_tier === tier).length
                        return n ? <span key={tier} className="num flex items-center gap-1.5"><Dot color={OVERVIEW_FILL[tier]} stripes={tier === 'Critical'} />{TIER_MARK[tier]} {n}</span> : null
                      })}
                      <span className="num">{t('ro.wards', { n: ws.length })}</span>
                    </span>
                  </div>
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${z.min}px, 1fr))` }}>
                    {ws.map((w) => (
                      <WardTile key={w.ward_id} w={w} p={byWard.get(w.ward_id)} layer={layer} height={z.h}
                        selected={panelOpen && w.ward_id === ward} onSelect={() => select(w)} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* bottom strip: compact legend + honest attribution, like a map's scale bar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-line-soft bg-black/70 px-4 py-2 text-[11px]">
        <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-ink" aria-label={t('ro.legend')}>
          <li className="flex items-center gap-1.5"><Dot color={OVERVIEW_FILL.Low} />{t('ro.legendLow')}</li>
          <li className="flex items-center gap-1.5"><Dot color={OVERVIEW_FILL.Medium} />{t('ro.legendMedium')}</li>
          <li className="flex items-center gap-1.5"><Dot color={OVERVIEW_FILL.High} />{t('ro.legendRed')}</li>
          <li className="flex items-center gap-1.5"><Dot color={OVERVIEW_FILL.Critical} stripes />{t('ro.legendCritical')}</li>
          <li className="flex items-center gap-1.5"><Dot color={NO_PREDICTION_FILL} />{t('ro.legendNone')}</li>
        </ul>
        <span className="flex items-center gap-3 text-faint">
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] tracking-wide text-muted uppercase">{t('ro.schematicBadge')}</span>
          <span className="hidden 2xl:inline">{t('ro.dataCredit')}</span>
        </span>
      </div>
    </section>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PrimaryTabs />
        <Button size="sm" variant="secondary" className="lg:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} aria-controls="ro-filters">
          <SlidersHorizontal />{showFilters ? t('ro.hideFilters') : t('ro.showFilters')}
        </Button>
      </div>

      <div className="grid overflow-hidden rounded-xl border border-line bg-black lg:h-[calc(100dvh-13.5rem)] lg:min-h-[620px] lg:grid-cols-[268px_minmax(0,1fr)] xl:grid-cols-[268px_minmax(0,1fr)_400px]">
        <aside id="ro-filters" aria-label={t('ro.filters')} className={cn('min-h-0 flex-col border-b border-line lg:flex lg:border-r lg:border-b-0', showFilters ? 'flex' : 'hidden')}>
          <PaneHeader title={t('ro.dataLayers')} action={<Button size="icon" variant="ghost" className="size-8" onClick={resetAll} aria-label={t('ro.reset')}><RotateCcw /></Button>} />
          <div className="min-h-0 flex-1 overflow-y-auto">{leftPane}</div>
        </aside>

        {canvas}

        {wide && (
          <aside aria-label={selectedInfo ? selectedInfo.ward_id : t('ro.info')} className="flex min-h-0 flex-col border-l border-line bg-[#08080c]">
            {selectedInfo ? <WardDetailPanel wardId={selectedInfo.ward_id} onClose={close} /> : (
              <>
                <PaneHeader title={t('ro.info')} />
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {all.data ? <InfoSummary data={all.data} scope={scope} byWard={byWard} onSelect={select} /> : <LoadingBlock className="m-4 h-64" />}
                </div>
              </>
            )}
          </aside>
        )}
      </div>

      {/* below 1280px the ward panel is a bottom sheet (phones) or slide-over (tablets) */}
      {!wide && selectedInfo && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={close} aria-hidden />
          <aside aria-label={selectedInfo.ward_id}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col overflow-hidden rounded-t-2xl border border-line bg-[#08080c] shadow-[var(--shadow-lift)] sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[440px] sm:rounded-none sm:rounded-l-2xl">
            <WardDetailPanel wardId={selectedInfo.ward_id} onClose={close} />
          </aside>
        </>
      )}
    </div>
  )
}
