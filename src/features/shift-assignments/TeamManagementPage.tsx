// ============================================================================
// TEAM MANAGEMENT PAGE - Quản lý đội ca (Redesigned)
// File: src/features/attendance/TeamManagementPage.tsx
// Mobile-first, 44px+ touch targets, visible remove buttons
// ============================================================================

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { shiftTeamService } from '../../services/shiftTeamService'
import { supabase } from '../../lib/supabase'
import {
  Users, UserPlus, UserMinus, RefreshCw, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle2, Info, Search, X, ArrowRightLeft
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface Department {
  id: string
  code: string
  name: string
}

interface Employee {
  id: string
  code: string
  full_name: string
  department_id: string
}

// ============================================================================
// COLOR HELPERS
// ============================================================================

const TEAM_STYLES: Record<string, { bg: string; border: string; badge: string; avatar: string; text: string }> = {
  A: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-600',
    avatar: 'bg-blue-100 text-blue-700',
    text: 'text-blue-700'
  },
  B: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-500',
    avatar: 'bg-amber-100 text-amber-700',
    text: 'text-amber-700'
  }
}

function getTeamStyle(code: string) {
  if (code?.includes('A')) return TEAM_STYLES.A
  if (code?.includes('B')) return TEAM_STYLES.B
  return { bg: 'bg-gray-50', border: 'border-gray-200', badge: 'bg-gray-500', avatar: 'bg-gray-100 text-gray-700', text: 'text-gray-700' }
}

function getTeamLabel(code: string) {
  if (code?.includes('A')) return 'A'
  if (code?.includes('B')) return 'B'
  return code?.charAt(code.length - 1) || '?'
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function TeamManagementPage() {
  const queryClient = useQueryClient()

  // ── State ──
  const [selectedDeptId, setSelectedDeptId] = useState<string>('')
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [showAddModal, setShowAddModal] = useState<{ teamId: string; teamName: string } | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<{ memberId: string; empName: string } | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // ── Auto-dismiss toast ──
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Departments query ──
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments-for-teams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, code, name')
        
        .order('name')
      if (error) throw error
      return data || []
    }
  })

  // Auto-select first dept
  const activeDeptId = selectedDeptId || departments[0]?.id || ''
  const activeDeptName = departments.find(d => d.id === activeDeptId)?.name || ''

  // ── Teams + Members query ──
  const { data: teams = [], isLoading: teamsLoading, refetch: refetchTeams } = useQuery({
    queryKey: ['shift-teams', activeDeptId],
    queryFn: async () => {
      if (!activeDeptId) return []
      const teamList = await shiftTeamService.getTeams(activeDeptId)
      // Fetch members for each team
      const result = await Promise.all(
        teamList.map(async (team) => {
          try {
            const members = await shiftTeamService.getTeamMembers(team.id)
            return { ...team, members }
          } catch {
            return { ...team, members: [] }
          }
        })
      )
      return result
    },
    enabled: !!activeDeptId
  })

  // ── Unassigned employees ──
  const { data: unassigned = [] } = useQuery<Employee[]>({
    queryKey: ['unassigned-employees', activeDeptId],
    queryFn: async () => {
      if (!activeDeptId) return []
      return shiftTeamService.getUnassignedEmployees(activeDeptId)
    },
    enabled: !!activeDeptId
  })

  // ── Mutations ──
  const addMemberMutation = useMutation({
    mutationFn: async ({ teamId, employeeIds }: { teamId: string; employeeIds: string[] }) => {
      const user = (await supabase.auth.getUser()).data.user
      // Tìm employee_id từ user
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user?.id || '')
        .maybeSingle()

      return shiftTeamService.addMembersInBulk(
        teamId,
        employeeIds,
        new Date().toISOString().split('T')[0],
        emp?.id || undefined
      )
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['shift-teams'] })
      queryClient.invalidateQueries({ queryKey: ['unassigned-employees'] })
      showToast('success', `Đã thêm ${result.added} nhân viên${result.skipped > 0 ? `, bỏ qua ${result.skipped}` : ''}`)
      setShowAddModal(null)
    },
    onError: (err: any) => {
      showToast('error', err.message || 'Lỗi khi thêm nhân viên')
    }
  })

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) => shiftTeamService.removeMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-teams'] })
      queryClient.invalidateQueries({ queryKey: ['unassigned-employees'] })
      showToast('success', 'Đã xóa nhân viên khỏi đội')
      setConfirmRemove(null)
    },
    onError: (err: any) => {
      showToast('error', err.message || 'Lỗi khi xóa')
    }
  })

  // ── Computed ──
  const totalAssigned = teams.reduce((sum, t) => sum + ((t as any).members?.length || 0), 0)
  const totalUnassigned = unassigned.length
  const totalTeams = teams.length

  // ── Toggle expand ──
  const toggleExpand = (teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  // ══════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════

  return (
    <div className="min-h-screen bg-gray-50 pb-safe">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Quản lý đội ca</h1>
            <p className="text-xs text-gray-500 mt-0.5">Phân nhân viên vào đội A / B để xoay 3 ca ngắn</p>
          </div>
          <button
            onClick={() => refetchTeams()}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg active:bg-gray-100"
          >
            <RefreshCw size={18} className="text-gray-500" />
          </button>
        </div>

        {/* ── Department Tabs ── */}
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
          {departments.map(dept => (
            <button
              key={dept.id}
              onClick={() => setSelectedDeptId(dept.id)}
              className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium min-h-[40px] transition-colors ${
                activeDeptId === dept.id
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              }`}
            >
              {dept.name}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3 max-w-3xl mx-auto">
        {/* ── Stats Cards ── */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
            <div className="text-2xl font-bold text-gray-900">{totalAssigned}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Đã phân đội</div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
            <div className={`text-2xl font-bold ${totalUnassigned > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
              {totalUnassigned}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">Chưa phân đội</div>
          </div>
          <div className="bg-white rounded-xl p-3 border border-gray-100 text-center">
            <div className="text-2xl font-bold text-blue-600">{totalTeams}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Đội</div>
          </div>
        </div>

        {/* ── Unassigned Warning ── */}
        {totalUnassigned > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <span className="font-semibold">{totalUnassigned} nhân viên</span> chưa có đội.
              Nhấn <span className="font-medium">"Thêm thành viên"</span> để phân đội.
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {teamsLoading && (
          <div className="bg-white rounded-xl p-8 text-center">
            <RefreshCw size={20} className="animate-spin mx-auto text-gray-400" />
            <p className="text-sm text-gray-500 mt-2">Đang tải...</p>
          </div>
        )}

        {/* ── Team Cards ── */}
        {!teamsLoading && teams.map(team => {
          const style = getTeamStyle(team.code)
          const label = getTeamLabel(team.code)
          const members = (team as any).members || []
          const isExpanded = expandedTeams.has(team.id)

          // Filter members by search
          const filteredMembers = searchTerm
            ? members.filter((m: any) => {
                const emp = m.employee
                const name = emp?.full_name?.toLowerCase() || ''
                const code = emp?.code?.toLowerCase() || ''
                return name.includes(searchTerm.toLowerCase()) || code.includes(searchTerm.toLowerCase())
              })
            : members

          return (
            <div key={team.id} className={`bg-white rounded-xl border-2 ${style.border} overflow-hidden`}>
              {/* Team Header — always visible, tap to expand */}
              <button
                onClick={() => toggleExpand(team.id)}
                className={`w-full flex items-center gap-3 p-3 ${style.bg} active:opacity-80 min-h-[56px]`}
              >
                {/* Team Avatar */}
                <div className={`w-10 h-10 rounded-full ${style.badge} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`}>
                  {label}
                </div>

                {/* Team Info */}
                <div className="flex-1 text-left min-w-0">
                  <div className="font-semibold text-gray-900 text-[15px]">
                    {team.name}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {activeDeptName}
                  </div>
                </div>

                {/* Count + Chevron */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${style.badge} text-white`}>
                    <Users size={12} className="inline mr-1 -mt-0.5" />
                    {members.length}
                  </span>
                  {isExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                </div>
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-gray-100">
                  {/* Actions Bar */}
                  <div className="px-3 py-2 flex items-center gap-2 bg-gray-50 border-b border-gray-100">
                    <button
                      onClick={() => setShowAddModal({ teamId: team.id, teamName: team.name })}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white min-h-[40px] active:opacity-80 ${style.badge}`}
                    >
                      <UserPlus size={15} />
                      Thêm thành viên
                    </button>

                    {members.length > 3 && (
                      <div className="flex-1 relative ml-auto max-w-[200px]">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Tìm..."
                          value={searchTerm}
                          onChange={e => setSearchTerm(e.target.value)}
                          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 bg-white min-h-[40px] text-[15px]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Members List */}
                  {filteredMembers.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Users size={28} className="mx-auto text-gray-300" />
                      <p className="text-sm text-gray-400 mt-2">
                        {members.length === 0 ? 'Chưa có thành viên' : 'Không tìm thấy'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {filteredMembers.map((member: any) => {
                        const emp = member.employee
                        const empName = emp?.full_name || 'N/A'
                        const empCode = emp?.code || ''
                        const posName = emp?.position?.name || ''

                        return (
                          <div key={member.id} className="flex items-center gap-3 px-3 py-2.5 group">
                            {/* Avatar */}
                            <div className={`w-9 h-9 rounded-full ${style.avatar} flex items-center justify-center text-sm font-semibold flex-shrink-0`}>
                              {empName.charAt(0)}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-900 text-sm truncate">{empName}</div>
                              <div className="text-xs text-gray-500 truncate">
                                {empCode}{posName ? ` · ${posName}` : ''}
                              </div>
                            </div>

                            {/* Remove Button — ALWAYS VISIBLE */}
                            <button
                              onClick={() => setConfirmRemove({ memberId: member.id, empName })}
                              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-red-400 active:bg-red-50 active:text-red-600 flex-shrink-0"
                              title="Xóa khỏi đội"
                            >
                              <UserMinus size={17} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* ── How it works ── */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info size={16} className="text-blue-500" />
            <span className="font-semibold text-sm text-gray-900">Cách hoạt động</span>
          </div>
          <ul className="space-y-1.5 text-sm text-gray-600">
            <li>• <strong>2 đội</strong> xoay vòng chạy <strong>3 ca ngắn</strong>: Sáng (6-14h), Chiều (14-22h), Đêm (22-6h)</li>
            <li>• Mỗi lượt chỉ cần nhân lực cho <strong>2/3 ca</strong></li>
            <li>• Đổi ca: <strong>Thứ 4 tuần chẵn</strong> / <strong>Thứ 5 tuần lẻ</strong></li>
            <li>• Sau khi phân đội → vào <strong>Phân ca nhanh</strong> chọn "Phân ca theo đội"</li>
          </ul>
        </div>
      </div>

      {/* ══════════════════════════════════════════ */}
      {/* ADD MEMBERS MODAL (Bottom Sheet) */}
      {/* ══════════════════════════════════════════ */}
      {showAddModal && (
        <AddMembersModal
          teamId={showAddModal.teamId}
          teamName={showAddModal.teamName}
          unassigned={unassigned}
          isLoading={addMemberMutation.isPending}
          onAdd={(employeeIds) => {
            addMemberMutation.mutate({ teamId: showAddModal.teamId, employeeIds })
          }}
          onClose={() => setShowAddModal(null)}
        />
      )}

      {/* ══════════════════════════════════════════ */}
      {/* CONFIRM REMOVE DIALOG */}
      {/* ══════════════════════════════════════════ */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmRemove(null)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm mx-auto p-5 pb-safe animate-slide-up">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">
              <UserMinus size={22} className="text-red-600" />
            </div>
            <h3 className="text-center font-semibold text-gray-900">Xóa khỏi đội?</h3>
            <p className="text-center text-sm text-gray-500 mt-1">
              Bạn có chắc muốn xóa <strong>{confirmRemove.empName}</strong> khỏi đội ca?
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setConfirmRemove(null)}
                className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 active:bg-gray-50 min-h-[48px]"
              >
                Hủy
              </button>
              <button
                onClick={() => removeMemberMutation.mutate(confirmRemove.memberId)}
                disabled={removeMemberMutation.isPending}
                className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-medium active:bg-red-700 disabled:opacity-50 min-h-[48px]"
              >
                {removeMemberMutation.isPending ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════ */}
      {/* TOAST */}
      {/* ══════════════════════════════════════════ */}
      {toast && (
        <div className="fixed bottom-6 left-4 right-4 z-50 flex justify-center pointer-events-none">
          <div className={`inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg pointer-events-auto
            ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// ADD MEMBERS MODAL — Bottom Sheet trên mobile
// ============================================================================

function AddMembersModal({
  teamId,
  teamName,
  unassigned,
  isLoading,
  onAdd,
  onClose
}: {
  teamId: string
  teamName: string
  unassigned: Employee[]
  isLoading: boolean
  onAdd: (ids: string[]) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return unassigned
    const q = search.toLowerCase()
    return unassigned.filter(e =>
      e.full_name?.toLowerCase().includes(q) || e.code?.toLowerCase().includes(q)
    )
  }, [unassigned, search])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(e => e.id)))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md mx-auto flex flex-col max-h-[85vh] animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Thêm vào {teamName}</h3>
            <p className="text-xs text-gray-500">{unassigned.length} nhân viên chưa có đội</p>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg active:bg-gray-100"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-gray-50">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm nhân viên..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 text-[15px] rounded-lg border border-gray-200 bg-gray-50 min-h-[44px]"
              autoFocus
            />
          </div>
        </div>

        {/* Select All */}
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-50 flex items-center justify-between">
            <button
              onClick={selectAll}
              className="text-sm font-medium text-blue-600 active:text-blue-700 min-h-[36px] flex items-center"
            >
              {selected.size === filtered.length ? 'Bỏ chọn tất cả' : `Chọn tất cả (${filtered.length})`}
            </button>
            {selected.size > 0 && (
              <span className="text-xs text-gray-500">Đã chọn: {selected.size}</span>
            )}
          </div>
        )}

        {/* Employee List */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Users size={28} className="mx-auto text-gray-300" />
              <p className="text-sm text-gray-400 mt-2">
                {unassigned.length === 0 ? 'Tất cả nhân viên đã có đội' : 'Không tìm thấy'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map(emp => {
                const isSelected = selected.has(emp.id)
                return (
                  <button
                    key={emp.id}
                    onClick={() => toggleSelect(emp.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left min-h-[52px] transition-colors ${
                      isSelected ? 'bg-blue-50' : 'active:bg-gray-50'
                    }`}
                  >
                    {/* Checkbox */}
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'
                    }`}>
                      {isSelected && (
                        <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                          <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>

                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-sm font-semibold flex-shrink-0">
                      {emp.full_name?.charAt(0) || '?'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm truncate">{emp.full_name}</div>
                      <div className="text-xs text-gray-500">{emp.code}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer — sticky action */}
        <div className="px-4 py-3 border-t border-gray-200 bg-white pb-safe">
          <button
            onClick={() => onAdd(Array.from(selected))}
            disabled={selected.size === 0 || isLoading}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium text-sm active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed min-h-[48px]"
          >
            {isLoading
              ? 'Đang thêm...'
              : selected.size > 0
                ? `Thêm ${selected.size} nhân viên`
                : 'Chọn nhân viên để thêm'
            }
          </button>
        </div>
      </div>
    </div>
  )
}