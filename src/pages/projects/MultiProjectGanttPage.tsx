// ============================================================================
// FILE: src/pages/projects/MultiProjectGanttPage.tsx
// MODULE: Quản lý Dự án (Project Management) — Huy Anh Rubber ERP
// PHASE: PM4 — Bước 4.6
// MÔ TẢ: Gantt tổng hợp nhiều dự án — cho BGĐ xem tổng quan
//         Filter: phòng ban, trạng thái, ưu tiên
//         Group by project → phases → milestones
// DESIGN: Industrial Rubber Theme, desktop-focused Manager View
// FIX: Bộ lọc hoạt động — dùng counter trigger thay vì useCallback dependency
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react'
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
  X,
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

  // =========================================================================
  // FIX: Dùng fetchTrigger counter để đảm bảo useEffect luôn re-run
  // khi filter thay đổi (tránh stale closure / memoization issues)
  // =========================================================================
  const [fetchTrigger, setFetchTrigger] = useState(0)

  // ---- Load departments ----
  useEffect(() => {
    const loadDepts = async () => {
      try {
        // NOTE: bảng departments KHÔNG có cột is_active
        const { data } = await supabase
          .from('departments')
          .select('id, name')
          .order('name')
        if (data) {
          setDepartments(data.map((d) => ({ id: d.id as string, name: d.name as string })))
        }
      } catch (err) {
        console.error('[MultiProjectGantt] Error loading departments:', err)
      }
    }
    loadDepts()
  }, [])

  // ---- FIX: Khi bất kỳ filter nào thay đổi → increment trigger ----
  useEffect(() => {
    setFetchTrigger(prev => prev + 1)
  }, [filterDept, filterStatus, filterPriority])

  // ---- Load gantt data — chạy khi fetchTrigger thay đổi ----
  useEffect(() => {
    let cancelled = false

    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)

        // Build params — chỉ gửi field có giá trị thực
        const params: Record<string, string> = {}
        if (filterDept !== 'all') params.department_id = filterDept
        if (filterStatus !== 'all') params.status = filterStatus
        if (filterPriority !== 'all') params.priority = filterPriority

        console.log('📊 [MultiProjectGantt] Fetching with params:', JSON.stringify(params))

        const result = await ganttService.getMultiProjectGantt(params)

        if (cancelled) return

        console.log('✅ [MultiProjectGantt] Got', result.projects.length, 'projects')

        setProjects(result.projects)
        setOverallStart(result.overall_start)
        setOverallEnd(result.overall_end)
      } catch (err: any) {
        if (cancelled) return
        console.error('[MultiProjectGantt] Load error:', err)
        setError('Không thể tải dữ liệu: ' + (err?.message || ''))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchTrigger])

  // ---- Merge all project items into single GanttData ----
  const mergedGanttData: GanttData = useMemo(() => {
    const allItems: GanttItem[] = []
    const allDeps: GanttDependency[] = []

    for (const project of projects) {
      const cleaned = project.items.map(item => {
        if (item.type === 'project' && item.name.includes(' — ')) {
          return { ...item, name: item.name.split(' — ').slice(1).join(' — ') }
        }
        return item
      })
      allItems.push(...cleaned)
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

  // ---- Active filter count ----
  const activeFilterCount = [filterDept, filterStatus, filterPriority]
    .filter(v => v !== 'all').length

  // ---- Handlers ----
  const handleItemClick = (item: GanttItem) => {
    if (item.type === 'project') {
      navigate(`/projects/${item.id}`)
    }
  }

  const handleClearFilters = () => {
    setFilterDept('all')
    setFilterStatus('all')
    setFilterPriority('all')
  }

  const handleRefresh = () => {
    setFetchTrigger(prev => prev + 1)
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
                showFilters || activeFilterCount > 0
                  ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              Lọc
              {activeFilterCount > 0 && (
                <span className="ml-1 bg-white text-[#1B4D3E] text-xs font-bold rounded-full w-5 h-5 inline-flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              title="Tải lại"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent outline-none"
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
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent outline-none"
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
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent outline-none"
              >
                <option value="all">Tất cả ưu tiên</option>
                <option value="critical">Khẩn cấp</option>
                <option value="high">Cao</option>
                <option value="medium">Trung bình</option>
                <option value="low">Thấp</option>
              </select>
            </div>

            {/* Clear + Active filter tags */}
            {activeFilterCount > 0 && (
              <>
                <button
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:underline px-2 py-1"
                >
                  <X className="w-3.5 h-3.5" />
                  Xóa bộ lọc
                </button>

                <div className="flex flex-wrap gap-1.5 ml-1">
                  {filterDept !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#1B4D3E]/10 text-[#1B4D3E] rounded-full text-xs font-medium">
                      {departments.find(d => d.id === filterDept)?.name || 'Phòng ban'}
                      <button onClick={() => setFilterDept('all')} className="hover:text-red-600">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {filterStatus !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                      {filterStatus === 'planning' ? 'Lập kế hoạch' :
                       filterStatus === 'approved' ? 'Đã duyệt' :
                       filterStatus === 'in_progress' ? 'Đang thực hiện' :
                       filterStatus === 'on_hold' ? 'Tạm dừng' :
                       filterStatus === 'completed' ? 'Hoàn thành' : filterStatus}
                      <button onClick={() => setFilterStatus('all')} className="hover:text-red-600">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {filterPriority !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full text-xs font-medium">
                      {filterPriority === 'critical' ? 'Khẩn cấp' :
                       filterPriority === 'high' ? 'Cao' :
                       filterPriority === 'medium' ? 'Trung bình' :
                       filterPriority === 'low' ? 'Thấp' : filterPriority}
                      <button onClick={() => setFilterPriority('all')} className="hover:text-red-600">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>
              </>
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
          <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">
            {error}
            <button onClick={handleRefresh} className="ml-3 underline hover:no-underline">
              Thử lại
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <LayoutGrid className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-2">
              {activeFilterCount > 0
                ? 'Không có dự án nào phù hợp bộ lọc'
                : 'Chưa có dự án nào'}
            </p>
            {activeFilterCount > 0 && (
              <button
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1 text-sm text-[#1B4D3E] hover:underline"
              >
                <X className="w-4 h-4" /> Xóa bộ lọc
              </button>
            )}
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