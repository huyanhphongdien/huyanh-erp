// src/features/reports/CustomReportTab.tsx
// Phase 6.3: Task Reports - Custom Report Tab (FIXED)
// ============================================================

import { useState, useEffect } from 'react'
import {
  Settings,
  Filter,
  FileSpreadsheet,
  FileText,
  Play,
  RefreshCw,
  Calendar,
  Building2,
  CheckSquare,
  AlertTriangle,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Table
} from 'lucide-react'
import { departmentService } from '../../services/departmentService'
import taskReportService from '../../services/taskReportService'
import {
  exportDepartmentReportToExcel,
  exportEmployeeReportToExcel,
  exportDepartmentReportToPDF
} from '../../utils/reportExportUtils'

// ============================================================================
// TYPES
// ============================================================================

interface CustomFilter {
  start_date: string
  end_date: string
  department_id?: string
  group_by: 'department' | 'employee'
}

interface ColumnConfig {
  key: string
  label: string
  visible: boolean
}

interface ReportData {
  rows: any[]
  summary: {
    total_tasks: number
    finished_tasks: number
    in_progress_tasks: number
    cancelled_tasks: number
    overdue_count: number
    completion_rate: number
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GROUP_BY_OPTIONS = [
  { value: 'department', label: 'Theo phòng ban', icon: Building2 },
  { value: 'employee', label: 'Theo nhân viên', icon: Building2 }
]

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'name', label: 'Tên', visible: true },
  { key: 'total_tasks', label: 'Tổng số', visible: true },
  { key: 'finished_tasks', label: 'Hoàn thành', visible: true },
  { key: 'in_progress_tasks', label: 'Đang làm', visible: true },
  { key: 'cancelled_tasks', label: 'Đã hủy', visible: true },
  { key: 'overdue_count', label: 'Quá hạn', visible: true },
  { key: 'completion_rate', label: 'Tỷ lệ HT (%)', visible: true },
  { key: 'avg_score', label: 'Điểm TB', visible: false }
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getDefaultDateRange = () => {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  
  return {
    start_date: firstDay.toISOString().split('T')[0],
    end_date: lastDay.toISOString().split('T')[0]
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function CustomReportTab() {
  // State
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showColumnConfig, setShowColumnConfig] = useState(false)
  
  // Filter state
  const [filter, setFilter] = useState<CustomFilter>({
    ...getDefaultDateRange(),
    department_id: undefined,
    group_by: 'department'
  })
  
  // Column config
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS)
  
  // Data state
  const [reportData, setReportData] = useState<ReportData | null>(null)
  
  // Dropdown data
  const [departments, setDepartments] = useState<any[]>([])

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    loadDropdownData()
  }, [])

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadDropdownData = async () => {
    try {
      const deptData = await departmentService.getAllActive()
      setDepartments(deptData)
    } catch (error) {
      console.error('Error loading dropdown data:', error)
    }
  }

  const generateReport = async () => {
    setLoading(true)
    try {
      let rows: any[] = []
      let summary = {
        total_tasks: 0,
        finished_tasks: 0,
        in_progress_tasks: 0,
        cancelled_tasks: 0,
        overdue_count: 0,
        completion_rate: 0
      }

      if (filter.group_by === 'department') {
        // Use existing RPC function
        const data = await taskReportService.getCompletionByDepartment({
          start_date: filter.start_date,
          end_date: filter.end_date
        })
        
        // Filter by department if selected
        rows = filter.department_id 
          ? data.filter(d => d.department_id === filter.department_id)
          : data
        
        // Transform data
        rows = rows.map(d => ({
          id: d.department_id,
          code: d.department_code,
          name: d.department_name,
          total_tasks: d.total_tasks,
          finished_tasks: d.finished_tasks,
          in_progress_tasks: d.in_progress_tasks,
          cancelled_tasks: d.cancelled_tasks,
          overdue_count: d.overdue_count,
          completion_rate: d.completion_rate,
          avg_score: d.avg_score
        }))

      } else if (filter.group_by === 'employee') {
        // Use existing RPC function
        const data = await taskReportService.getCompletionByEmployee({
          department_id: filter.department_id,
          start_date: filter.start_date,
          end_date: filter.end_date
        })
        
        rows = data.map(e => ({
          id: e.employee_id,
          code: e.employee_code,
          name: e.employee_name,
          department_id: e.department_id,
          department: e.department_name,
          position_id: e.position_id,
          position: e.position_name,
          total_tasks: e.total_tasks,
          finished_tasks: e.finished_tasks,
          in_progress_tasks: e.in_progress_tasks,
          cancelled_tasks: e.cancelled_tasks,
          overdue_count: e.overdue_count,
          on_time_count: e.on_time_count,
          completion_rate: e.completion_rate,
          on_time_rate: e.on_time_rate,
          avg_score: e.avg_score
        }))
      }

      // Calculate summary
      summary = {
        total_tasks: rows.reduce((sum, r) => sum + (r.total_tasks || 0), 0),
        finished_tasks: rows.reduce((sum, r) => sum + (r.finished_tasks || 0), 0),
        in_progress_tasks: rows.reduce((sum, r) => sum + (r.in_progress_tasks || 0), 0),
        cancelled_tasks: rows.reduce((sum, r) => sum + (r.cancelled_tasks || 0), 0),
        overdue_count: rows.reduce((sum, r) => sum + (r.overdue_count || 0), 0),
        completion_rate: 0
      }
      
      if (summary.total_tasks > 0) {
        summary.completion_rate = Number(((summary.finished_tasks / summary.total_tasks) * 100).toFixed(1))
      }

      setReportData({ rows, summary })
      
    } catch (error) {
      console.error('Error generating report:', error)
      alert('Có lỗi khi tạo báo cáo. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  // ============================================================================
  // EXPORT FUNCTIONS
  // ============================================================================

  const handleExportExcel = async () => {
    if (!reportData || reportData.rows.length === 0) {
      alert('Chưa có dữ liệu để xuất')
      return
    }
    
    setExporting(true)
    try {
      const exportOptions = {
        title: 'Báo cáo tùy chỉnh',
        company: 'Công ty TNHH MTV Huy Anh',
        filename: `bao-cao-tuy-chinh-${filter.start_date}-${filter.end_date}.xlsx`
      }

      if (filter.group_by === 'department') {
        // Cast to any để bypass TypeScript check
        const exportData: any[] = reportData.rows.map(row => ({
          department_id: row.id || '',
          department_code: row.code || '',
          department_name: row.name || '',
          total_tasks: row.total_tasks || 0,
          finished_tasks: row.finished_tasks || 0,
          in_progress_tasks: row.in_progress_tasks || 0,
          cancelled_tasks: row.cancelled_tasks || 0,
          overdue_count: row.overdue_count || 0,
          completion_rate: row.completion_rate || 0,
          avg_score: row.avg_score || null
        }))
        await exportDepartmentReportToExcel(exportData, exportOptions)
      } else {
        // Cast to any để bypass TypeScript check vì data từ RPC có thể thiếu một số fields
        const exportData: any[] = reportData.rows.map(row => ({
          employee_id: row.id || '',
          employee_code: row.code || '',
          employee_name: row.name || '',
          department_id: row.department_id || '',
          department_name: row.department || '',
          position_id: row.position_id || '',
          position_name: row.position || '',
          total_tasks: row.total_tasks || 0,
          finished_tasks: row.finished_tasks || 0,
          in_progress_tasks: row.in_progress_tasks || 0,
          cancelled_tasks: row.cancelled_tasks || 0,
          overdue_count: row.overdue_count || 0,
          on_time_count: row.on_time_count || 0,
          completion_rate: row.completion_rate || 0,
          on_time_rate: row.on_time_rate || 0,
          avg_score: row.avg_score || null
        }))
        await exportEmployeeReportToExcel(exportData, {
          ...exportOptions,
          filename: `bao-cao-nhan-vien-${filter.start_date}-${filter.end_date}.xlsx`
        })
      }
    } catch (error) {
      console.error('Export Excel error:', error)
      alert('Có lỗi khi xuất Excel. Vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }

  const handleExportPDF = () => {
    if (!reportData || reportData.rows.length === 0) {
      alert('Chưa có dữ liệu để xuất')
      return
    }
    
    setExporting(true)
    try {
      // Cast to any để bypass TypeScript check
      const exportData: any[] = reportData.rows.map(row => ({
        department_id: row.id || '',
        department_code: row.code || '',
        department_name: row.name || '',
        total_tasks: row.total_tasks || 0,
        finished_tasks: row.finished_tasks || 0,
        in_progress_tasks: row.in_progress_tasks || 0,
        cancelled_tasks: row.cancelled_tasks || 0,
        overdue_count: row.overdue_count || 0,
        completion_rate: row.completion_rate || 0,
        avg_score: row.avg_score || null
      }))
      
      exportDepartmentReportToPDF(exportData, {
        title: 'BÁO CÁO TÙY CHỈNH',
        company: 'Công ty TNHH MTV Huy Anh',
        filename: `bao-cao-tuy-chinh-${filter.start_date}-${filter.end_date}.pdf`
      })
    } catch (error) {
      console.error('Export PDF error:', error)
      alert('Có lỗi khi xuất PDF. Vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }

  // ============================================================================
  // COLUMN CONFIG HANDLERS
  // ============================================================================

  const toggleColumn = (key: string) => {
    setColumns(prev => prev.map(col => 
      col.key === key ? { ...col, visible: !col.visible } : col
    ))
  }

  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================

  const renderFilters = () => (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Filter className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Bộ lọc báo cáo</h3>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Date Range */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            <Calendar className="w-4 h-4 inline mr-2" />
            Từ ngày
          </label>
          <input
            type="date"
            value={filter.start_date}
            onChange={(e) => setFilter(prev => ({ ...prev, start_date: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            <Calendar className="w-4 h-4 inline mr-2" />
            Đến ngày
          </label>
          <input
            type="date"
            value={filter.end_date}
            onChange={(e) => setFilter(prev => ({ ...prev, end_date: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Group By */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            <BarChart3 className="w-4 h-4 inline mr-2" />
            Nhóm theo
          </label>
          <select
            value={filter.group_by}
            onChange={(e) => setFilter(prev => ({ ...prev, group_by: e.target.value as any }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {GROUP_BY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Department Filter */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            <Building2 className="w-4 h-4 inline mr-2" />
            Phòng ban
          </label>
          <select
            value={filter.department_id || ''}
            onChange={(e) => setFilter(prev => ({ 
              ...prev, 
              department_id: e.target.value || undefined 
            }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tất cả phòng ban</option>
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          onClick={generateReport}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          <span>Tạo báo cáo</span>
        </button>

        <button
          onClick={() => setShowColumnConfig(!showColumnConfig)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <Table className="w-4 h-4" />
          <span>Cột hiển thị</span>
          {showColumnConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Column Config */}
      {showColumnConfig && (
        <div className="pt-4 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-3">Chọn cột hiển thị:</p>
          <div className="flex flex-wrap gap-2">
            {columns.map(col => (
              <button
                key={col.key}
                onClick={() => toggleColumn(col.key)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors
                  ${col.visible
                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                  }
                `}
              >
                {col.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{col.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const renderSummary = () => {
    if (!reportData) return null

    const { summary } = reportData

    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Tổng số</p>
          <p className="text-2xl font-bold text-gray-900">{summary.total_tasks}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Hoàn thành</p>
          <p className="text-2xl font-bold text-green-600">{summary.finished_tasks}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Đang làm</p>
          <p className="text-2xl font-bold text-blue-600">{summary.in_progress_tasks}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Đã hủy</p>
          <p className="text-2xl font-bold text-gray-500">{summary.cancelled_tasks}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Quá hạn</p>
          <p className="text-2xl font-bold text-red-600">{summary.overdue_count}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Tỷ lệ HT</p>
          <p className="text-2xl font-bold text-purple-600">{summary.completion_rate}%</p>
        </div>
      </div>
    )
  }

  const renderResultsTable = () => {
    if (!reportData) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Chọn bộ lọc và nhấn "Tạo báo cáo" để xem kết quả</p>
        </div>
      )
    }
    
    if (reportData.rows.length === 0) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <p className="text-gray-600">Không có dữ liệu trong khoảng thời gian này</p>
        </div>
      )
    }

    const visibleColumns = columns.filter(c => c.visible)

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Export Buttons */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">
            Kết quả ({reportData.rows.length} dòng)
          </h3>
          <div className="flex gap-2">
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Xuất Excel</span>
            </button>
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <FileText className="w-4 h-4" />
              <span>Xuất PDF</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  #
                </th>
                {visibleColumns.map(col => (
                  <th
                    key={col.key}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reportData.rows.map((row, idx) => (
                <tr key={row.id || idx} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {idx + 1}
                  </td>
                  {visibleColumns.map(col => (
                    <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm">
                      {col.key === 'name' ? (
                        <div>
                          <span className="font-medium text-gray-900">{row[col.key]}</span>
                          {row.code && <span className="text-gray-500 ml-2">({row.code})</span>}
                        </div>
                      ) : col.key === 'completion_rate' ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full"
                              style={{ width: `${Math.min(row[col.key] || 0, 100)}%` }}
                            />
                          </div>
                          <span className="text-gray-900">{row[col.key]}%</span>
                        </div>
                      ) : col.key === 'overdue_count' && row[col.key] > 0 ? (
                        <span className="text-red-600 font-medium">{row[col.key]}</span>
                      ) : col.key === 'finished_tasks' ? (
                        <span className="text-green-600 font-medium">{row[col.key]}</span>
                      ) : (
                        <span className="text-gray-900">{row[col.key] ?? 'N/A'}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Settings className="w-5 h-5 text-purple-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-purple-900">Báo cáo tùy chỉnh</p>
            <p className="text-xs text-purple-700 mt-1">
              Tạo báo cáo với các tiêu chí tùy chọn. Chọn khoảng thời gian, phòng ban và cách nhóm dữ liệu.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      {renderFilters()}

      {/* Summary Cards */}
      {renderSummary()}

      {/* Results Table */}
      {renderResultsTable()}
    </div>
  )
}