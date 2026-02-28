// ============================================================================
// FILE: src/pages/projects/MultiProjectGanttPage.tsx
// MODULE: Quản lý Dự án (Project Management) — Huy Anh Rubber ERP
// PHASE: PM4 — Bước 4.6
// MÔ TẢ: Gantt tổng hợp nhiều dự án — cho BGĐ xem tổng quan
//         Filter: phòng ban, trạng thái, ưu tiên
//         Group by project → phases → milestones
// DESIGN: Industrial Rubber Theme, desktop-focused Manager View
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  LayoutGrid,
  RefreshCw,
  Filter,
  Loader2,
  Building2,
  Flag,
  AlertCircle,
} from 'lucide-react'
import GanttChart from '../../components/project/GanttChart'
import type { ZoomLevel } from '../../components/project/GanttChart'
import { ganttService } from '../../services/project/ganttService'
import type {
  GanttData,
  GanttItem,
  GanttDependency,
  MultiProjectGanttResult,
} from '../../services/project/ganttService'
import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

interface DepartmentOption {
  id: string
  name: string
}

// ============================================================================
// COMPONENT
// ============================================================================

const MultiProjectGanttPage: React.FC = () => {
  const navigate = useNavigate()

  // State
  const [projects, setProjects] = useState<MultiProjectGanttResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [overallStart, setOverallStart] = useState<string | null>(null)
  const [overallEnd, setOverallEnd] = useState<string | null>(null)

  // Filters
  const [filterDept, setFilterDept] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [showFilters, setShowFilters] = useState(true)

  // Dropdown data
  const [departments, setDepartments] = useState<DepartmentOption[]>([])

  // ---- Load departments ----
  useEffect(() => {
    const loadDepts = async () => {
      const { data } = await supabase
        .from('departments')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      if (data) {
        setDepartments(data.map((d) => ({ id: d.id as string, name: d.name as string })))
      }
    }
    loadDepts()
  }, [])

  // ---- Load gantt data ----
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params: Record<string, string | undefined> = {}
      if (filterDept !== 'all') params.department_id = filterDept
      if (filterStatus !== 'all') params.status = filterStatus
      if (filterPriority !== 'all') params.priority = filterPriority

      const result = await ganttService.getMultiProjectGantt(params)
      setProjects(result.projects)
      setOverallStart(result.overall_start)
      setOverallEnd(result.overall_end)
    } catch (err) {
      console.error('[MultiProjectGantt] Load error:', err)
      setError('Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [filterDept, filterStatus, filterPriority])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ---- Merge all project items into single GanttData ----
  const mergedGanttData: GanttData = useMemo(() => {
    const allItems: GanttItem[] = []
    const allDeps: GanttDependency[] = []

    for (const project of projects) {
      allItems.push(...project.items)
    }

    return {
      items: allItems,
      dependencies: allDeps,
      critical_path: [],
      project_start: overallStart,
      project_end: overallEnd,
      total_duration_days: 0,
    }
  }, [projects, overallStart, overallEnd])

  // ---- Stats ----
  const stats = useMemo(() => {
    const total = projects.length
    const inProgress = projects.filter((p) => p.status === 'in_progress').length
    const completed = projects.filter((p) => p.status === 'completed').length
    const onHold = projects.filter((p) => p.status === 'on_hold').length
    return { total, inProgress, completed, onHold }
  }, [projects])

  // ---- Handlers ----
  const handleItemClick = (item: GanttItem) => {
    // Nếu click vào project bar → navigate to project gantt
    if (item.type === 'project') {
      navigate(`/projects/${item.id}/gantt`)
    }
  }

  // ---- Render ----

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">

      {/* ===== HEADER ===== */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 md:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/projects')}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <LayoutGrid className="w-5 h-5 text-[#1B4D3E]" />
                Gantt Tổng hợp
              </h1>
              <p className="text-sm text-gray-500">Xem timeline tất cả dự án</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
                showFilters ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]' : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" /> Lọc
            </button>
            <button
              onClick={loadData}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50"
              title="Tải lại"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ===== FILTER BAR ===== */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
            {/* Department */}
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gray-400" />
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
              >
                <option value="all">Tất cả phòng ban</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-gray-400" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="planning">Lập kế hoạch</option>
                <option value="approved">Đã duyệt</option>
                <option value="in_progress">Đang thực hiện</option>
                <option value="on_hold">Tạm dừng</option>
                <option value="completed">Hoàn thành</option>
              </select>
            </div>

            {/* Priority */}
            <div className="flex items-center gap-2">
              <Flag className="w-4 h-4 text-gray-400" />
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
              >
                <option value="all">Tất cả ưu tiên</option>
                <option value="critical">Khẩn cấp</option>
                <option value="high">Cao</option>
                <option value="medium">Trung bình</option>
                <option value="low">Thấp</option>
              </select>
            </div>

            {(filterDept !== 'all' || filterStatus !== 'all' || filterPriority !== 'all') && (
              <button
                onClick={() => { setFilterDept('all'); setFilterStatus('all'); setFilterPriority('all') }}
                className="text-xs text-red-600 hover:underline"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        )}
      </div>

      {/* ===== STATS CARDS ===== */}
      <div className="px-4 md:px-6 py-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Tổng dự án" value={stats.total} color="#1B4D3E" />
          <StatCard label="Đang chạy" value={stats.inProgress} color="#2563EB" />
          <StatCard label="Hoàn thành" value={stats.completed} color="#16A34A" />
          <StatCard label="Tạm dừng" value={stats.onHold} color="#F59E0B" />
        </div>
      </div>

      {/* ===== GANTT ===== */}
      <div className="flex-1 px-4 md:px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#1B4D3E]" />
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <LayoutGrid className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Không có dự án nào phù hợp bộ lọc</p>
          </div>
        ) : (
          <GanttChart
            data={mergedGanttData}
            zoomLevel="month"
            showCriticalPath={false}
            onItemClick={handleItemClick}
            className="min-h-[400px]"
          />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const StatCard: React.FC<{ label: string; value: number; color: string }> = ({
  label, value, color,
}) => (
  <div className="bg-white rounded-lg border border-gray-200 p-3">
    <p className="text-xs text-gray-500">{label}</p>
    <p className="text-2xl font-bold mt-0.5" style={{ color }}>
      {value}
    </p>
  </div>
)

export default MultiProjectGanttPage