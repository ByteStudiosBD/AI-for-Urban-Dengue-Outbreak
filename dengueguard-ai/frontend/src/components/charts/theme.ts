export const C = {
  accent: '#FF633E',
  accentSoft: '#FF8A6B',
  ink: '#F7F7FB',
  muted: '#9B9BAA',
  faint: '#6E6E7C',
  grid: '#26262F',
  line: '#30303B',
  rain: '#5B8DEF',
  rainSoft: '#3B5A99',
  humidity: '#6FC2D9',
  canvasDot: '#0B0B10',
  temp: '#F2C94C',
}
export const axisProps = {
  stroke: C.faint,
  tick: { fill: C.muted, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const
export const ANIM_MS = 350
