// ============================================================================
// FILE: src/components/project/MilestoneTimeline.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM3 — Bước 3.8
// ============================================================================
// Vertical timeline: milestone nodes with status icons
// Click → expand deliverables checklist
// Actions: Complete / Reopen milestone
// ============================================================================

import React, { useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Calendar,
  Users,
  Square,
  CheckSquare,
  RotateCcw,
  Clock,
  AlertTriangle,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

type MilestoneStatus = 'pending' | 'approaching' | 'completed' | 'overdue' | 'cancelled'

interface Deliverable {
  id: string
  title: string
  completed: boolean
}

interface MilestoneTimelineItem {
  id: string
  name: string
  description?: string
  due_date: string
  completed_date?: string
  status: MilestoneStatus
  assignee?: { id: string; full_name: string }
  phase?: { id: string; name: string; color?: string }
  deliverables?: Deliverable[]
}

interface MilestoneTimelineProps {
  milestones: MilestoneTimelineItem[]
  onComplete?: (id: string) => void
  onReopen?: (id: string) => void
  onToggleDeliverable?: (milestoneId: string, deliverableId: string) => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_CONFIG: Record<MilestoneStatus, {
  icon: string
  label: string
  color: string
  bgColor: string
  borderColor: string
  lineColor: string
}> = {
  pending: {
    icon: '⬜',
    label: 'Chờ',
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    borderColor: 'border-gray-300',
    lineColor: 'bg-gray-200',
  },
  approaching: {
    icon: '🔵',
    label: 'Sắp tới',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    borderColor: 'border-blue-400',
    lineColor: 'bg-blue-200',
  },
  completed: {
    icon: '✅',
    label: 'Hoàn thành',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    borderColor: 'border-green-400',
    lineColor: 'bg-green-200',
  },
  overdue: {
    icon: '🔴',
    label: 'Quá hạn',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    borderColor: 'border-red-400',
    lineColor: 'bg-red-200',
  },
  cancelled: {
    icon: '⚫',
    label: 'Đã hủy',
    color: 'text-gray-400',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    lineColor: 'bg-gray-100',
  },
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(d?: string): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getDaysLabel(dueDateStr: string, status: MilestoneStatus): { label: string; color: string } | null {
  if (status === 'completed' || status === 'cancelled') return null
  const due = new Date(dueDateStr)
  const now = new Date()
  const diff = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diff < 0) return { label: `Trễ ${Math.abs(diff)} ngày`, color: 'text-red-600' }
  if (diff === 0) return { label: 'Hôm nay', color: 'text-red-600' }
  if (diff <= 3) return { label: `Còn ${diff} ngày`, color: 'text-amber-600' }
  if (diff <= 7) return { label: `Còn ${diff} ngày`, color: 'text-blue-600' }
  return { label: `Còn ${diff} ngày`, color: 'text-gray-500' }
}

// ============================================================================
// TIMELINE NODE
// ============================================================================

const TimelineNode: React.FC<{
  milestone: MilestoneTimelineItem
  isLast: boolean
  onComplete?: (id: string) => void
  onReopen?: (id: string) => void
  onToggleDeliverable?: (milestoneId: string, deliverableId: string) => void
}> = ({ milestone, isLast, onComplete, onReopen, onToggleDeliverable }) => {
  const [expanded, setExpanded] = useState(false)
  const conf = STATUS_CONFIG[milestone.status]
  const daysInfo = getDaysLabel(milestone.due_date, milestone.status)
  const deliverables = milestone.deliverables || []
  const delCompleted = deliverables.filter(d => d.completed).length
  const hasDeliverables = deliverables.length > 0

  return (
    <div className="flex gap-3">
      {/* Timeline line + node */}
      <div className="flex flex-col items-center shrink-0 w-8">
        {/* Node icon */}
        <div className={`
          w-8 h-8 rounded-full
          flex items-center justify-center
          text-[16px]
          border-2 ${conf.borderColor} ${conf.bgColor}
          shrink-0 z-10
        `}>
          {conf.icon}
        </div>
        {/* Connecting line */}
        {!isLast && (
          <div className={`w-0.5 flex-1 ${conf.lineColor} mt-0.5`} />
        )}
      </div>

      {/* Content card */}
      <div className={`flex-1 pb-6 min-w-0 ${isLast ? '' : ''}`}>
        <div className={`
          bg-white rounded-xl border border-gray-100
          shadow-[0_1px_2px_rgba(0,0,0,0.04)]
          overflow-hidden
        `}>
          {/* Header — clickable to expand */}
          <button
            type="button"
            onClick={() => hasDeliverables && setExpanded(!expanded)}
            className={`
              w-full text-left p-3.5
              ${hasDeliverables ? 'active:bg-gray-50' : 'cursor-default'}
            `}
          >
            {/* Row 1: Name + status label */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <h4 className={`text-[14px] font-semibold leading-snug ${
                milestone.status === 'completed' ? 'text-gray-400 line-through' : 'text-gray-900'
              }`}>
                {milestone.name}
              </h4>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${conf.bgColor} ${conf.color}`}>
                {conf.label}
              </span>
            </div>

            {/* Row 2: Metadata */}
            <div className="flex items-center gap-3 flex-wrap text-[11px] text-gray-500">
              {/* Due date */}
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatDate(milestone.due_date)}
              </span>

              {/* Completed date */}
              {milestone.completed_date && (
                <span className="inline-flex items-center gap-1 text-green-600">
                  <Check className="w-3 h-3" />
                  {formatDate(milestone.completed_date)}
                </span>
              )}

              {/* Days remaining */}
              {daysInfo && (
                <span className={`inline-flex items-center gap-1 font-semibold ${daysInfo.color}`}>
                  <Clock className="w-3 h-3" />
                  {daysInfo.label}
                </span>
              )}

              {/* Assignee */}
              {milestone.assignee && (
                <span className="inline-flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {milestone.assignee.full_name}
                </span>
              )}

              {/* Phase tag */}
              {milestone.phase && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                  style={{
                    backgroundColor: (milestone.phase.color || '#6B7280') + '15',
                    color: milestone.phase.color || '#6B7280',
                  }}
                >
                  {milestone.phase.name}
                </span>
              )}
            </div>

            {/* Deliverables counter + expand hint */}
            {hasDeliverables && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                <span className="text-[11px] text-gray-500">
                  📋 {delCompleted}/{deliverables.length} sản phẩm bàn giao
                </span>
                {expanded
                  ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                  : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                }
              </div>
            )}
          </button>

          {/* Expanded: Deliverables checklist */}
          {expanded && hasDeliverables && (
            <div className="border-t border-gray-100 px-3.5 py-3 space-y-1.5">
              {deliverables.map(del => (
                <button
                  key={del.id}
                  type="button"
                  onClick={() => onToggleDeliverable?.(milestone.id, del.id)}
                  className="w-full flex items-center gap-2.5 py-1.5 text-left group"
                >
                  {del.completed ? (
                    <CheckSquare className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-300 group-active:text-[#1B4D3E] shrink-0" />
                  )}
                  <span className={`text-[13px] ${del.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {del.title}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Actions */}
          {milestone.status !== 'cancelled' && (
            <div className="border-t border-gray-50 px-3.5 py-2.5 flex gap-2">
              {milestone.status !== 'completed' && (
                <button
                  onClick={() => onComplete?.(milestone.id)}
                  className="
                    inline-flex items-center gap-1.5
                    px-3 py-1.5 rounded-lg
                    bg-green-50 text-green-600
                    text-[11px] font-semibold
                    active:scale-[0.97] transition-transform
                  "
                >
                  <Check className="w-3.5 h-3.5" /> Hoàn thành
                </button>
              )}
              {milestone.status === 'completed' && (
                <button
                  onClick={() => onReopen?.(milestone.id)}
                  className="
                    inline-flex items-center gap-1.5
                    px-3 py-1.5 rounded-lg
                    bg-gray-50 text-gray-600
                    text-[11px] font-medium
                    active:scale-[0.97] transition-transform
                  "
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Mở lại
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const MilestoneTimeline: React.FC<MilestoneTimelineProps> = ({
  milestones,
  onComplete,
  onReopen,
  onToggleDeliverable,
}) => {
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'overdue' | 'completed'>('all')

  const filtered = milestones.filter(ms => {
    if (filter === 'upcoming') return ms.status === 'pending' || ms.status === 'approaching'
    if (filter === 'overdue') return ms.status === 'overdue'
    if (filter === 'completed') return ms.status === 'completed'
    return true
  })

  // Counts for filter chips
  const counts = {
    all: milestones.length,
    upcoming: milestones.filter(m => m.status === 'pending' || m.status === 'approaching').length,
    overdue: milestones.filter(m => m.status === 'overdue').length,
    completed: milestones.filter(m => m.status === 'completed').length,
  }

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {([
          { key: 'all',       label: 'Tất cả' },
          { key: 'upcoming',  label: 'Sắp tới' },
          { key: 'overdue',   label: 'Quá hạn' },
          { key: 'completed', label: 'Đã xong' },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`
              inline-flex items-center gap-1
              px-3 py-1.5 rounded-full
              text-[12px] font-medium whitespace-nowrap
              transition-colors
              ${filter === f.key
                ? 'bg-[#1B4D3E] text-white'
                : 'bg-white text-gray-600 border border-gray-200'
              }
            `}
          >
            {f.label}
            <span className={`
              text-[10px] px-1.5 py-0.5 rounded-full
              ${filter === f.key ? 'bg-white/20' : 'bg-gray-100'}
            `}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[13px] text-gray-400">
          Không có milestone nào
        </div>
      ) : (
        <div>
          {filtered.map((ms, idx) => (
            <TimelineNode
              key={ms.id}
              milestone={ms}
              isLast={idx === filtered.length - 1}
              onComplete={onComplete}
              onReopen={onReopen}
              onToggleDeliverable={onToggleDeliverable}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default MilestoneTimeline