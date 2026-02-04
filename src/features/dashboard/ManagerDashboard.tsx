// ============================================================================
// MANAGER DASHBOARD — RESPONSIVE + CHẤM CÔNG NHANH
// File: src/features/dashboard/ManagerDashboard.tsx
// Huy Anh ERP System - Dashboard cho Manager và Executive (Level 1-5)
// ============================================================================
// CHANGES:
// - Tích hợp CheckInOutWidget ngay trên dashboard
// - Tối ưu mobile: padding, font-size, grid, charts, touch targets
// - Header không sticky trên mobile
// - Stat cards: 2 cols mobile → 3 tablet → 5 desktop
// - Charts: chiều cao responsive, font nhỏ hơn trên mobile
// - Tất cả 2-col grids: stack trên mobile
// - Quick actions: 3 cols mobile → 6 desktop
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Clock,
  TrendingUp,
  Award,
  Building2,
  RefreshCw,
  ChevronRight,
  FileText,
  Activity,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  Briefcase,
  Timer,
  Target,
  BarChart3,
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from 'recharts'
import { useAuthStore } from '../../stores/authStore'
import {
  dashboardService,
  type DashboardStats,
  type TaskStatusDistribution,
  type TaskTrend,
  type DepartmentPerformance,
  type TopEmployee,
  type OverdueTask,
  type UpcomingTask,
  type RecentActivity,
  type ContractAlert,
} from '../../services/dashboardService'

// ★ Tích hợp chấm công nhanh
import { CheckInOutWidget } from '../attendance/CheckInOutWidget'

// ============================================================================
// TYPES
// ============================================================================

interface StatCardProps {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ReactNode
  trend?: { value: number; isPositive: boolean }
  color: 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'indigo'
  onClick?: () => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Thấp',
  medium: 'TB',
  high: 'Cao',
  urgent: 'Khẩn',
}

const ACTION_LABELS: Record<string, string> = {
  created: 'đã tạo công việc',
  updated: 'đã cập nhật',
  status_changed: 'đã đổi trạng thái',
  progress_updated: 'đã cập nhật tiến độ',
  assigned: 'đã giao việc',
  comment_added: 'đã bình luận',
  attachment_added: 'đã đính kèm file',
  self_eval_submitted: 'đã nộp tự đánh giá',
  approved: 'đã phê duyệt',
  rejected: 'đã từ chối',
}

// ============================================================================
// COMPONENTS — RESPONSIVE
// ============================================================================

function StatCard({ title, value, subtitle, icon, trend, color, onClick }: StatCardProps) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-emerald-500 to-emerald-600',
    red: 'from-red-500 to-red-600',
    yellow: 'from-amber-500 to-amber-600',
    purple: 'from-purple-500 to-purple-600',
    indigo: 'from-indigo-500 to-indigo-600',
  }

  const iconBgClasses = {
    blue: 'bg-blue-400/30',
    green: 'bg-emerald-400/30',
    red: 'bg-red-400/30',
    yellow: 'bg-amber-400/30',
    purple: 'bg-purple-400/30',
    indigo: 'bg-indigo-400/30',
  }

  return (
    <div
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-xl sm:rounded-2xl p-3.5 sm:p-5
        bg-gradient-to-br ${colorClasses[color]}
        text-white shadow-lg
        transform transition-all duration-300
        ${onClick ? 'cursor-pointer hover:scale-105 hover:shadow-xl active:scale-[0.98]' : ''}
      `}
    >
      {/* Background Pattern */}
      <div className="absolute top-0 right-0 w-24 h-24 sm:w-32 sm:h-32 transform translate-x-6 -translate-y-6 sm:translate-x-8 sm:-translate-y-8">
        <div className={`w-full h-full rounded-full ${iconBgClasses[color]} opacity-50`} />
      </div>

      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl ${iconBgClasses[color]}`}>
            <span className="[&>svg]:w-5 [&>svg]:h-5 sm:[&>svg]:w-6 sm:[&>svg]:h-6">{icon}</span>
          </div>
          {trend && (
            <div className={`flex items-center gap-0.5 text-xs sm:text-sm ${trend.isPositive ? 'text-green-200' : 'text-red-200'}`}>
              {trend.isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {trend.value}%
            </div>
          )}
        </div>

        <div className="mt-2.5 sm:mt-4">
          <p className="text-white/80 text-xs sm:text-sm font-medium truncate">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold mt-0.5">{value}</p>
          {subtitle && <p className="text-white/70 text-[10px] sm:text-xs mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>

      {onClick && <ChevronRight className="absolute bottom-2.5 right-2.5 sm:bottom-4 sm:right-4 w-4 h-4 text-white/50" />}
    </div>
  )
}

function SectionHeader({ title, icon, action }: { title: string; icon: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3 sm:mb-4">
      <div className="flex items-center gap-2">
        <div className="p-1.5 sm:p-2 rounded-lg bg-gray-100 text-gray-600">
          {icon}
        </div>
        <h2 className="text-sm sm:text-lg font-semibold text-gray-800">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-3.5 sm:p-5 ${className}`}>
      {children}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ManagerDashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [statusDistribution, setStatusDistribution] = useState<TaskStatusDistribution[]>([])
  const [taskTrend, setTaskTrend] = useState<TaskTrend[]>([])
  const [departmentPerformance, setDepartmentPerformance] = useState<DepartmentPerformance[]>([])
  const [topEmployees, setTopEmployees] = useState<TopEmployee[]>([])
  const [overdueTasks, setOverdueTasks] = useState<OverdueTask[]>([])
  const [upcomingTasks, setUpcomingTasks] = useState<UpcomingTask[]>([])
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([])
  const [expiringContracts, setExpiringContracts] = useState<ContractAlert[]>([])

  const loadData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true)
    else setIsLoading(true)

    try {
      const [
        statsResult, distributionResult, trendResult,
        deptResult, topEmpResult, overdueResult,
        upcomingResult, activitiesResult, contractsResult,
      ] = await Promise.all([
        dashboardService.getStats(),
        dashboardService.getTaskStatusDistribution(),
        dashboardService.getTaskTrend(8),
        dashboardService.getDepartmentPerformance(),
        dashboardService.getTopEmployees(5),
        dashboardService.getOverdueTasks(5),
        dashboardService.getUpcomingTasks(7, 5),
        dashboardService.getRecentActivities(8),
        dashboardService.getExpiringContracts(30, 5),
      ])

      if (statsResult.data) setStats(statsResult.data)
      setStatusDistribution(distributionResult.data)
      setTaskTrend(trendResult.data)
      setDepartmentPerformance(deptResult.data)
      setTopEmployees(topEmpResult.data)
      setOverdueTasks(overdueResult.data)
      setUpcomingTasks(upcomingResult.data)
      setRecentActivities(activitiesResult.data)
      setExpiringContracts(contractsResult.data)
    } catch (error) {
      console.error('Dashboard load error:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}p trước`
    if (diffHours < 24) return `${diffHours}h trước`
    if (diffDays < 7) return `${diffDays} ngày trước`
    return date.toLocaleDateString('vi-VN')
  }

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm sm:text-base text-gray-600">Đang tải Dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* ══════════ HEADER — không sticky trên mobile ══════════ */}
      <div className="bg-white border-b border-gray-200 lg:sticky lg:top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">
                Xin chào, {user?.full_name || 'Người dùng'}! 👋
              </h1>
              <p className="text-gray-500 text-xs sm:text-sm mt-0.5 truncate">
                Tổng quan hệ thống • {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <button
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline text-sm">Làm mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════ MAIN CONTENT ══════════ */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">

        {/* ══════════ ★ CHẤM CÔNG NHANH ══════════ */}
        <CheckInOutWidget />

        {/* ══════════ STATS CARDS — 2 mobile, 3 tablet, 5 desktop ══════════ */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
          <StatCard
            title="Nhân viên"
            value={stats?.totalEmployees || 0}
            subtitle={stats?.newEmployeesThisMonth ? `+${stats.newEmployeesThisMonth} tháng này` : undefined}
            icon={<Users className="w-6 h-6" />}
            color="blue"
            onClick={() => navigate('/employees')}
          />
          <StatCard
            title="Công việc"
            value={stats?.totalTasks || 0}
            subtitle={stats?.newTasksThisWeek ? `+${stats.newTasksThisWeek} tuần này` : undefined}
            icon={<ClipboardList className="w-6 h-6" />}
            color="indigo"
            onClick={() => navigate('/tasks')}
          />
          <StatCard
            title="Hoàn thành"
            value={`${stats?.completionRate || 0}%`}
            subtitle={`${stats?.completedTasks || 0} công việc`}
            icon={<CheckCircle2 className="w-6 h-6" />}
            color="green"
          />
          <StatCard
            title="Quá hạn"
            value={stats?.overdueTasks || 0}
            subtitle="Cần xử lý"
            icon={<AlertTriangle className="w-6 h-6" />}
            color="red"
            onClick={() => navigate('/tasks?filter=overdue')}
          />
          {/* Card thứ 5: ẩn trên mobile 2-col, hiện từ md trở lên */}
          <StatCard
            title="Chờ duyệt"
            value={stats?.pendingApprovals || 0}
            subtitle="Đang chờ phê duyệt"
            icon={<Clock className="w-6 h-6" />}
            color="yellow"
            onClick={() => navigate('/approvals')}
          />
        </div>

        {/* ══════════ CHARTS — stack trên mobile ══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Task Trend Chart */}
          <Card className="lg:col-span-2">
            <SectionHeader
              title="Xu hướng Công việc"
              icon={<TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />}
            />
            <div className="h-52 sm:h-64 lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={taskTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#9CA3AF" interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#9CA3AF" width={30} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #E5E7EB',
                      borderRadius: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="created" name="Tạo mới" stroke="#6366F1" strokeWidth={2} dot={{ fill: '#6366F1', strokeWidth: 2, r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="completed" name="Hoàn thành" stroke="#10B981" strokeWidth={2} dot={{ fill: '#10B981', strokeWidth: 2, r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Status Distribution */}
          <Card>
            <SectionHeader
              title="Phân bổ Trạng thái"
              icon={<Target className="w-4 h-4 sm:w-5 sm:h-5" />}
            />
            <div className="h-48 sm:h-56 lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={5}
                    dataKey="count"
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, _name, props) => [
                      `${value} CV`,
                      (props as any).payload.label,
                    ]}
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #E5E7EB',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3 justify-center mt-1">
              {statusDistribution.map((item) => (
                <div key={item.status} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] sm:text-xs text-gray-600">{item.label}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ══════════ DEPT PERFORMANCE + TOP EMPLOYEES — stack trên mobile ══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Department Performance */}
          <Card>
            <SectionHeader
              title="Hiệu suất Phòng ban"
              icon={<Building2 className="w-4 h-4 sm:w-5 sm:h-5" />}
              action={
                <button
                  onClick={() => navigate('/tasks?tab=overview')}
                  className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                >
                  Chi tiết <ChevronRight className="w-3.5 h-3.5" />
                </button>
              }
            />
            <div className="h-48 sm:h-56 lg:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departmentPerformance} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} stroke="#9CA3AF" />
                  <YAxis type="category" dataKey="department_name" width={80} tick={{ fontSize: 10 }} stroke="#9CA3AF" />
                  <Tooltip
                    formatter={(value) => [`${value}%`, 'Tỷ lệ']}
                    contentStyle={{
                      backgroundColor: '#fff',
                      border: '1px solid #E5E7EB',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="completion_rate" fill="#6366F1" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Top Employees */}
          <Card>
            <SectionHeader
              title="Nhân viên Xuất sắc"
              icon={<Award className="w-4 h-4 sm:w-5 sm:h-5" />}
            />
            <div className="space-y-2 sm:space-y-3">
              {topEmployees.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6 sm:py-8">Chưa có dữ liệu đánh giá</p>
              ) : (
                topEmployees.map((emp, index) => (
                  <div
                    key={emp.employee_id}
                    className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <div
                      className={`
                        w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0
                        ${index === 0 ? 'bg-yellow-100 text-yellow-700' : ''}
                        ${index === 1 ? 'bg-gray-100 text-gray-700' : ''}
                        ${index === 2 ? 'bg-orange-100 text-orange-700' : ''}
                        ${index > 2 ? 'bg-blue-50 text-blue-600' : ''}
                      `}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{emp.employee_name}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500 truncate">{emp.department_name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-base sm:text-lg font-bold text-blue-600">{emp.avg_score}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500">{emp.completed_tasks} CV</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* ══════════ OVERDUE + UPCOMING — stack trên mobile ══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Overdue Tasks */}
          <Card>
            <SectionHeader
              title="Quá hạn"
              icon={<AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />}
              action={
                overdueTasks.length > 0 ? (
                  <button
                    onClick={() => navigate('/tasks?filter=overdue')}
                    className="text-xs sm:text-sm text-red-600 hover:text-red-700 flex items-center gap-0.5"
                  >
                    Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : undefined
              }
            />
            {overdueTasks.length === 0 ? (
              <div className="text-center py-6 sm:py-8">
                <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Không có công việc quá hạn</p>
              </div>
            ) : (
              <div className="space-y-1.5 sm:space-y-2">
                {overdueTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-red-50 hover:bg-red-100 cursor-pointer transition-colors active:bg-red-200"
                  >
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                      <Timer className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{task.name}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500 truncate">{task.code} • {task.assignee_name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs sm:text-sm font-semibold text-red-600">-{task.days_overdue}d</span>
                      <span className={`block text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full mt-0.5 ${PRIORITY_COLORS[task.priority]}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Upcoming Tasks */}
          <Card>
            <SectionHeader
              title="Sắp đến hạn (7 ngày)"
              icon={<Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />}
              action={
                upcomingTasks.length > 0 ? (
                  <button
                    onClick={() => navigate('/tasks')}
                    className="text-xs sm:text-sm text-amber-600 hover:text-amber-700 flex items-center gap-0.5"
                  >
                    Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : undefined
              }
            />
            {upcomingTasks.length === 0 ? (
              <div className="text-center py-6 sm:py-8">
                <Calendar className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Không có công việc sắp đến hạn</p>
              </div>
            ) : (
              <div className="space-y-1.5 sm:space-y-2">
                {upcomingTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-amber-50 hover:bg-amber-100 cursor-pointer transition-colors active:bg-amber-200"
                  >
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{task.name}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500 truncate">{task.code} • {task.assignee_name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs sm:text-sm font-semibold text-amber-600">
                        {task.days_until_due === 0 ? 'Hôm nay' : `${task.days_until_due}d`}
                      </span>
                      <span className={`block text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full mt-0.5 ${PRIORITY_COLORS[task.priority]}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ══════════ ACTIVITIES + CONTRACTS — stack trên mobile ══════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Recent Activities */}
          <Card className="lg:col-span-2">
            <SectionHeader
              title="Hoạt động Gần đây"
              icon={<Activity className="w-4 h-4 sm:w-5 sm:h-5" />}
            />
            {recentActivities.length === 0 ? (
              <div className="text-center py-6 sm:py-8">
                <Activity className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Chưa có hoạt động nào</p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {recentActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm text-gray-900 leading-relaxed">
                        <span className="font-medium">{activity.actor_name}</span>
                        {' '}
                        <span className="text-gray-600">
                          {ACTION_LABELS[activity.action] || activity.action}
                        </span>
                        {activity.task_name && (
                          <>
                            {' "'}
                            <span className="font-medium text-blue-600 break-all">{activity.task_name}</span>
                            {'"'}
                          </>
                        )}
                      </p>
                      <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">
                        {formatTimeAgo(activity.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Expiring Contracts */}
          <Card>
            <SectionHeader
              title="HĐ Sắp hết hạn"
              icon={<FileText className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500" />}
              action={
                expiringContracts.length > 0 ? (
                  <button
                    onClick={() => navigate('/contracts')}
                    className="text-xs sm:text-sm text-purple-600 hover:text-purple-700 flex items-center gap-0.5"
                  >
                    Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : undefined
              }
            />
            {expiringContracts.length === 0 ? (
              <div className="text-center py-6 sm:py-8">
                <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Không có HĐ sắp hết hạn</p>
              </div>
            ) : (
              <div className="space-y-1.5 sm:space-y-2">
                {expiringContracts.map((contract) => (
                  <div
                    key={contract.id}
                    onClick={() => navigate('/contracts')}
                    className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-purple-50 hover:bg-purple-100 cursor-pointer transition-colors active:bg-purple-200"
                  >
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{contract.employee_name}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500 truncate">{contract.contract_type}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-xs sm:text-sm font-semibold text-purple-600">
                        {contract.days_until_expiry}d
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ══════════ QUICK ACTIONS — 3 cols mobile, 6 desktop ══════════ */}
        <Card>
          <SectionHeader
            title="Thao tác Nhanh"
            icon={<BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />}
          />
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3">
            {[
              { label: 'Tạo CV', icon: <ClipboardList className="w-5 h-5" />, path: '/tasks/create', color: 'bg-blue-100 text-blue-600 hover:bg-blue-200 active:bg-blue-300' },
              { label: 'CV của tôi', icon: <CheckCircle2 className="w-5 h-5" />, path: '/my-tasks', color: 'bg-green-100 text-green-600 hover:bg-green-200 active:bg-green-300' },
              { label: 'Phê duyệt', icon: <Clock className="w-5 h-5" />, path: '/approvals', color: 'bg-amber-100 text-amber-600 hover:bg-amber-200 active:bg-amber-300' },
              { label: 'Nhân viên', icon: <Users className="w-5 h-5" />, path: '/employees', color: 'bg-purple-100 text-purple-600 hover:bg-purple-200 active:bg-purple-300' },
              { label: 'Nghỉ phép', icon: <Calendar className="w-5 h-5" />, path: '/leave-requests', color: 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200 active:bg-indigo-300' },
              { label: 'Thống kê', icon: <BarChart3 className="w-5 h-5" />, path: '/reports/tasks', color: 'bg-pink-100 text-pink-600 hover:bg-pink-200 active:bg-pink-300' },
            ].map((action) => (
              <button
                key={action.path}
                onClick={() => navigate(action.path)}
                className={`flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl transition-colors ${action.color}`}
              >
                {action.icon}
                <span className="text-[10px] sm:text-xs font-medium text-center leading-tight">{action.label}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default ManagerDashboard