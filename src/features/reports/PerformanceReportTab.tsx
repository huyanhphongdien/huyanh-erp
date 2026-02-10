// src/features/reports/PerformanceReportTab.tsx
// Phase 6.3: Task Reports - Performance Analysis Tab (FIXED ERROR HANDLING)
// ============================================================

import { useState, useEffect } from 'react'
import {
  TrendingUp,
  Trophy,
  AlertTriangle,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
  Calendar,
  Building2,
  Award,
  Clock,
  CheckCircle2,
  XCircle,
  Target
} from 'lucide-react'
import taskReportService from '../../services/taskReportService'
import type {
  PerformanceMetrics,
  TopPerformer,
  OverdueTask
} from '../../services/taskReportService'
import { departmentService } from '../../services/departmentService'

// ============================================================================
// TYPES
// ============================================================================

interface FilterState {
  start_date: string
  end_date: string
  department_id?: string
}

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

const getPresetDateRange = (preset: string) => {
  const now = new Date()
  let start_date: Date
  let end_date: Date = now

  switch (preset) {
    case 'this_month':
      start_date = new Date(now.getFullYear(), now.getMonth(), 1)
      end_date = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      break
    case 'last_month':
      start_date = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      end_date = new Date(now.getFullYear(), now.getMonth(), 0)
      break
    case 'this_quarter':
      const quarter = Math.floor(now.getMonth() / 3)
      start_date = new Date(now.getFullYear(), quarter * 3, 1)
      end_date = new Date(now.getFullYear(), quarter * 3 + 3, 0)
      break
    case 'this_year':
      start_date = new Date(now.getFullYear(), 0, 1)
      end_date = new Date(now.getFullYear(), 11, 31)
      break
    default:
      start_date = new Date(now.getFullYear(), now.getMonth(), 1)
      end_date = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  }

  return {
    start_date: start_date.toISOString().split('T')[0],
    end_date: end_date.toISOString().split('T')[0]
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PerformanceReportTab() {
  // State
  const [loading, setLoading] = useState(false)
  const [showFilters, setShowFilters] = useState(true)
  const [filter, setFilter] = useState<FilterState>(getDefaultDateRange())
  
  // Data state
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>([])
  const [overdueTasks, setOverdueTasks] = useState<OverdueTask[]>([])
  
  // Dropdown data
  const [departments, setDepartments] = useState<any[]>([])
  
  // Error state
  const [errors, setErrors] = useState<{metrics?: string; performers?: string; overdue?: string}>({})

  // ============================================================================
  // EFFECTS
  // ============================================================================

  useEffect(() => {
    loadDepartments()
    loadPerformanceData()
  }, [])

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  const loadDepartments = async () => {
    try {
      const data = await departmentService.getAllActive()
      setDepartments(data)
    } catch (error) {
      console.error('Error loading departments:', error)
    }
  }

  const loadPerformanceData = async () => {
    setLoading(true)
    setErrors({})
    
    // Load metrics
    try {
      const metricsData = await taskReportService.getPerformanceMetrics({
        department_id: filter.department_id,
        start_date: filter.start_date,
        end_date: filter.end_date
      })
      setMetrics(metricsData)
    } catch (error) {
      console.error('Error loading metrics:', error)
      setErrors(prev => ({ ...prev, metrics: 'Không thể tải dữ liệu metrics' }))
    }
    
    // Load top performers
    try {
      const performersData = await taskReportService.getTopPerformers({
        department_id: filter.department_id,
        start_date: filter.start_date,
        end_date: filter.end_date,
        limit: 10
      })
      setTopPerformers(performersData)
    } catch (error) {
      console.error('Error loading top performers:', error)
      setErrors(prev => ({ ...prev, performers: 'Không thể tải top performers' }))
    }
    
    // Load overdue tasks - handle error gracefully
    try {
      const overdueData = await taskReportService.getOverdueTasks({
        department_id: filter.department_id,
        start_date: filter.start_date,
        end_date: filter.end_date,
        limit: 20
      })
      setOverdueTasks(overdueData)
    } catch (error) {
      console.error('Error loading overdue tasks:', error)
      // Don't show error for overdue - it might not be critical
      setOverdueTasks([])
      setErrors(prev => ({ ...prev, overdue: 'Chức năng công việc quá hạn chưa khả dụng' }))
    }
    
    setLoading(false)
  }

  const handleRefresh = () => {
    loadPerformanceData()
  }

  const handlePresetClick = (preset: string) => {
    const range = getPresetDateRange(preset)
    setFilter(prev => ({ ...prev, ...range }))
  }

  // ============================================================================
  // RENDER FUNCTIONS
  // ============================================================================

  const renderFilters = () => (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Filter Header */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Filter className="w-5 h-5 text-blue-600" />
          <span className="font-medium text-gray-900">Bộ lọc</span>
        </div>
        {showFilters ? (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {/* Filter Content */}
      {showFilters && (
        <div className="p-4 pt-0 space-y-4 border-t border-gray-200">
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

            {/* Department */}
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
                <option value="">Tất cả</option>
                {departments.map(dept => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>

            {/* Preset Buttons */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Khoảng thời gian
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handlePresetClick('this_month')}
                  className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Tháng này
                </button>
                <button
                  onClick={() => handlePresetClick('last_month')}
                  className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Tháng trước
                </button>
                <button
                  onClick={() => handlePresetClick('this_quarter')}
                  className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Quý này
                </button>
                <button
                  onClick={() => handlePresetClick('this_year')}
                  className="px-3 py-2 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Năm nay
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span>Làm mới</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const renderMetricsCards = () => {
    if (errors.metrics) {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-yellow-800 text-sm">{errors.metrics}</p>
        </div>
      )
    }
    
    if (!metrics) {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      )
    }

    const cards = [
      {
        label: 'Tổng công việc',
        value: metrics.total_tasks,
        icon: Target,
        color: 'bg-blue-500',
        textColor: 'text-blue-600'
      },
      {
        label: 'Tỷ lệ hoàn thành',
        value: `${metrics.completion_rate}%`,
        icon: CheckCircle2,
        color: 'bg-green-500',
        textColor: 'text-green-600'
      },
      {
        label: 'Đúng hạn',
        value: `${metrics.on_time_rate}%`,
        icon: Clock,
        color: 'bg-purple-500',
        textColor: 'text-purple-600'
      },
      {
        label: 'Quá hạn',
        value: metrics.overdue_count,
        icon: XCircle,
        color: 'bg-red-500',
        textColor: 'text-red-600'
      }
    ]

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className={`p-2 rounded-lg ${card.color}`}>
                <card.icon className="w-5 h-5 text-white" />
              </div>
              <span className="text-sm text-gray-600">{card.label}</span>
            </div>
            <p className={`text-3xl font-bold ${card.textColor}`}>
              {card.value}
            </p>
          </div>
        ))}
      </div>
    )
  }

  const renderTopPerformers = () => {
    if (errors.performers) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900">Top Performers</h3>
          </div>
          <p className="text-yellow-600 text-sm">{errors.performers}</p>
        </div>
      )
    }
    
    if (topPerformers.length === 0) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900">Top Performers</h3>
          </div>
          <div className="text-center py-8">
            <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Chưa có dữ liệu đánh giá</p>
          </div>
        </div>
      )
    }

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h3 className="text-lg font-semibold text-gray-900">Top 10 Performers</h3>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hạng</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nhân viên</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phòng ban</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Hoàn thành</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tỷ lệ HT</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Đúng hạn</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {topPerformers.map((performer, idx) => (
                <tr key={performer.employee_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center justify-center">
                      {idx < 3 ? (
                        <Award className={`w-6 h-6 ${
                          idx === 0 ? 'text-yellow-500' :
                          idx === 1 ? 'text-gray-400' :
                          'text-orange-400'
                        }`} />
                      ) : (
                        <span className="text-gray-500 font-medium">{idx + 1}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <p className="font-medium text-gray-900">{performer.employee_name}</p>
                      <p className="text-xs text-gray-500">{performer.employee_code}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm text-gray-600">{performer.department_name}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="font-semibold text-green-600">{performer.finished_tasks}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${performer.completion_rate}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-900">{performer.completion_rate}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="text-sm text-purple-600">{performer.on_time_rate}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const renderOverdueTasks = () => {
    // If there's an error loading overdue tasks, show info message
    if (errors.overdue) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-semibold text-gray-900">Công việc quá hạn</h3>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800 text-sm">{errors.overdue}</p>
            <p className="text-yellow-600 text-xs mt-2">
              Vui lòng chạy SQL migration để kích hoạt tính năng này.
            </p>
          </div>
        </div>
      )
    }
    
    if (overdueTasks.length === 0) {
      return (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-semibold text-gray-900">Công việc quá hạn</h3>
          </div>
          <div className="text-center py-8">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
            <p className="text-gray-500">Không có công việc quá hạn</p>
          </div>
        </div>
      )
    }

    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-semibold text-gray-900">
              Công việc quá hạn ({overdueTasks.length})
            </h3>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-red-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-red-700 uppercase">Mã CV</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-red-700 uppercase">Công việc</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-red-700 uppercase">Nhân viên</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-red-700 uppercase">Phòng ban</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-red-700 uppercase">Hạn HT</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-red-700 uppercase">Quá hạn</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {overdueTasks.map((task) => (
                <tr key={task.task_id} className="hover:bg-red-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900">{task.task_code}</span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900 max-w-xs truncate">{task.task_name}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm text-gray-600">{task.assignee_name}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <p className="text-sm text-gray-600">{task.department_name}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="text-sm text-gray-600">
                      {new Date(task.due_date).toLocaleDateString('vi-VN')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs font-medium">
                      {task.days_overdue} ngày
                    </span>
                  </td>
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
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-indigo-600 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-indigo-900">Phân tích hiệu suất</p>
            <p className="text-xs text-indigo-700 mt-1">
              Đánh giá hiệu suất làm việc và top performers
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      {renderFilters()}

      {/* Metrics Cards */}
      {renderMetricsCards()}

      {/* Top Performers */}
      {renderTopPerformers()}

      {/* Overdue Tasks */}
      {renderOverdueTasks()}
    </div>
  )
}