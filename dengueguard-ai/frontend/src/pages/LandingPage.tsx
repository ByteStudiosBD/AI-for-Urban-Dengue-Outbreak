import { Activity, ArrowRight, ChartNoAxesCombined, CloudRain, Grid3x3, Languages, ShieldAlert, SlidersHorizontal } from 'lucide-react'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import corridor from '@/assets/photos/medical-corridor.jpg'
import emergency from '@/assets/photos/medical-emergency.jpg'
import surgery from '@/assets/photos/medical-surgery.png'
import { Logo } from '@/components/Logo'
import { LanguageToggle } from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { useMetadata } from '@/state/AppData'

const EASE = [0.16, 1, 0.3, 1] as const

function Photo({ src, alt, className, depth, mx, my, delay, objectPosition }: {
  src: string; alt: string; className: string; depth: number; mx: ReturnType<typeof useSpring>; my: ReturnType<typeof useSpring>; delay: number; objectPosition?: string
}) {
  const x = useTransform(mx, (v) => v * depth)
  const y = useTransform(my, (v) => v * depth)
  return (
    <motion.figure
      initial={{ opacity: 0, y: 24, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.9, delay, ease: EASE }}
      className={`absolute overflow-hidden rounded-[22px] border border-white/10 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8)] ${className}`}
    >
      <motion.img src={src} alt={alt} style={{ x, y, scale: 1.06, objectPosition }} className="size-full object-cover" draggable={false} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-canvas/55 via-transparent to-transparent" />
    </motion.figure>
  )
}

function Collage() {
  const { t } = useI18n()
  const reduce = useReducedMotion()
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const mx = useSpring(rawX, { stiffness: 60, damping: 20 })
  const my = useSpring(rawY, { stiffness: 60, damping: 20 })
  useEffect(() => {
    if (reduce) return
    const onMove = (e: PointerEvent) => {
      rawX.set((e.clientX / window.innerWidth - 0.5) * 2)
      rawY.set((e.clientY / window.innerHeight - 0.5) * 2)
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [reduce, rawX, rawY])

  return (
    <div className="relative mx-auto aspect-[1/0.92] w-full max-w-[620px]">
      <Photo src={surgery} alt={t('landing.photoSurgery')} depth={-5} mx={mx} my={my} delay={0.15} objectPosition="35% 40%"
        className="top-0 left-0 h-[62%] w-[78%]" />
      <Photo src={corridor} alt={t('landing.photoCorridor')} depth={8} mx={mx} my={my} delay={0.3} objectPosition="50% 55%"
        className="top-[8%] right-0 h-[46%] w-[30%]" />
      <Photo src={emergency} alt={t('landing.photoEmergency')} depth={4} mx={mx} my={my} delay={0.45} objectPosition="40% 50%"
        className="right-[6%] bottom-0 h-[50%] w-[70%]" />
      <div aria-hidden className="absolute -bottom-6 -left-6 -z-10 size-48 rounded-full bg-accent/20 blur-3xl" />
    </div>
  )
}

/** The breeding-clock idea as a week strip: rain at t−4…t, forecasts at t+2…t+4. */
function LagStrip() {
  const { t } = useI18n()
  const weeks = [-4, -3, -2, -1, 0, 1, 2, 3, 4]
  return (
    <div className="overflow-x-auto">
      <ol className="grid min-w-[620px] grid-cols-9 gap-2" aria-label={t('landing.howTitle')}>
        {weeks.map((w) => {
          const rain = w < 0
          const now = w === 0
          const fc = w >= 2
          return (
            <li key={w} className="flex flex-col items-center gap-2">
              <span className={`grid h-16 w-full place-items-center rounded-xl border text-sm font-semibold ${now ? 'border-ink bg-ink text-canvas' : fc ? 'border-accent/60 bg-accent/15 text-accent' : rain ? 'border-[#5B8DEF]/40 bg-[#5B8DEF]/10 text-[#9fbaf5]' : 'border-line text-faint'}`}>
                {rain ? <CloudRain className="size-5" /> : fc ? <Activity className="size-5" /> : now ? 't' : '·'}
              </span>
              <span className="num text-xs text-muted">{w === 0 ? 't' : w > 0 ? `t+${w}` : `t${w}`.replace('-', '−')}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export default function LandingPage() {
  const { t, fmtDate, fmtNum } = useI18n()
  const { meta } = useMetadata()
  useEffect(() => {
    document.title = 'DengueGuard AI — ward-level dengue early warning'
  }, [])

  const features = [
    { icon: Grid3x3, title: t('landing.feat1t'), text: t('landing.feat1') },
    { icon: SlidersHorizontal, title: t('landing.feat2t'), text: t('landing.feat2') },
    { icon: ChartNoAxesCombined, title: t('landing.feat3t'), text: t('landing.feat3') },
    { icon: Languages, title: t('landing.feat4t'), text: t('landing.feat4') },
  ]

  return (
    <div className="min-h-dvh overflow-x-clip bg-canvas text-ink">
      <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Link to="/" className="flex items-center gap-3 rounded-xl"><Logo className="size-9" /><span className="font-semibold tracking-[-0.01em]">{t('app.name')}</span></Link>
        <nav className="flex items-center gap-2">
          <LanguageToggle className="hidden sm:inline-flex" />
          <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link to="/login">{t('nav.login')}</Link></Button>
          <Button asChild variant="primary"><Link to="/risk">{t('landing.ctaPrimary')}</Link></Button>
        </nav>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-14 px-4 pt-8 pb-20 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:pt-16">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: EASE }}>
          <h1 className="text-[clamp(2.6rem,6vw,4.75rem)] leading-[1.02] font-bold tracking-[-0.035em] text-balance">{t('landing.headline')}</h1>
          <p className="mt-6 max-w-[56ch] text-lg leading-relaxed text-muted">{t('landing.sub')}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild variant="primary" size="lg"><Link to="/risk">{t('landing.ctaPrimary')}<ArrowRight /></Link></Button>
            <Button asChild variant="secondary" size="lg"><Link to="/heatmap"><Grid3x3 />{t('landing.ctaSecondary')}</Link></Button>
          </div>
          <LanguageToggle className="mt-6 sm:hidden" />
        </motion.div>
        <Collage />
      </section>

      <section id="how" className="border-t border-line-soft">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-8">
          <h2 className="text-3xl font-semibold tracking-[-0.02em]">{t('landing.howTitle')}</h2>
          <div className="mt-10"><LagStrip /></div>
          <ol className="mt-12 grid gap-10 md:grid-cols-3">
            {[['how1t', 'how1'], ['how2t', 'how2'], ['how3t', 'how3']].map(([h, p]) => (
              <li key={h}>
                <h3 className="text-lg font-semibold">{t(`landing.${h}` as 'landing.how1t')}</h3>
                <p className="mt-2 leading-relaxed text-muted">{t(`landing.${p}` as 'landing.how1')}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-line-soft bg-rail">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <h2 className="text-3xl font-semibold tracking-[-0.02em] text-balance">{t('landing.featTitle')}</h2>
          <ul className="divide-y divide-line-soft">
            {features.map((f) => (
              <li key={f.title} className="group flex gap-5 py-6 first:pt-0">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-panel text-accent transition-transform duration-200 group-hover:-translate-y-0.5"><f.icon className="size-5" /></span>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 leading-relaxed text-muted">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-t border-line-soft">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-8 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">{t('landing.dataTitle')}</h2>
            <p className="mt-3 max-w-[60ch] leading-relaxed text-muted">
              {meta ? t('landing.dataText', {
                wards: meta.coverage.ward_count, cities: meta.cities.length,
                from: fmtDate(meta.coverage.date_min, 'long'), to: fmtDate(meta.coverage.date_max, 'long'), rows: fmtNum(meta.coverage.rows),
              }) : '—'}
            </p>
            {meta && <p className="mt-3 text-sm text-faint">{meta.cities.join(' · ')}</p>}
          </div>
          <div className="rounded-2xl border border-risk-medium/25 bg-risk-medium/[0.06] p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldAlert className="size-5 text-risk-medium" />{t('landing.protoTitle')}</h2>
            <p className="mt-3 leading-relaxed text-muted">{t('landing.protoText')}</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-line-soft">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-faint sm:px-8">
          <span className="flex items-center gap-2"><Logo className="size-6" />{t('landing.footer')}</span>
          <nav className="flex gap-4">
            <Link to="/dashboard" className="hover:text-ink">{t('nav.overview')}</Link>
            <Link to="/validation" className="hover:text-ink">{t('nav.validation')}</Link>
            <Link to="/login" className="hover:text-ink">{t('nav.login')}</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
