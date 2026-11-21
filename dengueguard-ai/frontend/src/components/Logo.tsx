export function Logo({ className = 'size-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="12" fill="#FF633E" />
      <path d="M20 8.5c5 6.4 8.6 11.3 8.6 16a8.6 8.6 0 0 1-17.2 0c0-4.7 3.6-9.6 8.6-16Z" fill="#0B0B10" />
      <path d="M16.2 24.6h7.6M20 20.8v7.6" stroke="#FF633E" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
