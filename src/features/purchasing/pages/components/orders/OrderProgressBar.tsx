// ============================================================================
// ORDER PROGRESS BAR
// File: src/features/purchasing/pages/components/orders/OrderProgressBar.tsx
// ============================================================================

interface OrderProgressBarProps {
  value: number
  label: string
  color?: 'blue' | 'green' | 'orange' | 'red'
  showLabel?: boolean
}

const COLOR_MAP: Record<string, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
}

export function OrderProgressBar({
  value,
  label,
  color = 'blue',
  showLabel = true,
}: OrderProgressBarProps) {
  const barColor = COLOR_MAP[color] || COLOR_MAP.blue

  return (
    <div>
      {showLabel && (
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-500">{label}</span>
          <span className="font-medium text-gray-700">{value}%</span>
        </div>
      )}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  )
}

export default OrderProgressBar