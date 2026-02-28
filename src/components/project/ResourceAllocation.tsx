// ============================================================================
// FILE: src/components/project/ResourceAllocation.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM5 — Bước 5.4 (ResourceAllocation)
// ============================================================================
// Stacked bar chart:
//   X axis = Nhân viên
//   Y axis = % allocation (0 → 150+)
//   Stacked bars = Mỗi DA 1 màu
//   Line at 100% = capacity limit
//   Bars vượt 100% = highlight đỏ
// ============================================================================

import React, { useState, useMemo } from 'react'
import {
  AlertTriangle,
  Briefcase,
  ChevronDown,
  ChevronUp,
  Users,
  X,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

export interface AllocationProject {
  project_id: string
  project_code: string
  project_name: string
  allocation_pct: number
  role: string
}

export interface AllocationEmployee {
  employee_id: string
  employee_name: string
  employee_code: string
  department_name: string
  avatar_url: string | null
  projects: AllocationProject[]
}

export interface ResourceAllocationProps {
  employees: AllocationEmployee[]
  /** Giới hạn capacity (default: 100) */
  capacityLimit?: number
  /** Chiều cao tối đa bar (px) (default: 200) */
  maxBarHeight?: number
  /** Sắp xếp theo tổng allocation giảm dần (default: true) */
  sortDesc?: boolean
  /** Chỉ hiển thị NV có allocation > 0 (default: false) */
  hideEmpty?: boolean
  /** Loading state */
  loading?: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Bảng màu cho các DA (cycle nếu > 10 DA) */
const PROJECT_COLORS = [
  { bg: '#1B4D3E', text: '#fff' },
  { bg: '#2563EB', text: '#fff' },
  { bg: '#E8A838', text: '#1a1a1a' },
  { bg: '#7C3AED', text: '#fff' },
  { bg: '#059669', text: '#fff' },
  { bg: '#DC2626', text: '#fff' },
  { bg: '#D97706', text: '#fff' },
  { bg: '#4F46E5', text: '#fff' },
  { bg: '#0891B2', text: '#fff' },
  { bg: '#BE185D', text: '#fff' },
]

const Y_MAX = 150

// ============================================================================
// HELPERS
// ============================================================================

function getProjectColor(index: number) {
  return PROJECT_COLORS[index % PROJECT_COLORS.length]
}

function getTotalAllocation(emp: AllocationEmployee): number {
  return emp.projects.reduce((sum, p) => sum + p.allocation_pct, 0)
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function ResourceAllocation({
  employees,
  capacityLimit = 100,
  maxBarHeight = 200,
  sortDesc = true,
  hideEmpty = false,
  loading = false,
}: ResourceAllocationProps) {
  const [selectedEmp, setSelectedEmp] = useState<AllocationEmployee | null>(null)
  const [showAll, setShowAll] = useState(false)

  // --- Computed ---
  const sortedEmployees = useMemo(() => {
    let list = [...employees]
    if (hideEmpty) {
      list = list.filter((e) => e.projects.length > 0)
    }
    if (sortDesc) {
      list.sort((a, b) => getTotalAllocation(b) - getTotalAllocation(a))
    }
    return list
  }, [employees, sortDesc, hideEmpty])

  const displayedEmployees = showAll
    ? sortedEmployees
    : sortedEmployees.slice(0, 10)

  // Unique project legend
  const projectLegend = useMemo(() => {
    const seen = new Map<string, { code: string; name: string; colorIdx: number }>()
    for (const emp of employees) {
      for (const proj of emp.projects) {
        if (!seen.has(proj.project_id)) {
          seen.set(proj.project_id, {
            code: proj.project_code,
            name: proj.project_name,
            colorIdx: seen.size,
          })
        }
      }
    }
    return Array.from(seen.values())
  }, [employees])

  // Map project_id → color index
  const projectColorMap = useMemo(() => {
    const map = new Map<string, number>()
    let idx = 0
    for (const emp of employees) {
      for (const proj of emp.projects) {
        if (!map.has(proj.project_id)) {
          map.set(proj.project_id, idx++)
        }
      }
    }
    return map
  }, [employees])

  // Stats
  const stats = useMemo(() => {
    const total = sortedEmployees.length
    const overCount = sortedEmployees.filter(
      (e) => getTotalAllocation(e) > capacityLimit
    ).length
    const avgAlloc =
      total > 0
        ? Math.round(
            sortedEmployees.reduce((s, e) => s + getTotalAllocation(e), 0) / total
          )
        : 0
    return { total, overCount, avgAlloc }
  }, [sortedEmployees, capacityLimit])

  // ==========================================================================
  // LOADING / EMPTY
  // ==========================================================================

  if (loading) {
    return (
      <div className="bg-white border rounded-xl p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-[#1B4D3E] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (sortedEmployees.length === 0) {
    return (
      <div className="bg-white border rounded-xl p-8 flex flex-col items-center justify-center text-gray-400">
        <Users size={36} className="mb-2" />
        <p className="text-sm">Chưa có dữ liệu phân bổ</p>
      </div>
    )
  }

  // ==========================================================================
  // RENDER
  // ==========================================================================

  const barWidth = Math.max(
    36,
    Math.min(56, Math.floor(300 / displayedEmployees.length))
  )
  const gap = 8

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between p-3 border-b flex-wrap gap-2">
        <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Briefcase size={16} className="text-[#1B4D3E]" />
          Phân bổ nguồn lực
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{stats.total} NV • TB {stats.avgAlloc}%</span>
          {stats.overCount > 0 && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <AlertTriangle size={12} />
              {stats.overCount} quá tải
            </span>
          )}
        </div>
      </div>

      {/* ===== CHART ===== */}
      <div className="overflow-x-auto p-3 pb-1">
        <div
          className="relative"
          style={{
            minWidth: displayedEmployees.length * (barWidth + gap) + 50,
            height: maxBarHeight + 60,
          }}
        >
          {/* Y-axis grid lines + labels */}
          {[0, 50, 100, 150].map((pct) => {
            const y = (1 - pct / Y_MAX) * maxBarHeight
            return (
              <React.Fragment key={pct}>
                <div
                  className={`absolute left-8 right-0 border-t ${
                    pct === capacityLimit
                      ? 'border-red-400 border-dashed z-10'
                      : 'border-gray-100'
                  }`}
                  style={{ top: y }}
                />
                <div
                  className="absolute left-0 text-[10px] text-gray-400 font-mono -translate-y-1/2"
                  style={{ top: y }}
                >
                  {pct}%
                </div>
              </React.Fragment>
            )
          })}

          {/* Capacity limit label */}
          <div
            className="absolute left-8 text-[9px] text-red-500 font-medium bg-white px-1 -translate-y-full z-10"
            style={{ top: (1 - capacityLimit / Y_MAX) * maxBarHeight }}
          >
            Giới hạn
          </div>

          {/* Bars container */}
          <div
            className="absolute left-10 bottom-[36px] flex items-end"
            style={{ gap, height: maxBarHeight }}
          >
            {displayedEmployees.map((emp) => {
              const total = getTotalAllocation(emp)
              const isOver = total > capacityLimit
              const barTotalHeight = Math.min(
                (total / Y_MAX) * maxBarHeight,
                maxBarHeight
              )

              return (
                <div
                  key={emp.employee_id}
                  className="flex flex-col items-center cursor-pointer group"
                  style={{ width: barWidth }}
                  onClick={() => setSelectedEmp(emp)}
                >
                  {/* Total label */}
                  <div
                    className={`text-[10px] font-mono font-bold mb-1 ${
                      isOver ? 'text-red-600' : 'text-gray-600'
                    }`}
                  >
                    {total}%
                  </div>

                  {/* Stacked bar */}
                  <div
                    className={`relative w-full rounded-t-md overflow-hidden transition-all group-active:scale-x-90 ${
                      isOver ? 'ring-2 ring-red-400 ring-offset-1' : ''
                    }`}
                    style={{ height: barTotalHeight }}
                  >
                    {(() => {
                      let currentBottom = 0
                      return emp.projects.map((proj) => {
                        const colorIdx = projectColorMap.get(proj.project_id) || 0
                        const color = getProjectColor(colorIdx)
                        const segHeight = (proj.allocation_pct / Y_MAX) * maxBarHeight
                        const bottom = currentBottom
                        currentBottom += segHeight

                        return (
                          <div
                            key={proj.project_id}
                            className="absolute left-0 right-0 transition-all"
                            style={{
                              bottom,
                              height: segHeight,
                              backgroundColor: color.bg,
                            }}
                            title={`${proj.project_code}: ${proj.allocation_pct}%`}
                          />
                        )
                      })
                    })()}

                    {/* Over-capacity stripe overlay */}
                    {isOver && (
                      <div
                        className="absolute left-0 right-0 pointer-events-none"
                        style={{
                          bottom: (capacityLimit / Y_MAX) * maxBarHeight,
                          top: 0,
                          background:
                            'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,0,0,0.1) 3px, rgba(255,0,0,0.1) 6px)',
                        }}
                      />
                    )}
                  </div>

                  {/* Avatar + Name below */}
                  <div className="mt-1.5 text-center w-full">
                    <div className="w-6 h-6 mx-auto rounded-full bg-[#1B4D3E] flex items-center justify-center text-white text-[8px] font-bold">
                      {emp.avatar_url ? (
                        <img
                          src={emp.avatar_url}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover"
                        />
                      ) : (
                        emp.employee_name?.charAt(0) || '?'
                      )}
                    </div>
                    <div
                      className="text-[9px] text-gray-500 truncate mt-0.5 leading-tight"
                      style={{ maxWidth: barWidth }}
                    >
                      {emp.employee_name?.split(' ').pop() || ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Show more/less */}
      {sortedEmployees.length > 10 && (
        <div className="px-3 pb-2">
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full py-2 text-xs text-[#1B4D3E] font-medium flex items-center justify-center gap-1 hover:bg-gray-50 rounded-lg active:scale-[0.98]"
          >
            {showAll ? (
              <>
                <ChevronUp size={14} />
                Thu gọn
              </>
            ) : (
              <>
                <ChevronDown size={14} />
                Xem tất cả ({sortedEmployees.length} NV)
              </>
            )}
          </button>
        </div>
      )}

      {/* ===== LEGEND ===== */}
      <div className="px-3 py-2 border-t bg-gray-50 flex flex-wrap gap-2">
        {projectLegend.map((proj) => {
          const color = getProjectColor(proj.colorIdx)
          return (
            <span
              key={proj.code}
              className="inline-flex items-center gap-1.5 text-[10px] text-gray-600"
            >
              <span
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: color.bg }}
              />
              <span className="font-medium">{proj.code}</span>
              <span className="text-gray-400 hidden sm:inline truncate max-w-[100px]">
                {proj.name}
              </span>
            </span>
          )
        })}
        <span className="inline-flex items-center gap-1.5 text-[10px] text-red-500 ml-auto">
          <span className="w-4 border-t border-dashed border-red-400" />
          Giới hạn {capacityLimit}%
        </span>
      </div>

      {/* ===== DETAIL POPUP (Bottom Sheet) ===== */}
      {selectedEmp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setSelectedEmp(null)}
          />
          <div className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden animate-slide-up">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b">
              <div className="w-10 h-10 rounded-full bg-[#1B4D3E] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {selectedEmp.avatar_url ? (
                  <img
                    src={selectedEmp.avatar_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  selectedEmp.employee_name?.charAt(0) || '?'
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 truncate">
                  {selectedEmp.employee_name}
                </div>
                <div className="text-xs text-gray-500">
                  {selectedEmp.department_name} • {selectedEmp.employee_code}
                </div>
              </div>
              <button
                onClick={() => setSelectedEmp(null)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Total + Progress bar */}
            {(() => {
              const total = getTotalAllocation(selectedEmp)
              const isOver = total > capacityLimit
              return (
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600">Tổng phân bổ</span>
                    <span
                      className={`text-xl font-bold ${
                        isOver ? 'text-red-600' : 'text-[#1B4D3E]'
                      }`}
                    >
                      {total}%
                    </span>
                  </div>
                  <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`absolute top-0 left-0 h-full rounded-full transition-all ${
                        isOver ? 'bg-red-500' : 'bg-[#1B4D3E]'
                      }`}
                      style={{
                        width: `${Math.min((total / Y_MAX) * 100, 100)}%`,
                      }}
                    />
                    <div
                      className="absolute top-0 h-full w-0.5 bg-gray-400"
                      style={{ left: `${(capacityLimit / Y_MAX) * 100}%` }}
                    />
                  </div>
                  {isOver && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
                      <AlertTriangle size={13} />
                      Vượt giới hạn {total - capacityLimit}%
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Project list */}
            <div className="px-4 pb-4 space-y-2">
              {selectedEmp.projects.map((proj) => {
                const colorIdx = projectColorMap.get(proj.project_id) || 0
                const color = getProjectColor(colorIdx)
                return (
                  <div
                    key={proj.project_id}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50"
                  >
                    <span
                      className="w-3 h-8 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: color.bg }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {proj.project_code}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {proj.project_name} • {proj.role}
                      </div>
                    </div>
                    <div className="text-sm font-bold font-mono text-gray-700 flex-shrink-0">
                      {proj.allocation_pct}%
                    </div>
                  </div>
                )
              })}
              {selectedEmp.projects.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">
                  Chưa tham gia DA nào
                </p>
              )}
            </div>
            <div className="h-safe-area-inset-bottom" />
          </div>
        </div>
      )}

      {/* Animation */}
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.25s ease-out;
        }
      `}</style>
    </div>
  )
}