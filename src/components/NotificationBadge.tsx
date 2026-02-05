// ============================================================================
// NOTIFICATION BADGE COMPONENT
// File: src/components/NotificationBadge.tsx
// ============================================================================
// Usage: <NotificationBadge count={5} />
// ============================================================================

interface NotificationBadgeProps {
  count: number
  max?: number
  className?: string
}

export function NotificationBadge({ count, max = 99, className = '' }: NotificationBadgeProps) {
  if (count === 0) return null

  const displayCount = count > max ? `${max}+` : count

  return (
    <span
      className={`
        inline-flex items-center justify-center
        min-w-[20px] h-5 px-1.5
        text-[11px] font-bold text-white
        bg-red-500 rounded-full
        ${className}
      `}
      style={{
        boxShadow: '0 0 0 2px white',
      }}
    >
      {displayCount}
    </span>
  )
}