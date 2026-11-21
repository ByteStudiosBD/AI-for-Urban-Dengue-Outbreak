import type { RiskTier } from '@/types/api'

/**
 * Overview-only colour scheme. The model still produces four tiers (Low / Medium / High /
 * Critical, from the existing thresholds in model_metadata.json); this map only decides how
 * the overview tiles are filled. High and Critical share red, and Critical tiles get an extra
 * stripe pattern, border and "C" marker so the two stay distinguishable.
 */
export const OVERVIEW_FILL: Record<RiskTier, string> = {
  Low: '#22C55E',
  Medium: '#3B82F6',
  High: '#EF4444',
  Critical: '#EF4444',
}

/** Neutral fill for a ward that has no model prediction. Never green: missing is not "safe". */
export const NO_PREDICTION_FILL = '#4B5563'

export const OVERVIEW_COLOR_NAME: Record<RiskTier, 'green' | 'blue' | 'red'> = {
  Low: 'green',
  Medium: 'blue',
  High: 'red',
  Critical: 'red',
}

export const TIERS: RiskTier[] = ['Low', 'Medium', 'High', 'Critical']

/** Diagonal stripes drawn over Critical tiles (in addition to the C marker and border). */
export const CRITICAL_PATTERN =
  'repeating-linear-gradient(135deg, rgba(11,11,16,0.28) 0 6px, transparent 6px 12px)'
