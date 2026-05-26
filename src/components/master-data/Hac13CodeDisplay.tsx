import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { formatHac13Display, parseHac13 } from '../../lib/hac13'

interface Hac13CodeDisplayProps {
  /** Mã HAC-13 13 ký tự (có thể có dấu gạch). */
  code: string
  /** Kiểu hiển thị. Default 'inline'. */
  variant?: 'inline' | 'badge' | 'large'
  /** Hiện nút copy. Default true. */
  showCopy?: boolean
  /** Hiện chip màu theo type code. Default false. */
  showTypeBadge?: boolean
  className?: string
}

const TYPE_LABELS: Record<string, string> = {
  '1': 'BP-VN',
  '2': 'BP-FOR',
  '3': 'NV',
}

const TYPE_COLORS: Record<string, string> = {
  '1': 'bg-blue-100 text-blue-700 border-blue-200',
  '2': 'bg-purple-100 text-purple-700 border-purple-200',
  '3': 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

/**
 * Hiển thị mã HAC-13 dạng đẹp `8999-1-0001234-6` + nút copy + (optional) chip type.
 */
export function Hac13CodeDisplay({
  code,
  variant = 'inline',
  showCopy = true,
  showTypeBadge = false,
  className,
}: Hac13CodeDisplayProps) {
  const [copied, setCopied] = useState(false)
  const parsed = parseHac13(code)
  const formatted = formatHac13Display(code)
  const typeCode = parsed?.typeCode

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(code.replace(/[\s-]/g, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  const baseTextSize =
    variant === 'large' ? 'text-2xl font-semibold' : variant === 'badge' ? 'text-xs' : 'text-sm'

  return (
    <span
      className={[
        'inline-flex items-center gap-2',
        variant === 'badge' && 'px-2 py-0.5 rounded-md border bg-slate-50',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showTypeBadge && typeCode && (
        <span
          className={`px-1.5 py-0.5 rounded text-xs border font-medium ${TYPE_COLORS[String(typeCode)]}`}
        >
          {TYPE_LABELS[String(typeCode)]}
        </span>
      )}
      <span className={`font-mono ${baseTextSize}`}>{formatted}</span>
      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy HAC-13 code"
          className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      )}
    </span>
  )
}

export default Hac13CodeDisplay
