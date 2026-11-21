/** Chart colours as CSS variables, so every chart follows the active dark/light theme
 * (values live in index.css). Recharts passes these through to SVG, where var() resolves. */
export const C = {
  accent: 'var(--color-accent)',
  accentSoft: 'var(--color-accent-soft)',
  ink: 'var(--color-ink)',
  muted: 'var(--color-muted)',
  faint: 'var(--color-faint)',
  grid: 'var(--color-chart-grid)',
  line: 'var(--color-line)',
  rain: 'var(--color-chart-rain)',
  rainSoft: 'var(--color-chart-rain-soft)',
  humidity: 'var(--color-chart-humidity)',
  canvasDot: 'var(--color-canvas)',
  temp: 'var(--color-chart-temp)',
}
export const axisProps = {
  stroke: C.faint,
  tick: { fill: C.muted, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const
export const ANIM_MS = 350
