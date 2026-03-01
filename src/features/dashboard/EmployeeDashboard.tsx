// ============================================================================
// EMPLOYEE DASHBOARD — MODERN REDESIGN 2025
// File: src/features/dashboard/EmployeeDashboard.tsx
// Huy Anh ERP System - Dashboard cho Nhân viên (Level 6)
// ============================================================================
// REDESIGN: Warm Minimalism, Glassmorphism cards, consistent with Manager style
// DATA LOGIC: Unchanged - uses same supabase queries
// RESPONSIVE: Mobile-first with 44px+ touch targets
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
  FolderKanban,
  ArrowUpRight,
} from 'lucide-react'

// ============================================================================
// DESIGN TOKENS
// ============================================================================

const BRAND = {
  primary: '#1B4D3E',
  secondary: '#2D8B6E',
  accent: '#E8A838',
  bg: '#F0EDE8',
} as const

// ============================================================================
// TYPES (unchanged)
// ============================================================================

interface DashboardStats {
  totalTasks: number
  pendingEvaluation: number
  completedTasks: number
  inProgressTasks: number
  remainingLeaveDays: number
  pendingLeaveRequests: number
  recentTasks: RecentTask[]
  myProjectCount: number
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
// ANIMATED NUMBER
// ============================================================================

function AnimatedNumber({ target }: { target: number }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (target === 0) { setVal(0); return }
    let start = 0
    const step = target / (800 / 16)
    const id = setInterval(() => {
      start += step
      if (start >= target) { setVal(target); clearInterval(id) }
      else setVal(Math.floor(start))
    }, 16)
    return () => clearInterval(id)
  }, [target])
  return <>{val}</>
}

// ============================================================================
// GLASS CARD
// ============================================================================

function GlassCard({ children, className = '', onClick }: {
  children: React.ReactNode; className?: string; onClick?: () => void
}) {
  return (
    <div onClick={onClick}
      className={`
        bg-white/80 backdrop-blur-sm rounded-2xl sm:rounded-[20px]
        border border-white/60 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.03)]
        transition-all duration-300
        ${onClick ? 'cursor-pointer hover:shadow-lg hover:bg-white/95 hover:-translate-y-0.5 active:translate-y-0' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

// ============================================================================
// STAT CARD — Modern glassmorphism style
// ============================================================================

interface StatCardProps {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ReactNode
  accentColor: string
  iconBg: string
  link?: string
  onClick?: () => void
}

function StatCard({ title, value, subtitle, icon, accentColor, iconBg, link, onClick }: StatCardProps) {
  const content = (
    <GlassCard
      onClick={onClick}
      className="p-3.5 sm:p-5 relative overflow-hidden group"
    >
      {/* Decorative corner */}
      <div className="absolute top-0 right-0 w-20 h-20 rounded-bl-[60px] opacity-[0.06] group-hover:opacity-[0.1] transition-opacity"
        style={{ background: `linear-gradient(135deg, ${accentColor}, transparent)` }} />
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs sm:text-[13px] font-medium text-gray-500 truncate">{title}</p>
            <p className="text-2xl sm:text-[32px] font-bold mt-1 tracking-tight text-gray-900 leading-none">
              {typeof value === 'number' ? <AnimatedNumber target={value} /> : value}
            </p>
            {subtitle && <p className="text-[10px] sm:text-xs text-gray-400 mt-1 truncate">{subtitle}</p>}
          </div>
          <div className={`p-2 sm:p-2.5 rounded-xl ${iconBg} flex-shrink-0 ml-2`}>
            <span className="[&>svg]:w-[18px] [&>svg]:h-[18px] sm:[&>svg]:w-5 sm:[&>svg]:h-5">{icon}</span>
          </div>
        </div>
      </div>
      {(link || onClick) && (
        <ChevronRight className="absolute bottom-2.5 right-2.5 sm:bottom-4 sm:right-4 w-4 h-4 text-gray-300" />
      )}
    </GlassCard>
  )

  if (link) {
    return <Link to={link} className="block">{content}</Link>
  }
  return content
}

// ============================================================================
// TASK STATUS BADGE
// ============================================================================

function TaskStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; cls: string }> = {
    new: { label: 'Mới', cls: 'bg-gray-100 text-gray-600' },
    in_progress: { label: 'Đang làm', cls: 'bg-blue-50 text-blue-600' },
    pending_review: { label: 'Chờ duyệt', cls: 'bg-amber-50 text-amber-600' },
    completed: { label: 'Hoàn thành', cls: 'bg-emerald-50 text-emerald-600' },
    accepted: { label: 'Đã duyệt', cls: 'bg-green-50 text-green-600' },
    rejected: { label: 'Từ chối', cls: 'bg-red-50 text-red-600' },
  }
  const cfg = configs[status] || { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-semibold whitespace-nowrap ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ============================================================================
// PRIORITY BADGE
// ============================================================================

function PriorityBadge({ priority }: { priority: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    low: { label: 'Thấp', cls: 'text-gray-400' },
    medium: { label: 'TB', cls: 'text-blue-500' },
    high: { label: 'Cao', cls: 'text-orange-500' },
    urgent: { label: 'Khẩn', cls: 'text-red-500' },
  }
  const item = cfg[priority] || cfg.medium
  return <span className={`text-[10px] sm:text-xs font-semibold ${item.cls}`}>{item.label}</span>
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function EmployeeDashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [stats, setStats] = useState<DashboardStats>({
    totalTasks: 0, pendingEvaluation: 0, completedTasks: 0, inProgressTasks: 0,
    remainingLeaveDays: 12, pendingLeaveRequests: 0, recentTasks: [], myProjectCount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Fetch data (unchanged logic) ──
  const fetchDashboardData = async (showRefresh = false) => {
    if (!user?.employee_id) { setLoading(false); return }
    if (showRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      setError(null)
      const employeeId = user.employee_id
      const { count: totalTasks } = await supabase
        .from('task_assignments').select('*', { count: 'exact', head: true }).eq('employee_id', employeeId)
      const { data: inProgressData } = await supabase
        .from('task_assignments').select(`id, task:tasks!inner(status)`)
        .eq('employee_id', employeeId).in('tasks.status', ['new', 'in_progress'])
      const { data: pendingEvalTasks } = await supabase
        .from('task_assignments').select(`id, self_rating, task:tasks!inner(status)`)
        .eq('employee_id', employeeId).eq('tasks.status', 'pending_review').is('self_rating', null)
      const { data: completedData } = await supabase
        .from('task_assignments').select(`id, task:tasks!inner(status)`)
        .eq('employee_id', employeeId).in('tasks.status', ['completed', 'accepted'])
      const { count: pendingLeave } = await supabase
        .from('leave_requests').select('*', { count: 'exact', head: true })
        .eq('employee_id', employeeId).eq('status', 'pending')
      const currentYear = new Date().getFullYear()
      const { data: usedLeave } = await supabase
        .from('leave_requests').select('total_days').eq('employee_id', employeeId)
        .eq('status', 'approved').gte('start_date', `${currentYear}-01-01`).lte('end_date', `${currentYear}-12-31`)
      const totalUsedDays = usedLeave?.reduce((sum, l) => sum + (l.total_days || 0), 0) || 0
      const remainingDays = Math.max(0, 12 - totalUsedDays)
      const { data: recentTasksData } = await supabase
        .from('task_assignments').select(`id, task:tasks(id, name, code, status, due_date, priority)`)
        .eq('employee_id', employeeId).order('created_at', { ascending: false }).limit(5)
      const recentTasks: RecentTask[] = (recentTasksData || [])
        .filter(t => t.task)
        .map(t => ({
          id: (t.task as any).id, name: (t.task as any).name, code: (t.task as any).code || '',
          status: (t.task as any).status, due_date: (t.task as any).due_date, priority: (t.task as any).priority || 'medium',
        }))
      let myProjectCount = 0
      try {
        const { count } = await supabase
          .from('project_members').select('*', { count: 'exact', head: true })
          .eq('employee_id', employeeId).eq('is_active', true)
        myProjectCount = count || 0
      } catch {}
      setStats({
        totalTasks: totalTasks || 0, pendingEvaluation: pendingEvalTasks?.length || 0,
        completedTasks: completedData?.length || 0, inProgressTasks: inProgressData?.length || 0,
        remainingLeaveDays: remainingDays, pendingLeaveRequests: pendingLeave || 0, recentTasks, myProjectCount,
      })
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setError('Không thể tải dữ liệu dashboard')
    } finally { setLoading(false); setRefreshing(false) }
  }

  useEffect(() => { fetchDashboardData() }, [user?.employee_id])

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BRAND.bg }}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})` }}>
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          </div>
          <p className="text-sm text-gray-500 font-medium">Đang tải Dashboard...</p>
        </div>
      </div>
    )
  }

  // ── Error ──
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: BRAND.bg }}>
        <div className="text-center">
          <AlertCircle className="w-14 h-14 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <button onClick={() => fetchDashboardData()}
            className="px-5 py-2.5 text-white rounded-xl text-sm font-semibold"
            style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})` }}>
            Thử lại
          </button>
        </div>
      </div>
    )
  }

  const formatDate = (dateStr: string | null) => dateStr ? new Date(dateStr).toLocaleDateString('vi-VN') : ''
  const isOverdue = (dateStr: string | null) => dateStr ? new Date(dateStr) < new Date() : false

  return (
    <div className="min-h-screen" style={{ background: BRAND.bg }}>

      {/* ══════ HEADER ══════ */}
      <div className="bg-white/70 backdrop-blur-md border-b border-black/5 lg:sticky lg:top-0 z-20">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-[22px] font-bold text-gray-900 tracking-tight truncate">
                Xin chào, {user?.full_name || 'Nhân viên'}{' '}
                <span className="hidden sm:inline">👋</span>
              </h1>
              <p className="text-gray-400 text-xs sm:text-[13px] mt-0.5 font-medium truncate">
                {user?.department_name || 'Chưa có phòng ban'} • {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <button onClick={() => fetchDashboardData(true)} disabled={refreshing}
              className="p-2.5 rounded-xl bg-white/80 border border-gray-200/60 text-gray-500 hover:text-gray-700 hover:bg-white transition-all disabled:opacity-50 flex-shrink-0">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ══════ MAIN CONTENT ══════ */}
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">

        {/* ─── STATS GRID ─── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3.5">
          <StatCard
            title="Công việc"
            value={stats.totalTasks}
            subtitle={`${stats.inProgressTasks} đang thực hiện`}
            icon={<ClipboardList />}
            accentColor="#3B82F6"
            iconBg="bg-blue-50 text-blue-600"
            link="/my-tasks"
          />
          <StatCard
            title="Chờ đánh giá"
            value={stats.pendingEvaluation}
            subtitle="cần tự đánh giá"
            icon={<Clock />}
            accentColor={BRAND.accent}
            iconBg="bg-amber-50 text-amber-600"
            link="/my-tasks?status=pending_review"
          />
          <StatCard
            title="Đã hoàn thành"
            value={stats.completedTasks}
            subtitle="công việc"
            icon={<CheckCircle2 />}
            accentColor="#10B981"
            iconBg="bg-emerald-50 text-emerald-600"
            link="/my-tasks?status=completed"
          />
          <StatCard
            title="Ngày phép còn"
            value={stats.remainingLeaveDays}
            subtitle="ngày trong năm"
            icon={<CalendarDays />}
            accentColor="#8B5CF6"
            iconBg="bg-violet-50 text-violet-600"
          />
          <StatCard
            title="Đơn chờ duyệt"
            value={stats.pendingLeaveRequests}
            subtitle="đơn nghỉ phép"
            icon={<FileText />}
            accentColor="#F97316"
            iconBg="bg-orange-50 text-orange-600"
            link="/leave-requests"
          />
          <StatCard
            title="Phiếu lương"
            value="Xem"
            subtitle="phiếu lương mới nhất"
            icon={<Wallet />}
            accentColor="#EC4899"
            iconBg="bg-pink-50 text-pink-600"
            link="/payslips"
          />
          {stats.myProjectCount > 0 && (
            <StatCard
              title="Dự án"
              value={stats.myProjectCount}
              subtitle="đang tham gia"
              icon={<FolderKanban />}
              accentColor="#6366F1"
              iconBg="bg-indigo-50 text-indigo-600"
              link="/projects/list"
            />
          )}
        </div>

        {/* ─── RECENT TASKS ─── */}
        <GlassCard className="overflow-hidden">
          <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-black/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg" style={{ background: `${BRAND.secondary}15`, color: BRAND.secondary }}>
                <ClipboardList className="w-4 h-4" />
              </div>
              <h3 className="text-sm sm:text-[15px] font-bold text-gray-800 tracking-tight">Công việc gần đây</h3>
            </div>
            <Link to="/my-tasks"
              className="text-xs sm:text-sm font-semibold flex items-center gap-0.5"
              style={{ color: BRAND.secondary }}>
              Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-black/[0.03]">
            {stats.recentTasks.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <ClipboardList className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-400 font-medium">Chưa có công việc nào được giao</p>
                <p className="text-xs text-gray-300 mt-1">Các công việc mới sẽ hiển thị ở đây</p>
              </div>
            ) : (
              stats.recentTasks.map((task) => (
                <div key={task.id}
                  onClick={() => navigate(`/my-tasks/${task.id}`)}
                  className="px-3.5 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between gap-2 hover:bg-black/[0.015] cursor-pointer transition-colors active:bg-black/[0.03]">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                    <TaskStatusBadge status={task.status} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 font-semibold truncate">{task.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] sm:text-xs text-gray-400">{task.code}</span>
                        <span className="text-gray-300 text-[10px]">•</span>
                        <PriorityBadge priority={task.priority} />
                      </div>
                    </div>
                  </div>
                  {task.due_date && (
                    <div className={`flex items-center gap-1 text-xs whitespace-nowrap ml-2 flex-shrink-0 font-medium
                      ${isOverdue(task.due_date) ? 'text-red-500' : 'text-gray-400'}`}>
                      {isOverdue(task.due_date) ? <Timer className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                      <span className="hidden sm:inline">{formatDate(task.due_date)}</span>
                      <span className="sm:hidden">{new Date(task.due_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </GlassCard>

        {/* ─── QUICK ACTIONS ─── */}
        <GlassCard className="p-3.5 sm:p-5">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <div className="p-1.5 rounded-lg" style={{ background: `${BRAND.secondary}15`, color: BRAND.secondary }}>
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <h3 className="text-sm sm:text-[15px] font-bold text-gray-800 tracking-tight">Thao tác nhanh</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-2.5">
            {[
              { label: 'Công việc', icon: <ClipboardList className="w-5 h-5" />, path: '/my-tasks', bg: 'bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200' },
              { label: 'Xin nghỉ phép', icon: <CalendarDays className="w-5 h-5" />, path: '/leave-requests', bg: 'bg-violet-50 text-violet-600 hover:bg-violet-100 active:bg-violet-200' },
              { label: 'Chấm công', icon: <Clock className="w-5 h-5" />, path: '/attendance', bg: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:bg-emerald-200' },
              { label: 'Phiếu lương', icon: <Wallet className="w-5 h-5" />, path: '/payslips', bg: 'bg-pink-50 text-pink-600 hover:bg-pink-100 active:bg-pink-200' },
              { label: 'Dự án', icon: <FolderKanban className="w-5 h-5" />, path: '/projects/list', bg: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 active:bg-indigo-200' },
            ].map((action) => (
              <Link key={action.path} to={action.path}
                className={`flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl transition-colors ${action.bg}`}>
                {action.icon}
                <span className="text-[10px] sm:text-xs font-semibold text-center leading-tight">{action.label}</span>
              </Link>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  )
}

export default EmployeeDashboard