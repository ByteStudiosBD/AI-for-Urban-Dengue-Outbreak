import * as T from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export const TooltipProvider = T.Provider

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <T.Root delayDuration={120}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={8}
          className="z-50 max-w-xs rounded-lg border border-line bg-[#14141c] px-2.5 py-1.5 text-xs text-ink shadow-[var(--shadow-lift)] data-[state=delayed-open]:animate-[tip-in_160ms_var(--ease-out-expo)]"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  )
}
