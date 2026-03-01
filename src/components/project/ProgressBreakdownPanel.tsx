// ============================================================================
// PROGRESS BREAKDOWN PANEL — Chi tiết tiến độ tự động
// File: src/components/project/ProgressBreakdownPanel.tsx
// Huy Anh Rubber ERP — Project Management Module
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  BarChart3,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings2,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
  ListTodo,
  AlertTriangle,
} from 'lucide-react'
import progressService from '../../services/project/progressService'
import type { ProjectProgressSummary, PhaseProgressBreakdown, ProgressMode } from '../../services/project/progressService'

// ============================================================================
// TYPES
// ============================================================================

interface ProgressBreakdownPanelProps {
  projectId: string
  /** Callback khi progress thay đổi → parent re-fetch project data */
  onProgressChanged?: () => void
}

// ============================================================================
// HELPERS
// ============================================================================

function getProgressColor(pct: number): string {
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 50) return 'bg-blue-500'
  if (pct >= 20) return 'bg-amber-500'
  return 'bg-gray-300'
}

function getProgressTextColor(pct: number): string {
  if (pct >= 80) return 'text-green-600'
  if (pct >= 50) return 'text-blue-600'
  if (pct >= 20) return 'text-amber-600'
  return 'text-gray-500'
}

// ============================================================================
// COMPONENT
// ============================================================================

const ProgressBreakdownPanel: React.FC<ProgressBreakdownPanelProps> = ({
  projectId,
  onProgressChanged,
}) => {
  const [data, setData] = useState<ProjectProgressSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  // Fetch breakdown
  const fetchBreakdown = useCallback(async () => {
    try {
      setError(null)
      const result = await progressService.getProgressBreakdown(projectId)
      setData(result)
    } catch (err: any) {
      console.error('[ProgressBreakdown] fetch error:', err)
      setError(err?.message || 'Lỗi tải dữ liệu tiến độ')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchBreakdown()
  }, [fetchBreakdown])

  // Manual recalculate all
  const handleRecalculate = async () => {
    setRefreshing(true)
    try {
      await progressService.recalculateAll(projectId)
      await fetchBreakdown()
      onProgressChanged?.()
    } catch (err: any) {
      setError(err?.message || 'Lỗi khi tính lại tiến độ')
    } finally {
      setRefreshing(false)
    }
  }

  // Toggle progress mode
  const handleToggleMode = async (
    entityId: string,
    entityType: 'phase' | 'project',
    currentMode: ProgressMode
  ) => {
    const newMode: ProgressMode = currentMode === 'auto' ? 'manual' : 'auto'
    try {
      await progressService.setProgressMode(entityId, entityType, newMode)
      await fetchBreakdown()
      onProgressChanged?.()
    } catch (err: any) {
      console.error('[ProgressBreakdown] toggle mode error:', err)
    }
  }

  // ======== RENDER ========

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-6 flex items-center justify-center gap-2 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[13px]">Đang tải tiến độ...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-red-100 p-4 flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
        <div className="flex-1">
          <p className="text-[13px] text-red-600 font-medium">{error}</p>
        </div>
        <button
          onClick={fetchBreakdown}
          className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-red-50 text-red-600 active:scale-[0.97]"
        >
          Thử lại
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-gray-50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-[#1B4D3E]/10 flex items-center justify-center shrink-0">
          <BarChart3 className="w-4 h-4 text-[#1B4D3E]" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-[14px] font-semibold text-gray-900">Chi tiết tiến độ</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {data.progress_mode === 'auto' ? 'Tự động từ tasks' : 'Nhập tay'} · {data.completed_tasks}/{data.total_tasks} tasks
          </p>
        </div>
        <span
          className={`text-[16px] font-bold ${getProgressTextColor(data.progress_pct)}`}
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {data.progress_pct.toFixed(1)}%
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Action bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/50 border-b border-gray-100">
            <button
              onClick={handleRecalculate}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B4D3E] text-white text-[11px] font-semibold active:scale-[0.97] disabled:opacity-60"
            >
              {refreshing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Tính lại
            </button>
            <button
              onClick={() => handleToggleMode(data.project_id, 'project', data.progress_mode)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] font-medium text-gray-600 active:scale-[0.97]"
            >
              {data.progress_mode === 'auto' ? (
                <ToggleRight className="w-3.5 h-3.5 text-[#2D8B6E]" />
              ) : (
                <ToggleLeft className="w-3.5 h-3.5 text-gray-400" />
              )}
              {data.progress_mode === 'auto' ? 'Auto' : 'Nhập tay'}
            </button>
          </div>

          {/* Phase breakdown table */}
          <div className="divide-y divide-gray-50">
            {data.phases.map((phase) => (
              <PhaseRow
                key={phase.phase_id || 'unassigned'}
                phase={phase}
                onToggleMode={handleToggleMode}
              />
            ))}
          </div>

          {/* Summary row */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-t border-gray-200">
            <div className="w-6 h-6 rounded-md bg-[#1B4D3E]/10 flex items-center justify-center">
              <ListTodo className="w-3.5 h-3.5 text-[#1B4D3E]" />
            </div>
            <span className="flex-1 text-[13px] font-bold text-gray-800">TỔNG CỘNG</span>
            <span className="text-[12px] text-gray-500 font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {data.completed_tasks}/{data.total_tasks}
            </span>
            <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${getProgressColor(data.progress_pct)}`}
                style={{ width: `${data.progress_pct}%` }}
              />
            </div>
            <span
              className={`w-14 text-right text-[13px] font-bold ${getProgressTextColor(data.progress_pct)}`}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {data.progress_pct.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// PHASE ROW
// ============================================================================

const PhaseRow: React.FC<{
  phase: PhaseProgressBreakdown
  onToggleMode: (id: string, type: 'phase' | 'project', mode: ProgressMode) => void
}> = ({ phase, onToggleMode }) => {
  const isUnassigned = !phase.phase_id

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 group">
      {/* Indicator */}
      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
        isUnassigned ? 'bg-gray-100' : 'bg-blue-50'
      }`}>
        {phase.completed_tasks === phase.total_tasks && phase.total_tasks > 0 ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
        ) : (
          <span className="text-[10px] font-bold text-gray-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {phase.total_tasks > 0
              ? Math.round((phase.completed_tasks / phase.total_tasks) * 100)
              : 0
            }
          </span>
        )}
      </div>

      {/* Phase name */}
      <div className="flex-1 min-w-0">
        <p className={`text-[13px] font-medium truncate ${isUnassigned ? 'text-gray-400 italic' : 'text-gray-800'}`}>
          {phase.phase_name}
        </p>
        {phase.cancelled_tasks > 0 && (
          <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
            <XCircle className="w-3 h-3" /> {phase.cancelled_tasks} đã hủy
          </p>
        )}
      </div>

      {/* Task count */}
      <span className="text-[12px] text-gray-400 font-medium shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {phase.completed_tasks}/{phase.total_tasks}
      </span>

      {/* Mini progress bar */}
      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden shrink-0">
        <div
          className={`h-full rounded-full ${getProgressColor(phase.progress_pct)}`}
          style={{ width: `${phase.progress_pct}%` }}
        />
      </div>

      {/* Percentage */}
      <span
        className={`w-14 text-right text-[12px] font-semibold shrink-0 ${getProgressTextColor(phase.progress_pct)}`}
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {phase.progress_pct.toFixed(1)}%
      </span>

      {/* Mode toggle (only for real phases) */}
      {!isUnassigned && (
        <button
          onClick={() => onToggleMode(phase.phase_id!, 'phase', phase.progress_mode)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-gray-100"
          title={phase.progress_mode === 'auto' ? 'Chuyển sang nhập tay' : 'Chuyển sang tự động'}
        >
          <Settings2 className="w-3.5 h-3.5 text-gray-400" />
        </button>
      )}
    </div>
  )
}

export default ProgressBreakdownPanel