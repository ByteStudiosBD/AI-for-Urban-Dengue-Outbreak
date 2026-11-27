export type Horizon = 2 | 3 | 4
export type RiskTier = 'Low' | 'Medium' | 'High' | 'Critical'
export type EvaluationStatus = 'in_sample_train' | 'validation' | 'held_out_test' | 'forecast_beyond_data'
export type DriverGroup = 'rainfall' | 'temperature' | 'humidity' | 'recent_cases' | 'ward_vulnerability' | 'seasonality'

export interface ForecastInterval {
  lower: number
  upper: number
  nominal_coverage: number
  kind: 'prediction_interval'
}

export interface Driver {
  group: DriverGroup
  contribution_cases: number
  features: Record<string, number>
  typical: Record<string, number>
}

export interface ErrorMetrics {
  mae: number
  rmse: number
  bias: number
  n: number
  interval_coverage?: number
  mean_interval_width?: number
}

export interface PredictionResult {
  ward_id: string
  city: string
  horizon_weeks: Horizon
  as_of: string
  target_date: string
  predicted_cases: number
  interval: ForecastInterval
  risk_tier: RiskTier
  risk_score: number
  actual_cases: number | null
  evaluation_status: EvaluationStatus
  drivers?: Driver[]
  model?: string
  test_metrics?: ErrorMetrics
}

export interface WardInfo {
  ward_id: string
  city: string
  population_density_sqkm: number
  water_logging_risk_index: number
  sanitation_score: number
}

export interface RiskTierConfig {
  basis: string
  quantiles: Record<string, number>
  thresholds_cases: { medium: number; high: number; critical: number }
  rule: string
  score_formula: string
  score_cap_cases: number
  disclaimer: string
}

export interface Metadata {
  coverage: {
    rows: number
    cities: Record<string, string[]>
    ward_count: number
    date_min: string
    date_max: string
    weeks: number
    zero_case_share: number
  }
  cities: string[]
  wards: WardInfo[]
  as_of_range: { min: string; max: string }
  available_weeks: string[]
  horizons: Horizon[]
  risk_tiers: RiskTierConfig
  interval: { method: string; nominal_coverage: number; bins: number }
  models: Record<string, string>
  trained_at_utc: string
  llm_calls_per_request: number
}

export interface WardObservation {
  date: string
  city?: string
  ward_id?: string
  dengue_cases: number
  rainfall_mm: number
  avg_temp_c: number
  max_temp_c?: number
  min_temp_c?: number
  relative_humidity_pct: number
  wards?: number
}

export interface ObservationsResponse {
  level: 'ward' | 'city' | 'all'
  observations: WardObservation[]
}

export interface WeatherLag {
  lag_weeks: 1 | 2 | 3 | 4
  week: string
  rainfall_mm: number
}

export interface WeatherLagResponse {
  ward_id: string
  city: string
  as_of: string
  lags: WeatherLag[]
  current: { rainfall_mm: number; avg_temp_c: number; max_temp_c: number; min_temp_c: number; relative_humidity_pct: number }
  rolling: Record<'rain_sum_2w' | 'rain_sum_3w' | 'rain_sum_4w' | 'rain_sum_lag1_4' | 'temp_mean_4w' | 'humidity_mean_4w', number>
  series: Array<{
    date: string
    rainfall_mm: number
    rain_lag1: number | null
    rain_lag2: number | null
    rain_lag3: number | null
    rain_lag4: number | null
    rain_sum_4w: number | null
    avg_temp_c: number
    relative_humidity_pct: number
    dengue_cases: number
  }>
}

export interface HorizonsResponse {
  ward_id: string
  as_of: string
  predictions: PredictionResult[]
}

export interface PredictAllResponse {
  city: string | null
  as_of: string
  horizon_weeks: Horizon
  target_date: string
  tier_counts: Record<RiskTier, number>
  alerts: number
  total_predicted_cases: number
  predictions: PredictionResult[]
}

export interface HeatmapResponse {
  city: string | null
  as_of: string
  cells: PredictionResult[]
  timeline_weeks: string[]
  timeline: Record<string, Array<{ ward_id: string; as_of: string; target_date: string; predicted_cases: number; risk_tier: RiskTier }>>
}

export interface SplitRange { target_from: string; target_to: string; rows: number }

export interface ValidationMetrics {
  horizon_weeks: Horizon
  model: string
  split: { train: SplitRange; validation: SplitRange; test: SplitRange }
  validation_candidates: Record<string, ErrorMetrics>
  validation_baseline_4w_mean: ErrorMetrics
  test: ErrorMetrics
  test_baseline_4w_mean: ErrorMetrics
  test_abs_error_quantiles: Record<string, number>
  intervals: { edges: number[]; qhat: number[] }
  group_importance_val_mae_increase: Record<DriverGroup, number>
  test_by_city: Array<{ city: string; mae: number; rmse: number; n: number }>
}

export interface ValidationResponse {
  metrics: ValidationMetrics[]
  interval: Metadata['interval']
  risk_tiers: RiskTierConfig
}

export interface ValidationSeriesResponse {
  horizon_weeks: Horizon
  ward_id: string | null
  city: string | null
  aggregation: string
  interval_note: string
  metrics: { mae: number; rmse: number; n: number; interval_coverage: number } | null
  series: Array<{ target_date: string; split: 'validation' | 'held_out_test'; actual: number; predicted: number; lower: number; upper: number; wards: number }>
}

/** One original dataset row, values exactly as stored (null stays null). */
export type DatasetRecord = Record<string, string | number | null>

export interface RecordsQuery {
  city?: string
  ward_id?: string
  from?: string
  to?: string
  q?: string
  sort?: string
  order?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export interface RecordsResponse {
  total: number
  page: number
  page_size: number
  pages: number
  sort: string
  order: 'asc' | 'desc'
  columns: string[]
  rows: DatasetRecord[]
}

export interface Session {
  token: string
  email: string | null
  role: string
  mode: 'demo' | 'account'
}

export interface ApiErrorBody {
  error: { code: string; message: string }
}

/* ---------------- Phase 2: operations ---------------- */
export type SupplyKey = 'saline_bags_needed' | 'diagnostic_kits_needed' | 'hospital_beds_required'
export type ConsumableKey = 'saline_bags_needed' | 'diagnostic_kits_needed'
export type Severity = 'critical' | 'warning' | 'ok'
export type DemandBasis = 'expected' | 'upper'

export interface PlanParams {
  as_of: string
  horizon_weeks: Horizon
  city: string | null
  stock_pct: number
  total_crews: number
  effect_per_crew_pct: number
  max_crews_per_ward: number
  risk_weight: number
  demand_basis: DemandBasis
  capacity_scale_pct: number
  capacity_overrides: Record<string, number>
  deployment: Record<string, number> | null
  plan_with_intervention: boolean
  /** 'pct' = scenario share of demand (30–100%); 'exact' = saline bags and test kits the officer typed. */
  stock_mode: StockMode
  saline_available: number | null
  kits_available: number | null
  /** Exact bed total for the planning pool (one city, or all 60 wards); null = capacity_scale_pct. */
  beds_total: number | null
}

export type StockMode = 'pct' | 'exact'

export interface OpsWard {
  ward_id: string
  city: string
  in_pool: boolean
  population_density_sqkm: number
  risk_tier: RiskTier
  risk_score: number
  priority: number
  predicted_cases: number
  interval: [number, number]
  planning_cases: number
  planning_cases_whole: number
  required: Record<SupplyKey, number>
  allocated: Record<ConsumableKey, number | null>
  crews: number
  beds: {
    required: number; capacity: number; capacity_baseline: number; capacity_overridden: boolean
    routed_out: number; routed_in: number; net_deficit: number; occupied: number; utilisation_pct: number | null
  }
  flags: string[]
  severity: Severity
}

export interface OpsCity {
  city: string
  wards: number
  beds_required: number
  bed_capacity: number
  beds_occupied_after_routing: number
  utilisation_pct: number | null
  demand_vs_capacity_pct: number | null
  headroom_after_routing: number
  patients_routed: number
  net_deficit: number
  wards_over_capacity: number
}

export interface OpsTransfer { city: string; from_ward: string; to_ward: string; patients: number }

export interface SimHorizon {
  horizon_weeks: Horizon
  target_date: string
  cases_baseline: number
  cases_scenario: number
  cases_prevented: number
  beds_baseline: number
  beds_scenario: number
  saline_baseline: number
  saline_scenario: number
  kits_baseline: number
  kits_scenario: number
  wards_over_capacity_baseline: number
  wards_over_capacity_scenario: number
}

export interface SimRank {
  ward_id: string
  city: string
  risk_tier: RiskTier
  crews: number
  cases_window_baseline: number
  cases_prevented: number
  roi_cases_per_crew: number | null
  first_crew_roi: number
  beds_prevented: number
  saline_prevented: number
  per_horizon: Array<{ h: Horizon; baseline: number; scenario: number }>
}

export interface PlanResponse {
  scenario: PlanParams & { target_date: string; crew_mode: 'optimised' | 'manual'; bed_mode: 'exact' | 'scale'; bed_pool: string }
  assumptions: Array<{ id: string; kind: 'derived' | 'assumption' | 'scenario'; text: string }>
  supplies: Record<ConsumableKey, {
    required: number; available: number; allocated: number; shortfall: number; unused: number; wards_short: number
    source: 'pct_of_demand' | 'user_entered'; verified: false
  }>
  crews: { total: number; assigned: number; unused: number; high_risk_wards_without_crew: number }
  alerts: { critical: number; warning: number }
  wards: OpsWard[]
  cities: OpsCity[]
  transfers: OpsTransfer[]
  simulation: { per_horizon: SimHorizon[]; ranking: SimRank[]; total_cases_prevented: number; roi_cases_per_crew: number | null; label: string }
}

export interface SupplyRateInfo { column: SupplyKey; rate: number; nominal: number; exact_range: [number, number] | null; agreement: number; rule: string }

export interface OpsAssumptions {
  source: string
  rows_checked: number
  rates: Record<SupplyKey, SupplyRateInfo>
  rounding: string
  capacity: { label: string; method: string; is_official_data: false; per_ward: Record<string, number> }
  network_required: false
}

export interface DispatchNotice { ward_id: string; city: string; severity: Severity; sms: string; whatsapp: string }
export interface DispatchResponse { lang: 'en' | 'bn'; generator: string; notices: DispatchNotice[] }
