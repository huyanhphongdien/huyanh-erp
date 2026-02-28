// ============================================================================
// FILE: src/components/project/ProjectProgressBar.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM3 — Bước 3.9
// ============================================================================
// Smart progress bar:
// - Thanh chính: overall % (auto-calc từ phases)
// - Mini bars cho mỗi phase (color-coded)
// - Health indicator: On track / At risk / Behind
//   (tính từ % tiến độ vs % thời gian đã trôi)
// ============================================================================

import React from 'react'
import {
  TrendingUp,
  AlertTriangle,
  TrendingDown,
  CheckCircle2,
  Clock,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

type ProjectStatus = 'draft' | 'planning' | 'approved' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'
type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

interface PhaseProgress {
  id: string
  name: string
  status: PhaseStatus
  progress_pct: number
  color?: string
  planned_start?: string
  planned_end?: string
}

interface ProjectProgressBarProps {
  /** Overall project progress 0-100 */
  progressPct: number
  /** Project status */
  status: ProjectStatus
  /** Project planned start */
  plannedStart?: string
  /** Project planned end */
  plannedEnd?: string
  /** Phase breakdown */
  phases?: PhaseProgress[]
  /** Compact mode — chỉ thanh chính, không mini bars */
  compact?: boolean
  /** Hide health indicator */
  hideHealth?: boolean
}

// ============================================================================
// HELPERS
// ============================================================================

function getProgressBarColor(pct: number, status: ProjectStatus): string {
  if (status === 'completed') return 'bg-green-500'
  if (status === 'on_hold') return 'bg-amber-400'
  if (status === 'cancelled') return 'bg-gray-300'
  if (pct >= 75) return 'bg-emerald-500'
  if (pct >= 40) return 'bg-blue-500'
  if (pct >= 10) return 'bg-amber-500'
  return 'bg-gray-300'
}

interface HealthInfo {
  label: string
  description: string
  color: string
  bgColor: string
  icon: React.ReactNode
}

function calculateHealth(
  progressPct: number,
  plannedStart?: string,
  plannedEnd?: string,
  status?: ProjectStatus,
): HealthInfo | null {
  // Không tính health cho các status đặc biệt
  if (!plannedStart || !plannedEnd) return null
  if (status === 'completed') {
    return { label: 'Hoàn thành', description: 'Dự án đã kết thúc', color: 'text-green-600', bgColor: 'bg-green-50', icon: <CheckCircle2 className="w-4 h-4" /> }
  }
  if (status === 'cancelled' || status === 'draft') return null
  if (status === 'on_hold') {
    return { label: 'Tạm dừng', description: 'Dự án đang tạm dừng', color: 'text-amber-600', bgColor: 'bg-amber-50', icon: <Clock className="w-4 h-4" /> }
  }

  const start = new Date(plannedStart).getTime()
  const end = new Date(plannedEnd).getTime()
  const now = Date.now()

  // Chưa bắt đầu
  if (now < start) return null

  // Đã qua deadline
  if (now > end) {
    if (progressPct >= 100) {
      return { label: 'Hoàn thành', description: 'Đã xong trước/đúng hạn', color: 'text-green-600', bgColor: 'bg-green-50', icon: <CheckCircle2 className="w-4 h-4" /> }
    }
    return { label: 'Chậm tiến độ', description: `Đã quá hạn, mới đạt ${progressPct.toFixed(0)}%`, color: 'text-red-600', bgColor: 'bg-red-50', icon: <TrendingDown className="w-4 h-4" /> }
  }

  // Trong thời gian thực hiện
  const totalDuration = end - start
  const elapsed = now - start
  const timePct = (elapsed / totalDuration) * 100
  const diff = progressPct - timePct

  if (diff >= -5) {
    return { label: 'Đúng tiến độ', description: `Tiến độ ${progressPct.toFixed(0)}% vs thời gian ${timePct.toFixed(0)}%`, color: 'text-green-600', bgColor: 'bg-green-50', icon: <TrendingUp className="w-4 h-4" /> }
  }
  if (diff >= -20) {
    return { label: 'Có rủi ro', description: `Tiến độ ${progressPct.toFixed(0)}% nhưng đã trôi ${timePct.toFixed(0)}% thời gian`, color: 'text-amber-600', bgColor: 'bg-amber-50', icon: <AlertTriangle className="w-4 h-4" /> }
  }
  return { label: 'Chậm tiến độ', description: `Tiến độ ${progressPct.toFixed(0)}% vs ${timePct.toFixed(0)}% thời gian`, color: 'text-red-600', bgColor: 'bg-red-50', icon: <TrendingDown className="w-4 h-4" /> }
}

function getPhaseStatusOpacity(status: PhaseStatus): string {
  if (status === 'skipped') return 'opacity-40'
  return ''
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ProjectProgressBar: React.FC<ProjectProgressBarProps> = ({
  progressPct,
  status,
  plannedStart,
  plannedEnd,
  phases = [],
  compact = false,
  hideHealth = false,
}) => {
  const barColor = getProgressBarColor(progressPct, status)
  const health = !hideHealth ? calculateHealth(progressPct, plannedStart, plannedEnd, status) : null
  const clampedPct = Math.max(0, Math.min(100, progressPct))

  // Time marker position (% of time elapsed)
  let timeMarkerPct: number | null = null
  if (plannedStart && plannedEnd && status !== 'completed' && status !== 'cancelled') {
    const start = new Date(plannedStart).getTime()
    const end = new Date(plannedEnd).getTime()
    const now = Date.now()
    if (now >= start && now <= end) {
      timeMarkerPct = ((now - start) / (end - start)) * 100
    }
  }

  return (
    <div className="space-y-2">
      {/* Main progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-gray-500 font-medium">Tiến độ tổng thể</span>
          <span
            className="text-[15px] font-bold text-gray-800"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {clampedPct.toFixed(1)}%
          </span>
        </div>

        <div className="relative">
          {/* Bar track */}
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
              style={{ width: `${clampedPct}%` }}
            />
          </div>

          {/* Time marker — thin line showing % of time elapsed */}
          {timeMarkerPct !== null && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-gray-800/40 z-10"
              style={{ left: `${timeMarkerPct}%` }}
              title={`${timeMarkerPct.toFixed(0)}% thời gian đã trôi`}
            >
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-gray-400 whitespace-nowrap"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                {timeMarkerPct.toFixed(0)}% TG
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Phase mini bars */}
      {!compact && phases.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-gray-400 font-medium uppercase">Theo giai đoạn</p>
          <div className="flex gap-1">
            {phases.map(phase => (
              <div
                key={phase.id}
                className={`flex-1 group relative ${getPhaseStatusOpacity(phase.status)}`}
              >
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${phase.progress_pct}%`,
                      backgroundColor: phase.color || '#9CA3AF',
                    }}
                  />
                </div>

                {/* Tooltip */}
                <div className="
                  invisible group-hover:visible
                  absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5
                  px-2.5 py-1.5 bg-gray-800 text-white rounded-lg
                  text-[10px] whitespace-nowrap z-20
                  shadow-lg
                ">
                  <p className="font-semibold">{phase.name}</p>
                  <p className="opacity-80" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {phase.progress_pct}%
                  </p>
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-gray-800" />
                </div>
              </div>
            ))}
          </div>

          {/* Phase legend — only if <= 6 phases */}
          {phases.length <= 6 && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {phases.map(phase => (
                <span key={phase.id} className="inline-flex items-center gap-1 text-[9px] text-gray-500">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: phase.color || '#9CA3AF' }}
                  />
                  <span className="truncate max-w-[80px]">{phase.name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {phase.progress_pct}%
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Health indicator */}
      {health && (
        <div className={`
          flex items-center gap-2
          px-3 py-2 rounded-lg
          ${health.bgColor}
        `}>
          <span className={health.color}>{health.icon}</span>
          <div className="flex-1 min-w-0">
            <span className={`text-[12px] font-semibold ${health.color}`}>{health.label}</span>
            <span className="text-[11px] text-gray-500 ml-1.5">{health.description}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProjectProgressBar