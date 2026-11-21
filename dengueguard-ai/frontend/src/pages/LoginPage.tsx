import { ArrowRight, Eye, EyeOff, LogIn, UserRound } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { safeNext } from '@/components/layout/RequireSession'
import corridor from '@/assets/photos/signin-corridor.png'
import { Logo } from '@/components/Logo'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { LanguageToggle } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { ApiError, api } from '@/services/api'
import { useSession } from '@/state/AppData'

export default function LoginPage() {
  const { t } = useI18n()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { setSession } = useSession()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [remember, setRemember] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState<'login' | 'demo' | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const ids = { email: useId(), pw: useId(), err: useId() }
  useEffect(() => {
    document.title = `${t('login.title')} · DengueGuard AI`
  }, [t])

  const emailErr = touched && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? t('login.emailInvalid') : null
  const pwErr = touched && pw.length < 8 ? t('login.pwShort') : null

  const demo = async () => {
    setBusy('demo')
    setFormError(null)
    try {
      setSession(await api.demo(), remember)
      nav(next, { replace: true })
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setFormError(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || pw.length < 8) return
    setBusy('login')
    try {
      setSession(await api.login(email, pw), remember)
      nav(next, { replace: true })
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ''
      setFormError(code === 'no_accounts' ? t('login.noAccounts') : code === 'invalid_credentials' ? t('login.badCreds') : (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const field = 'h-12 w-full rounded-xl border bg-canvas px-4 text-sm text-ink outline-none transition-colors duration-150 placeholder:text-faint focus:border-accent'

  return (
    <>
    <div className="grid min-h-dvh bg-canvas text-ink lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden lg:block">
        <img src={corridor} alt={t('landing.photoCorridor')} className="absolute inset-0 size-full object-cover object-center" draggable={false} />
        {/* Same dark navy overlay in both themes: the photo is dark, so its text is always white. */}
        <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,7,16,0.55)_0%,rgba(4,7,16,0.15)_28%,rgba(4,7,16,0.2)_55%,rgba(4,7,16,0.88)_100%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex w-fit items-center gap-3"><Logo /><span className="text-lg font-semibold text-white">{t('app.name')}</span></div>
          <div>
            <p className="max-w-[18ch] text-4xl leading-tight font-bold tracking-[-0.03em] text-white [text-shadow:0_2px_20px_rgba(0,0,0,0.6)]">{t('landing.headline')}</p>
            <p className="mt-4 max-w-[46ch] text-[#d7deea] [text-shadow:0_1px_10px_rgba(0,0,0,0.6)]">{t('app.tagline')}</p>
          </div>
        </div>
      </div>

      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          {/* Sign-in comes first now, so there is no "back to home" link here: home requires a session. */}
          <div className="flex items-center gap-2.5 lg:invisible"><Logo className="size-8" /><span className="font-semibold">{t('app.name')}</span></div>
          <div className="flex items-center gap-2"><LanguageToggle /><ThemeToggle /></div>
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-bold tracking-[-0.03em]">{t('login.title')}</h1>
          <p className="mt-2 text-muted">{t('login.sub')}</p>

          <div className="mt-8 rounded-2xl border border-accent/40 bg-accent/[0.07] p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-accent/20 text-accent"><UserRound className="size-5" /></span>
              <div>
                <p className="font-semibold">{t('login.role')}</p>
                <p className="text-xs text-muted">{t('login.demoHint')}</p>
              </div>
            </div>
            <Button variant="primary" size="lg" className="mt-4 w-full" onClick={demo} disabled={busy !== null}>
              {busy === 'demo' ? t('common.loading') : t('login.demo')} <ArrowRight />
            </Button>
          </div>

          <div className="my-7 flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" />{t('login.or')}<span className="h-px flex-1 bg-line" /></div>

          <form noValidate onSubmit={submit} className="flex flex-col gap-4" aria-describedby={formError ? ids.err : undefined}>
            <div>
              <label htmlFor={ids.email} className="mb-1.5 block text-sm font-medium">{t('login.email')}</label>
              <input id={ids.email} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => email && setTouched(true)}
                aria-invalid={!!emailErr} className={`${field} ${emailErr ? 'border-risk-critical' : 'border-line'}`} placeholder="officer@example.org" />
              {emailErr && <p className="mt-1.5 text-xs text-risk-critical">{emailErr}</p>}
            </div>
            <div>
              <label htmlFor={ids.pw} className="mb-1.5 block text-sm font-medium">{t('login.password')}</label>
              <div className="relative">
                <input id={ids.pw} type={show ? 'text' : 'password'} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)}
                  aria-invalid={!!pwErr} className={`${field} pr-12 ${pwErr ? 'border-risk-critical' : 'border-line'}`} />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t('login.hide') : t('login.show')} aria-pressed={show}
                  className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-panel hover:text-ink">
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {pwErr && <p className="mt-1.5 text-xs text-risk-critical">{pwErr}</p>}
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm text-muted">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[#FF633E]" />
              {t('login.remember')}
            </label>
            {formError && <p id={ids.err} role="alert" className="rounded-xl border border-risk-critical/30 bg-risk-critical/5 p-3 text-sm text-ink">{formError}</p>}
            <Button type="submit" variant="secondary" size="lg" disabled={busy !== null}><LogIn />{busy === 'login' ? t('common.loading') : t('login.submit')}</Button>
          </form>
          <p className="mt-6 text-xs leading-relaxed text-faint">{t('login.note')}</p>
        </div>
      </main>
    </div>
    <SiteFooter />
    </>
  )
}
