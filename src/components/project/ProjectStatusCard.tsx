// ============================================================================
// FILE: src/components/project/ProjectStatusCard.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM9 — Bước 9.4: ProjectStatusCard Component
// ============================================================================
// Card hiển thị tóm tắt 1 DA, dùng trong Dashboard + List
// Health indicator: On Track / At Risk / Behind Schedule
// Design: Industrial Rubber Theme, mobile-first
// ============================================================================

import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Calendar,
  Users,
  Target,
  AlertTriangle,
  ChevronRight,
  Clock,
  CheckCircle2,
  PauseCircle,
  Loader2,
  TrendingUp,
  Flag,
} from 'lucide-react'
import type { HealthStatus } from '../../services/project/projectDashboardService'

// ============================================
// INTERFACES
// ============================================

interface ProjectStatusCardProps {
  id: string
  code: string
  name: string
  status: string
  priority: string
  progress_pct: number
  health: HealthStatus
  owner_name: string
  planned_start?: string | null
  planned_end?: string | null
  task_count?: number
  milestone_count?: number
  risk_count?: number
  open_issues?: number
  next_milestone?: string | null
  next_milestone_due?: string | null
  onClick?: () => void
}

// ============================================
// HELPERS
// ============================================

const HEALTH_CONFIG: Record<HealthStatus, { label: string; color: string; bg: string; icon: typeof TrendingUp }> = {
  on_track: { label: 'Đúng tiến độ', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  at_risk: { label: 'Có rủi ro', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: AlertTriangle },
  behind_schedule: { label: 'Chậm tiến độ', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: Clock },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Nháp', color: 'text-gray-600', bg: 'bg-gray-100' },
  planning: { label: 'Lập kế hoạch', color: 'text-blue-600', bg: 'bg-blue-50' },
  approved: { label: 'Đã duyệt', color: 'text-teal-600', bg: 'bg-teal-50' },
  in_progress: { label: 'Đang thực hiện', color: 'text-[#1B4D3E]', bg: 'bg-emerald-50' },
  on_hold: { label: 'Tạm dừng', color: 'text-amber-600', bg: 'bg-amber-50' },
  completed: { label: 'Hoàn thành', color: 'text-green-600', bg: 'bg-green-50' },
  cancelled: { label: 'Đã hủy', color: 'text-red-600', bg: 'bg-red-50' },
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: 'Khẩn cấp', color: 'text-red-600' },
  high: { label: 'Cao', color: 'text-orange-600' },
  medium: { label: 'TB', color: 'text-amber-600' },
  low: { label: 'Thấp', color: 'text-blue-600' },
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ============================================
// COMPONENT
// ============================================

const ProjectStatusCard: React.FC<ProjectStatusCardProps> = ({
  id, code, name, status, priority, progress_pct, health,
  owner_name, planned_start, planned_end,
  task_count = 0, milestone_count = 0, risk_count = 0, open_issues = 0,
  next_milestone, next_milestone_due, onClick,
}) => {
  const navigate = useNavigate()
  const healthCfg = HEALTH_CONFIG[health]
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft
  const prioCfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium
  const HealthIcon = healthCfg.icon
  const progress = Math.min(100, Math.max(0, Number(progress_pct) || 0))

  const handleClick = () => {
    if (onClick) onClick()
    else navigate(`/projects/${id}`)
  }

  return (
    <div
      onClick={handleClick}
      className="bg-white rounded-lg border border-gray-200 hover:border-[#1B4D3E]/30 hover:shadow-md transition-all duration-200 cursor-pointer active:scale-[0.99]"
    >
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-gray-500 font-medium">{code}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${prioCfg.color} font-medium`}>
                <Flag className="w-3 h-3 inline mr-0.5" />
                {prioCfg.label}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">
              {name}
            </h3>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
        </div>

        {/* Health badge */}
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium ${healthCfg.bg} ${healthCfg.color}`}>
          <HealthIcon className="w-3.5 h-3.5" />
          {healthCfg.label}
        </div>
      </div>

      {/* Progress */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-gray-500">Tiến độ</span>
          <span className="font-mono font-semibold text-gray-700">{progress.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              health === 'behind_schedule' ? 'bg-red-500' :
              health === 'at_risk' ? 'bg-amber-500' : 'bg-[#1B4D3E]'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Timeline */}
        {(planned_start || planned_end) && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formatDate(planned_start)}</span>
            <span>→</span>
            <span>{formatDate(planned_end)}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="px-4 pb-3 flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          {owner_name}
        </span>
      </div>

      {/* Quick stats row */}
      <div className="px-4 pb-3 grid grid-cols-4 gap-1 text-center">
        <div className="bg-gray-50 rounded px-1 py-1.5">
          <div className="text-xs font-mono font-semibold text-gray-700">{task_count}</div>
          <div className="text-[10px] text-gray-400">Tasks</div>
        </div>
        <div className="bg-gray-50 rounded px-1 py-1.5">
          <div className="text-xs font-mono font-semibold text-gray-700">{milestone_count}</div>
          <div className="text-[10px] text-gray-400">Mốc</div>
        </div>
        <div className="bg-gray-50 rounded px-1 py-1.5">
          <div className="text-xs font-mono font-semibold text-amber-600">{risk_count}</div>
          <div className="text-[10px] text-gray-400">Rủi ro</div>
        </div>
        <div className="bg-gray-50 rounded px-1 py-1.5">
          <div className="text-xs font-mono font-semibold text-red-600">{open_issues}</div>
          <div className="text-[10px] text-gray-400">Vấn đề</div>
        </div>
      </div>

      {/* Next milestone */}
      {next_milestone && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 text-xs bg-blue-50 text-blue-700 rounded px-2 py-1.5">
            <Target className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{next_milestone}</span>
            {next_milestone_due && (
              <span className="ml-auto text-blue-500 flex-shrink-0 font-mono">
                {formatDate(next_milestone_due)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color} font-medium`}>
          {statusCfg.label}
        </span>
      </div>
    </div>
  )
}

export default ProjectStatusCard