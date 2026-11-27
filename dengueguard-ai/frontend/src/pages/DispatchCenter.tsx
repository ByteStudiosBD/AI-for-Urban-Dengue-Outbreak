import { Check, Copy, Download, FileText, Info, MessageSquareText, Printer, Search, Smartphone } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Disclosure, KindTag, ScenarioSummary, Segmented, SeverityBadge, StepCard, tFlag } from '@/components/ops/controls'
import { RiskBadge } from '@/components/RiskBadge'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useFilters } from '@/state/AppData'
import { usePlan, usePlanParams } from '@/state/Ops'
import type { PlanParams } from '@/types/api'

type Lang = 'en' | 'bn'
type Channel = 'whatsapp' | 'sms' | 'brief'

function saveText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** GSM-7 messages hold 160 chars (153 per part when split); Bangla needs UCS-2: 70 (67 per part). */
function smsParts(text: string) {
  const ucs2 = /[^\x00-\x7F]/.test(text)
  const single = ucs2 ? 70 : 160
  const multi = ucs2 ? 67 : 153
  const n = text.length
  return { chars: n, parts: n <= single ? 1 : Math.ceil(n / multi), encoding: ucs2 ? 'UCS-2' : 'GSM-7' }
}

/** Render WhatsApp *bold* and _italic_ markers safely (no HTML injection). */
function WhatsAppText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <p key={i} className="min-h-[1em]">
          {/* markers only count at word boundaries, so ward IDs like DSCC_Ward_07 stay intact */}
          {line.split(/((?<![\w*])\*[^*]+\*(?![\w*])|(?<!\w)_[^_]+_(?!\w))/g).map((seg, j) =>
            seg.startsWith('*') && seg.endsWith('*') && seg.length > 2 ? <b key={j}>{seg.slice(1, -1)}</b>
              : seg.startsWith('_') && seg.endsWith('_') && seg.length > 2 ? <i key={j} className="text-[#8696a0]">{seg.slice(1, -1)}</i>
                : <span key={j}>{seg}</span>)}
        </p>
      ))}
    </>
  )
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  return (
    <Button variant="primary" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800) } catch { /* clipboard blocked */ }
    }}>{done ? <Check /> : <Copy />} {done ? t('ops.disp.copied') : t('ux.disp.copy')}</Button>
  )
}

async function openBrief(params: PlanParams, city: string | null) {
  // open the tab synchronously (popup blockers), then fill it with the server-rendered brief
  const win = window.open('', '_blank')
  const html = await api.opsBriefHtml({ ...params, brief_city: city })
  if (win) {
    win.document.open()
    win.document.write(html)
    win.document.close()
  } else {
    saveText(`dengueguard_brief_${(city ?? 'all').replace(/\s+/g, '_')}_${params.as_of}.html`, html)
  }
}

export default function DispatchCenter() {
  const { t, fmtNum, lang: uiLang } = useI18n()
  const { ward: filterWard } = useFilters()
  // set by "View actions" on Home: always show that ward, even if it has no shortage
  const focusWard = (useLocation().state as { focusWard?: string } | null)?.focusWard ?? null
  const focusHandled = useRef(false)
  const params = usePlanParams()
  const plan = usePlan()
  const [lang, setLang] = useState<Lang>(uiLang)
  const [flagged, setFlagged] = useState<'flagged' | 'all'>('flagged')
  const [selected, setSelected] = useState<string | null>(null)
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const key = JSON.stringify(params)
  const q = useAsync(() => (params ? api.opsDispatch({ ...params, lang, only_flagged: flagged === 'flagged' }) : null), [key, lang, flagged])
  const notices = useMemo(() => q.data?.notices ?? [], [q.data])
  const shown = notices.filter((n) => n.ward_id.toLowerCase().includes(query.trim().toLowerCase()))
  const cur = notices.find((n) => n.ward_id === selected) ?? null
  const w = plan.data?.wards.find((x) => x.ward_id === cur?.ward_id)
  // a ward sent from Home is selected once; if it has no shortage, show all wards so it is listed
  useEffect(() => {
    if (!focusWard || focusHandled.current || !q.data) return
    if (notices.some((n) => n.ward_id === focusWard)) {
      setSelected(focusWard)
      focusHandled.current = true
    } else if (flagged === 'flagged') setFlagged('all')
    else focusHandled.current = true
  }, [focusWard, notices, flagged, q.data])
  // otherwise keep a valid selection, preferring the ward in the top-bar filter
  useEffect(() => {
    if (!notices.length || notices.some((n) => n.ward_id === selected)) return
    if (focusWard && !focusHandled.current) return
    setSelected(notices.some((n) => n.ward_id === filterWard) ? filterWard : notices[0].ward_id)
  }, [notices, selected, filterWard, focusWard])

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const sms = cur ? smsParts(cur.sms) : null
  const stamp = params ? `${params.as_of}_h${params.horizon_weeks}` : ''
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }

  return (
    <div className="flex flex-col gap-5">
      <ScenarioSummary editTo="/allocation" />
      <p className="flex items-start gap-2 text-xs text-muted"><Info className="mt-px size-4 shrink-0 text-faint" aria-hidden /> {t('ux.disp.notSent')}</p>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <StepCard n={1} title={t('ux.disp.s1')} sub={t('ux.disp.s1Sub')} className="self-start">
          <Segmented label={t('ops.disp.wards')} value={flagged} onChange={setFlagged}
            options={[{ value: 'flagged', label: t('ops.disp.flaggedOnly') }, { value: 'all', label: t('ops.disp.allWards') }]} />
          <label className="flex h-10 items-center gap-2 rounded-xl border border-line bg-canvas px-3 focus-within:border-accent">
            <Search className="size-4 text-muted" aria-hidden />
            <span className="sr-only">{t('top.searchWard')}</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('top.searchWard')} className="w-full bg-transparent text-sm outline-none placeholder:text-faint" />
          </label>
          {q.loading && !q.data ? <LoadingBlock className="h-72" /> : shown.length === 0 ? <EmptyState message={notices.length ? t('top.noWardMatch') : t('ops.disp.none')} /> : (
            <ul className="-mx-2 flex max-h-[520px] flex-col gap-1 overflow-y-auto px-2" aria-label={t('ops.disp.list', { n: shown.length })}>
              {shown.map((n) => (
                <li key={n.ward_id}>
                  <button onClick={() => setSelected(n.ward_id)} aria-current={n.ward_id === cur?.ward_id}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors', n.ward_id === cur?.ward_id ? 'bg-panel-2 text-ink ring-1 ring-accent/60' : 'text-muted hover:bg-panel-2/60 hover:text-ink')}>
                    <span><span className="block font-mono text-xs font-semibold">{n.ward_id}</span><span className="text-[11px] text-faint">{n.city}</span></span>
                    <SeverityBadge severity={n.severity} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </StepCard>

        <div className="flex min-w-0 flex-col gap-5">
          <StepCard n={2} title={cur ? t('ux.disp.s2For', { ward: cur.ward_id }) : t('ux.disp.s2')} sub={t('ux.disp.s2Sub')} action={<KindTag kind="calculated" />}>
            {!cur && q.data ? <EmptyState message={t('ops.disp.none')} /> : !w ? <LoadingBlock className="h-24" /> : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge tier={w.risk_tier} /> <SeverityBadge severity={w.severity} />
                  <span className="text-xs text-muted">{w.city}</span>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 xl:grid-cols-5">
                  {[
                    [t('ux.disp.rCases'), `${fmtNum(w.planning_cases_whole)}`, `${fmtNum(w.interval[0], 0)}–${fmtNum(w.interval[1], 0)}`],
                    [t('ops.supply.saline_bags_needed'), `${fmtNum(w.allocated.saline_bags_needed)} / ${fmtNum(w.required.saline_bags_needed)}`, t('ux.disp.allocReq')],
                    [t('ops.supply.diagnostic_kits_needed'), `${fmtNum(w.allocated.diagnostic_kits_needed)} / ${fmtNum(w.required.diagnostic_kits_needed)}`, t('ux.disp.allocReq')],
                    [t('ops.supply.hospital_beds_required'), `${fmtNum(w.beds.required - w.beds.net_deficit)} / ${fmtNum(w.beds.required)}`,
                      w.beds.routed_out ? t('ux.disp.routed', { n: w.beds.routed_out }) : t('ux.disp.bedsSecured')],
                    [t('ops.col.crews'), fmtNum(w.crews), t('ux.disp.crewsAssigned')],
                  ].map(([k, v, s]) => (
                    <div key={k} className="rounded-xl border border-line-soft p-3">
                      <dt className="text-[11px] text-muted">{k}</dt>
                      <dd className="num text-lg font-semibold">{v}</dd>
                      <dd className="text-[11px] text-faint">{s}</dd>
                    </div>
                  ))}
                </dl>
                {w.flags.length > 0 && <p className="text-xs text-muted"><span className="font-semibold text-ink">{t('ux.disp.issues')}: </span>{w.flags.map((f) => tFlag(t, f)).join(' · ')}</p>}
              </>
            )}
          </StepCard>

          <StepCard n={3} title={t('ux.disp.s3')} sub={t('ux.disp.s3Sub')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Segmented<Channel> label={t('ops.disp.channel')} value={channel} onChange={setChannel}
                options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }, { value: 'brief', label: t('ux.disp.brief') }]} />
              <Segmented<Lang> label={t('ops.disp.lang')} value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা' }]} />
            </div>
          </StepCard>

          <StepCard n={4} title={t('ux.disp.s4')} sub={t('ux.disp.s4Sub')}>
            {!cur ? <LoadingBlock className="h-56" /> : channel === 'brief' ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm leading-relaxed text-muted">{t('ux.disp.briefText', { city: cur.city })}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" disabled={!params || busy} onClick={() => run(() => openBrief(params!, cur.city))}><Printer /> {t('ux.disp.briefCity', { city: cur.city })}</Button>
                  <Button variant="secondary" disabled={!params || busy} onClick={() => run(() => openBrief(params!, null))}><FileText /> {t('ops.disp.briefAll')}</Button>
                </div>
                <p className="text-xs text-faint">{t('ux.disp.briefLang')}</p>
              </div>
            ) : channel === 'sms' ? (
              <div className="flex flex-col gap-4">
                <div className="mx-auto w-full max-w-sm rounded-[28px] border border-line bg-canvas p-4">
                  <p className="mb-3 flex items-center gap-2 text-[11px] text-faint"><Smartphone className="size-3.5" aria-hidden /> {t('ux.disp.smsPreview')}</p>
                  <p className="rounded-2xl rounded-tl-sm bg-panel-2 px-3.5 py-2.5 text-[15px] leading-relaxed text-ink">{cur.sms}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton text={cur.sms} />
                  <Button variant="secondary" onClick={() => saveText(`dengueguard_sms_${cur.ward_id}_${lang}_${stamp}.txt`, cur.sms + '\n')}><Download /> {t('ux.disp.download')}</Button>
                  <span className="num ml-auto text-xs text-muted">{t('ops.disp.chars', { n: sms!.chars, parts: sms!.parts, enc: sms!.encoding })}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="mx-auto w-full max-w-md rounded-[28px] border border-line bg-[#0b141a] p-4">
                  <p className="mb-3 flex items-center gap-2 text-[11px] text-[#8696a0]"><MessageSquareText className="size-3.5" aria-hidden /> {t('ux.disp.waPreview')}</p>
                  <div className="rounded-2xl rounded-tl-sm bg-[#202c33] px-3.5 py-2.5 text-[14px] leading-relaxed text-[#e9edef]"><WhatsAppText text={cur.whatsapp} /></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={cur.whatsapp} />
                  <Button variant="secondary" onClick={() => saveText(`dengueguard_whatsapp_${cur.ward_id}_${lang}_${stamp}.txt`, cur.whatsapp + '\n')}><Download /> {t('ux.disp.download')}</Button>
                </div>
              </div>
            )}
          </StepCard>

          <Disclosure title={t('ux.disp.bulk')} sub={t('ux.disp.bulkSub', { n: notices.length })}>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={!notices.length} onClick={() => saveText(`dengueguard_sms_${lang}_${stamp}.txt`, notices.map((n) => n.sms).join('\n') + '\n')}><Download /> {t('ops.disp.dlSms')}</Button>
              <Button variant="secondary" disabled={!notices.length} onClick={() => saveText(`dengueguard_whatsapp_${lang}_${stamp}.txt`, notices.map((n) => n.whatsapp).join('\n\n----------\n\n') + '\n')}><Download /> {t('ops.disp.dlWa')}</Button>
              <Button variant="secondary" disabled={!params || busy} onClick={() => run(() => openBrief(params!, null))}><FileText /> {t('ops.disp.briefAll')}</Button>
            </div>
            <p className="text-xs text-faint">{t('ops.disp.offline')}</p>
          </Disclosure>
        </div>
      </div>
    </div>
  )
}
