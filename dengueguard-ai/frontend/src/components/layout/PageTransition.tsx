import type { ReactNode } from 'react'

/**
 * Enter-only page fade using a CSS animation (`page-in` in index.css).
 * A CSS animation always finishes at the element's normal, fully visible style, so
 * content can never be left stuck invisible. Remount it with key={pathname} to replay.
 * Reduced-motion users get an instant switch via the global rule in index.css.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="animate-[page-in_260ms_cubic-bezier(0.16,1,0.3,1)_backwards]">{children}</div>
}
