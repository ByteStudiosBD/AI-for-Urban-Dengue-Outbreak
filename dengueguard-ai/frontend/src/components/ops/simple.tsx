import { ChevronDown, ChevronLeft, ChevronRight, CircleCheck, History, Minus, Plus, RotateCcw, SlidersHorizontal, TriangleAlert, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useAsync } from '@/lib/useAsync'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { addWeeks, cn, snapToMonday } from '@/lib/utils'
import { useFilters, useMetadata } from '@/state/AppData'
import { OPS_DEFAULTS, useOps, usePlan } from '@/state/Ops'
import { AssumptionList } from './controls'

/** A week in the 2025 monsoon season with real outbreak numbers, for demos and training. */
export const BUSY_WEEK = '2025-08-25'
/** City the app opens with (same default as the URL filters). */
const START_CITY = 'Dhaka South'

/* ---------------- typed number input (no dragging) ---------------- */
const BN_DIGITS = '০১২৩৪৫৬৭৮৯'
const toLatin = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))

/**
 * Large number box with − / + buttons and quick presets. Values outside the allowed range are
 * never applied while typing; on leaving the box they are corrected to the nearest allowed value
 * and a plain message says so.
 */
export function NumberField({ label, help, value, min, max, step = 1, unit = '', presets = [], onChange, size = 'lg' }: {
  label: string; help?: string; value: number; min: number; max: number; step?: number; unit?: string
  presets?: number[]; onChange: (v: number) => void; size?: 'lg' | 'md'
}) {
  const { t } = useI18n()
  const id = useId()
  const [draft, setDraft] = useState(String(value))
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => setDraft(String(value)), [value])
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step))
  const range = t('s.num.range', { label, min: `${min}${unit}`, max: `${max}${unit}` })
  const parse = (s: string) => {
    const n = Number(toLatin(s).trim())
    return s.trim() === '' || !Number.isFinite(n) ? null : n
  }
  const onType = (s: string) => {
    setDraft(s)
    const n = parse(s)
    if (n !== null && n >= min && n <= max && Number.isInteger(n / step)) {
      setMsg(null)
      if (n !== value) onChange(n)
    } else if (n !== null && n > max) setMsg(range) // more digits cannot fix this, so say so now
    else setMsg(null)
  }
  const onBlur = () => {
    const n = parse(draft)
    if (n === null) { setDraft(String(value)); setMsg(range); return }
    const c = clamp(n)
    if (c !== n) setMsg(`${range} ${t('s.num.used', { v: `${c}${unit}` })}`)
    if (c !== value) onChange(c)
    setDraft(String(c))
  }
  const big = size === 'lg'
  const btn = cn('grid shrink-0 place-items-center rounded-xl border border-line bg-panel text-ink transition-colors hover:border-line-strong hover:bg-panel-2 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
    big ? 'size-12' : 'size-11')
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[15px] font-semibold text-ink">{label}</label>
      {help && <p id={`${id}-h`} className="-mt-1 text-[13px] leading-snug text-muted">{help}</p>}
      <div className="flex items-center gap-2">
        <button type="button" className={btn} aria-label={t('s.num.less', { label })} disabled={value <= min} onClick={() => { setMsg(null); onChange(clamp(value - step)) }}><Minus className="size-5" /></button>
        <div className="relative">
          <input
            id={id} inputMode="numeric" autoComplete="off" value={draft} aria-describedby={help ? `${id}-h` : undefined}
            aria-invalid={!!msg} onChange={(e) => onType(e.target.value)} onBlur={onBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className={cn('num rounded-xl border bg-canvas text-center font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30',
              big ? 'h-12 w-28 text-xl' : 'h-11 w-20 text-lg', unit && 'pr-7', msg ? 'border-risk-critical' : 'border-line')}
          />
          {unit && <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-base font-semibold text-muted">{unit}</span>}
        </div>
        <button type="button" className={btn} aria-label={t('s.num.more', { label })} disabled={value >= max} onClick={() => { setMsg(null); onChange(clamp(value + step)) }}><Plus className="size-5" /></button>
      </div>
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('s.num.quick', { label })}>
          {presets.map((p) => (
            <button key={p} type="button" aria-pressed={value === p} onClick={() => { setMsg(null); onChange(p) }}
              className={cn('num h-11 min-w-14 rounded-xl border px-3 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                value === p ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-panel text-ink hover:bg-panel-2')}>
              {p}{unit}
            </button>
          ))}
        </div>
      )}
      {msg && <p role="alert" className="flex items-start gap-1.5 text-[13px] font-medium text-risk-critical"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{msg}</p>}
    </div>
  )
}

/* ---------------- big choice buttons ---------------- */
export function Choice<T extends string>({ label, value, options, onChange, className }: {
  label: string; value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (v: T) => void; className?: string
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[15px] font-semibold text-ink">{label}</legend>
      <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', className)}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
            className={cn('min-h-12 rounded-xl border px-3 py-2 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              value === o.value ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-panel text-ink hover:bg-panel-2')}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * Reads a typed date as DD/MM/YYYY (also with - or . or spaces), or YYYY-MM-DD. Bangla digits work.
 * Returns an ISO date only for a real calendar date; anything else returns null (never guesses).
 */
export function parseTypedDate(raw: string): string | null {
  const s = toLatin(raw).trim()
  let d: number, m: number, y: number
  let g = s.match(/^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/)
  if (g) [y, m, d] = [+g[1], +g[2], +g[3]]
  else if ((g = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/))) [d, m, y] = [+g[1], +g[2], +g[3]]
  else return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

/** Type a date and jump to the dataset week that contains it. */
function DateTyper({ weeks, onPick }: { weeks: string[]; onPick: (week: string) => void }) {
  const { t, fmtDate } = useI18n()
  const id = useId()
  const [text, setText] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const first = weeks[0]
  const last = weeks[weeks.length - 1]
  const lastDay = addWeeks(last, 1) // the last week runs until the day before this
  const go = () => {
    const iso = parseTypedDate(text)
    if (!iso) { setMsg({ ok: false, text: t('s.set.typeBad') }); return }
    if (iso < first || iso >= lastDay) {
      setMsg({ ok: false, text: t('s.set.typeRange', { a: fmtDate(first, 'long'), b: fmtDate(last, 'long') }) }); return
    }
    const monday = snapToMonday(iso)
    const week = weeks.filter((w) => w <= monday).at(-1) ?? first
    onPick(week)
    setMsg({ ok: true, text: t('s.set.typeOk', { date: fmtDate(week, 'long') }) })
  }
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-semibold text-muted">{t('s.set.typeLabel')}</label>
      <div className="flex gap-2">
        <input id={id} value={text} inputMode="numeric" autoComplete="off" placeholder={t('s.set.typePh')}
          onChange={(e) => { setText(e.target.value); setMsg(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go() } }}
          aria-invalid={msg ? !msg.ok : undefined} aria-describedby={msg ? `${id}-m` : undefined}
          className={cn('num h-12 min-w-0 flex-1 rounded-xl border bg-canvas px-3 text-[15px] font-semibold text-ink outline-none placeholder:font-normal placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/30',
            msg && !msg.ok ? 'border-risk-critical' : 'border-line')} />
        <Button type="button" variant="primary" className="h-12" onClick={go}>{t('s.set.typeGo')}</Button>
      </div>
      {msg && (
        <p id={`${id}-m`} role={msg.ok ? 'status' : 'alert'} className={cn('flex items-start gap-1.5 text-[13px] font-medium', msg.ok ? 'text-risk-low' : 'text-risk-critical')}>
          {msg.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}{msg.text}
        </p>
      )}
    </div>
  )
}

/* ---------------- week picker: list, arrows, quick buttons or a typed date ---------------- */
export function WeekField() {
  const { t, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const { asOf, set } = useFilters()
  const id = useId()
  if (!meta) return null
  const weeks = meta.available_weeks
  const i = weeks.indexOf(asOf)
  const years = [...new Set(weeks.map((w) => w.slice(0, 4)))].reverse()
  const btn = 'grid size-12 shrink-0 place-items-center rounded-xl border border-line bg-panel text-ink hover:bg-panel-2 disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[15px] font-semibold text-ink">{t('s.set.week')}</label>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} aria-label={t('top.prevWeek')} disabled={i <= 0} onClick={() => set({ asOf: weeks[i - 1] })}><ChevronLeft className="size-5" /></button>
        <div className="relative min-w-0 flex-1">
          <select id={id} value={asOf} onChange={(e) => set({ asOf: e.target.value })}
            className="num h-12 w-full appearance-none rounded-xl border border-line bg-canvas pr-9 pl-3 text-[15px] font-semibold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/30">
            {years.map((y) => (
              <optgroup key={y} label={y}>
                {weeks.filter((w) => w.startsWith(y)).reverse().map((w) => <option key={w} value={w}>{t('s.set.weekOf', { date: fmtDate(w, 'long') })}</option>)}
              </optgroup>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" />
        </div>
        <button type="button" className={btn} aria-label={t('top.nextWeek')} disabled={i >= weeks.length - 1} onClick={() => set({ asOf: weeks[i + 1] })}><ChevronRight className="size-5" /></button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-11" onClick={() => set({ asOf: weeks[weeks.length - 1] })}>{t('s.set.latest')}</Button>
        {weeks.includes(BUSY_WEEK) && <Button type="button" className="h-11" onClick={() => set({ asOf: BUSY_WEEK })}>{t('s.set.busy', { date: fmtDate(BUSY_WEEK, 'long') })}</Button>}
      </div>
      <DateTyper weeks={weeks} onPick={(w) => set({ asOf: w })} />
      <p className="flex items-center gap-1.5 text-[13px] text-muted"><History className="size-4" aria-hidden /> {t('s.set.historical')}</p>
    </div>
  )
}

/* ---------------- the one settings panel ---------------- */
function AreaChoice() {
  const { t } = useI18n()
  const { meta } = useMetadata()
  const { city, set } = useFilters()
  const { controls, setControls } = useOps()
  const value = controls.pool === 'all' ? '__all' : city
  return (
    <Choice<string> label={t('s.set.area')} value={value}
      onChange={(v) => { if (v === '__all') setControls({ pool: 'all' }); else { set({ city: v }); setControls({ pool: 'city' }) } }}
      options={[{ value: '__all', label: t('s.set.allAreas') }, ...(meta?.cities ?? []).map((c) => ({ value: c, label: c }))]} />
  )
}

export function HorizonChoice() {
  const { t } = useI18n()
  const { h, set } = useFilters()
  return (
    <Choice<string> label={t('s.set.planFor')} value={String(h)} onChange={(v) => set({ h: Number(v) as 2 | 3 | 4 })}
      options={[2, 3, 4].map((n) => ({ value: String(n), label: t('s.set.nextN', { n }) }))} />
  )
}

type Unit = 'number' | 'pct'

/** Switch between typing a plain number and typing a percentage. */
function UnitSwitch({ value, onChange, numberLabel, disabled }: { value: Unit; onChange: (u: Unit) => void; numberLabel: string; disabled?: boolean }) {
  const { t } = useI18n()
  return (
    <div role="group" aria-label={t('s.unit.label')} className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] text-muted">{t('s.unit.label')}</span>
      {([['number', numberLabel], ['pct', t('s.unit.pct')]] as const).map(([u, label]) => (
        <button key={u} type="button" aria-pressed={value === u} disabled={u === 'number' && disabled} onClick={() => onChange(u)}
          className={cn('min-h-11 rounded-xl border px-3 text-[13px] font-semibold transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            value === u ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-panel text-muted hover:text-ink')}>
          {label}
        </button>
      ))}
    </div>
  )
}

/** Percent of demand that gives exactly `b` bags under the server's floor rule, kept inside the allowed 30–100%. */
function bagsToPct(b: number, need: number) {
  if (need <= 0) return 100
  if (b >= need) return 100
  return Math.max(30, Math.min(100, ((b + 0.5) / need) * 100))
}

/**
 * Stock available. The problem set defines stock as 30–100% of demand, so the plan always stores a percentage;
 * officers can type a number of saline bags instead and it is converted exactly (same floor rule as the server).
 */
export function StockField({ size }: { size?: 'lg' | 'md' }) {
  const { t, fmtNum } = useI18n()
  const { controls, setControls } = useOps()
  const plan = usePlan().data
  const [unit, setUnit] = useState<Unit>('number')
  const need = plan?.supplies.saline_bags_needed.required ?? 0
  const kitNeed = plan?.supplies.diagnostic_kits_needed.required ?? 0
  const pct = controls.stock_pct
  const bags = Math.floor((pct / 100) * need)
  const kits = Math.floor((pct / 100) * kitNeed)
  const byNumber = unit === 'number'
  const minBags = Math.ceil(0.3 * need)
  const typed = controls.stock_bags
  const outside = typed !== null && need > 0 && (typed < minBags || typed > need)
  return (
    <div className="flex flex-col gap-3">
      <UnitSwitch value={byNumber ? 'number' : 'pct'} onChange={setUnit} numberLabel={t('s.unit.bags')} />
      {byNumber ? (
        <NumberField size={size} label={t('s.set.stockBags')} help={t('s.set.stockBagsHelp', { need: fmtNum(need) })} value={typed ?? bags} min={0} max={99999}
          presets={need > 0 ? [...new Set([30, 50, 75, 100].map((p) => Math.max(minBags, Math.floor((p / 100) * need))))] : []}
          onChange={(b) => setControls({ stock_bags: b, ...(need > 0 ? { stock_pct: bagsToPct(b, need) } : {}) })} />
      ) : (
        <NumberField size={size} label={t('s.set.stock')} help={t('s.set.stockHelp')} value={Math.round(pct)} min={30} max={100} unit="%" presets={[30, 50, 75, 100]}
          onChange={(v) => setControls({ stock_bags: null, stock_pct: v })} />
      )}
      {outside && <p role="status" className="text-[13px] font-medium text-risk-medium">{typed! > need ? t('s.set.stockMore', { x: fmtNum(typed), hi: fmtNum(need), spare: fmtNum(typed! - need) }) : t('s.set.stockLess', { x: fmtNum(typed), lo: fmtNum(minBags) })}</p>}
      {need > 0 ? (
        <p className="num rounded-xl bg-panel-2/60 px-3 py-2 text-[13px] text-ink">
          {t('s.set.stockIs', { b: fmtNum(bags), bn: fmtNum(need), k: fmtNum(kits), kn: fmtNum(kitNeed), p: Math.round(pct) })}
        </p>
      ) : plan && <p className="text-[13px] text-muted">{byNumber ? t('s.set.stockQuiet') : t('s.set.stockNone')}</p>}
    </div>
  )
}

/** Normal (planning baseline) number of beds across all 60 wards, from the assumptions endpoint. */
function useBaseBeds() {
  const { data } = useAsync(() => api.opsAssumptions(), [])
  const perWard = data?.capacity.per_ward ?? {}
  return { perWard, total: Object.values(perWard).reduce((a, b) => a + b, 0) }
}

/** Split a typed bed total over the wards in proportion to their normal beds, summing exactly to `total` (largest remainder). */
export function splitBeds(perWard: Record<string, number>, total: number): Record<string, number> {
  const ids = Object.keys(perWard).sort()
  const base = ids.reduce((a, w) => a + perWard[w], 0)
  if (!base) return {}
  const exact = ids.map((w) => (perWard[w] * total) / base)
  const out = exact.map(Math.floor)
  let left = total - out.reduce((a, b) => a + b, 0)
  const order = ids.map((_, i) => i).sort((a, b) => (exact[b] - out[b]) - (exact[a] - out[a]) || perWard[ids[b]] - perWard[ids[a]] || a - b)
  for (const i of order) { if (left <= 0) break; out[i] += 1; left -= 1 }
  return Object.fromEntries(ids.map((w, i) => [w, out[i]]))
}

export function TeamsField({ size }: { size?: 'lg' | 'md' }) {
  const { t } = useI18n()
  const { controls, setControls } = useOps()
  return <NumberField label={t('s.set.teams')} help={t('s.set.teamsHelp')} value={controls.total_crews} min={0} max={200} presets={[0, 5, 10, 20]} size={size}
    onChange={(v) => setControls({ total_crews: v, deployment: null })} />
}

/** Hospital beds: a total number of beds (default) or a percentage of the normal estimate. */
export function BedsField() {
  const { t, fmtNum } = useI18n()
  const { controls, setControls } = useOps()
  const plan = usePlan().data
  const { perWard, total: base } = useBaseBeds()
  const [unit, setUnit] = useState<Unit>('number')
  const pct = controls.capacity_scale_pct
  const byNumber = unit === 'number' && base > 0
  const total = controls.beds_total ?? Math.round((base * pct) / 100)
  const used = plan?.cities.reduce((a, c) => a + c.bed_capacity, 0)
  const min = Math.ceil(base * 0.25)
  // a typed total is split exactly over the wards; a percentage scales every ward instead
  const setTotal = (n: number) => setControls({ beds_total: n, capacity_overrides: splitBeds(perWard, n), capacity_scale_pct: (n / base) * 100 })
  const setPct = (v: number) => setControls({ beds_total: null, capacity_overrides: {}, capacity_scale_pct: v })
  const edited = controls.beds_total === null ? Object.keys(controls.capacity_overrides).length : 0
  return (
    <div className="flex flex-col gap-3">
      <UnitSwitch value={byNumber ? 'number' : 'pct'} onChange={setUnit} numberLabel={t('s.unit.beds')} disabled={base === 0} />
      {byNumber ? (
        <NumberField label={t('s.set.bedsN')} help={t('s.set.bedsNHelp', { n: fmtNum(base) })} value={total} min={min} max={base * 3}
          presets={[50, 75, 100, 125].map((p) => Math.max(min, Math.round((base * p) / 100)))}
          onChange={setTotal} />
      ) : (
        <NumberField label={t('s.set.beds')} help={t('s.set.bedsHelp')} value={Math.round(pct)} min={25} max={300} step={5} unit="%" presets={[50, 75, 100, 125]}
          onChange={setPct} />
      )}
      {used !== undefined && base > 0 && (
        <p className="num rounded-xl bg-panel-2/60 px-3 py-2 text-[13px] text-ink">
          {t('s.set.bedsIs', { n: fmtNum(used), p: Math.round(pct), base: fmtNum(base) })}
          {edited > 0 && ` ${t('s.set.bedsEdited', { n: edited })}`}
        </p>
      )}
    </div>
  )
}

/** Where an expert setting shows its effect, so a change is never invisible. */
function Where({ children }: { children: ReactNode }) {
  return <p className="-mt-3 flex items-start gap-1.5 text-[13px] font-medium text-accent"><ChevronRight aria-hidden className="mt-0.5 size-4 shrink-0" />{children}</p>
}

function ExpertSettings() {
  const { t } = useI18n()
  const { controls: c, setControls: set } = useOps()
  return (
    <details className="group rounded-2xl border border-line-soft">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 text-[15px] font-semibold text-ink hover:bg-panel-2/60 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-5 text-muted transition-transform group-open:rotate-90" /> {t('s.set.expert')}
        <span className="ml-auto text-[13px] font-normal text-muted">{t('s.set.expertSub')}</span>
      </summary>
      <div className="flex flex-col gap-6 border-t border-line-soft p-4">
        <Choice<'expected' | 'upper'> label={t('s.set.basis')} value={c.demand_basis} onChange={(v) => set({ demand_basis: v })} className="sm:grid-cols-2"
          options={[{ value: 'expected', label: t('s.set.basisNormal') }, { value: 'upper', label: t('s.set.basisBad') }]} />
        <p className="-mt-4 text-[13px] text-muted">{t('s.set.basisHelp')}</p>
        <Where>{t('s.set.whereBasis')}</Where>
        <NumberField size="md" label={t('s.set.effect')} help={t('s.set.effectHelp')} value={c.effect_per_crew_pct} min={0} max={50} unit="%" presets={[5, 10, 15, 20]}
          onChange={(v) => set({ effect_per_crew_pct: v })} />
        <Where>{t('s.set.whereEffect')}</Where>
        <NumberField size="md" label={t('s.set.maxTeams')} value={c.max_crews_per_ward} min={1} max={20} presets={[1, 2, 3, 5]}
          onChange={(v) => set({ max_crews_per_ward: v, deployment: null })} />
        <Where>{t('s.set.whereMax')}</Where>
        <NumberField size="md" label={t('s.set.risk')} help={t('s.set.riskHelp')} value={Math.round(c.risk_weight * 100)} min={0} max={100} step={5} unit="%" presets={[0, 50, 70, 100]}
          onChange={(v) => set({ risk_weight: v / 100 })} />
        <Where>{t('s.set.whereRisk')}</Where>
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line-soft p-3">
          <input type="checkbox" checked={c.plan_with_intervention} onChange={(e) => set({ plan_with_intervention: e.target.checked })} className="mt-0.5 size-5 accent-[var(--color-accent)]" />
          <span><span className="block text-[15px] font-semibold text-ink">{t('s.set.withTeams')}</span><span className="block text-[13px] text-muted">{t('s.set.withTeamsHelp')}</span></span>
        </label>
        <Where>{t('s.set.whereWith')}</Where>
        <Button type="button" className="h-11 self-start" onClick={() => set({ demand_basis: OPS_DEFAULTS.demand_basis, effect_per_crew_pct: OPS_DEFAULTS.effect_per_crew_pct,
          max_crews_per_ward: OPS_DEFAULTS.max_crews_per_ward, risk_weight: OPS_DEFAULTS.risk_weight, plan_with_intervention: false })}>
          <RotateCcw /> {t('s.set.expertReset')}
        </Button>
      </div>
    </details>
  )
}

function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="settings-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      className="m-0 ml-auto h-dvh max-h-none w-full max-w-lg border-l border-line bg-panel p-0 text-ink backdrop:bg-black/55">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
          <h2 id="settings-title" className="text-xl font-semibold">{t('s.set.title')}</h2>
          <button type="button" onClick={onClose} aria-label={t('s.set.close')} className="grid size-11 place-items-center rounded-xl border border-line text-muted hover:text-ink"><X className="size-5" /></button>
        </div>
        <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-5 py-5">
          <p className="text-[13px] text-muted">{t('s.set.intro')}</p>
          <WeekField />
          <HorizonChoice />
          <AreaChoice />
          <StockField />
          <TeamsField />
          <BedsField />
          <ExpertSettings />
        </div>
        <div className="border-t border-line-soft px-5 py-4">
          <Button variant="primary" size="lg" className="w-full" onClick={onClose}>{t('s.set.done')}</Button>
        </div>
      </div>
    </dialog>
  )
}

/** The current plan in plain words, with the only two buttons needed to change it. Shown on every operations page. */
export function PlanBar() {
  const { t, fmtDate } = useI18n()
  const { controls: c, reset, setControls } = useOps()
  const { asOf, h, city, set } = useFilters()
  const { meta } = useMetadata()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  // identical request to the page's own plan, so this is served from the same cache
  const plan = usePlan().data
  /** Everything back to how the app opens: latest week, next 2 weeks, all areas, default numbers, no edits. */
  const startOver = () => {
    reset()
    set({ h: 2, asOf: meta?.as_of_range.max ?? asOf, city: START_CITY })
    setConfirm(false)
  }
  const bags = plan?.supplies.saline_bags_needed
  const beds = plan?.cities.reduce((a, x) => a + x.bed_capacity, 0)
  // typed saline bags stay fixed: when demand changes (week, area, a bad week…) recalculate the percentage
  const need = bags?.required
  useEffect(() => {
    if (c.stock_bags === null || !need) return
    const pct = bagsToPct(c.stock_bags, need)
    if (Math.abs(pct - c.stock_pct) > 1e-9) setControls({ stock_pct: pct })
  }, [need, c.stock_bags, c.stock_pct, setControls])
  const quiet = !!plan && plan.wards.every((w) => w.planning_cases_whole === 0)
  const expert = c.demand_basis !== OPS_DEFAULTS.demand_basis || c.effect_per_crew_pct !== OPS_DEFAULTS.effect_per_crew_pct
    || c.max_crews_per_ward !== OPS_DEFAULTS.max_crews_per_ward || c.risk_weight !== OPS_DEFAULTS.risk_weight || c.plan_with_intervention
    || (c.beds_total === null && Object.keys(c.capacity_overrides).length > 0) || c.deployment !== null
  const parts = [
    t('s.set.weekOf', { date: fmtDate(asOf, 'long') }),
    t('s.set.nextN', { n: h }),
    c.pool === 'city' ? city : t('s.set.allAreas'),
    bags && bags.required > 0 ? t('s.bar.stockBags', { n: Math.round(c.stock_pct), b: bags.available }) : t('s.bar.stock', { n: Math.round(c.stock_pct) }),
    t('s.bar.teams', { n: c.total_crews }),
    beds !== undefined ? t('s.bar.bedsN', { n: beds }) : t('s.bar.beds', { n: Math.round(c.capacity_scale_pct) }),
  ]
  return (
    <>
    <section aria-label={t('s.bar.label')} className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line bg-panel px-4 py-3">
      <div className="min-w-0 flex-1 basis-72">
        <p className="text-[13px] font-semibold text-muted">{t('s.bar.label')}</p>
        <p className="num text-[15px] leading-relaxed text-ink">{parts.join(' · ')}{expert && <span className="text-muted"> · {t('s.bar.custom')}</span>}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted"><History className="size-3.5" aria-hidden /> {t('s.set.historical')}</p>
        {quiet && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink">
            {t('s.bar.quiet')}
            <button type="button" onClick={() => set({ asOf: BUSY_WEEK })} className="min-h-11 font-semibold text-accent underline-offset-2 hover:underline">{t('s.bar.quietBtn')}</button>
          </p>
        )}
      </div>
      {confirm ? (
        <div role="alertdialog" aria-label={t('s.bar.confirm')} className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">{t('s.bar.confirm')}</span>
          <Button variant="primary" className="h-11" onClick={startOver}>{t('s.bar.yes')}</Button>
          <Button className="h-11" onClick={() => setConfirm(false)}>{t('s.bar.cancel')}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" className="h-11" onClick={() => setOpen(true)}><SlidersHorizontal /> {t('s.bar.change')}</Button>
          <Button className="h-11" onClick={() => setConfirm(true)}><RotateCcw /> {t('s.bar.reset')}</Button>
        </div>
      )}
    </section>
    <SettingsSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/* ---------------- page building blocks ---------------- */
/** The page's answer in one big sentence, shown before anything else. */
export function BigAnswer({ tone, title, children, action }: { tone: 'bad' | 'good' | 'info'; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'good' ? CircleCheck : TriangleAlert
  return (
    <div aria-live="polite" className={cn('flex flex-wrap items-start gap-4 rounded-2xl border p-5',
      tone === 'bad' ? 'border-risk-critical/40 bg-risk-critical/[0.07]' : tone === 'good' ? 'border-risk-low/40 bg-risk-low/[0.07]' : 'border-line bg-panel')}>
      <Icon aria-hidden className={cn('mt-1 size-7 shrink-0', tone === 'bad' ? 'text-risk-critical' : tone === 'good' ? 'text-risk-low' : 'text-accent')} />
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-xl leading-snug font-semibold tracking-[-0.01em] text-ink sm:text-2xl">{title}</p>
        {children && <div className="mt-1.5 text-[15px] leading-relaxed text-muted">{children}</div>}
      </div>
      {action}
    </div>
  )
}

/** One short line saying what the page is for. */
export function PageIntro({ children }: { children: ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-muted">{children}</p>
}

/** Plain section with a heading; replaces numbered step cards. */
export function Section({ title, sub, children, action, className }: { title: ReactNode; sub?: ReactNode; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-line-soft bg-panel p-5', className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-[13px] text-muted">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** "How is this calculated?" — method and assumptions, closed by default. */
export function HowCalculated({ children }: { children?: ReactNode }) {
  const { t } = useI18n()
  return (
    <details className="group rounded-2xl border border-line-soft bg-panel">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-5 text-[15px] font-semibold text-ink hover:bg-panel-2/60 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-5 text-muted transition-transform group-open:rotate-90" /> {t('s.how')}
      </summary>
      <div className="flex flex-col gap-4 border-t border-line-soft px-5 py-4 text-[15px] leading-relaxed text-muted">
        {children}
        <AssumptionList />
      </div>
    </details>
  )
}

/** Expand/collapse button used by list rows ("Details"). */
export function DetailsButton({ open, onClick, label }: { open: boolean; onClick: () => void; label: string }) {
  const { t } = useI18n()
  return (
    <button type="button" onClick={onClick} aria-expanded={open} aria-label={`${open ? t('s.hide') : t('s.details')}: ${label}`}
      className="inline-flex h-11 items-center gap-1 rounded-xl border border-line px-3 text-[13px] font-semibold text-ink hover:bg-panel-2">
      {open ? t('s.hide') : t('s.details')} <ChevronDown aria-hidden className={cn('size-4 transition-transform', open && 'rotate-180')} />
    </button>
  )
}

export function ShowMore({ shown, total, onClick, open }: { shown: number; total: number; onClick: () => void; open: boolean }) {
  const { t } = useI18n()
  if (total <= shown && !open) return null
  return (
    <Button className="mt-3 h-11 self-start" onClick={onClick}>{open ? t('s.showFewer') : t('s.showAll', { n: total })}</Button>
  )
}
