import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/services/api'
import { useAsync } from '@/lib/useAsync'
import { snapToMonday } from '@/lib/utils'
import type { Horizon, Metadata, Session, WardInfo } from '@/types/api'

/* ---------------- metadata (fetched once) ---------------- */
interface MetaCtx {
  meta: Metadata | undefined
  error: Error | undefined
  loading: boolean
  retry: () => void
}
const MetaContext = createContext<MetaCtx | null>(null)

export function MetadataProvider({ children }: { children: ReactNode }) {
  const { data, error, loading, retry } = useAsync(() => api.metadata(), [])
  return <MetaContext.Provider value={{ meta: data, error, loading, retry }}>{children}</MetaContext.Provider>
}
export function useMetadata() {
  const c = useContext(MetaContext)
  if (!c) throw new Error('useMetadata outside provider')
  return c
}

/* ---------------- filters: single source of truth in the URL query ---------------- */
export interface Filters {
  city: string
  ward: string
  asOf: string
  h: Horizon
}

const DEFAULT_CITY = 'Dhaka South'

/** Reads/writes ?city=&ward=&asOf=&h= so every page and shared link keeps the same selection. */
export function useFilters(): Filters & {
  set: (patch: Partial<Filters>) => void
  wardsInCity: WardInfo[]
  ready: boolean
  search: string
} {
  const { meta } = useMetadata()
  const [params, setParams] = useSearchParams()

  const resolved = useMemo(() => {
    if (!meta) return null
    const cityParam = params.get('city')
    const city = cityParam && meta.cities.includes(cityParam) ? cityParam : (meta.cities.includes(DEFAULT_CITY) ? DEFAULT_CITY : meta.cities[0])
    const wardsInCity = meta.wards.filter((w) => w.city === city)
    const wardParam = params.get('ward')
    const ward = wardsInCity.some((w) => w.ward_id === wardParam) ? wardParam! : wardsInCity[0].ward_id
    const weeks = meta.available_weeks
    const raw = params.get('asOf')
    let asOf = raw ? snapToMonday(raw) : meta.as_of_range.max
    if (asOf < meta.as_of_range.min) asOf = meta.as_of_range.min
    if (asOf > meta.as_of_range.max) asOf = meta.as_of_range.max
    if (!weeks.includes(asOf)) asOf = weeks.filter((w) => w <= asOf).at(-1) ?? meta.as_of_range.max
    const hn = Number(params.get('h'))
    const h = (hn === 3 || hn === 4 ? hn : 2) as Horizon
    return { city, ward, asOf, h, wardsInCity }
  }, [meta, params])

  const set = useCallback(
    (patch: Partial<Filters>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          const cur = resolved
          const merged = { city: cur?.city, ward: cur?.ward, asOf: cur?.asOf, h: cur?.h, ...patch }
          if (patch.city && patch.city !== cur?.city && !patch.ward) {
            merged.ward = meta?.wards.find((w) => w.city === patch.city)?.ward_id
          }
          for (const [k, v] of Object.entries(merged)) if (v !== undefined) next.set(k, String(v))
          return next
        },
        { replace: true },
      )
    },
    [setParams, resolved, meta],
  )

  const search = resolved ? `?${new URLSearchParams({ city: resolved.city, ward: resolved.ward, asOf: resolved.asOf, h: String(resolved.h) })}` : ''
  return {
    city: resolved?.city ?? '', ward: resolved?.ward ?? '', asOf: resolved?.asOf ?? '', h: resolved?.h ?? 2,
    wardsInCity: resolved?.wardsInCity ?? [], ready: !!resolved, set, search,
  }
}

/* ---------------- session (demo or local account) ---------------- */
interface SessionCtx {
  session: Session | null
  setSession: (s: Session | null, remember?: boolean) => void
}
const SessionContext = createContext<SessionCtx | null>(null)
const SKEY = 'dg.session'

function readSession(): Session | null {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const v = store.getItem(SKEY)
      if (v) return JSON.parse(v) as Session
    } catch {
      /* ignore */
    }
  }
  return null
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setState] = useState<Session | null>(readSession)
  const setSession = useCallback((s: Session | null, remember = false) => {
    setState(s)
    try {
      sessionStorage.removeItem(SKEY)
      localStorage.removeItem(SKEY)
      if (s) (remember ? localStorage : sessionStorage).setItem(SKEY, JSON.stringify(s))
    } catch {
      /* storage blocked: session lives in memory only */
    }
  }, [])
  useEffect(() => {
    // keep tabs in sync when signing out elsewhere
    const onStorage = (e: StorageEvent) => e.key === SKEY && setState(readSession())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return <SessionContext.Provider value={{ session, setSession }}>{children}</SessionContext.Provider>
}
export function useSession() {
  const c = useContext(SessionContext)
  if (!c) throw new Error('useSession outside provider')
  return c
}
