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
