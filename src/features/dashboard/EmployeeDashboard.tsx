// ============================================================================
// EMPLOYEE DASHBOARD — RESPONSIVE + CHẤM CÔNG NHANH
// File: src/features/dashboard/EmployeeDashboard.tsx
// Huy Anh ERP System - Dashboard cho Nhân viên (Level 6)
// ============================================================================
// CHANGES:
// - Tích hợp CheckInOutWidget ngay trên dashboard
// - Tối ưu mobile: padding, font-size, grid, touch targets
// - Header không sticky trên mobile (tránh đè sidebar header)
// - Stat cards compact hơn trên mobile
// - Task list dạng card trên mobile
// - Quick actions responsive
// ============================================================================

import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import {
  ClipboardList,
  Clock,
  CheckCircle2,
  CalendarDays,
  FileText,
  Wallet,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  Timer,
  Calendar,
  LogIn,
} from 'lucide-react'



// ============================================================================
// TYPES
// ============================================================================

interface DashboardStats {
  totalTasks: number
  pendingEvaluation: number
  completedTasks: number
  inProgressTasks: number
  remainingLeaveDays: number
  pendingLeaveRequests: number
  recentTasks: RecentTask[]
}

interface RecentTask {
  id: string
  name: string
  code: string
  status: string
  due_date: string | null
  priority: string
}

// ============================================================================
// STAT CARD COMPONENT — RESPONSIVE
// ============================================================================

interface StatCardProps {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ReactNode
  color: 'blue' | 'yellow' | 'green' | 'purple' | 'orange' | 'pink' | 'indigo'
  link?: string
  onClick?: () => void
}

function StatCard({ title, value, subtitle, icon, color, link, onClick }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100',
    yellow: 'bg-yellow-50 text-yellow-600 border-yellow-200 hover:bg-yellow-100',
    green: 'bg-green-50 text-green-600 border-green-200 hover:bg-green-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100',
    pink: 'bg-pink-50 text-pink-600 border-pink-200 hover:bg-pink-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100',
  }

  const iconBgClasses = {
    blue: 'bg-blue-100 text-blue-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
    orange: 'bg-orange-100 text-orange-600',
    pink: 'bg-pink-100 text-pink-600',
    indigo: 'bg-indigo-100 text-indigo-600',
  }

  const content = (
    <div
      className={`
        relative rounded-xl sm:rounded-2xl border-2 p-3 sm:p-5 transition-all duration-300
        ${colorClasses[color]}
        ${(link || onClick) ? 'cursor-pointer hover:scale-[1.02] hover:shadow-md active:scale-[0.98]' : ''}
      `}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold mt-0.5 sm:mt-1">{value}</p>
          {subtitle && <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 truncate">{subtitle}</p>}
        </div>
        <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl ${iconBgClasses[color]} flex-shrink-0 ml-2`}>
          <span className="[&>svg]:w-5 [&>svg]:h-5 sm:[&>svg]:w-6 sm:[&>svg]:h-6">{icon}</span>
        </div>
      </div>
      {(link || onClick) && (
        <ChevronRight className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4 w-4 h-4 sm:w-5 sm:h-5 opacity-40" />
      )}
    </div>
  )

  if (link) {
    return <Link to={link} className="block">{content}</Link>
  }

  return <div>{content}</div>
}

// ============================================================================
// TASK STATUS BADGE
// ============================================================================

function TaskStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    new: { label: 'Mới', className: 'bg-gray-100 text-gray-700' },
    in_progress: { label: 'Đang làm', className: 'bg-blue-100 text-blue-700' },
    pending_review: { label: 'Chờ duyệt', className: 'bg-yellow-100 text-yellow-700' },
    completed: { label: 'Hoàn thành', className: 'bg-green-100 text-green-700' },
    accepted: { label: 'Đã duyệt', className: 'bg-emerald-100 text-emerald-700' },
    rejected: { label: 'Từ chối', className: 'bg-red-100 text-red-700' },
  }

  const config = statusConfig[status] || { label: status, className: 'bg-gray-100 text-gray-700' }

  return (
    <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium whitespace-nowrap ${config.className}`}>
      {config.label}
    </span>
  )
}

// ============================================================================
// PRIORITY BADGE
// ============================================================================

function PriorityBadge({ priority }: { priority: string }) {
  const config: Record<string, { label: string; className: string }> = {
    low: { label: 'Thấp', className: 'text-gray-500' },
    medium: { label: 'TB', className: 'text-blue-500' },
    high: { label: 'Cao', className: 'text-orange-500' },
    urgent: { label: 'Khẩn', className: 'text-red-500' },
  }

  const item = config[priority] || config.medium
  return <span className={`text-[10px] sm:text-xs font-medium ${item.className}`}>{item.label}</span>
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function EmployeeDashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [stats, setStats] = useState<DashboardStats>({
    totalTasks: 0,
    pendingEvaluation: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    remainingLeaveDays: 12,
    pendingLeaveRequests: 0,
    recentTasks: [],
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch dashboard data
  const fetchDashboardData = async (showRefresh = false) => {
    if (!user?.employee_id) {
      setLoading(false)
      return
    }

    if (showRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      setError(null)
      const employeeId = user.employee_id

      const { count: totalTasks } = await supabase
        .from('task_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', employeeId)

      const { data: inProgressData } = await supabase
        .from('task_assignments')
        .select(`id, task:tasks!inner(status)`)
        .eq('employee_id', employeeId)
        .in('tasks.status', ['new', 'in_progress'])

      const { data: pendingEvalTasks } = await supabase
        .from('task_assignments')
        .select(`id, self_rating, task:tasks!inner(status)`)
        .eq('employee_id', employeeId)
        .eq('tasks.status', 'pending_review')
        .is('self_rating', null)

      const { data: completedData } = await supabase
        .from('task_assignments')
        .select(`id, task:tasks!inner(status)`)
        .eq('employee_id', employeeId)
        .in('tasks.status', ['completed', 'accepted'])

      const { count: pendingLeave } = await supabase
        .from('leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('employee_id', employeeId)
        .eq('status', 'pending')

      const currentYear = new Date().getFullYear()
      const { data: usedLeave } = await supabase
        .from('leave_requests')
        .select('total_days')
        .eq('employee_id', employeeId)
        .eq('status', 'approved')
        .gte('start_date', `${currentYear}-01-01`)
        .lte('end_date', `${currentYear}-12-31`)

      const totalUsedDays = usedLeave?.reduce((sum, l) => sum + (l.total_days || 0), 0) || 0
      const remainingDays = Math.max(0, 12 - totalUsedDays)

      const { data: recentTasksData } = await supabase
        .from('task_assignments')
        .select(`id, task:tasks(id, name, code, status, due_date, priority)`)
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: false })
        .limit(5)

      const recentTasks: RecentTask[] = (recentTasksData || [])
        .filter(t => t.task)
        .map(t => ({
          id: (t.task as any).id,
          name: (t.task as any).name,
          code: (t.task as any).code || '',
          status: (t.task as any).status,
          due_date: (t.task as any).due_date,
          priority: (t.task as any).priority || 'medium',
        }))

      setStats({
        totalTasks: totalTasks || 0,
        pendingEvaluation: pendingEvalTasks?.length || 0,
        completedTasks: completedData?.length || 0,
        inProgressTasks: inProgressData?.length || 0,
        remainingLeaveDays: remainingDays,
        pendingLeaveRequests: pendingLeave || 0,
        recentTasks,
      })
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setError('Không thể tải dữ liệu dashboard')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [user?.employee_id])

  // Loading
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 sm:w-12 sm:h-12 animate-spin text-blue-600 mx-auto" />
          <p className="mt-3 text-sm sm:text-base text-gray-600">Đang tải Dashboard...</p>
        </div>
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-red-500 mx-auto mb-3" />
          <p className="text-sm sm:text-base text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => fetchDashboardData()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Thử lại
          </button>
        </div>
      </div>
    )
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('vi-VN')
  }

  const isOverdue = (dateStr: string | null) => {
    if (!dateStr) return false
    return new Date(dateStr) < new Date()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* ══════════ HEADER — responsive, không sticky trên mobile ══════════ */}
      <div className="bg-white border-b border-gray-200 lg:sticky lg:top-0 z-10">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">
                Xin chào, {user?.full_name || 'Nhân viên'}! 👋
              </h1>
              <p className="text-gray-500 text-xs sm:text-sm mt-0.5 truncate">
                {user?.department_name || 'Chưa có phòng ban'} • {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <button
              onClick={() => fetchDashboardData(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline text-sm">Làm mới</span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════ MAIN CONTENT ══════════ */}
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">

       

        {/* ══════════ STATS GRID — 2 cols mobile, 3 cols desktop ══════════ */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
          <StatCard
            title="Công việc"
            value={stats.totalTasks}
            subtitle={`${stats.inProgressTasks} đang thực hiện`}
            icon={<ClipboardList size={24} />}
            color="blue"
            link="/my-tasks"
          />
          <StatCard
            title="Chờ đánh giá"
            value={stats.pendingEvaluation}
            subtitle="cần tự đánh giá"
            icon={<Clock size={24} />}
            color="yellow"
            link="/my-tasks?status=pending_review"
          />
          <StatCard
            title="Đã hoàn thành"
            value={stats.completedTasks}
            subtitle="công việc"
            icon={<CheckCircle2 size={24} />}
            color="green"
            link="/my-tasks?status=completed"
          />
          <StatCard
            title="Ngày phép còn"
            value={stats.remainingLeaveDays}
            subtitle="ngày trong năm"
            icon={<CalendarDays size={24} />}
            color="purple"
          />
          <StatCard
            title="Đơn chờ duyệt"
            value={stats.pendingLeaveRequests}
            subtitle="đơn nghỉ phép"
            icon={<FileText size={24} />}
            color="orange"
            link="/leave-requests"
          />
          <StatCard
            title="Phiếu lương"
            value="Xem"
            subtitle="phiếu lương mới nhất"
            icon={<Wallet size={24} />}
            color="pink"
            link="/payslips"
          />
        </div>

        {/* ══════════ RECENT TASKS — responsive ══════════ */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 sm:p-2 rounded-lg bg-blue-100 text-blue-600">
                <ClipboardList size={18} />
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-gray-900">Công việc gần đây</h2>
            </div>
            <Link
              to="/my-tasks"
              className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
            >
              Xem tất cả
              <ChevronRight size={14} />
            </Link>
          </div>

          <div className="divide-y divide-gray-100">
            {stats.recentTasks.length === 0 ? (
              <div className="px-4 py-10 sm:py-12 text-center">
                <ClipboardList className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-500">Chưa có công việc nào được giao</p>
                <p className="text-xs text-gray-400 mt-1">Các công việc mới sẽ hiển thị ở đây</p>
              </div>
            ) : (
              stats.recentTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => navigate(`/my-tasks/${task.id}`)}
                  className="px-3.5 sm:px-5 py-3 sm:py-4 flex items-center justify-between gap-2 hover:bg-gray-50 cursor-pointer transition-colors active:bg-gray-100"
                >
                  <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 flex-1">
                    <TaskStatusBadge status={task.status} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 font-medium truncate">{task.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] sm:text-xs text-gray-400">{task.code}</span>
                        <span className="text-gray-300 text-[10px]">•</span>
                        <PriorityBadge priority={task.priority} />
                      </div>
                    </div>
                  </div>
                  {task.due_date && (
                    <div className={`flex items-center gap-1 text-xs sm:text-sm whitespace-nowrap ml-2 flex-shrink-0 ${isOverdue(task.due_date) ? 'text-red-500' : 'text-gray-500'}`}>
                      {isOverdue(task.due_date) ? <Timer size={12} /> : <Calendar size={12} />}
                      <span className="hidden sm:inline">{formatDate(task.due_date)}</span>
                      <span className="sm:hidden">{new Date(task.due_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ══════════ QUICK ACTIONS — responsive grid ══════════ */}
        <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 p-3.5 sm:p-5">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <div className="p-1.5 sm:p-2 rounded-lg bg-gray-100 text-gray-600">
              <ChevronRight size={18} />
            </div>
            <h2 className="text-sm sm:text-base font-semibold text-gray-900">Thao tác nhanh</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <Link
              to="/my-tasks"
              className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200 transition-colors"
            >
              <ClipboardList size={22} />
              <span className="text-xs sm:text-sm font-medium">Công việc</span>
            </Link>
            <Link
              to="/leave-requests"
              className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl bg-purple-50 text-purple-600 hover:bg-purple-100 active:bg-purple-200 transition-colors"
            >
              <CalendarDays size={22} />
              <span className="text-xs sm:text-sm font-medium">Xin nghỉ phép</span>
            </Link>
            <Link
              to="/attendance"
              className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 active:bg-green-200 transition-colors"
            >
              <Clock size={22} />
              <span className="text-xs sm:text-sm font-medium">Chấm công</span>
            </Link>
            <Link
              to="/payslips"
              className="flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl bg-pink-50 text-pink-600 hover:bg-pink-100 active:bg-pink-200 transition-colors"
            >
              <Wallet size={22} />
              <span className="text-xs sm:text-sm font-medium">Phiếu lương</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default EmployeeDashboard