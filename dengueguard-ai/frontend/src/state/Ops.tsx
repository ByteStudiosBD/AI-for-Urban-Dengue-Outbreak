import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAsync } from '@/lib/useAsync'
import { api } from '@/services/api'
import { useFilters } from '@/state/AppData'
import type { DemandBasis, PlanParams } from '@/types/api'

/**
 * One planning scenario shared by the Allocation, Overflow, Simulator and Dispatch pages.
 * Reference week, horizon and city come from the top-bar filters (URL); the scenario
 * controls live here and are remembered per browser as a convenience only.
 */
export interface OpsControls {
  pool: 'city' | 'all'
  stock_pct: number
  total_crews: number
  effect_per_crew_pct: number
  max_crews_per_ward: number
  risk_weight: number
  demand_basis: DemandBasis
  capacity_scale_pct: number
  capacity_overrides: Record<string, number>
  /** UI only: total beds the officer typed; the per-ward split of it is sent as capacity_overrides. */
  beds_total: number | null
  /** UI only: saline bags the officer typed; stock_pct is recalculated from it whenever demand changes. */
  stock_bags: number | null
  deployment: Record<string, number> | null
  plan_with_intervention: boolean
}

export const OPS_DEFAULTS: OpsControls = {
  pool: 'all', stock_pct: 100, total_crews: 10, effect_per_crew_pct: 10, max_crews_per_ward: 3, risk_weight: 0.7,
  demand_basis: 'expected', capacity_scale_pct: 100, capacity_overrides: {}, beds_total: null, stock_bags: null, deployment: null, plan_with_intervention: false,
}

const KEY = 'dg.ops.v1'

function read(): OpsControls {
  try {
    const v = localStorage.getItem(KEY)
    if (v) return { ...OPS_DEFAULTS, ...(JSON.parse(v) as Partial<OpsControls>) }
  } catch {
    /* storage blocked: defaults */
  }
  return OPS_DEFAULTS
}

interface Ctx {
  controls: OpsControls
  setControls: (patch: Partial<OpsControls>) => void
  reset: () => void
}
const OpsContext = createContext<Ctx | null>(null)

export function OpsProvider({ children }: { children: ReactNode }) {
  const [controls, setState] = useState<OpsControls>(read)
  const setControls = useCallback((patch: Partial<OpsControls>) => setState((c) => ({ ...c, ...patch })), [])
  const reset = useCallback(() => setState(OPS_DEFAULTS), [])
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(controls))
    } catch {
      /* ignore */
    }
  }, [controls])
  return <OpsContext.Provider value={{ controls, setControls, reset }}>{children}</OpsContext.Provider>
}

export function useOps() {
  const c = useContext(OpsContext)
  if (!c) throw new Error('useOps outside provider')
  return c
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

/** Full request body for the current scenario (filters + controls). */
export function usePlanParams(): PlanParams | null {
  const { controls } = useOps()
  const { city, asOf, h, ready } = useFilters()
  return useMemo(() => {
    if (!ready) return null
    const { pool, beds_total: _bedsTotal, stock_bags: _stockBags, ...rest } = controls
    return { ...rest, as_of: asOf, horizon_weeks: h, city: pool === 'city' ? city : null }
  }, [controls, city, asOf, h, ready])
}

/** Plan for the current scenario. Slider changes are debounced, identical scenarios are cached. */
export function usePlan() {
  const params = usePlanParams()
  const debounced = useDebounced(params, 220)
  const key = JSON.stringify(debounced)
  const q = useAsync(() => (debounced ? api.opsPlan(debounced) : null), [key])
  return { ...q, params: debounced, pending: q.loading || key !== JSON.stringify(params) }
}
