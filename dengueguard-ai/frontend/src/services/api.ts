import type {
  HeatmapResponse, Horizon, HorizonsResponse, Metadata, ObservationsResponse, PredictAllResponse,
  PredictionResult, Session, ValidationResponse, ValidationSeriesResponse, WeatherLagResponse,
} from '@/types/api'

export class ApiError extends Error {
  code: string
  status: number
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * Request minimisation: the dataset is static, so every GET response is cached
 * in memory for the session and identical in-flight requests are de-duplicated.
 * Filters only trigger requests on change, never per keystroke.
 */
const cache = new Map<string, Promise<unknown>>()

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the DengueGuard API. Is the backend running on port 8000?')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const e = body?.error
    throw new ApiError(res.status, e?.code ?? 'http_error', e?.message ?? `Request failed (${res.status})`)
  }
  return body as T
}

export function get<T>(path: string): Promise<T> {
  const hit = cache.get(path)
  if (hit) return hit as Promise<T>
  const p = request<T>(path).catch((err) => {
    cache.delete(path) // do not cache failures
    throw err
  })
  cache.set(path, p)
  return p
}

function qs(params: Record<string, string | number | null | undefined>) {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== '') s.set(k, String(v))
  const str = s.toString()
  return str ? `?${str}` : ''
}

export const api = {
  metadata: () => get<Metadata>('/api/metadata'),
  observations: (p: { city?: string; ward_id?: string; from?: string; to?: string }) =>
    get<ObservationsResponse>(`/api/observations${qs(p)}`),
  weatherLags: (ward_id: string, as_of: string, weeks = 12) =>
    get<WeatherLagResponse>(`/api/weather-lags${qs({ ward_id, as_of, weeks })}`),
  predict: (ward_id: string, as_of: string, horizon_weeks: Horizon) =>
    get<PredictionResult>(`/api/predict${qs({ ward_id, as_of, horizon_weeks })}`),
  predictHorizons: (ward_id: string, as_of: string) =>
    get<HorizonsResponse>(`/api/predict-horizons${qs({ ward_id, as_of })}`),
  predictAll: (city: string | null, as_of: string, horizon_weeks: Horizon) =>
    get<PredictAllResponse>(`/api/predict-all${qs({ city, as_of, horizon_weeks })}`),
  heatmap: (city: string | null, as_of: string, weeks = 8) =>
    get<HeatmapResponse>(`/api/heatmap${qs({ city, as_of, weeks })}`),
  validation: () => get<ValidationResponse>('/api/validation'),
  validationSeries: (p: { horizon_weeks: Horizon; ward_id?: string; city?: string; from?: string; to?: string }) =>
    get<ValidationSeriesResponse>(`/api/validation-series${qs(p)}`),
  authConfig: () => request<{ accounts_configured: boolean }>('/api/auth/config'),
  demo: () => request<Session>('/api/auth/demo', { method: 'POST' }),
  login: (email: string, password: string) =>
    request<Session>('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    }),
  logout: (token: string) =>
    request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }),
}
