import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { bn } from './bn'
import { en, type Dict } from './en'

export type Lang = 'en' | 'bn'
const dicts: Record<Lang, Dict> = { en, bn }
const STORAGE_KEY = 'dg.lang'

type Path<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Path<T[K], `${P}${K}.`>
}[keyof T & string]
export type TKey = Path<Dict>

interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TKey, vars?: Record<string, string | number>) => string
  fmtNum: (n: number | null | undefined, digits?: number) => string
  fmtDate: (iso: string, style?: 'short' | 'long') => string
}

const Ctx = createContext<I18n | null>(null)

function readLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'bn' ? 'bn' : 'en'
  } catch {
    return 'en'
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(STORAGE_KEY, l)
    } catch {
      /* storage unavailable: preference lasts for this tab only */
    }
  }, [])
  const value = useMemo<I18n>(() => {
    // data values keep Latin digits in both languages; month names follow the UI language
    const locale = lang === 'bn' ? 'bn-BD-u-nu-latn' : 'en-GB'
    return {
      lang,
      setLang,
      t: (key, vars) => {
        let s = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], dicts[lang]) as string | undefined
        if (typeof s !== 'string') s = key
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
        return s
      },
      fmtNum: (n, digits = 0) =>
        n === null || n === undefined || Number.isNaN(n)
          ? '—'
          : new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n),
      fmtDate: (iso, style = 'short') => {
        const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
        if (Number.isNaN(d.getTime())) return '—'
        return new Intl.DateTimeFormat(locale, {
          day: 'numeric', month: 'short', ...(style === 'long' ? { year: 'numeric' } : { year: '2-digit' }), timeZone: 'UTC',
        }).format(d)
      },
    }
  }, [lang, setLang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useI18n outside provider')
  return c
}
