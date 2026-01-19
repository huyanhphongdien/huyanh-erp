// src/components/ui/ProgressBar.tsx
import { cn } from '../../lib/utils'
 
interface ProgressBarProps {
  value: number
  max?: number
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}
 
export function ProgressBar({ 
  value, 
  max = 100, 
  showLabel = true,
  size = 'md',
  className 
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100)
  
  const getColor = () => {
    if (percentage >= 100) return 'bg-green-500'
    if (percentage >= 70) return 'bg-blue-500'
    if (percentage >= 40) return 'bg-yellow-500'
    return 'bg-gray-400'
  }
 
  const heights = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4'
  }
 
  return (
    <div className={cn('w-full', className)}>
      <div className={cn('w-full bg-gray-200 rounded-full', heights[size])}>
        <div
          className={cn('rounded-full transition-all duration-300', heights[size], getColor())}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-gray-500 mt-1">{Math.round(percentage)}%</span>
      )}
    </div>
  )
}
