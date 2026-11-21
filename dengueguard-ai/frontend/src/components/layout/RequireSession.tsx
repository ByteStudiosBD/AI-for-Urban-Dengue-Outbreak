import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '@/state/AppData'

/**
 * Sign-in comes first: visitors without a session (demo or account) are sent to /login,
 * which brings them back to the page they asked for afterwards (?next=).
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { session } = useSession()
  const { pathname, search } = useLocation()
  if (!session) {
    const next = pathname === '/' && !search ? '' : `?next=${encodeURIComponent(pathname + search)}`
    return <Navigate to={`/login${next}`} replace />
  }
  return <>{children}</>
}

/** Only same-site paths are allowed as a post-login destination. */
export function safeNext(raw: string | null, fallback = '/') {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/login') ? raw : fallback
}
