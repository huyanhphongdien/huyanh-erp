// ============================================================================
// BONUS TIER BADGE — Chip hiển thị tier bonus (Kim Cương / Tier 4 / Đồng...)
// File: src/components/b2b/BonusTierBadge.tsx
// ============================================================================

import type { RubberType } from '../../types/b2b.types'

interface BonusTierBadgeProps {
  tier: string | null | undefined
  rubberType?: RubberType
  size?: 'sm' | 'md'
  className?: string
}

// Mủ nước: Kim Cương 💎 / Vàng 🥇 / Bạc 🥈 / Đồng
// Mủ tạp: Tier 4 / Tier 3 / Tier 2 / Tier 1
const TIER_STYLE: Record<string, { bg: string; text: string; icon: string }> = {
  'Kim Cương': { bg: 'bg-purple-100',  text: 'text-purple-700',  icon: '💎' },
  'Vàng':      { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: '🥇' },
  'Bạc':       { bg: 'bg-slate-200',   text: 'text-slate-700',   icon: '🥈' },
  'Đồng':      { bg: 'bg-orange-100',  text: 'text-orange-700',  icon: '🥉' },
  'Tier 4':    { bg: 'bg-purple-100',  text: 'text-purple-700',  icon: '⭐⭐⭐⭐' },
  'Tier 3':    { bg: 'bg-amber-100',   text: 'text-amber-700',   icon: '⭐⭐⭐' },
  'Tier 2':    { bg: 'bg-sky-100',     text: 'text-sky-700',     icon: '⭐⭐' },
  'Tier 1':    { bg: 'bg-slate-100',   text: 'text-slate-700',   icon: '⭐' },
}

export function BonusTierBadge({ tier, rubberType: _rubberType, size = 'md', className }: BonusTierBadgeProps) {
  if (!tier) {
    return (
      <span
        className={[
          'inline-flex items-center px-1.5 py-0.5 rounded text-slate-500 bg-slate-50 border border-slate-200',
          size === 'sm' ? 'text-xs' : 'text-sm',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        Chưa đạt
      </span>
    )
  }

  const style = TIER_STYLE[tier] ?? { bg: 'bg-slate-100', text: 'text-slate-700', icon: '' }

  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium',
        style.bg,
        style.text,
        size === 'sm' ? 'text-xs' : 'text-sm',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      title={tier}
    >
      <span>{style.icon}</span>
      <span>{tier}</span>
    </span>
  )
}

export default BonusTierBadge
