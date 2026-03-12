// ============================================================================
// FILE: src/pages/projects/ProjectResourcePage.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM5 — Bước 5.2 (ProjectResourcePage)
// ============================================================================
// Design: Industrial Mobile-First (WMS_UI_DESIGN_GUIDE.md)
// - Tab layout: Thành viên + Workload Overview
// - Add member modal with search + allocation preview
// - Inline edit role & allocation %
// - Brand: #1B4D3E primary, #E8A838 accent
// - Touch target ≥ 48px, mobile card layout
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Users,
  UserPlus,
  Search,
  X,
  ChevronLeft,
  Trash2,
  Edit3,
  Check,
  AlertTriangle,
  BarChart3,
  Briefcase,
  Building2,
  Clock,
  Percent,
  Shield,
  UserCheck,
  UserMinus,
  Filter,
} from 'lucide-react'
import { useParams, useNavigate } from 'react-router-dom'
import resourceService, {
  type ProjectMember,
  type ProjectMemberRole,
  type EmployeeWorkload,
  MEMBER_ROLE_LABELS,
  MEMBER_ROLE_COLORS,
  getAllocationColor,
  getAllocationLevel,
} from '../../services/project/resourceService'

// ============================================================================
// TYPES
// ============================================================================

type TabKey = 'members' | 'workload'

interface EditingMember {
  id: string
  role: ProjectMemberRole
  allocation_pct: number
}

interface SearchResult {
  id: string
  full_name: string
  employee_code: string
  department_name: string
  position_name: string
  avatar_url: string | null
  current_allocation_pct: number
  already_member: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: 'members', label: 'Thành viên', icon: <Users size={18} /> },
  { key: 'workload', label: 'Workload', icon: <BarChart3 size={18} /> },
]

const ROLE_OPTIONS: Array<{ value: ProjectMemberRole; label: string }> = [
  { value: 'owner', label: 'Chủ DA (PM)' },
  { value: 'co_owner', label: 'Đồng quản lý' },
  { value: 'lead', label: 'Trưởng nhóm' },
  { value: 'member', label: 'Thành viên' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'observer', label: 'Quan sát' },
]

// ============================================================================
// COMPONENT
// ============================================================================

export default function ProjectResourcePage() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // --- State ---
  const [activeTab, setActiveTab] = useState<TabKey>('members')
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [workloads, setWorkloads] = useState<EmployeeWorkload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add member modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [addRole, setAddRole] = useState<ProjectMemberRole>('member')
  const [addAllocation, setAddAllocation] = useState(100)

  // Inline editing
  const [editing, setEditing] = useState<EditingMember | null>(null)
  const [saving, setSaving] = useState(false)

  // Confirm delete
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)

  // Stats
  const [stats, setStats] = useState<{
    total_members: number
    active_members: number
    avg_allocation: number
    overallocated_count: number
  } | null>(null)

  // ==========================================================================
  // DATA LOADING
  // ==========================================================================

  const loadMembers = useCallback(async () => {
    if (!projectId) return
    try {
      setLoading(true)
      setError(null)
      const data = await resourceService.getMembers({
        project_id: projectId,
        is_active: 'all',
      })
      setMembers(data)

      // Load stats
      const s = await resourceService.getProjectResourceStats(projectId)
      setStats(s)
    } catch (err: any) {
      setError(err.message || 'Không thể tải danh sách thành viên')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const loadWorkloads = useCallback(async () => {
    if (!projectId) return
    try {
      const activeMembers = members.filter((m) => m.is_active)
      const wls: EmployeeWorkload[] = []
      const checkedIds = new Set<string>()

      for (const m of activeMembers) {
        if (checkedIds.has(m.employee_id)) continue
        checkedIds.add(m.employee_id)
        try {
          const wl = await resourceService.getEmployeeWorkload(m.employee_id)
          wls.push(wl)
        } catch {
          // Skip
        }
      }

      setWorkloads(
        wls.sort((a, b) => b.total_allocation_pct - a.total_allocation_pct)
      )
    } catch {
      // Silent fail for workload tab
    }
  }, [projectId, members])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  useEffect(() => {
    if (activeTab === 'workload' && members.length > 0) {
      loadWorkloads()
    }
  }, [activeTab, members, loadWorkloads])

  // ==========================================================================
  // SEARCH EMPLOYEES
  // ==========================================================================

  const handleSearch = useCallback(
    async (query: string) => {
      setSearchQuery(query)
      if (!projectId || query.length < 1) {
        setSearchResults([])
        return
      }
      try {
        setSearching(true)
        const results = await resourceService.searchEmployeesForProject(
          projectId,
          query
        )
        setSearchResults(results)
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    },
    [projectId]
  )

  // Debounce search
  useEffect(() => {
    if (!showAddModal) return
    const timer = setTimeout(() => {
      if (searchQuery.length >= 1) {
        handleSearch(searchQuery)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, showAddModal, handleSearch])

  // Load initial results when modal opens
  useEffect(() => {
    if (showAddModal && projectId) {
      resourceService
        .searchEmployeesForProject(projectId, '')
        .then(setSearchResults)
        .catch(() => {})
    }
  }, [showAddModal, projectId])

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  const handleAddMember = async (employeeId: string) => {
    if (!projectId) return
    try {
      setAddingId(employeeId)
      await resourceService.addMember({
        project_id: projectId,
        employee_id: employeeId,
        role: addRole,
        allocation_pct: addAllocation,
      })
      await loadMembers()
      // Refresh search results
      if (searchQuery) {
        handleSearch(searchQuery)
      } else {
        const results = await resourceService.searchEmployeesForProject(
          projectId,
          ''
        )
        setSearchResults(results)
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi thêm thành viên')
    } finally {
      setAddingId(null)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    try {
      await resourceService.removeMember(memberId)
      setConfirmRemoveId(null)
      await loadMembers()
    } catch (err: any) {
      alert(err.message || 'Lỗi xóa thành viên')
    }
  }

  const handleStartEdit = (member: ProjectMember) => {
    setEditing({
      id: member.id,
      role: member.role,
      allocation_pct: member.allocation_pct,
    })
  }

  const handleSaveEdit = async () => {
    if (!editing) return
    try {
      setSaving(true)
      await resourceService.updateMember(editing.id, {
        role: editing.role,
        allocation_pct: editing.allocation_pct,
      })
      setEditing(null)
      await loadMembers()
    } catch (err: any) {
      alert(err.message || 'Lỗi cập nhật')
    } finally {
      setSaving(false)
    }
  }

  // ==========================================================================
  // RENDER: STAT CARDS
  // ==========================================================================

  const renderStats = () => {
    if (!stats) return null
    const cards = [
      {
        label: 'Thành viên',
        value: stats.active_members,
        icon: <Users size={20} className="text-[#1B4D3E]" />,
        bg: 'bg-emerald-50 border-emerald-200',
      },
      {
        label: 'TB Allocation',
        value: `${stats.avg_allocation}%`,
        icon: <Percent size={20} className="text-blue-600" />,
        bg: 'bg-blue-50 border-blue-200',
      },
      {
        label: 'Quá tải',
        value: stats.overallocated_count,
        icon: <AlertTriangle size={20} className="text-red-600" />,
        bg:
          stats.overallocated_count > 0
            ? 'bg-red-50 border-red-200'
            : 'bg-gray-50 border-gray-200',
      },
    ]

    return (
      <div className="grid grid-cols-3 gap-3 mb-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`${c.bg} border rounded-xl p-3 text-center`}
          >
            <div className="flex justify-center mb-1">{c.icon}</div>
            <div className="text-lg font-bold text-gray-900">{c.value}</div>
            <div className="text-[11px] text-gray-500 leading-tight">
              {c.label}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ==========================================================================
  // RENDER: MEMBER CARD
  // ==========================================================================

  const renderMemberCard = (member: ProjectMember) => {
    const emp = member.employee
    const isEditing = editing?.id === member.id
    const isConfirmingRemove = confirmRemoveId === member.id
    const allocColor = getAllocationColor(member.allocation_pct)
    const roleColor = MEMBER_ROLE_COLORS[member.role] || ''

    return (
      <div
        key={member.id}
        className={`bg-white border rounded-xl p-4 transition-all ${
          !member.is_active ? 'opacity-50' : ''
        } ${isEditing ? 'ring-2 ring-[#1B4D3E]' : ''}`}
      >
        {/* Top row: Avatar + Name + Actions */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-[#1B4D3E] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {emp?.avatar_url ? (
              <img
                src={emp.avatar_url}
                alt=""
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              emp?.full_name?.charAt(0) || '?'
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-[15px] truncate">
              {emp?.full_name || 'N/A'}
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
              <Building2 size={12} />
              <span className="truncate">
                {emp?.department?.name || '—'}
              </span>
              <span className="text-gray-300">•</span>
              <span className="truncate">
                {emp?.position?.name || '—'}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          {member.is_active && !isEditing && !isConfirmingRemove && (
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => handleStartEdit(member)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 active:scale-95"
              >
                <Edit3 size={16} />
              </button>
              <button
                onClick={() => setConfirmRemoveId(member.id)}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 active:scale-95"
              >
                <UserMinus size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Role + Allocation row */}
        {!isEditing ? (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${roleColor}`}
            >
              <Shield size={12} />
              {MEMBER_ROLE_LABELS[member.role] || member.role}
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${allocColor}`}
            >
              <Percent size={12} />
              {member.allocation_pct}%
            </span>
            {member.start_date && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Clock size={12} />
                {new Date(member.start_date).toLocaleDateString('vi-VN')}
                {member.end_date &&
                  ` → ${new Date(member.end_date).toLocaleDateString('vi-VN')}`}
              </span>
            )}
          </div>
        ) : (
          /* Inline Edit Form */
          <div className="mt-3 space-y-3 bg-gray-50 rounded-lg p-3">
            {/* Role select */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Vai trò
              </label>
              <select
                value={editing.role}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    role: e.target.value as ProjectMemberRole,
                  })
                }
                className="w-full h-11 px-3 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-[#1B4D3E] focus:border-[#1B4D3E] outline-none"
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Allocation slider + input */}
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Phân bổ: {editing.allocation_pct}%
              </label>
              <input
                type="range"
                min={0}
                max={150}
                step={5}
                value={editing.allocation_pct}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    allocation_pct: Number(e.target.value),
                  })
                }
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#1B4D3E]"
              />
              <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                <span>0%</span>
                <span>50%</span>
                <span className="text-amber-500 font-medium">100%</span>
                <span className="text-red-500">150%</span>
              </div>
            </div>

            {/* Save / Cancel */}
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex-1 h-11 bg-[#1B4D3E] text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
              >
                <Check size={16} />
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button
                onClick={() => setEditing(null)}
                className="h-11 px-4 border border-gray-300 rounded-lg text-sm text-gray-600 active:scale-[0.98]"
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {/* Confirm Remove */}
        {isConfirmingRemove && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700 mb-2">
              Xóa <strong>{emp?.full_name}</strong> khỏi dự án?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleRemoveMember(member.id)}
                className="flex-1 h-10 bg-red-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1 active:scale-[0.98]"
              >
                <Trash2 size={14} />
                Xóa
              </button>
              <button
                onClick={() => setConfirmRemoveId(null)}
                className="h-10 px-4 border border-gray-300 rounded-lg text-sm text-gray-600 active:scale-[0.98]"
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {/* Inactive badge */}
        {!member.is_active && (
          <div className="mt-2 text-xs text-gray-400 italic">
            Đã rời dự án
            {member.left_at &&
              ` — ${new Date(member.left_at).toLocaleDateString('vi-VN')}`}
          </div>
        )}
      </div>
    )
  }

  // ==========================================================================
  // RENDER: WORKLOAD CARD
  // ==========================================================================

  const renderWorkloadCard = (wl: EmployeeWorkload) => {
    const barWidth = Math.min(wl.total_allocation_pct, 150)
    const isOver = wl.is_overallocated
    const barColor = isOver ? 'bg-red-500' : 'bg-[#1B4D3E]'
    const limitLinePos = (100 / 150) * 100 // Position of 100% mark on 0-150 scale

    return (
      <div
        key={wl.employee_id}
        className={`bg-white border rounded-xl p-4 ${
          isOver ? 'border-red-300 bg-red-50/30' : ''
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-[#1B4D3E] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {wl.avatar_url ? (
              <img
                src={wl.avatar_url}
                alt=""
                className="w-9 h-9 rounded-full object-cover"
              />
            ) : (
              wl.employee_name?.charAt(0) || '?'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-sm truncate">
              {wl.employee_name}
            </div>
            <div className="text-xs text-gray-500 truncate">
              {wl.department_name} • {wl.position_name}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div
              className={`text-lg font-bold ${
                isOver ? 'text-red-600' : 'text-[#1B4D3E]'
              }`}
            >
              {wl.total_allocation_pct}%
            </div>
            <div className="text-[10px] text-gray-400">
              {wl.project_count} DA
            </div>
          </div>
        </div>

        {/* Allocation bar */}
        <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden mb-2">
          <div
            className={`absolute top-0 left-0 h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${(barWidth / 150) * 100}%` }}
          />
          {/* 100% limit line */}
          <div
            className="absolute top-0 h-full w-px bg-gray-400"
            style={{ left: `${limitLinePos}%` }}
          />
          <div
            className="absolute -top-0.5 text-[9px] text-gray-500 font-medium"
            style={{ left: `${limitLinePos}%`, transform: 'translateX(-50%)' }}
          >
            100%
          </div>
        </div>

        {/* Project breakdown */}
        {wl.projects.length > 0 && (
          <div className="space-y-1.5 mt-2">
            {wl.projects.map((p, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <Briefcase size={11} className="text-gray-400 flex-shrink-0" />
                  <span className="truncate text-gray-600">
                    {p.project_code} — {p.project_name}
                  </span>
                </div>
                <span
                  className={`font-mono font-medium ml-2 flex-shrink-0 ${
                    p.project_id === projectId
                      ? 'text-[#1B4D3E]'
                      : 'text-gray-500'
                  }`}
                >
                  {p.allocation_pct}%
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Over-allocation warning */}
        {isOver && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-2.5 py-1.5">
            <AlertTriangle size={13} />
            <span>
              Quá tải {wl.total_allocation_pct - 100}% — cần điều chỉnh
            </span>
          </div>
        )}
      </div>
    )
  }

  // ==========================================================================
  // RENDER: ADD MEMBER MODAL (Bottom Sheet style)
  // ==========================================================================

  const renderAddModal = () => {
    if (!showAddModal) return null

    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => {
            setShowAddModal(false)
            setSearchQuery('')
            setSearchResults([])
          }}
        />

        {/* Modal */}
        <div className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-lg font-bold text-gray-900">
              Thêm thành viên
            </h3>
            <button
              onClick={() => {
                setShowAddModal(false)
                setSearchQuery('')
                setSearchResults([])
              }}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-95"
            >
              <X size={20} />
            </button>
          </div>

          {/* Settings: Role + Allocation */}
          <div className="px-4 pt-3 pb-2 space-y-3 border-b bg-gray-50">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Vai trò
                </label>
                <select
                  value={addRole}
                  onChange={(e) =>
                    setAddRole(e.target.value as ProjectMemberRole)
                  }
                  className="w-full h-10 px-3 rounded-lg border border-gray-300 text-sm bg-white focus:ring-2 focus:ring-[#1B4D3E] outline-none"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  Phân bổ
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={150}
                    step={5}
                    value={addAllocation}
                    onChange={(e) => setAddAllocation(Number(e.target.value))}
                    className="w-full h-10 px-3 pr-8 rounded-lg border border-gray-300 text-sm text-right font-mono focus:ring-2 focus:ring-[#1B4D3E] outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    %
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="px-4 pt-3">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm nhân viên (tên, mã NV)..."
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-gray-200 text-[15px] bg-gray-50 focus:ring-2 focus:ring-[#1B4D3E] focus:bg-white outline-none"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSearchResults([])
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  <X size={16} className="text-gray-400" />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {searching && (
              <div className="text-center py-8 text-gray-400 text-sm">
                Đang tìm...
              </div>
            )}

            {!searching && searchResults.length === 0 && searchQuery && (
              <div className="text-center py-8 text-gray-400 text-sm">
                Không tìm thấy nhân viên
              </div>
            )}

            {searchResults.map((emp) => (
              <div
                key={emp.id}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  emp.already_member
                    ? 'bg-gray-50 border-gray-200 opacity-60'
                    : 'bg-white border-gray-200 active:scale-[0.98]'
                }`}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-[#1B4D3E] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {emp.avatar_url ? (
                    <img
                      src={emp.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    emp.full_name?.charAt(0) || '?'
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm truncate">
                    {emp.full_name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {emp.employee_code} • {emp.department_name}
                  </div>
                  {emp.current_allocation_pct > 0 && (
                    <div
                      className={`text-xs mt-0.5 ${
                        emp.current_allocation_pct > 100
                          ? 'text-red-500'
                          : 'text-gray-400'
                      }`}
                    >
                      Hiện: {emp.current_allocation_pct}% phân bổ
                    </div>
                  )}
                </div>

                {/* Add button */}
                {emp.already_member ? (
                  <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                    <UserCheck size={14} />
                    Đã có
                  </span>
                ) : (
                  <button
                    onClick={() => handleAddMember(emp.id)}
                    disabled={addingId === emp.id}
                    className="h-10 px-4 bg-[#1B4D3E] text-white rounded-lg text-sm font-medium flex items-center gap-1.5 active:scale-95 disabled:opacity-50 flex-shrink-0"
                  >
                    {addingId === emp.id ? (
                      'Đang thêm...'
                    ) : (
                      <>
                        <UserPlus size={14} />
                        Thêm
                      </>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Safe area bottom padding (mobile) */}
          <div className="h-safe-area-inset-bottom" />
        </div>
      </div>
    )
  }

  // ==========================================================================
  // RENDER: MAIN
  // ==========================================================================

  if (!projectId) {
    return (
      <div className="p-4 text-center text-gray-500">
        Không tìm thấy dự án
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F5F2]">
      {/* ===== HEADER ===== */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 active:scale-95"
          >
            <ChevronLeft size={22} className="text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">
              Nguồn lực
            </h1>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-4 gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.key
                  ? 'text-[#1B4D3E] border-b-2 border-[#1B4D3E] bg-[#1B4D3E]/5'
                  : 'text-gray-500'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== CONTENT ===== */}
      <div className="p-4 pb-24 max-w-2xl mx-auto">
        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 border-3 border-[#1B4D3E] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Đang tải...</p>
          </div>
        )}

        {/* TAB: Members */}
        {!loading && activeTab === 'members' && (
          <>
            {renderStats()}

            {/* Member list */}
            <div className="space-y-3">
              {members.filter((m) => m.is_active).length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border">
                  <Users size={40} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500 text-sm">Chưa có thành viên</p>
                  <p className="text-gray-400 text-xs mt-1">
                    Nhấn nút + để thêm
                  </p>
                </div>
              ) : (
                members
                  .filter((m) => m.is_active)
                  .map(renderMemberCard)
              )}

              {/* Inactive members (collapsed) */}
              {members.filter((m) => !m.is_active).length > 0 && (
                <details className="mt-4">
                  <summary className="text-xs text-gray-400 cursor-pointer py-2">
                    {members.filter((m) => !m.is_active).length} thành viên đã
                    rời
                  </summary>
                  <div className="space-y-2 mt-2">
                    {members
                      .filter((m) => !m.is_active)
                      .map(renderMemberCard)}
                  </div>
                </details>
              )}
            </div>
          </>
        )}

        {/* TAB: Workload */}
        {!loading && activeTab === 'workload' && (
          <div className="space-y-3">
            {/* Summary */}
            {workloads.length > 0 && (
              <div className="bg-white border rounded-xl p-3 mb-2">
                <div className="text-xs text-gray-500 mb-2 font-medium">
                  Tổng quan phân bổ dự án này
                </div>
                <div className="flex gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-[#1B4D3E]">
                      {workloads.length}
                    </div>
                    <div className="text-[10px] text-gray-400">Thành viên</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-amber-600">
                      {workloads.filter((w) => w.total_allocation_pct > 80 && !w.is_overallocated).length}
                    </div>
                    <div className="text-[10px] text-gray-400">Tải cao</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-red-600">
                      {workloads.filter((w) => w.is_overallocated).length}
                    </div>
                    <div className="text-[10px] text-gray-400">Quá tải</div>
                  </div>
                </div>
              </div>
            )}

            {workloads.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border">
                <BarChart3 size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm">
                  Chưa có dữ liệu workload
                </p>
              </div>
            ) : (
              workloads.map(renderWorkloadCard)
            )}
          </div>
        )}
      </div>

      {/* ===== FAB: Add Member ===== */}
      {activeTab === 'members' && (
        <div className="fixed bottom-6 right-6 z-20">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-14 h-14 bg-[#1B4D3E] text-white rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          >
            <UserPlus size={24} />
          </button>
        </div>
      )}

      {/* ===== ADD MEMBER MODAL ===== */}
      {renderAddModal()}

      {/* Slide-up animation */}
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}