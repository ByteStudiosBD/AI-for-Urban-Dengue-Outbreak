import { lazy, type ComponentType } from 'react'

const RELOAD_KEY = 'dg-chunk-reload-at'

/**
 * React.lazy for route pages, with recovery when a page's code chunk fails to load.
 * That happens when the app is rebuilt (new chunk file names) while a tab is still
 * open on the old build, or after a brief network hiccup. Instead of leaving a blank
 * screen, reload the page once to pick up the current build. If it fails again within
 * 10 s, rethrow so the route error boundary can show a message with a Reload button.
 */
export function lazyPage<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load()
      try { sessionStorage.removeItem(RELOAD_KEY) } catch { /* storage unavailable */ }
      return mod
    } catch (err) {
      let last = 0
      try { last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) } catch { /* storage unavailable */ }
      if (Date.now() - last > 10_000) {
        try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())) } catch { /* storage unavailable */ }
        window.location.reload()
        return new Promise<never>(() => {}) // keep showing the loading state until the reload
      }
      throw err
    }
  })
}
