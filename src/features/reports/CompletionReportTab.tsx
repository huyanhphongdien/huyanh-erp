// src/features/reports/CompletionReportTab.tsx
// Phase 6.3: Completion Report Tab - WITH EXPORT FUNCTIONS
// ============================================================

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts'
import {
  Building2,
  Briefcase,
  Users,
  Calendar,
  TrendingUp,
  Download,
  FileSpreadsheet,
  FileText,
  ChevronDown
} from 'lucide-react'
import taskReportService from '../../services/taskAnalyticsService'
import type {
  CompletionByDepartment,
  CompletionByPosition,
  CompletionByEmployee
} from '../../services/taskAnalyticsService'
import {
  exportDepartmentReportToExcel,
  exportEmployeeReportToExcel,
  exportDepartmentReportToPDF
} from '../../utils/reportExportUtils'

// ============================================================================
// TYPES
// ============================================================================

type ViewMode = 'department' | 'position' | 'employee' | 'timeline'

interface DateRange {
  start_date: string
  end_date: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6']

const VIEW_MODES = [
  { key: 'department' as ViewMode, label: 'Theo phòng ban', icon: Building2 },
  { key: 'position' as ViewMode, label: 'Theo chức vụ', icon: Briefcase },
  { key: 'employee' as ViewMode, label: 'Theo nhân viên', icon: Users },
  { key: 'timeline' as ViewMode, label: 'Theo thời gian', icon: Calendar }
]

// ============================================================================
// COMPONENT
// ============================================================================

export default function CompletionReportTab() {
  const [viewMode, setViewMode] = useState<ViewMode>('department')
  const [dateRange, setDateRange] = useState<DateRange>({
    start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0]
  })
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exporting, setExporting] = useState(false)

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const { data: departmentData, isLoading: loadingDept } = useQuery({
    queryKey: ['completion-by-department', dateRange],
    queryFn: () => taskReportService.getCompletionByDepartment(dateRange),
    enabled: viewMode === 'department'
  })

  const { data: positionData, isLoading: loadingPos } = useQuery({
    queryKey: ['completion-by-position', dateRange],
    queryFn: () => taskReportService.getCompletionByPosition(dateRange),
    enabled: viewMode === 'position'
  })

  const { data: employeeData, isLoading: loadingEmp } = useQuery({
    queryKey: ['completion-by-employee', dateRange],
    queryFn: () => taskReportService.getCompletionByEmployee(dateRange),
    enabled: viewMode === 'employee'
  })

  const { data: timelineData, isLoading: loadingTime } = useQuery({
    queryKey: ['completion-timeline', dateRange],
    queryFn: () => taskReportService.getTimeSeriesData({
      start_date: dateRange.start_date,
      end_date: dateRange.end_date
    }),
    enabled: viewMode === 'timeline'
  })

  // ============================================================================
  // EXPORT FUNCTIONS
  // ============================================================================

  const handleExportExcel = async () => {
    setExporting(true)
    setShowExportMenu(false)
    
    try {
      const exportOptions = {
        title: 'Báo cáo hoàn thành công việc',
        company: 'Công ty TNHH MTV Huy Anh'
      }

      switch (viewMode) {
        case 'department':
          if (departmentData) {
            await exportDepartmentReportToExcel(departmentData, {
              ...exportOptions,
              filename: `bao-cao-phong-ban-${dateRange.start_date}-${dateRange.end_date}.xlsx`
            })
          }
          break
        case 'employee':
          if (employeeData) {
            await exportEmployeeReportToExcel(employeeData, {
              ...exportOptions,
              filename: `bao-cao-nhan-vien-${dateRange.start_date}-${dateRange.end_date}.xlsx`
            })
          }
          break
        case 'position':
          // Transform position data to department format for export
          if (positionData) {
            const transformedData = positionData.map(p => ({
              department_id: p.position_id,
              department_code: p.position_code,
              department_name: p.position_name,
              total_tasks: p.total_tasks,
              finished_tasks: p.finished_tasks,
              in_progress_tasks: p.in_progress_tasks,
              cancelled_tasks: p.cancelled_tasks,
              completion_rate: p.completion_rate,
              avg_score: p.avg_score,
              overdue_count: p.overdue_count
            }))
            await exportDepartmentReportToExcel(transformedData, {
              ...exportOptions,
              filename: `bao-cao-chuc-vu-${dateRange.start_date}-${dateRange.end_date}.xlsx`
            })
          }
          break
        default:
          alert('Chế độ xem này chưa hỗ trợ xuất Excel')
      }
    } catch (error) {
      console.error('Export Excel error:', error)
      alert('Có lỗi khi xuất Excel. Vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }

  const handleExportPDF = () => {
    setExporting(true)
    setShowExportMenu(false)
    
    try {
      const exportOptions = {
        title: 'BÁO CÁO HOÀN THÀNH CÔNG VIỆC',
        company: 'Công ty TNHH MTV Huy Anh'
      }

      switch (viewMode) {
        case 'department':
          if (departmentData) {
            exportDepartmentReportToPDF(departmentData, {
              ...exportOptions,
              filename: `bao-cao-phong-ban-${dateRange.start_date}-${dateRange.end_date}.pdf`
            })
          }
          break
        case 'position':
          if (positionData) {
            const transformedData = positionData.map(p => ({
              department_id: p.position_id,
              department_code: p.position_code,
              department_name: p.position_name,
              total_tasks: p.total_tasks,
              finished_tasks: p.finished_tasks,
              in_progress_tasks: p.in_progress_tasks,
              cancelled_tasks: p.cancelled_tasks,
              completion_rate: p.completion_rate,
              avg_score: p.avg_score,
              overdue_count: p.overdue_count
            }))
            exportDepartmentReportToPDF(transformedData, {
              ...exportOptions,
              title: 'BÁO CÁO THEO CHỨC VỤ',
              filename: `bao-cao-chuc-vu-${dateRange.start_date}-${dateRange.end_date}.pdf`
            })
          }
          break
        default:
          alert('Chế độ xem này chưa hỗ trợ xuất PDF')
      }
    } catch (error) {
      console.error('Export PDF error:', error)
      alert('Có lỗi khi xuất PDF. Vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderDepartmentView = () => {
    if (loadingDept) return <LoadingSpinner />
    if (!departmentData || departmentData.length === 0) return <EmptyState />

    const chartData = departmentData.map(d => ({
      name: d.department_code,
      'Hoàn thành': d.finished_tasks,
      'Đang làm': d.in_progress_tasks,
      'Đã hủy': d.cancelled_tasks
    }))

    const pieData = departmentData.map(d => ({
      name: d.department_name,
      value: d.finished_tasks
    }))

    return (
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {departmentData.slice(0, 3).map((dept) => (
            <StatCard
              key={dept.department_id}
              title={dept.department_name}
              value={`${dept.completion_rate}%`}
              subtitle={`${dept.finished_tasks}/${dept.total_tasks} công việc`}
              color="blue"
            />
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart */}
          <ChartCard title="Thống kê theo phòng ban">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Hoàn thành" fill="#10b981" />
                <Bar dataKey="Đang làm" fill="#f59e0b" />
                <Bar dataKey="Đã hủy" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Pie Chart */}
          <ChartCard title="Tỷ lệ trạng thái">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Table */}
        <DepartmentTable data={departmentData} />
      </div>
    )
  }

  const renderPositionView = () => {
    if (loadingPos) return <LoadingSpinner />
    if (!positionData || positionData.length === 0) return <EmptyState />

    const chartData = positionData.map(p => ({
      name: p.position_name,
      'Hoàn thành': p.finished_tasks,
      'Đang làm': p.in_progress_tasks,
      rate: p.completion_rate
    }))

    return (
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {positionData.slice(0, 4).map((pos) => (
            <StatCard
              key={pos.position_id}
              title={pos.position_name}
              value={`${pos.completion_rate}%`}
              subtitle={`${pos.finished_tasks} công việc`}
              color="green"
            />
          ))}
        </div>

        {/* Chart */}
        <ChartCard title="Thống kê theo chức vụ">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} layout="horizontal">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={150} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Hoàn thành" fill="#10b981" />
              <Bar dataKey="Đang làm" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Table */}
        <PositionTable data={positionData} />
      </div>
    )
  }

  const renderEmployeeView = () => {
    if (loadingEmp) return <LoadingSpinner />
    if (!employeeData || employeeData.length === 0) return <EmptyState />

    return (
      <div className="space-y-6">
        {/* Top Performers */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {employeeData.slice(0, 3).map((emp, idx) => (
            <StatCard
              key={emp.employee_id}
              title={emp.employee_name}
              value={`${emp.completion_rate}%`}
              subtitle={`${emp.department_name} - ${emp.position_name}`}
              badge={idx === 0 ? '🏆 Top 1' : idx === 1 ? '🥈 Top 2' : '🥉 Top 3'}
              color={idx === 0 ? 'yellow' : idx === 1 ? 'gray' : 'orange'}
            />
          ))}
        </div>

        {/* Table */}
        <EmployeeTable data={employeeData} />
      </div>
    )
  }

  const renderTimelineView = () => {
    if (loadingTime) return <LoadingSpinner />
    if (!timelineData || timelineData.length === 0) return <EmptyState />

    const chartData = timelineData.map(t => ({
      date: t.period_label,
      'Tổng số': t.total_tasks,
      'Hoàn thành': t.finished_tasks,
      'Đang làm': t.in_progress_tasks,
      'Tỷ lệ': t.completion_rate
    }))

    return (
      <div className="space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            title="Tổng công việc"
            value={timelineData.reduce((sum, t) => sum + t.total_tasks, 0).toString()}
            color="blue"
          />
          <StatCard
            title="Đã hoàn thành"
            value={timelineData.reduce((sum, t) => sum + t.finished_tasks, 0).toString()}
            color="green"
          />
          <StatCard
            title="Đang làm"
            value={timelineData.reduce((sum, t) => sum + t.in_progress_tasks, 0).toString()}
            color="yellow"
          />
          <StatCard
            title="Trung bình"
            value={`${(timelineData.reduce((sum, t) => sum + t.completion_rate, 0) / timelineData.length).toFixed(1)}%`}
            color="purple"
          />
        </div>

        {/* Line Chart */}
        <ChartCard title="Biểu đồ theo thời gian">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Tổng số" stroke="#3b82f6" strokeWidth={2} />
              <Line type="monotone" dataKey="Hoàn thành" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="Đang làm" stroke="#f59e0b" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    )
  }

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  return (
    <div className="space-y-6">
      {/* View Mode Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {VIEW_MODES.map((mode) => {
          const Icon = mode.icon
          const isActive = viewMode === mode.key
          return (
            <button
              key={mode.key}
              onClick={() => setViewMode(mode.key)}
              className={`
                flex items-center gap-2 px-4 py-2.5 rounded-lg
                font-medium text-sm whitespace-nowrap transition-all
                ${isActive
                  ? 'bg-blue-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }
              `}
            >
              <Icon className="w-4 h-4" />
              <span>{mode.label}</span>
            </button>
          )
        })}
      </div>

      {/* Date Range Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Khoảng thời gian:</span>
          </div>
          <input
            type="date"
            value={dateRange.start_date}
            onChange={(e) => setDateRange(prev => ({ ...prev, start_date: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <span className="text-gray-500">đến</span>
          <input
            type="date"
            value={dateRange.end_date}
            onChange={(e) => setDateRange(prev => ({ ...prev, end_date: e.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          
          {/* Export Dropdown */}
          <div className="ml-auto relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Xuất báo cáo</span>
              <ChevronDown className="w-4 h-4" />
            </button>
            
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                <button
                  onClick={handleExportExcel}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  <span>Xuất Excel (.xlsx)</span>
                </button>
                <button
                  onClick={handleExportPDF}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <FileText className="w-4 h-4 text-red-600" />
                  <span>Xuất PDF (.pdf)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'department' && renderDepartmentView()}
      {viewMode === 'position' && renderPositionView()}
      {viewMode === 'employee' && renderEmployeeView()}
      {viewMode === 'timeline' && renderTimelineView()}
    </div>
  )
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  badge?: string
  color?: 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'gray'
}

function StatCard({ title, value, subtitle, badge, color = 'blue' }: StatCardProps) {
  const colors: Record<StatCardProps['color'] & string, string> = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    yellow: 'from-yellow-500 to-yellow-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    gray: 'from-gray-500 to-gray-600'
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      {badge && (
        <div className="text-xs font-medium text-blue-600 mb-2">{badge}</div>
      )}
      <div className="text-sm text-gray-600 mb-1">{title}</div>
      <div className={`text-2xl font-bold bg-gradient-to-r ${colors[color]} bg-clip-text text-transparent`}>
        {value}
      </div>
      {subtitle && (
        <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
      )}
    </div>
  )
}

interface ChartCardProps {
  title: string
  children: React.ReactNode
}

function ChartCard({ title, children }: ChartCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  )
}

interface DepartmentTableProps {
  data: CompletionByDepartment[]
}

function DepartmentTable({ data }: DepartmentTableProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phòng ban</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tổng số</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hoàn thành</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Đang làm</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Quá hạn</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tỷ lệ HT</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Điểm TB</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((dept) => (
            <tr key={dept.department_id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Building2 className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900">{dept.department_name}</div>
                    <div className="text-xs text-gray-500">{dept.department_code}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-center text-sm text-gray-900">{dept.total_tasks}</td>
              <td className="px-4 py-3 text-center text-sm text-green-600 font-medium">{dept.finished_tasks}</td>
              <td className="px-4 py-3 text-center text-sm text-yellow-600">{dept.in_progress_tasks}</td>
              <td className="px-4 py-3 text-center text-sm text-red-600">{dept.overdue_count}</td>
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-24 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{ width: `${dept.completion_rate}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900">{dept.completion_rate}%</span>
                </div>
              </td>
              <td className="px-4 py-3 text-center text-sm text-gray-900">
                {dept.avg_score ? dept.avg_score.toFixed(1) : 'N/A'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface PositionTableProps {
  data: CompletionByPosition[]
}

function PositionTable({ data }: PositionTableProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chức vụ</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tổng số</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hoàn thành</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tỷ lệ HT</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((pos) => (
            <tr key={pos.position_id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{pos.position_name}</td>
              <td className="px-4 py-3 text-center text-sm">{pos.total_tasks}</td>
              <td className="px-4 py-3 text-center text-sm text-green-600">{pos.finished_tasks}</td>
              <td className="px-4 py-3 text-center text-sm font-medium">{pos.completion_rate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface EmployeeTableProps {
  data: CompletionByEmployee[]
}

function EmployeeTable({ data }: EmployeeTableProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nhân viên</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phòng ban</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hoàn thành</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Đúng hạn</th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tỷ lệ HT</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((emp) => (
            <tr key={emp.employee_id} className="hover:bg-gray-50">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">{emp.employee_name}</div>
                <div className="text-xs text-gray-500">{emp.employee_code}</div>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">{emp.department_name}</td>
              <td className="px-4 py-3 text-center text-sm">{emp.finished_tasks}/{emp.total_tasks}</td>
              <td className="px-4 py-3 text-center text-sm text-green-600">{emp.on_time_count}</td>
              <td className="px-4 py-3 text-center text-sm font-medium">{emp.completion_rate}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
      <TrendingUp className="w-16 h-16 mb-4 text-gray-400" />
      <p className="text-lg font-medium">Chưa có dữ liệu đánh giá</p>
      <p className="text-sm">Chọn khoảng thời gian khác để xem báo cáo</p>
    </div>
  )
}