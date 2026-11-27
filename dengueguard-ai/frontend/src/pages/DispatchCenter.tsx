import { Check, ChevronRight, Copy, Download, FileText, Info, MessageCircle, MessageSquareText, Printer, Search, Smartphone } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { SeverityBadge } from '@/components/ops/controls'
import { Choice, PageIntro, PlanBar } from '@/components/ops/simple'
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

/** Print plain message text from a new tab (no HTML from the message is interpreted). */
function printText(title: string, text: string) {
  const win = window.open('', '_blank')
  if (!win) return
  const doc = win.document
  doc.title = title
  const pre = doc.createElement('pre')
  pre.textContent = text
  pre.style.cssText = 'font: 15px/1.6 system-ui, "Noto Sans Bengali", sans-serif; white-space: pre-wrap; margin: 24px'
  doc.body.appendChild(pre)
  win.focus()
  win.print()
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
    <Button variant="primary" size="lg" onClick={async () => {
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

function Step({ n, title, children, className }: { n: number; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-4 rounded-2xl border border-line-soft bg-panel p-5', className)}>
      <h2 className="flex items-center gap-3 text-lg font-semibold text-ink">
        <span aria-hidden className="num grid size-9 shrink-0 place-items-center rounded-full bg-accent text-[15px] font-bold text-accent-ink">{n}</span>
        <span><span className="sr-only">{`Step ${n}: `}</span>{title}</span>
      </h2>
      {children}
    </section>
  )
}

function TypeTile({ active, onClick, icon, label, sub }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; sub: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn('flex min-h-24 flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&_svg]:size-6',
        active ? 'border-accent bg-accent/10' : 'border-line bg-panel hover:bg-panel-2')}>
      <span className={active ? 'text-accent' : 'text-muted'}>{icon}</span>
      <span className="text-[15px] font-semibold text-ink">{label}</span>
      <span className="text-[13px] text-muted">{sub}</span>
    </button>
  )
}

export default function DispatchCenter() {
  const { t, fmtNum, lang: uiLang } = useI18n()
  const { ward: filterWard } = useFilters()
  // set by "Send message" on Home: always show that ward, even if it has no problem
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
  const qq = query.trim().toLowerCase()
  const shown = notices.filter((n) => n.ward_id.toLowerCase().includes(qq) || n.city.toLowerCase().includes(qq))
  const cur = notices.find((n) => n.ward_id === selected) ?? null
  const w = plan.data?.wards.find((x) => x.ward_id === cur?.ward_id)
  useEffect(() => {
    if (!focusWard || focusHandled.current || !q.data) return
    if (notices.some((n) => n.ward_id === focusWard)) {
      setSelected(focusWard)
      focusHandled.current = true
    } else if (flagged === 'flagged') setFlagged('all')
    else focusHandled.current = true
  }, [focusWard, notices, flagged, q.data])
  useEffect(() => {
    if (!notices.length || notices.some((n) => n.ward_id === selected)) return
    if (focusWard && !focusHandled.current) return
    setSelected(notices.some((n) => n.ward_id === filterWard) ? filterWard : notices[0].ward_id)
  }, [notices, selected, filterWard, focusWard])

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const sms = cur ? smsParts(cur.sms) : null
  const stamp = params ? `${params.as_of}_h${params.horizon_weeks}` : ''
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  const text = cur ? (channel === 'sms' ? cur.sms : cur.whatsapp) : ''

  return (
    <div className="flex flex-col gap-5">
      <PlanBar />
      <PageIntro>{t('s.disp.intro')}</PageIntro>
      <p className="flex items-start gap-2 text-[13px] text-muted"><Info className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden /> {t('s.disp.notSent')}</p>

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Step n={1} title={t('s.disp.s1')} className="self-start">
          <Choice<'flagged' | 'all'> label={t('s.disp.which')} value={flagged} onChange={setFlagged} className="grid-cols-2 sm:grid-cols-2"
            options={[{ value: 'flagged', label: t('s.disp.problems') }, { value: 'all', label: t('s.disp.allWards') }]} />
          <label className="flex h-12 items-center gap-2 rounded-xl border border-line bg-canvas px-3 focus-within:border-accent">
            <Search className="size-5 text-muted" aria-hidden />
            <span className="sr-only">{t('s.search')}</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('s.search')} className="w-full bg-transparent text-[15px] outline-none placeholder:text-faint" />
          </label>
          {q.loading && !q.data ? <LoadingBlock className="h-72" /> : shown.length === 0 ? <EmptyState message={notices.length ? t('top.noWardMatch') : t('s.disp.none')} /> : (
            <ul className="-mx-2 flex max-h-[460px] flex-col gap-1 overflow-y-auto px-2" aria-label={t('ops.disp.list', { n: shown.length })}>
              {shown.map((n) => (
                <li key={n.ward_id}>
                  <button onClick={() => setSelected(n.ward_id)} aria-current={n.ward_id === cur?.ward_id}
                    className={cn('flex min-h-14 w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors', n.ward_id === cur?.ward_id ? 'bg-panel-2 text-ink ring-2 ring-accent' : 'text-ink hover:bg-panel-2/60')}>
                    <span><span className="block font-mono text-[15px] font-semibold">{n.ward_id}</span><span className="text-[13px] text-muted">{n.city}</span></span>
                    <SeverityBadge severity={n.severity} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Step>

        <div className="flex min-w-0 flex-col gap-5">
          <Step n={2} title={t('s.disp.s2')}>
            <div className="grid gap-3 sm:grid-cols-3">
              <TypeTile active={channel === 'whatsapp'} onClick={() => setChannel('whatsapp')} icon={<MessageCircle />} label="WhatsApp" sub={t('s.disp.waSub')} />
              <TypeTile active={channel === 'sms'} onClick={() => setChannel('sms')} icon={<Smartphone />} label="SMS" sub={t('s.disp.smsSub')} />
              <TypeTile active={channel === 'brief'} onClick={() => setChannel('brief')} icon={<Printer />} label={t('s.disp.letter')} sub={t('s.disp.letterSub')} />
            </div>
            <Choice<Lang> label={t('s.disp.lang')} value={lang} onChange={setLang} className="grid-cols-2 sm:max-w-sm sm:grid-cols-2"
              options={[{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা' }]} />
          </Step>

          <Step n={3} title={cur ? t('s.disp.s3For', { ward: cur.ward_id }) : t('s.disp.s3')}>
            {!cur ? (q.data ? <EmptyState message={t('s.disp.none')} /> : <LoadingBlock className="h-56" />) : (
              <>
                {w && (
                  <ul className="num flex flex-wrap gap-2 text-[13px]">
                    {[
                      t('s.disp.fCases', { n: fmtNum(w.planning_cases_whole) }),
                      t('s.disp.fSaline', { a: fmtNum(w.allocated.saline_bags_needed), b: fmtNum(w.required.saline_bags_needed) }),
                      t('s.disp.fKits', { a: fmtNum(w.allocated.diagnostic_kits_needed), b: fmtNum(w.required.diagnostic_kits_needed) }),
                      t('s.disp.fBeds', { a: fmtNum(w.beds.required - w.beds.net_deficit), b: fmtNum(w.beds.required) }),
                      t('s.disp.fTeams', { n: w.crews }),
                    ].map((s) => <li key={s} className="rounded-full bg-panel-2 px-3 py-1.5 text-ink">{s}</li>)}
                  </ul>
                )}
                {channel === 'brief' ? (
                  <div className="flex flex-col gap-4">
                    <p className="text-[15px] leading-relaxed text-muted">{t('ux.disp.briefText', { city: cur.city })}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="primary" size="lg" disabled={!params || busy} onClick={() => run(() => openBrief(params!, cur.city))}><Printer /> {t('ux.disp.briefCity', { city: cur.city })}</Button>
                      <Button size="lg" disabled={!params || busy} onClick={() => run(() => openBrief(params!, null))}><FileText /> {t('ops.disp.briefAll')}</Button>
                    </div>
                    <p className="text-[13px] text-muted">{t('ux.disp.briefLang')}</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {channel === 'sms' ? (
                      <div className="w-full max-w-md rounded-[28px] border border-line bg-canvas p-4">
                        <p className="mb-3 flex items-center gap-2 text-[13px] text-muted"><Smartphone className="size-4" aria-hidden /> {t('ux.disp.smsPreview')}</p>
                        <p className="rounded-2xl rounded-tl-sm bg-panel-2 px-3.5 py-2.5 text-[15px] leading-relaxed text-ink">{cur.sms}</p>
                        <p className="num mt-2 text-[13px] text-muted">{t('ops.disp.chars', { n: sms!.chars, parts: sms!.parts, enc: sms!.encoding })}</p>
                      </div>
                    ) : (
                      <div className="w-full max-w-lg rounded-[28px] border border-line bg-[#0b141a] p-4">
                        <p className="mb-3 flex items-center gap-2 text-[13px] text-[#8696a0]"><MessageSquareText className="size-4" aria-hidden /> {t('ux.disp.waPreview')}</p>
                        <div className="rounded-2xl rounded-tl-sm bg-[#202c33] px-3.5 py-2.5 text-[15px] leading-relaxed text-[#e9edef]"><WhatsAppText text={cur.whatsapp} /></div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <CopyButton text={text} />
                      <Button size="lg" onClick={() => saveText(`dengueguard_${channel}_${cur.ward_id}_${lang}_${stamp}.txt`, text + '\n')}><Download /> {t('ux.disp.download')}</Button>
                      <Button size="lg" onClick={() => printText(`${cur.ward_id} · DengueGuard`, text)}><Printer /> {t('s.disp.print')}</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Step>

          <details className="group rounded-2xl border border-line-soft bg-panel">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-5 text-[15px] font-semibold text-ink hover:bg-panel-2/60 focus-visible:outline-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-5 text-muted transition-transform group-open:rotate-90" /> {t('s.disp.bulk', { n: notices.length })}
            </summary>
            <div className="flex flex-col gap-3 border-t border-line-soft px-5 py-4">
              <div className="flex flex-wrap gap-2">
                <Button className="h-11" disabled={!notices.length} onClick={() => saveText(`dengueguard_sms_${lang}_${stamp}.txt`, notices.map((n) => n.sms).join('\n') + '\n')}><Download /> {t('ops.disp.dlSms')}</Button>
                <Button className="h-11" disabled={!notices.length} onClick={() => saveText(`dengueguard_whatsapp_${lang}_${stamp}.txt`, notices.map((n) => n.whatsapp).join('\n\n----------\n\n') + '\n')}><Download /> {t('ops.disp.dlWa')}</Button>
                <Button className="h-11" disabled={!params || busy} onClick={() => run(() => openBrief(params!, null))}><FileText /> {t('ops.disp.briefAll')}</Button>
              </div>
              <p className="text-[13px] text-muted">{t('ops.disp.offline')}</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
