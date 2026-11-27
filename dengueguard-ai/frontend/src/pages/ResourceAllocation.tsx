import { ArrowRight, Search, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FillBar, SeverityBadge, tFlag } from '@/components/ops/controls'
import { BigAnswer, DetailsButton, HowCalculated, PageIntro, PlanBar, Section, ShowMore, StockField } from '@/components/ops/simple'
import { RiskBadge } from '@/components/RiskBadge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { useFilters } from '@/state/AppData'
import { usePlan } from '@/state/Ops'
import type { ConsumableKey, OpsWard } from '@/types/api'

const PAGE = 10

function ItemCard({ label, need, have, short, wards }: { label: string; need: number; have: number; short: number; wards: number }) {
  const { t, fmtNum } = useI18n()
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line-soft bg-panel p-5">
      <p className="text-lg font-semibold text-ink">{label}</p>
      <dl className="grid grid-cols-3 gap-2">
        <div><dt className="text-[13px] text-muted">{t('s.sup.need')}</dt><dd className="num text-2xl font-semibold">{fmtNum(need)}</dd></div>
        <div><dt className="text-[13px] text-muted">{t('s.sup.have')}</dt><dd className="num text-2xl font-semibold">{fmtNum(have)}</dd></div>
        <div><dt className="text-[13px] text-muted">{t('s.sup.short')}</dt><dd className={cn('num text-2xl font-semibold', short ? 'text-risk-critical' : 'text-risk-low')}>{short ? fmtNum(short) : '0 ✓'}</dd></div>
      </dl>
      <FillBar value={have} max={need} className="h-2.5" />
      <p className="text-[13px] text-muted">{short ? t('s.sup.itemShort', { w: wards }) : t('s.sup.itemOk')}</p>
    </div>
  )
}

function Fact({ label, a, r }: { label: string; a: number | null; r: number }) {
  const { fmtNum } = useI18n()
  if (a === null) return null
  return <span className="num text-[15px]"><span className="text-muted">{label} </span><span className={cn('font-semibold', a < r ? 'text-risk-critical' : 'text-ink')}>{fmtNum(a)}</span><span className="text-muted"> / {fmtNum(r)}</span></span>
}

function WardRow({ w }: { w: OpsWard }) {
  const { t, fmtNum } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <li className="border-b border-line-soft py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-40 flex-1 basis-40">
          <p className="font-mono text-[15px] font-semibold text-ink">{w.ward_id}</p>
          <p className="text-[13px] text-muted">{w.city}</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Fact label={t('s.sup.saline')} a={w.allocated.saline_bags_needed} r={w.required.saline_bags_needed} />
          <Fact label={t('s.sup.kits')} a={w.allocated.diagnostic_kits_needed} r={w.required.diagnostic_kits_needed} />
        </div>
        <SeverityBadge severity={w.severity} />
        <DetailsButton open={open} onClick={() => setOpen((v) => !v)} label={w.ward_id} />
      </div>
      {open && (
        <dl className="mt-3 grid gap-3 rounded-xl bg-panel-2/50 p-4 text-[15px] sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-[13px] text-muted">{t('s.sup.dCases')}</dt><dd className="num font-semibold">{fmtNum(w.planning_cases_whole)} <span className="text-[13px] font-normal text-muted">({t('s.sup.dRange', { a: fmtNum(w.interval[0], 0), b: fmtNum(w.interval[1], 0) })})</span></dd></div>
          <div><dt className="text-[13px] text-muted">{t('s.sup.dRisk')}</dt><dd><RiskBadge tier={w.risk_tier} size="sm" /></dd></div>
          <div><dt className="text-[13px] text-muted">{t('s.sup.dBeds')}</dt><dd className="num font-semibold">{fmtNum(w.beds.required)}{w.beds.net_deficit > 0 && <span className="text-risk-critical"> · {t('s.sup.dNoBed', { n: w.beds.net_deficit })}</span>}</dd></div>
          <div><dt className="text-[13px] text-muted">{t('s.sup.dTeams')}</dt><dd className="num font-semibold">{w.crews}</dd></div>
          {w.flags.length > 0 && <div className="sm:col-span-2 lg:col-span-4"><dt className="text-[13px] text-muted">{t('s.sup.dNotes')}</dt><dd>{w.flags.map((f) => tFlag(t, f)).join(' · ')}</dd></div>}
        </dl>
      )}
    </li>
  )
}

export default function ResourceAllocation() {
  const { t, fmtNum } = useI18n()
  const { search } = useFilters()
  const q = usePlan()
  const p = q.data
  const [all, setAll] = useState(false)
  const [more, setMore] = useState(false)
  const [query, setQuery] = useState('')

  const rows = useMemo(() => {
    const isShort = (w: OpsWard) => (['saline_bags_needed', 'diagnostic_kits_needed'] as ConsumableKey[])
      .some((k) => w.allocated[k] !== null && w.allocated[k]! < w.required[k])
    const qq = query.trim().toLowerCase()
    return (p?.wards ?? []).filter((w) => w.in_pool && (all || isShort(w)) && (!qq || w.ward_id.toLowerCase().includes(qq) || w.city.toLowerCase().includes(qq)))
      .sort((a, b) => b.priority - a.priority)
  }, [p, all, query])

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const sal = p?.supplies.saline_bags_needed
  const kit = p?.supplies.diagnostic_kits_needed
  const shown = more ? rows : rows.slice(0, PAGE)

  return (
    <div className="flex flex-col gap-5">
      <PlanBar />
      <PageIntro>{t('s.sup.intro')}</PageIntro>

      {!p || !sal || !kit ? <LoadingBlock className="h-40" /> : (
        <div className={cn('flex flex-col gap-5 transition-opacity', q.pending && 'opacity-70')}>
          <BigAnswer tone={sal.shortfall || kit.shortfall ? 'bad' : 'good'}
            title={sal.shortfall ? t('s.sup.ansBad', { w: sal.wards_short }) : kit.shortfall ? t('s.sup.ansKits', { w: kit.wards_short }) : t('s.sup.ansOk')}>
            {sal.shortfall || kit.shortfall
              ? <>{t('s.sup.ansBadSub', { s: fmtNum(sal.shortfall), k: fmtNum(kit.shortfall) })} {t('s.sup.ansWhy', { n: Math.round(p.scenario.stock_pct) })}</>
              : t('s.sup.ansOkSub')}
          </BigAnswer>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
            <ItemCard label={t('s.sup.saline')} need={sal.required} have={sal.available} short={sal.shortfall} wards={sal.wards_short} />
            <ItemCard label={t('s.sup.kits')} need={kit.required} have={kit.available} short={kit.shortfall} wards={kit.wards_short} />
            <div className="rounded-2xl border border-line-soft bg-panel p-5"><StockField size="md" /></div>
          </div>
        </div>
      )}

      <Section
        title={all ? t('s.sup.listAll') : t('s.sup.listShort')}
        sub={t('s.sup.listSub')}
        action={<Button className="h-11" onClick={() => setAll((v) => !v)}>{all ? t('s.sup.onlyShort') : t('s.sup.showAllWards')}</Button>}
        className={cn('transition-opacity', q.pending && p && 'opacity-70')}>
        <label className="mb-2 flex h-12 items-center gap-2 rounded-xl border border-line bg-canvas px-3 focus-within:border-accent sm:max-w-sm">
          <Search className="size-5 text-muted" aria-hidden />
          <span className="sr-only">{t('s.search')}</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('s.search')} className="w-full bg-transparent text-[15px] outline-none placeholder:text-faint" />
        </label>
        {!p ? <LoadingBlock className="h-60" /> : rows.length === 0 ? <EmptyState message={query ? t('top.noWardMatch') : t('s.sup.noneShort')} /> : (
          <div className="flex flex-col">
            <ul>{shown.map((w) => <WardRow key={w.ward_id} w={w} />)}</ul>
            <ShowMore shown={PAGE} total={rows.length} open={more} onClick={() => setMore((v) => !v)} />
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line-soft pt-4">
          <Button asChild variant="primary" size="lg"><Link to={{ pathname: '/dispatch', search }}><Send /> {t('s.sup.toDispatch')}</Link></Button>
          <Link to={{ pathname: '/overflow', search }} className="inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold text-accent hover:underline">{t('s.sup.bedsNote')} <ArrowRight className="size-4" aria-hidden /></Link>
        </div>
      </Section>

      <HowCalculated>
        <ol className="flex list-decimal flex-col gap-2 pl-5">
          <li>{t('ops.alloc.how1')}</li><li>{t('ops.alloc.how2')}</li><li>{t('ops.alloc.how3')}</li><li>{t('ops.alloc.how4')}</li>
        </ol>
      </HowCalculated>
    </div>
  )
}
