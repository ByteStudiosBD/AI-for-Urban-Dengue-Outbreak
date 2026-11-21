import * as S from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Select({ value, onValueChange, options, label, icon, className }: {
  value: string
  onValueChange: (v: string) => void
  options: Array<{ value: string; label: ReactNode }>
  label: string
  icon?: ReactNode
  className?: string
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange}>
      <S.Trigger
        aria-label={label}
        className={cn(
          'inline-flex h-10 min-w-0 items-center gap-2 rounded-xl border border-line bg-panel px-3 text-sm text-ink transition-colors duration-150 hover:border-line-strong hover:bg-panel-2 data-[state=open]:border-accent [&_svg]:size-4',
          className,
        )}
      >
        {icon && <span className="text-muted">{icon}</span>}
        <span className="truncate"><S.Value /></span>
        <S.Icon className="ml-auto text-muted"><ChevronDown /></S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-[min(360px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line bg-popover p-1 shadow-[var(--shadow-lift)] data-[state=open]:animate-[pop-in_180ms_var(--ease-out-expo)]"
        >
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pr-8 pl-3 text-sm text-ink outline-none data-[highlighted]:bg-panel-2 data-[state=checked]:text-accent"
              >
                <S.ItemText>{o.label}</S.ItemText>
                <S.ItemIndicator className="absolute right-2"><Check className="size-4" /></S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}
