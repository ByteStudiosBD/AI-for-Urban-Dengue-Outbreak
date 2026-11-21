import { ArrowDownWideNarrow, Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RiskBadge, TIER_COLOR, TIER_MARK } from '@/components/RiskBadge'
import { Select } from '@/components/ui/select'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states'
import { Tooltip } from '@/components/ui/tooltip'
import { useI18n, type TKey } from '@/i18n'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useFilters, useMetadata } from '@/state/AppData'
import type { Horizon, RiskTier } from '@/types/api'

const TIER_RANK: Record<RiskTier, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 }

function Cell({ tier, cases, active, onClick, tip, label }: {
  tier: RiskTier; cases: number; active?: boolean; onClick: () => void; tip: React.ReactNode; label: string
}) {
  const { fmtNum } = useI18n()
  return (
    <Tooltip content={tip}>
      <button
        onClick={onClick}
        aria-label={label}
        className={cn(
          'num relative flex h-10 w-full min-w-14 items-center justify-center gap-1 rounded-lg text-xs font-semibold transition-[transform,box-shadow] duration-150 ease-[var(--ease-out-expo)] hover:z-10 hover:scale-[1.06] hover:shadow-[var(--shadow-lift)]',
          active && 'ring-2 ring-ink ring-offset-2 ring-offset-panel',
        )}
        style={{
          background: `color-mix(in oklab, ${TIER_COLOR[tier]} ${tier === "Low" ? 22 : 78}%, var(--color-panel))`,
          color: tier === 'Low' ? 'var(--color-tier-low-ink)' : '#0b0b10',
        }}
      >
        <span aria-hidden className="text-[9px] opacity-70">{TIER_MARK[tier]}</span>
        {fmtNum(cases, 1)}
      </button>
    </Tooltip>
  )
}

export default function WardRiskHeatmap() {
  const { t, fmtNum, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const { city, ward, asOf, h, set, search } = useFilters()
  const nav = useNavigate()
  const [sort, setSort] = useState<'risk' | 'id'>('risk')
  const q = useAsync(() => api.heatmap(city, asOf, 8), [city, asOf])

  const wards = useMemo(() => {
    if (!q.data) return []
    const ids = [...new Set(q.data.cells.map((c) => c.ward_id))]
    const score = (id: string) => q.data!.cells.find((c) => c.ward_id === id && c.horizon_weeks === h)?.predicted_cases ?? 0
    return sort === 'id' ? ids.sort() : ids.sort((a, b) => score(b) - score(a))
  }, [q.data, sort, h])

  const open = (wardId: string, hz: Horizon) => {
    set({ ward: wardId, h: hz })
    nav({ pathname: '/predictions', search: search.replace(/ward=[^&]*/, `ward=${wardId}`).replace(/h=\d/, `h=${hz}`) })
  }

  const tip = (c: { ward_id: string; city?: string; horizon_weeks?: number; target_date: string; predicted_cases: number; risk_tier: RiskTier; as_of?: string; interval?: { lower: number; upper: number } }, hz: number) => (
    <div className="flex flex-col gap-1">
      <p className="font-semibold">{c.ward_id} · {c.city ?? city}</p>
      <p className="text-muted">+{hz} {t('common.week').toLowerCase()} → {fmtDate(c.target_date, 'long')}</p>
      <p><span className="num font-semibold">{fmtNum(c.predicted_cases, 1)}</span> {t('common.casesPerWeek')}{c.interval ? <span className="num text-muted"> ({fmtNum(c.interval.lower, 1)}–{fmtNum(c.interval.upper, 1)})</span> : null}</p>
      <RiskBadge tier={c.risk_tier} size="sm" className="w-fit" />
    </div>
  )

  const legend = (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" aria-label={t('heat.legend')}>
      {(['Low', 'Medium', 'High', 'Critical'] as RiskTier[]).map((tier, i) => {
        const th = meta!.risk_tiers.thresholds_cases
        return (
          <li key={tier} className="flex items-center gap-2">
            <span className="grid h-5 w-7 place-items-center rounded text-[9px] font-bold" style={{ background: `color-mix(in oklab, ${TIER_COLOR[tier]} ${tier === "Low" ? 22 : 78}%, var(--color-panel))`, color: tier === 'Low' ? 'var(--color-tier-low-ink)' : '#0b0b10' }}>{TIER_MARK[tier]}</span>
            <span>{t(`risk.${tier}`)}</span>
            <span className="num text-faint">{[`<${th.medium}`, `${th.medium}–${th.high}`, `${th.high}–${th.critical}`, `≥${th.critical}`][i]}</span>
          </li>
        )
      })}
    </ul>
  )

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('heat.subtitle')}</p>
        <div className="sticky top-0 flex items-center gap-2">
          <Select
            label={t('heat.sort')}
            icon={<ArrowDownWideNarrow />}
            value={sort}
            onValueChange={(v) => setSort(v as 'risk' | 'id')}
            options={[{ value: 'risk', label: t('heat.sortRisk') }, { value: 'id', label: t('heat.sortId') }]}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line-soft bg-panel px-5 py-3">
        {legend}
        <p className="flex items-center gap-1.5 text-[11px] text-faint"><Info className="size-3.5" />{t('heat.noMap')}</p>
      </div>

      {q.loading && !q.data ? <Card><LoadingBlock className="h-96" /></Card> : q.data && q.data.cells.length === 0 ? <EmptyState /> : q.data && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.7fr)]">
          <Card interactive={false}>
            <CardHeader title={t('heat.byHorizon')} sub={`${t('top.asOf')} ${fmtDate(asOf, 'long')} · ${t('heat.hoverHint')}`} />
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1.5">
                <thead>
                  <tr>
                    <th scope="col" className="text-left text-[11px] font-medium text-muted">{t('common.ward')}</th>
                    {([2, 3, 4] as Horizon[]).map((hz) => (
                      <th key={hz} scope="col" className={cn('text-[11px] font-medium', hz === h ? 'text-accent' : 'text-muted')}>{t('heat.horizonCol', { n: hz })}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wards.map((id) => (
                    <tr key={id}>
                      <th scope="row" className={cn('pr-2 text-left text-xs font-medium whitespace-nowrap', id === ward ? 'text-accent' : 'text-ink')}>{id}</th>
                      {([2, 3, 4] as Horizon[]).map((hz) => {
                        const c = q.data!.cells.find((x) => x.ward_id === id && x.horizon_weeks === hz)!
                        return (
                          <td key={hz}>
                            <Cell tier={c.risk_tier} cases={c.predicted_cases} active={id === ward && hz === h} onClick={() => open(id, hz)} tip={tip(c, hz)}
                              label={`${id}, +${hz}: ${fmtNum(c.predicted_cases, 1)} ${t('common.cases')}, ${t(`risk.${c.risk_tier}`)}`} />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card interactive={false}>
            <CardHeader title={t('heat.byWeek')} sub={t('heat.showingWeeks', { n: q.data.timeline_weeks.length, date: fmtDate(asOf, 'long'), h })} />
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-1.5">
                <thead>
                  <tr>
                    <th scope="col" className="text-left text-[11px] font-medium text-muted">{t('common.ward')}</th>
                    {q.data.timeline_weeks.map((w) => (
                      <th key={w} scope="col" className={cn('num text-[10px] font-medium whitespace-nowrap', w === asOf ? 'text-accent' : 'text-muted')}>
                        <button onClick={() => set({ asOf: w })} className="rounded px-1 hover:text-ink">{fmtDate(w)}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wards.map((id) => (
                    <tr key={id}>
                      <th scope="row" className={cn('pr-2 text-left text-xs font-medium whitespace-nowrap', id === ward ? 'text-accent' : 'text-ink')}>{id}</th>
                      {q.data!.timeline_weeks.map((w) => {
                        const c = q.data!.timeline[String(h)].find((x) => x.ward_id === id && x.as_of === w)
                        return (
                          <td key={w}>
                            {c && <Cell tier={c.risk_tier} cases={c.predicted_cases} active={id === ward && w === asOf}
                              onClick={() => { set({ ward: id, asOf: w }) }} tip={tip(c, h)}
                              label={`${id}, ${fmtDate(w)}: ${fmtNum(c.predicted_cases, 1)} ${t('common.cases')}, ${t(`risk.${c.risk_tier}`)}`} />}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {q.data && (
        <Card interactive={false}>
          <CardHeader title={t('heat.list')} sub={t('dash.watchlistSub', { h })} />
          <ol className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-4">
            {[...q.data.cells.filter((c) => c.horizon_weeks === h)].sort((a, b) => TIER_RANK[b.risk_tier] - TIER_RANK[a.risk_tier] || b.predicted_cases - a.predicted_cases).map((c, i) => (
              <li key={c.ward_id} className="flex items-center justify-between gap-2 border-b border-line-soft py-2 text-sm">
                <button onClick={() => open(c.ward_id, h)} className="flex min-w-0 items-center gap-2 text-left hover:text-accent">
                  <span className="num w-5 text-xs text-faint">{i + 1}</span>
                  <span className="truncate font-medium">{c.ward_id}</span>
                </button>
                <span className="flex items-center gap-2">
                  <span className="num text-xs text-muted">{fmtNum(c.predicted_cases, 1)}</span>
                  <RiskBadge tier={c.risk_tier} size="sm" />
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] text-faint">{t(`status.${q.data.cells[0]?.evaluation_status ?? 'validation'}` as TKey)} · {t('heat.hoverHint')}</p>
        </Card>
      )}
    </div>
  )
}
