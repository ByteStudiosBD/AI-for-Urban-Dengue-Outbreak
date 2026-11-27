import { Check, Copy, Download, FileText, MessageSquareText, Printer, Smartphone, WifiOff } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ScenarioPanel, Segmented, SeverityBadge } from '@/components/ops/controls'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/states'
import { useI18n } from '@/i18n'
import { useAsync } from '@/lib/useAsync'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'
import { useFilters } from '@/state/AppData'
import { usePlanParams } from '@/state/Ops'
import type { PlanParams } from '@/types/api'

type Lang = 'en' | 'bn'
type Channel = 'sms' | 'whatsapp'

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
              : seg.startsWith('_') && seg.endsWith('_') && seg.length > 2 ? <i key={j} className="text-[#667781]">{seg.slice(1, -1)}</i>
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
    <Button size="sm" variant="secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ }
    }}>{done ? <Check /> : <Copy />} {done ? t('ops.disp.copied') : t('ops.disp.copy')}</Button>
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
  const { t, lang: uiLang } = useI18n()
  const { city } = useFilters()
  const params = usePlanParams()
  const [lang, setLang] = useState<Lang>(uiLang)
  const [flagged, setFlagged] = useState<'flagged' | 'all'>('flagged')
  const [selected, setSelected] = useState<string | null>(null)
  const [channel, setChannel] = useState<Channel>('whatsapp')
  const [busy, setBusy] = useState(false)
  const key = JSON.stringify(params)
  const q = useAsync(() => (params ? api.opsDispatch({ ...params, lang, only_flagged: flagged === 'flagged' }) : null), [key, lang, flagged])
  const notices = useMemo(() => q.data?.notices ?? [], [q.data])
  const cur = notices.find((n) => n.ward_id === selected) ?? notices[0]
  useEffect(() => {
    if (notices.length && !notices.some((n) => n.ward_id === selected)) setSelected(notices[0].ward_id)
  }, [notices, selected])

  if (q.error) return <ErrorState error={q.error} onRetry={q.retry} />
  const sms = cur ? smsParts(cur.sms) : null
  const stamp = params ? `${params.as_of}_h${params.horizon_weeks}` : ''

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <ScenarioPanel show={['pool', 'stock', 'crews', 'capacity', 'basis']}
        footer={
          <div className="flex flex-col gap-4 border-t border-line-soft pt-4">
            <Segmented<Lang> label={t('ops.disp.lang')} value={lang} onChange={setLang} options={[{ value: 'en', label: 'English' }, { value: 'bn', label: 'বাংলা' }]} />
            <Segmented label={t('ops.disp.wards')} value={flagged} onChange={setFlagged} options={[{ value: 'flagged', label: t('ops.disp.flaggedOnly') }, { value: 'all', label: t('ops.disp.allWards') }]} />
          </div>
        } />

      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line-soft bg-panel px-4 py-3 text-xs text-muted">
          <WifiOff className="size-4 text-risk-low" /> <span className="mr-auto">{t('ops.disp.offline')}</span>
          <Button size="sm" variant="primary" disabled={!params || busy} onClick={async () => { setBusy(true); try { await openBrief(params!, city) } finally { setBusy(false) } }}>
            <Printer /> {t('ops.disp.briefCity', { city })}
          </Button>
          <Button size="sm" variant="secondary" disabled={!params || busy} onClick={async () => { setBusy(true); try { await openBrief(params!, null) } finally { setBusy(false) } }}>
            <FileText /> {t('ops.disp.briefAll')}
          </Button>
          <Button size="sm" variant="secondary" disabled={!notices.length} onClick={() => saveText(`dengueguard_sms_${lang}_${stamp}.txt`, notices.map((n) => n.sms).join('\n') + '\n')}>
            <Download /> {t('ops.disp.dlSms')}
          </Button>
          <Button size="sm" variant="secondary" disabled={!notices.length} onClick={() => saveText(`dengueguard_whatsapp_${lang}_${stamp}.txt`, notices.map((n) => n.whatsapp).join('\n\n----------\n\n') + '\n')}>
            <Download /> {t('ops.disp.dlWa')}
          </Button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Card interactive={false} className="p-3">
            <p className="px-2 pt-1 pb-2 text-xs font-semibold tracking-[0.06em] text-muted uppercase">{t('ops.disp.list', { n: notices.length })}</p>
            {q.loading && !q.data ? <LoadingBlock className="h-72" /> : notices.length === 0 ? <EmptyState message={t('ops.disp.none')} /> : (
              <ul className="flex max-h-[560px] flex-col gap-1 overflow-y-auto pr-1">
                {notices.map((n) => (
                  <li key={n.ward_id}>
                    <button onClick={() => setSelected(n.ward_id)} aria-current={n.ward_id === cur?.ward_id}
                      className={cn('flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors', n.ward_id === cur?.ward_id ? 'bg-panel-2 text-ink' : 'text-muted hover:bg-panel-2/60 hover:text-ink')}>
                      <span><span className="block font-mono text-xs font-semibold">{n.ward_id}</span><span className="text-[11px] text-faint">{n.city}</span></span>
                      <SeverityBadge severity={n.severity} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card interactive={false} className="min-w-0">
            <CardHeader title={cur ? t('ops.disp.preview', { ward: cur.ward_id }) : t('ops.disp.previewNone')} sub={t('ops.disp.previewSub')}
              action={<div className="w-56"><Segmented<Channel> label={t('ops.disp.channel')} value={channel} onChange={setChannel}
                options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }]} /></div>} />
            {!cur ? <LoadingBlock className="h-72" /> : channel === 'sms' ? (
              <div className="flex flex-col gap-4">
                <div className="mx-auto w-full max-w-sm rounded-[28px] border border-line bg-canvas p-4">
                  <p className="mb-3 flex items-center gap-2 text-[11px] text-faint"><Smartphone className="size-3.5" /> SMS · DengueGuard</p>
                  <p className="rounded-2xl rounded-tl-sm bg-panel-2 px-3.5 py-2.5 text-sm leading-relaxed text-ink">{cur.sms}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span className="num">{t('ops.disp.chars', { n: sms!.chars, parts: sms!.parts, enc: sms!.encoding })}</span>
                  <span className="ml-auto"><CopyButton text={cur.sms} /></span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="mx-auto w-full max-w-md rounded-[28px] border border-line bg-[#0b141a] p-4">
                  <p className="mb-3 flex items-center gap-2 text-[11px] text-[#8696a0]"><MessageSquareText className="size-3.5" /> WhatsApp · DengueGuard</p>
                  <div className="rounded-2xl rounded-tl-sm bg-[#202c33] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#e9edef]"><WhatsAppText text={cur.whatsapp} /></div>
                </div>
                <div className="flex justify-end"><CopyButton text={cur.whatsapp} /></div>
              </div>
            )}
            <p className="mt-5 border-t border-line-soft pt-3 text-xs leading-relaxed text-muted">{t('ops.disp.note')}</p>
          </Card>
        </div>
      </div>
    </div>
  )
}
