import * as P from '@radix-ui/react-popover'
import { Bell, Building2, ChevronLeft, ChevronRight, Download, Globe, History, LogOut, Menu, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import { RiskBadge } from '@/components/RiskBadge'
import { useI18n, type Lang } from '@/i18n'
import { api } from '@/services/api'
import { useAsync } from '@/lib/useAsync'
import { addWeeks, cn, downloadCsv, snapToMonday } from '@/lib/utils'
import { useFilters, useMetadata, useSession } from '@/state/AppData'
import type { Horizon } from '@/types/api'
import { ThemeToggle } from './ThemeToggle'
import { WardSearch } from './WardSearch'

export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n()
  return (
    <div role="group" aria-label={t('top.language')} className={cn('inline-flex h-10 items-center gap-1 rounded-xl border border-line bg-panel p-1', className)}>
      <Globe aria-hidden className="mx-1.5 size-4 text-muted" />
      {(['en', 'bn'] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          lang={l}
          className={cn(
            'h-full rounded-lg px-2.5 text-xs font-semibold transition-colors duration-150',
            lang === l ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink',
          )}
        >
          {l === 'en' ? 'EN' : 'বাংলা'}
        </button>
      ))}
    </div>
  )
}

function HorizonControl() {
  const { t } = useI18n()
  const { h, set } = useFilters()
  return (
    <div role="radiogroup" aria-label={t('top.horizon')} className="inline-flex h-10 items-center gap-1 rounded-xl border border-line bg-panel p-1">
      {([2, 3, 4] as Horizon[]).map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={h === n}
          aria-label={t('top.weeksAhead', { n })}
          onClick={() => set({ h: n })}
          className={cn('h-full rounded-lg px-2.5 text-xs font-semibold transition-colors duration-150', h === n ? 'bg-ink text-canvas' : 'text-muted hover:text-ink')}
        >
          {t('top.wk', { n })}
        </button>
      ))}
    </div>
  )
}

function WeekPicker() {
  const { t, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const { asOf, set } = useFilters()
  if (!meta) return null
  const { min, max } = meta.as_of_range
  return (
    <div className="inline-flex h-10 items-center rounded-xl border border-line bg-panel">
      <button aria-label={t('top.prevWeek')} disabled={asOf <= min} onClick={() => set({ asOf: addWeeks(asOf, -1) })} className="grid h-full w-8 place-items-center rounded-l-xl text-muted hover:text-ink disabled:opacity-30"><ChevronLeft className="size-4" /></button>
      <label className="flex h-full items-center gap-2 border-x border-line px-2">
        <span className="sr-only">{t('top.asOf')}</span>
        <input
          type="date"
          min={min}
          max={max}
          value={asOf}
          onChange={(e) => e.target.value && set({ asOf: snapToMonday(e.target.value) })}
          className="date-input num w-[8.6rem] bg-transparent text-sm text-ink outline-none"
          title={`${t('top.asOf')}: ${fmtDate(asOf, 'long')}`}
        />
      </label>
      <button aria-label={t('top.nextWeek')} disabled={asOf >= max} onClick={() => set({ asOf: addWeeks(asOf, 1) })} className="grid h-full w-8 place-items-center rounded-r-xl text-muted hover:text-ink disabled:opacity-30"><ChevronRight className="size-4" /></button>
    </div>
  )
}

function Alerts() {
  const { t, fmtDate, fmtNum } = useI18n()
  const { city, asOf, h, ready, set, search } = useFilters()
  const { data } = useAsync(() => (ready ? api.predictAll(city, asOf, h) : null), [ready, city, asOf, h])
  const alerting = data?.predictions.filter((p) => p.risk_tier === 'High' || p.risk_tier === 'Critical') ?? []
  return (
    <P.Root>
      <Tooltip content={t('top.alerts')}>
        <P.Trigger asChild>
          <button aria-label={`${t('top.alerts')}: ${data ? alerting.length : '…'}`} className="relative grid size-10 place-items-center rounded-xl border border-line bg-panel text-muted transition-colors duration-150 hover:bg-panel-2 hover:text-ink">
            <Bell className="size-4" />
            {data && alerting.length > 0 && (
              <span className="num absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">{alerting.length}</span>
            )}
          </button>
        </P.Trigger>
      </Tooltip>
      <P.Portal>
        <P.Content align="end" sideOffset={8} className="z-50 w-80 rounded-xl border border-line bg-popover p-3 shadow-[var(--shadow-lift)] data-[state=open]:animate-[pop-in_180ms_var(--ease-out-expo)]">
          <p className="text-sm font-semibold">{t('top.alertsTitle')}</p>
          <p className="mt-1 text-xs text-muted">{t('top.alertsBasis', { city, h, date: fmtDate(asOf, 'long') })}</p>
          <ul className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto">
            {data && alerting.length === 0 && <li className="text-sm text-muted">{t('top.alertsNone')}</li>}
            {alerting.map((p) => (
              <li key={p.ward_id}>
                <Link
                  to={{ pathname: '/predictions', search }}
                  onClick={() => set({ ward: p.ward_id })}
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-panel-2"
                >
                  <span className="font-medium">{p.ward_id}</span>
                  <span className="flex items-center gap-2">
                    <span className="num text-xs text-muted">{fmtNum(p.predicted_cases, 1)}</span>
                    <RiskBadge tier={p.risk_tier} size="sm" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}

function ExportButton() {
  const { t } = useI18n()
  const { city, asOf, h, ready } = useFilters()
  const { data } = useAsync(() => (ready ? api.predictAll(city, asOf, h) : null), [ready, city, asOf, h])
  const onExport = () => {
    if (!data) return
    downloadCsv(
      `dengueguard_${city.replace(/\s+/g, '-')}_${asOf}_h${h}.csv`,
      data.predictions.map((p) => ({
        city: p.city, ward_id: p.ward_id, reference_week: p.as_of, horizon_weeks: p.horizon_weeks, target_week: p.target_date,
        predicted_cases: p.predicted_cases, interval_lower_90: p.interval.lower, interval_upper_90: p.interval.upper,
        risk_tier: p.risk_tier, risk_score_0_100: p.risk_score, actual_cases: p.actual_cases ?? '', evaluation_status: p.evaluation_status,
        source: 'DengueGuard AI model forecast on historical dataset (prototype)',
      })),
    )
  }
  return (
    <Tooltip content={t('top.exportHint')}>
      <Button variant="secondary" size="icon" onClick={onExport} disabled={!data || data.predictions.length === 0} aria-label={t('top.export')} className="xl:w-auto xl:px-3">
        <Download /> <span className="hidden xl:inline">{t('top.export')}</span>
      </Button>
    </Tooltip>
  )
}

function Profile() {
  const { t } = useI18n()
  const { session, setSession } = useSession()
  const nav = useNavigate()
  if (!session) {
    return (
      <Tooltip content={t('top.notSignedIn')}>
        <Link to="/login" aria-label={t('top.signIn')} className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-muted hover:bg-panel-2 hover:text-ink"><UserRound className="size-4" /></Link>
      </Tooltip>
    )
  }
  return (
    <P.Root>
      <P.Trigger aria-label={t('nav.profile')} className="grid size-10 place-items-center rounded-full bg-accent/15 text-sm font-bold text-accent ring-1 ring-accent/40 transition-transform duration-150 hover:scale-105">
        {(session.email?.[0] ?? 'D').toUpperCase()}
      </P.Trigger>
      <P.Portal>
        <P.Content align="end" sideOffset={8} className="z-50 w-64 rounded-xl border border-line bg-popover p-3 shadow-[var(--shadow-lift)] data-[state=open]:animate-[pop-in_180ms_var(--ease-out-expo)]">
          <p className="text-sm font-semibold">{session.mode === 'demo' ? t('top.demoUser') : session.email}</p>
          <p className="mt-0.5 text-xs text-muted">{session.role}</p>
          <Button
            variant="ghost" size="sm" className="mt-3 w-full justify-start"
            onClick={async () => { await api.logout(session.token).catch(() => undefined); setSession(null); nav('/login') }}
          >
            <LogOut /> {t('top.signOut')}
          </Button>
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}

export function TopBar({ title, onMenu }: { title: string; onMenu: () => void }) {
  const { t, fmtDate } = useI18n()
  const { meta } = useMetadata()
  const { city, set } = useFilters()
  return (
    <header className="z-20 border-b border-line-soft bg-canvas/90 backdrop-blur-md lg:sticky lg:top-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 py-3 sm:px-6 lg:px-8">
        <button onClick={onMenu} aria-label={t('nav.openMenu')} className="grid size-10 place-items-center rounded-xl border border-line bg-panel text-muted hover:text-ink lg:hidden"><Menu className="size-5" /></button>
        <h1 className="mr-auto text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{title}</h1>
        {meta && (
          <Tooltip content={t('top.historicalHint', { from: fmtDate(meta.coverage.date_min, 'long'), to: fmtDate(meta.coverage.date_max, 'long') })}>
            <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-muted md:inline-flex">
              <History className="size-3.5" /> {t('top.historical')}
            </span>
          </Tooltip>
        )}
        <div className="flex items-center gap-2">
          <LanguageToggle className="hidden sm:inline-flex" />
          <Alerts />
          <ExportButton />
          <Profile />
          <ThemeToggle />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6 lg:px-8">
        {meta && (
          <Select
            label={t('top.city')}
            icon={<Building2 />}
            value={city}
            onValueChange={(v) => set({ city: v })}
            options={meta.cities.map((c) => ({ value: c, label: c }))}
            className="w-[11.5rem]"
          />
        )}
        <WardSearch />
        <WeekPicker />
        <HorizonControl />
        <LanguageToggle className="sm:hidden" />
      </div>
    </header>
  )
}
