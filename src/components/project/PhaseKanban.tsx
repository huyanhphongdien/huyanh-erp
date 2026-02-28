// ============================================================================
// FILE: src/components/project/PhaseKanban.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM3 — Bước 3.7
// ============================================================================
// Dual mode:
// - Desktop (≥1024px): Kanban columns — mỗi column = 1 phase, cards = milestones
// - Mobile: Accordion — mỗi section = 1 phase, expand → milestones + actions
// ============================================================================

import React, { useState, useEffect } from 'react'
import {
  Plus,
  Check,
  X,
  Edit3,
  Trash2,
  Play,
  SkipForward,
  GripVertical,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Calendar,
  Users,
  Target,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

type PhaseStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'
type MilestoneStatus = 'pending' | 'approaching' | 'completed' | 'overdue' | 'cancelled'

interface PhaseMilestone {
  id: string
  name: string
  due_date: string
  status: MilestoneStatus
  assignee?: { full_name: string }
}

interface PhaseItem {
  id: string
  name: string
  description?: string
  order_index: number
  planned_start?: string
  planned_end?: string
  status: PhaseStatus
  progress_pct: number
  color?: string
  milestones?: PhaseMilestone[]
}

interface PhaseKanbanProps {
  phases: PhaseItem[]
  onStatusChange?: (phaseId: string, status: PhaseStatus) => void
  onAddPhase?: (name: string) => void
  onEditPhase?: (phaseId: string) => void
  onDeletePhase?: (phaseId: string) => void
  onAddMilestone?: (phaseId: string) => void
  onCompleteMilestone?: (milestoneId: string) => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PHASE_CONF: Record<PhaseStatus, { label: string; color: string; bg: string; border: string }> = {
  pending:     { label: 'Chờ',       color: 'text-gray-600',  bg: 'bg-gray-50',    border: 'border-gray-200' },
  in_progress: { label: 'Đang chạy', color: 'text-blue-600',  bg: 'bg-blue-50',    border: 'border-blue-200' },
  completed:   { label: 'Hoàn thành', color: 'text-green-600', bg: 'bg-green-50',   border: 'border-green-200' },
  skipped:     { label: 'Bỏ qua',    color: 'text-gray-400',  bg: 'bg-gray-50',    border: 'border-gray-100' },
}

const MS_ICON: Record<MilestoneStatus, string> = {
  pending: '⬜', approaching: '🔵', completed: '✅', overdue: '🔴', cancelled: '⚫',
}

function formatShortDate(d?: string): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

function getProgressColor(pct: number): string {
  if (pct >= 75) return 'bg-emerald-500'
  if (pct >= 40) return 'bg-blue-500'
  if (pct >= 10) return 'bg-amber-500'
  return 'bg-gray-300'
}

// ============================================================================
// MILESTONE CARD (dùng chung cho cả 2 mode)
// ============================================================================

const MilestoneCard: React.FC<{
  ms: PhaseMilestone
  onComplete?: (id: string) => void
}> = ({ ms, onComplete }) => (
  <div className={`
    flex items-center gap-2.5 px-3 py-2.5 rounded-lg
    bg-white border border-gray-100
    ${ms.status === 'completed' ? 'opacity-60' : ''}
  `}>
    {/* Status icon — clickable to complete */}
    <button
      type="button"
      onClick={() => ms.status !== 'completed' && onComplete?.(ms.id)}
      disabled={ms.status === 'completed'}
      className="text-[16px] shrink-0 disabled:cursor-default"
    >
      {MS_ICON[ms.status]}
    </button>

    <div className="flex-1 min-w-0">
      <p className={`text-[12px] font-medium truncate ${
        ms.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-800'
      }`}>
        {ms.name}
      </p>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[10px] text-gray-400">{formatShortDate(ms.due_date)}</span>
        {ms.assignee && (
          <span className="text-[10px] text-gray-400">• {ms.assignee.full_name}</span>
        )}
      </div>
    </div>
  </div>
)

// ============================================================================
// KANBAN COLUMN (desktop)
// ============================================================================

const KanbanColumn: React.FC<{
  phase: PhaseItem
  onStatusChange?: (phaseId: string, status: PhaseStatus) => void
  onAddMilestone?: (phaseId: string) => void
  onCompleteMilestone?: (milestoneId: string) => void
  onEdit?: (phaseId: string) => void
  onDelete?: (phaseId: string) => void
}> = ({ phase, onStatusChange, onAddMilestone, onCompleteMilestone, onEdit, onDelete }) => {
  const conf = PHASE_CONF[phase.status]
  const milestones = phase.milestones || []

  return (
    <div className={`
      flex flex-col
      w-[280px] min-w-[280px] max-h-[calc(100vh-320px)]
      rounded-xl border ${conf.border}
      bg-white overflow-hidden
    `}>
      {/* Column header */}
      <div className={`px-3.5 py-3 ${conf.bg} border-b ${conf.border}`}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: phase.color || '#9CA3AF' }}
            />
            <h3 className={`text-[13px] font-bold truncate ${conf.color}`}>
              {phase.name}
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-gray-400"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {phase.progress_pct}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${getProgressColor(phase.progress_pct)}`}
            style={{ width: `${phase.progress_pct}%` }}
          />
        </div>

        {/* Dates + status label */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-gray-400">
            {formatShortDate(phase.planned_start)} → {formatShortDate(phase.planned_end)}
          </span>
          <span className={`text-[10px] font-semibold ${conf.color}`}>{conf.label}</span>
        </div>
      </div>

      {/* Milestones cards */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {milestones.length === 0 && (
          <p className="text-center text-[11px] text-gray-400 py-6">Chưa có milestone</p>
        )}
        {milestones.map(ms => (
          <MilestoneCard key={ms.id} ms={ms} onComplete={onCompleteMilestone} />
        ))}
      </div>

      {/* Column footer — actions */}
      <div className="p-2.5 border-t border-gray-50 space-y-1.5">
        <button
          onClick={() => onAddMilestone?.(phase.id)}
          className="
            w-full flex items-center justify-center gap-1.5
            py-2 rounded-lg border border-dashed border-gray-200
            text-[11px] font-medium text-gray-500
            active:bg-gray-50 transition-colors
          "
        >
          <Plus className="w-3.5 h-3.5" /> Thêm milestone
        </button>

        <div className="flex gap-1">
          {phase.status === 'pending' && (
            <button
              onClick={() => onStatusChange?.(phase.id, 'in_progress')}
              className="flex-1 py-1.5 rounded-md bg-blue-50 text-blue-600 text-[10px] font-semibold text-center"
            >
              ▶ Bắt đầu
            </button>
          )}
          {phase.status === 'in_progress' && (
            <button
              onClick={() => onStatusChange?.(phase.id, 'completed')}
              className="flex-1 py-1.5 rounded-md bg-green-50 text-green-600 text-[10px] font-semibold text-center"
            >
              ✓ Xong
            </button>
          )}
          <button
            onClick={() => onEdit?.(phase.id)}
            className="px-2 py-1.5 rounded-md bg-gray-50 text-gray-500"
          >
            <Edit3 className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDelete?.(phase.id)}
            className="px-2 py-1.5 rounded-md bg-red-50 text-red-400"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// ACCORDION ITEM (mobile)
// ============================================================================

const AccordionItem: React.FC<{
  phase: PhaseItem
  isExpanded: boolean
  onToggle: () => void
  onStatusChange?: (phaseId: string, status: PhaseStatus) => void
  onAddMilestone?: (phaseId: string) => void
  onCompleteMilestone?: (milestoneId: string) => void
  onEdit?: (phaseId: string) => void
  onDelete?: (phaseId: string) => void
}> = ({ phase, isExpanded, onToggle, onStatusChange, onAddMilestone, onCompleteMilestone, onEdit, onDelete }) => {
  const conf = PHASE_CONF[phase.status]
  const milestones = phase.milestones || []
  const msCompleted = milestones.filter(m => m.status === 'completed').length

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left active:bg-gray-50"
      >
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: phase.color || '#9CA3AF' }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-gray-900 truncate">{phase.name}</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[100px]">
              <div
                className={`h-full rounded-full ${getProgressColor(phase.progress_pct)}`}
                style={{ width: `${phase.progress_pct}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold text-gray-500"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {phase.progress_pct}%
            </span>
            <span className={`text-[10px] font-medium ${conf.color}`}>{conf.label}</span>
            {milestones.length > 0 && (
              <span className="text-[10px] text-gray-400">
                {msCompleted}/{milestones.length} MS
              </span>
            )}
          </div>
        </div>
        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-gray-100 p-4 space-y-3">
          {/* Dates */}
          {(phase.planned_start || phase.planned_end) && (
            <div className="flex items-center gap-1.5 text-[12px] text-gray-500">
              <Calendar className="w-3.5 h-3.5" />
              {formatShortDate(phase.planned_start)} → {formatShortDate(phase.planned_end)}
            </div>
          )}

          {/* Milestones */}
          {milestones.length > 0 && (
            <div className="space-y-1.5">
              {milestones.map(ms => (
                <MilestoneCard key={ms.id} ms={ms} onComplete={onCompleteMilestone} />
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-gray-50">
            <button
              onClick={() => onAddMilestone?.(phase.id)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-dashed border-gray-300 text-[11px] font-medium text-gray-500"
            >
              <Plus className="w-3.5 h-3.5" /> Milestone
            </button>
            {phase.status === 'pending' && (
              <button
                onClick={() => onStatusChange?.(phase.id, 'in_progress')}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-50 text-blue-600 text-[11px] font-semibold"
              >
                <Play className="w-3.5 h-3.5" /> Bắt đầu
              </button>
            )}
            {phase.status === 'in_progress' && (
              <button
                onClick={() => onStatusChange?.(phase.id, 'completed')}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-green-50 text-green-600 text-[11px] font-semibold"
              >
                <Check className="w-3.5 h-3.5" /> Hoàn thành
              </button>
            )}
            <div className="ml-auto flex gap-1">
              <button onClick={() => onEdit?.(phase.id)} className="p-2 rounded-lg bg-gray-50 text-gray-500">
                <Edit3 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete?.(phase.id)} className="p-2 rounded-lg bg-red-50 text-red-400">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const PhaseKanban: React.FC<PhaseKanbanProps> = ({
  phases,
  onStatusChange,
  onAddPhase,
  onEditPhase,
  onDeletePhase,
  onAddMilestone,
  onCompleteMilestone,
}) => {
  const [isDesktop, setIsDesktop] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(
    phases.find(p => p.status === 'in_progress')?.id || phases[0]?.id || null
  )
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsDesktop(e.matches)
    handler(mq)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const handleAdd = () => {
    if (!newName.trim()) return
    onAddPhase?.(newName.trim())
    setNewName('')
    setShowAddForm(false)
  }

  // ---- DESKTOP: Kanban columns ----
  if (isDesktop) {
    return (
      <div className="space-y-3">
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide">
          {phases.map(phase => (
            <KanbanColumn
              key={phase.id}
              phase={phase}
              onStatusChange={onStatusChange}
              onAddMilestone={onAddMilestone}
              onCompleteMilestone={onCompleteMilestone}
              onEdit={onEditPhase}
              onDelete={onDeletePhase}
            />
          ))}

          {/* Add column */}
          {showAddForm ? (
            <div className="w-[280px] min-w-[280px] rounded-xl border border-dashed border-[#2D8B6E] bg-white p-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Tên giai đoạn..."
                className="w-full px-3 py-2.5 text-[13px] bg-gray-50 rounded-lg border border-gray-200 outline-none focus:border-[#2D8B6E] mb-2"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <div className="flex gap-2">
                <button onClick={handleAdd} className="flex-1 py-2 rounded-lg bg-[#1B4D3E] text-white text-[12px] font-semibold">
                  Thêm
                </button>
                <button onClick={() => { setShowAddForm(false); setNewName('') }} className="px-3 py-2 rounded-lg bg-gray-100 text-gray-500 text-[12px]">
                  Hủy
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="
                w-[280px] min-w-[280px] min-h-[200px]
                flex flex-col items-center justify-center gap-2
                rounded-xl border border-dashed border-gray-300
                text-gray-400 text-[13px] font-medium
                hover:border-[#2D8B6E] hover:text-[#2D8B6E]
                transition-colors
              "
            >
              <Plus className="w-5 h-5" />
              Thêm giai đoạn
            </button>
          )}
        </div>
      </div>
    )
  }

  // ---- MOBILE: Accordion ----
  return (
    <div className="space-y-3">
      {phases.map(phase => (
        <AccordionItem
          key={phase.id}
          phase={phase}
          isExpanded={expandedId === phase.id}
          onToggle={() => setExpandedId(expandedId === phase.id ? null : phase.id)}
          onStatusChange={onStatusChange}
          onAddMilestone={onAddMilestone}
          onCompleteMilestone={onCompleteMilestone}
          onEdit={onEditPhase}
          onDelete={onDeletePhase}
        />
      ))}

      {/* Add phase */}
      {showAddForm ? (
        <div className="bg-white rounded-xl border border-dashed border-[#2D8B6E] p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tên giai đoạn mới..."
              className="flex-1 px-3 py-2.5 text-[14px] bg-gray-50 rounded-lg border border-gray-200 outline-none focus:border-[#2D8B6E]"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <button onClick={handleAdd} className="px-3 py-2.5 rounded-lg bg-[#1B4D3E] text-white">
              <Check className="w-4 h-4" />
            </button>
            <button onClick={() => { setShowAddForm(false); setNewName('') }} className="px-3 py-2.5 rounded-lg bg-gray-100 text-gray-500">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="
            w-full flex items-center justify-center gap-2
            py-3.5 rounded-xl border border-dashed border-gray-300
            text-[13px] font-medium text-gray-500
            active:bg-gray-50
          "
        >
          <Plus className="w-4 h-4" /> Thêm giai đoạn
        </button>
      )}
    </div>
  )
}

export default PhaseKanban