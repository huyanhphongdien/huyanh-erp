// ============================================================================
// FILE: src/pages/projects/ProjectGanttPage.tsx
// MODULE: Quản lý Dự án (Project Management) — Huy Anh Rubber ERP
// PHASE: PM4 — Bước 4.4
// MÔ TẢ: Full-page Gantt cho 1 dự án — toolbar, filter, auto-schedule,
//         selected item sidebar, baseline, export PNG
// DESIGN: Industrial Rubber Theme, mobile-first
// ============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Play,
  Download,
  Save,
  GitCompareArrows,
  RefreshCw,
  Filter,
  X,
  User,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Info,
} from 'lucide-react'
import GanttChart from '../../components/project/GanttChart'
import type { ZoomLevel } from '../../components/project/GanttChart'
import { ganttService } from '../../services/project/ganttService'
import type { GanttData, GanttItem, BaselineVariance } from '../../services/project/ganttService'

// ============================================================================
// TYPES
// ============================================================================

interface ProjectHeader {
  id: string
  code: string
  name: string
  status: string
  progress_pct: number
}

// ============================================================================
// COMPONENT
// ============================================================================

const ProjectGanttPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // State
  const [ganttData, setGanttData] = useState<GanttData | null>(null)
  const [project, setProject] = useState<ProjectHeader | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedItem, setSelectedItem] = useState<GanttItem | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filterPhase, setFilterPhase] = useState<string>('all')
  const [filterAssignee, setFilterAssignee] = useState<string>('all')

  const [scheduling, setScheduling] = useState(false)
  const [savingBaseline, setSavingBaseline] = useState(false)
  const [baselineVariances, setBaselineVariances] = useState<BaselineVariance[] | null>(null)
  const [showBaseline, setShowBaseline] = useState(false)

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // ---- Load data ----

  const loadData = useCallback(async () => {
    if (!projectId) return
    try {
      setLoading(true)
      setError(null)
      const data = await ganttService.getGanttData(projectId)
      setGanttData(data)

      // Extract project header from items hoặc query riêng
      const projectItem = data.items.find((i) => i.type === 'project')
      if (projectItem) {
        setProject({
          id: projectId,
          code: projectItem.name.split(' — ')[0] || '',
          name: projectItem.name.split(' — ')[1] || projectItem.name,
          status: projectItem.status || 'in_progress',
          progress_pct: projectItem.progress,
        })
      }
    } catch (err) {
      console.error('[ProjectGanttPage] Load error:', err)
      setError('Không thể tải dữ liệu Gantt')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ---- Handlers ----

  const handleAutoSchedule = async () => {
    if (!projectId) return
    try {
      setScheduling(true)
      const result = await ganttService.autoSchedule(projectId)
      showToast(`Auto-schedule: ${result.updated_count} items đã cập nhật`, 'success')
      await loadData()
    } catch (err) {
      console.error('[ProjectGanttPage] Auto-schedule error:', err)
      showToast('Lỗi auto-schedule', 'error')
    } finally {
      setScheduling(false)
    }
  }

  const handleSaveBaseline = async () => {
    if (!projectId) return
    try {
      setSavingBaseline(true)
      const result = await ganttService.saveBaseline(projectId)
      showToast(`Baseline saved: ${result.item_count} items (${result.snapshot_date})`, 'success')
    } catch (err) {
      console.error('[ProjectGanttPage] Save baseline error:', err)
      showToast('Lỗi lưu baseline', 'error')
    } finally {
      setSavingBaseline(false)
    }
  }

  const handleCompareBaseline = async () => {
    if (!projectId) return
    try {
      const variances = await ganttService.compareBaseline(projectId)
      setBaselineVariances(variances)
      setShowBaseline(true)
    } catch (err) {
      console.error('[ProjectGanttPage] Compare baseline error:', err)
      showToast('Không tìm thấy baseline để so sánh', 'error')
    }
  }

  const handleExportPNG = () => {
    // Dùng html2canvas hoặc tương tự (placeholder)
    showToast('Export PNG — tính năng sẽ được bổ sung', 'success')
  }

  const handleItemClick = (item: GanttItem) => {
    setSelectedItem(item)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ---- Filter gantt data ----

  const filteredData = React.useMemo((): GanttData | null => {
    if (!ganttData) return null
    if (filterPhase === 'all' && filterAssignee === 'all') return ganttData

    let items = [...ganttData.items]

    if (filterPhase !== 'all') {
      items = items.filter(
        (i) => i.id === filterPhase || i.parent_id === filterPhase || i.type === 'phase'
      )
    }

    if (filterAssignee !== 'all') {
      items = items.filter(
        (i) => i.assignee_id === filterAssignee || i.type === 'phase'
      )
    }

    return { ...ganttData, items }
  }, [ganttData, filterPhase, filterAssignee])

  // ---- Extract filter options ----

  const phases = ganttData?.items.filter((i) => i.type === 'phase') || []
  const assignees = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const item of ganttData?.items || []) {
      if (item.assignee_id && item.assignee_name) {
        map.set(item.assignee_id, item.assignee_name)
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [ganttData])

  // ---- Render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#1B4D3E]" />
      </div>
    )
  }

  if (error || !filteredData) {
    return (
      <div className="p-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 mb-4">
          <ArrowLeft className="w-5 h-5" /> Quay lại
        </button>
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">
          {error || 'Không có dữ liệu'}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-screen bg-gray-50">

      {/* ===== HEADER ===== */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 md:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                Gantt Chart {project?.code && `— ${project.code}`}
              </h1>
              <p className="text-sm text-gray-500">{project?.name}</p>
            </div>
          </div>

          {/* Desktop actions */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
                showFilters ? 'bg-[#1B4D3E] text-white border-[#1B4D3E]' : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" /> Lọc
            </button>

            <button
              onClick={handleAutoSchedule}
              disabled={scheduling}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Auto-schedule
            </button>

            <button
              onClick={handleSaveBaseline}
              disabled={savingBaseline}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {savingBaseline ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Lưu Baseline
            </button>

            <button
              onClick={handleCompareBaseline}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <GitCompareArrows className="w-4 h-4" /> So sánh Baseline
            </button>

            <button
              onClick={handleExportPNG}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" /> Export
            </button>

            <button
              onClick={loadData}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
              title="Tải lại"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter bar */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Phase:</label>
              <select
                value={filterPhase}
                onChange={(e) => setFilterPhase(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
              >
                <option value="all">Tất cả</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Người thực hiện:</label>
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-[#1B4D3E] focus:border-transparent"
              >
                <option value="all">Tất cả</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            {(filterPhase !== 'all' || filterAssignee !== 'all') && (
              <button
                onClick={() => { setFilterPhase('all'); setFilterAssignee('all') }}
                className="text-xs text-red-600 hover:underline"
              >
                Xóa bộ lọc
              </button>
            )}
          </div>
        )}
      </div>

      {/* ===== MAIN: Gantt + Sidebar ===== */}
      <div className="flex flex-1 overflow-hidden">

        {/* Gantt chart */}
        <div className="flex-1 p-4 overflow-hidden">
          <GanttChart
            data={filteredData}
            showCriticalPath={true}
            onItemClick={handleItemClick}
            className="h-full"
          />
        </div>

        {/* ===== SIDEBAR — Selected item details ===== */}
        {selectedItem && (
          <div className="hidden md:block w-80 bg-white border-l border-gray-200 overflow-y-auto">
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 text-sm">Chi tiết</h3>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-1 rounded-md hover:bg-gray-100"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Type badge */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                  selectedItem.type === 'phase'
                    ? 'bg-emerald-100 text-emerald-700'
                    : selectedItem.type === 'milestone'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {selectedItem.type === 'phase' ? 'Phase' : selectedItem.type === 'milestone' ? 'Milestone' : 'Task'}
                </span>
                {selectedItem.is_critical && (
                  <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-red-100 text-red-700">
                    Critical Path
                  </span>
                )}
              </div>

              {/* Name */}
              <h4 className="font-medium text-gray-900 mb-4">{selectedItem.name}</h4>

              {/* Fields */}
              <div className="space-y-3">
                <DetailRow
                  icon={<Calendar className="w-4 h-4" />}
                  label="Bắt đầu"
                  value={selectedItem.start || '—'}
                />
                <DetailRow
                  icon={<Calendar className="w-4 h-4" />}
                  label="Kết thúc"
                  value={selectedItem.end || '—'}
                />
                <DetailRow
                  icon={<Clock className="w-4 h-4" />}
                  label="Thời gian"
                  value={`${selectedItem.duration_days} ngày`}
                />
                {selectedItem.assignee_name && (
                  <DetailRow
                    icon={<User className="w-4 h-4" />}
                    label="Người thực hiện"
                    value={selectedItem.assignee_name}
                  />
                )}

                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Tiến độ</span>
                    <span className="text-xs font-semibold text-gray-700">{selectedItem.progress}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${selectedItem.progress}%`,
                        backgroundColor: selectedItem.progress >= 100 ? '#16A34A' : '#1B4D3E',
                      }}
                    />
                  </div>
                </div>

                {/* Dependencies */}
                {selectedItem.dependencies.length > 0 && (
                  <div>
                    <span className="text-xs text-gray-500 block mb-1">Phụ thuộc ({selectedItem.dependencies.length})</span>
                    <div className="space-y-1">
                      {selectedItem.dependencies.map((depId) => {
                        const depItem = ganttData?.items.find((i) => i.id === depId)
                        return (
                          <div
                            key={depId}
                            className="text-xs bg-gray-50 px-2 py-1 rounded cursor-pointer hover:bg-gray-100"
                            onClick={() => depItem && handleItemClick(depItem)}
                          >
                            → {depItem?.name || depId.slice(0, 8)}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Scheduling info */}
                {selectedItem.total_float !== undefined && (
                  <DetailRow
                    icon={<Info className="w-4 h-4" />}
                    label="Float"
                    value={`${selectedItem.total_float} ngày`}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== BASELINE COMPARISON MODAL ===== */}
      {showBaseline && baselineVariances && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-semibold text-gray-900">So sánh Baseline vs Thực tế</h3>
              <button onClick={() => setShowBaseline(false)} className="p-1 rounded-md hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto p-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase border-b">
                    <th className="pb-2 pr-3">Tên</th>
                    <th className="pb-2 pr-3">Loại</th>
                    <th className="pb-2 pr-3 text-center">Variance Start</th>
                    <th className="pb-2 pr-3 text-center">Variance End</th>
                    <th className="pb-2 text-center">Δ Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {baselineVariances.map((v) => (
                    <tr key={v.item_id} className="border-b border-gray-50">
                      <td className="py-2 pr-3 font-medium text-gray-800">{v.name}</td>
                      <td className="py-2 pr-3">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100">{v.type}</span>
                      </td>
                      <td className="py-2 pr-3 text-center">
                        <VarianceBadge days={v.start_variance_days} />
                      </td>
                      <td className="py-2 pr-3 text-center">
                        <VarianceBadge days={v.end_variance_days} />
                      </td>
                      <td className="py-2 text-center text-xs">
                        {v.progress_actual - v.progress_baseline > 0 ? '+' : ''}
                        {v.progress_actual - v.progress_baseline}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {baselineVariances.length === 0 && (
                <p className="text-center text-gray-400 py-8">Không có dữ liệu so sánh</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== MOBILE BOTTOM ACTIONS ===== */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 flex items-center gap-2 safe-area-pb">
        <button
          onClick={handleAutoSchedule}
          disabled={scheduling}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium rounded-lg bg-[#1B4D3E] text-white disabled:opacity-50"
        >
          {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Auto-schedule
        </button>
        <button
          onClick={handleSaveBaseline}
          disabled={savingBaseline}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium rounded-lg border border-gray-300"
        >
          <Save className="w-4 h-4" /> Baseline
        </button>
      </div>

      {/* ===== TOAST ===== */}
      {toast && (
        <div className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium z-50 ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const DetailRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon, label, value,
}) => (
  <div className="flex items-center gap-3">
    <span className="text-gray-400">{icon}</span>
    <div className="flex-1">
      <span className="text-xs text-gray-500 block">{label}</span>
      <span className="text-sm text-gray-800 font-mono">{value}</span>
    </div>
  </div>
)

const VarianceBadge: React.FC<{ days: number }> = ({ days }) => {
  if (days === 0) return <span className="text-xs text-gray-400">—</span>

  const isLate = days > 0
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
      isLate ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
    }`}>
      {isLate ? '+' : ''}{days}d
    </span>
  )
}

export default ProjectGanttPage