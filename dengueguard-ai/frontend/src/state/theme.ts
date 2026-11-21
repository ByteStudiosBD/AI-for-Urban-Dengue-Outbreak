import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'
const KEY = 'dg.theme'
const BG: Record<Theme, string> = { dark: '#0B0B10', light: '#FBF6EA' }

/** The theme lives on <html data-theme>, set before first paint by the script in index.html. */
function read(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

const listeners = new Set<() => void>()
function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function applyTheme(next: Theme) {
  const root = document.documentElement
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduce) {
    root.classList.add('theme-switching')
    window.setTimeout(() => root.classList.remove('theme-switching'), 320)
  }
  if (next === 'light') root.setAttribute('data-theme', 'light')
  else root.removeAttribute('data-theme')
  root.style.background = BG[next]
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* storage blocked: theme still applies for this visit */
  }
  listeners.forEach((l) => l())
}

/** Current theme plus a setter. Dark is the default for new visitors. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => 'dark' as Theme)
  const toggle = useCallback(() => applyTheme(read() === 'light' ? 'dark' : 'light'), [])
  return { theme, setTheme: applyTheme, toggle }
}
