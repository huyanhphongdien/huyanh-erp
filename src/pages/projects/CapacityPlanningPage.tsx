// ============================================================================
// FILE: src/pages/projects/CapacityPlanningPage.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM5 — Bước 5.5 (Capacity Planning View)
// ============================================================================
// Trang tổng hợp capacity (cho Trưởng phòng / BGĐ):
//   - Lọc: Phòng ban, Khoảng thời gian
//   - Cards: Tổng NV | Đã phân bổ | Còn trống | Over-allocated
//   - Bảng: NV | Tổng % | DA tham gia | Ghi chú
//   - Tích hợp: WorkloadHeatmap + ResourceAllocation
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users,
  UserCheck,
  UserX,
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronDown,
  BarChart3,
  Grid3X3,
  Table2,
  Briefcase,
  Search,
  Filter,
  RefreshCw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import resourceService, {
  type DepartmentCapacity,
  type EmployeeWorkload,
  MEMBER_ROLE_LABELS,
  getAllocationColor,
  getAllocationLevel,
} from '../../services/project/resourceService'
import WorkloadHeatmap, {
  workloadToHeatmapData,
  type HeatmapViewMode,
} from '../../components/project/WorkloadHeatmap'
import ResourceAllocation, {
  type AllocationEmployee,
} from '../../components/project/ResourceAllocation'

// ============================================================================
// TYPES
// ============================================================================

type ViewTab = 'table' | 'heatmap' | 'chart'

interface Department {
  id: string
  name: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const VIEW_TABS: Array<{ key: ViewTab; label: string; icon: React.ReactNode }> = [
  { key: 'table', label: 'Bảng', icon: <Table2 size={16} /> },
  { key: 'heatmap', label: 'Heatmap', icon: <Grid3X3 size={16} /> },
  { key: 'chart', label: 'Biểu đồ', icon: <BarChart3 size={16} /> },
]

// ============================================================================
// COMPONENT
// ============================================================================

export default function CapacityPlanningPage() {
  const navigate = useNavigate()

  // --- Filter state ---
  const [departments, setDepartments] = useState<Department[]>([])
  const [selectedDeptId, setSelectedDeptId] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // --- Data state ---
  const [capacityData, setCapacityData] = useState<DepartmentCapacity | null>(null)
  const [allWorkloads, setAllWorkloads] = useState<EmployeeWorkload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- View state ---
  const [viewTab, setViewTab] = useState<ViewTab>('table')
  const [showFilter, setShowFilter] = useState(false)
  const [expandedEmpId, setExpandedEmpId] = useState<string | null>(null)

  // ==========================================================================
  // LOAD DEPARTMENTS
  // ==========================================================================

  useEffect(() => {
    const loadDepts = async () => {
      try {
        const { data, error: err } = await supabase
          .from('departments')
          .select('id, name')
          .eq('is_active', true)
          .order('name')

        if (err) throw err
        setDepartments(data || [])
      } catch {
        // Silent — filter sẽ không có options
      }
    }
    loadDepts()
  }, [])

  // ==========================================================================
  // LOAD CAPACITY DATA
  // ==========================================================================

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      if (selectedDeptId !== 'all') {
        // Load capacity cho 1 phòng ban
        const data = await resourceService.getDepartmentCapacity(selectedDeptId)
        setCapacityData(data)
        setAllWorkloads(data.employees)
      } else {
        // Load tất cả nhân viên quá tải + có allocation
        // Lấy tất cả NV có tham gia DA
        const { data: allMembers, error: memErr } = await supabase
          .from('project_members')
          .select('employee_id')
          .eq('is_active', true)

        if (memErr) throw memErr

        const uniqueEmpIds = [...new Set((allMembers || []).map((m) => m.employee_id))]

        // Load workload từng NV
        const workloads: EmployeeWorkload[] = []
        for (const empId of uniqueEmpIds) {
          try {
            const wl = await resourceService.getEmployeeWorkload(empId)
            if (wl.project_count > 0) {
              workloads.push(wl)
            }
          } catch {
            // Skip
          }
        }

        workloads.sort((a, b) => b.total_allocation_pct - a.total_allocation_pct)
        setAllWorkloads(workloads)

        // Build aggregate capacity
        const allocated = workloads.filter((w) => w.project_count > 0).length
        const over = workloads.filter((w) => w.is_overallocated).length
        const totalPct = workloads.reduce((s, w) => s + w.total_allocation_pct, 0)

        setCapacityData({
          department_id: 'all',
          department_name: 'Tất cả phòng ban',
          total_employees: uniqueEmpIds.length,
          allocated_employees: allocated,
          available_employees: uniqueEmpIds.length - allocated,
          overallocated_employees: over,
          avg_allocation_pct:
            workloads.length > 0
              ? Math.round((totalPct / workloads.length) * 10) / 10
              : 0,
          employees: workloads,
        })
      }
    } catch (err: any) {
      setError(err.message || 'Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [selectedDeptId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ==========================================================================
  // FILTERED DATA
  // ==========================================================================

  const filteredWorkloads = useMemo(() => {
    if (!searchQuery) return allWorkloads
    const q = searchQuery.toLowerCase()
    return allWorkloads.filter(
      (w) =>
        w.employee_name.toLowerCase().includes(q) ||
        w.employee_code.toLowerCase().includes(q) ||
        w.department_name.toLowerCase().includes(q)
    )
  }, [allWorkloads, searchQuery])

  // Heatmap data
  const heatmapData = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const columns: string[] = []
    const d = new Date(start)
    for (let i = 0; i < 8; i++) {
      const year = d.getFullYear()
      const week =
        1 +
        Math.round(
          ((d.getTime() -
            new Date(d.getFullYear(), 0, 4).getTime()) /
            86400000 -
            3 +
            ((new Date(d.getFullYear(), 0, 4).getDay() + 6) % 7)) /
            7
        )
      columns.push(`${year}-W${String(week).padStart(2, '0')}`)
      d.setDate(d.getDate() + 7)
    }
    return workloadToHeatmapData(filteredWorkloads, columns, 'week')
  }, [filteredWorkloads])

  // Chart data
  const chartData: AllocationEmployee[] = useMemo(
    () =>
      filteredWorkloads.map((w) => ({
        employee_id: w.employee_id,
        employee_name: w.employee_name,
        employee_code: w.employee_code,
        department_name: w.department_name,
        avatar_url: w.avatar_url,
        projects: w.projects.map((p) => ({
          project_id: p.project_id,
          project_code: p.project_code,
          project_name: p.project_name,
          allocation_pct: p.allocation_pct,
          role: p.role,
        })),
        total_allocation_pct: w.total_allocation_pct,
      })),
    [filteredWorkloads]
  )

  // ==========================================================================
  // RENDER: STAT CARDS
  // ==========================================================================

  const renderStats = () => {
    if (!capacityData) return null

    const cards = [
      {
        label: 'Tổng NV',
        value: capacityData.total_employees,
        icon: <Users size={20} className="text-[#1B4D3E]" />,
        bg: 'bg-emerald-50 border-emerald-200',
        text: 'text-[#1B4D3E]',
      },
      {
        label: 'Đã phân bổ',
        value: capacityData.allocated_employees,
        icon: <UserCheck size={20} className="text-blue-600" />,
        bg: 'bg-blue-50 border-blue-200',
        text: 'text-blue-700',
      },
      {
        label: 'Còn trống',
        value: capacityData.available_employees,
        icon: <UserX size={20} className="text-gray-500" />,
        bg: 'bg-gray-50 border-gray-200',
        text: 'text-gray-700',
      },
      {
        label: 'Quá tải',
        value: capacityData.overallocated_employees,
        icon: <AlertTriangle size={20} className="text-red-600" />,
        bg:
          capacityData.overallocated_employees > 0
            ? 'bg-red-50 border-red-200'
            : 'bg-gray-50 border-gray-200',
        text:
          capacityData.overallocated_employees > 0
            ? 'text-red-700'
            : 'text-gray-700',
      },
    ]

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`${c.bg} border rounded-xl p-3 text-center`}
          >
            <div className="flex justify-center mb-1">{c.icon}</div>
            <div className={`text-xl font-bold ${c.text}`}>{c.value}</div>
            <div className="text-[11px] text-gray-500 leading-tight">
              {c.label}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ==========================================================================
  // RENDER: TABLE VIEW
  // ==========================================================================

  const renderTable = () => (
    <div className="space-y-2">
      {filteredWorkloads.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <Users size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">
            {searchQuery ? 'Không tìm thấy nhân viên' : 'Chưa có dữ liệu'}
          </p>
        </div>
      ) : (
        filteredWorkloads.map((wl) => {
          const isExpanded = expandedEmpId === wl.employee_id
          const allocColor = getAllocationColor(wl.total_allocation_pct)
          const isOver = wl.is_overallocated

          return (
            <div
              key={wl.employee_id}
              className={`bg-white border rounded-xl overflow-hidden transition-all ${
                isOver ? 'border-red-200' : ''
              }`}
            >
              {/* Main row — tap to expand */}
              <button
                onClick={() =>
                  setExpandedEmpId(isExpanded ? null : wl.employee_id)
                }
                className="w-full flex items-center gap-3 p-3.5 text-left active:bg-gray-50"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-[#1B4D3E] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                  {wl.avatar_url ? (
                    <img
                      src={wl.avatar_url}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    wl.employee_name?.charAt(0) || '?'
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-[15px] truncate">
                    {wl.employee_name}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Building2 size={11} />
                    <span className="truncate">{wl.department_name}</span>
                    <span className="text-gray-300">•</span>
                    <span>{wl.position_name}</span>
                  </div>
                </div>

                {/* Allocation badge */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${allocColor}`}
                  >
                    {wl.total_allocation_pct}%
                  </span>
                  <span className="text-xs text-gray-400">
                    {wl.project_count} DA
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </button>

              {/* Expanded: project breakdown */}
              {isExpanded && (
                <div className="px-4 pb-3 border-t bg-gray-50/50">
                  {/* Allocation bar */}
                  <div className="py-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                      <span>Phân bổ tổng</span>
                      <span className="font-mono">
                        {wl.total_allocation_pct}% / 100%
                      </span>
                    </div>
                    <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`absolute top-0 left-0 h-full rounded-full transition-all ${
                          isOver ? 'bg-red-500' : 'bg-[#1B4D3E]'
                        }`}
                        style={{
                          width: `${Math.min(
                            (wl.total_allocation_pct / 150) * 100,
                            100
                          )}%`,
                        }}
                      />
                      {/* 100% marker */}
                      <div
                        className="absolute top-0 h-full w-0.5 bg-gray-400"
                        style={{ left: `${(100 / 150) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Project list */}
                  <div className="space-y-2">
                    {wl.projects.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Briefcase
                            size={13}
                            className="text-gray-400 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-800 truncate">
                              {p.project_code} — {p.project_name}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              {MEMBER_ROLE_LABELS[p.role as keyof typeof MEMBER_ROLE_LABELS] || p.role}
                              {p.start_date &&
                                ` • ${new Date(p.start_date).toLocaleDateString('vi-VN')}`}
                              {p.end_date &&
                                ` → ${new Date(p.end_date).toLocaleDateString('vi-VN')}`}
                            </div>
                          </div>
                        </div>
                        <span
                          className={`font-mono font-bold text-sm ml-2 flex-shrink-0 ${
                            p.allocation_pct > 50
                              ? 'text-[#1B4D3E]'
                              : 'text-gray-600'
                          }`}
                        >
                          {p.allocation_pct}%
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Over-allocation warning */}
                  {isOver && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
                      <AlertTriangle size={14} />
                      <span>
                        Quá tải <strong>{wl.total_allocation_pct - 100}%</strong>{' '}
                        — cần giảm allocation hoặc thay người
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )

  // ==========================================================================
  // RENDER: MAIN
  // ==========================================================================

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
            <h1 className="text-lg font-bold text-gray-900">
              Capacity Planning
            </h1>
            {capacityData && selectedDeptId !== 'all' && (
              <p className="text-xs text-gray-500 truncate">
                {capacityData.department_name}
              </p>
            )}
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 active:scale-95"
          >
            <RefreshCw
              size={18}
              className={`text-gray-500 ${loading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>

        {/* Filter bar */}
        <div className="px-4 pb-3 flex gap-2 items-center">
          {/* Department select */}
          <div className="flex-1 relative">
            <Building2
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:ring-2 focus:ring-[#1B4D3E] outline-none appearance-none"
            >
              <option value="all">Tất cả phòng ban</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search */}
          <div className="relative w-40 sm:w-52">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm NV..."
              className="w-full h-10 pl-9 pr-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:ring-2 focus:ring-[#1B4D3E] outline-none"
            />
          </div>
        </div>

        {/* View tabs */}
        <div className="flex px-4 gap-1 border-t pt-1">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setViewTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                viewTab === tab.key
                  ? 'text-[#1B4D3E] border-b-2 border-[#1B4D3E] bg-[#1B4D3E]/5'
                  : 'text-gray-500'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          {/* Summary */}
          {capacityData && (
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-400 pr-1">
              <span>
                TB:{' '}
                <strong className="text-gray-600">
                  {capacityData.avg_allocation_pct}%
                </strong>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ===== CONTENT ===== */}
      <div className="p-4 pb-20 max-w-4xl mx-auto">
        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-10 h-10 border-3 border-[#1B4D3E] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Đang tải dữ liệu...</p>
          </div>
        ) : (
          <>
            {/* Stat cards */}
            {renderStats()}

            {/* View: Table */}
            {viewTab === 'table' && renderTable()}

            {/* View: Heatmap */}
            {viewTab === 'heatmap' && (
              <WorkloadHeatmap
                employees={heatmapData}
                loading={false}
              />
            )}

            {/* View: Chart */}
            {viewTab === 'chart' && (
              <ResourceAllocation
  employees={chartData}
  loading={false}
/>
            )}
          </>
        )}
      </div>
    </div>
  )
}