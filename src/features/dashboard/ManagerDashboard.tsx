// ============================================================================
// MANAGER DASHBOARD — MODERN REDESIGN 2025
// File: src/features/dashboard/ManagerDashboard.tsx
// Huy Anh ERP System - Dashboard cho Manager và Executive (Level 1-5)
// ============================================================================
// REDESIGN: Bento Grid Layout, Warm Minimalism, Glassmorphism accents,
//           Animated counters, Sparklines, Area charts, Modern typography
// DATA LOGIC: Unchanged - uses same dashboardService + supabase queries
// RESPONSIVE: Mobile-first with 44px+ touch targets
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
  ArrowUpRight,
  ArrowDownRight,
  Briefcase,
  Timer,
  Target,
  BarChart3,
  FolderKanban,
  Plus,
  Bell,
  LogOut,
  MapPin,
  UserCheck,
  UserX,
  Plane,
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
  AreaChart,
  Area,
} from 'recharts'
import { supabase } from '../../lib/supabase'
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

// ============================================================================
// DESIGN TOKENS
// ============================================================================

const BRAND = {
  primary: '#1B4D3E',
  secondary: '#2D8B6E',
  accent: '#E8A838',
  surface: '#F7F5F2',
  bg: '#F0EDE8',
} as const

// ============================================================================
// CONSTANTS (unchanged)
// ============================================================================

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600',
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

const ACTIVITY_COLORS: Record<string, string> = {
  created: 'bg-blue-500',
  approved: 'bg-emerald-500',
  rejected: 'bg-red-500',
  comment_added: 'bg-violet-500',
  status_changed: 'bg-amber-500',
  assigned: 'bg-teal-500',
  self_eval_submitted: 'bg-cyan-500',
}

// ============================================================================
// ANIMATED NUMBER COMPONENT
// ============================================================================

function AnimatedNumber({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (target === 0) { setVal(0); return }
    let start = 0
    const duration = 800
    const step = target / (duration / 16)
    const id = setInterval(() => {
      start += step
      if (start >= target) { setVal(target); clearInterval(id) }
      else setVal(Math.floor(start))
    }, 16)
    return () => clearInterval(id)
  }, [target])
  return <>{val}{suffix}</>
}

// ============================================================================
// MINI SPARKLINE (SVG)
// ============================================================================

function Sparkline({ data, color = BRAND.secondary, w = 64, h = 24 }: {
  data: number[]; color?: string; w?: number; h?: number
}) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const pts = data.map((v, i) =>
    `${(i / Math.max(data.length - 1, 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`
  ).join(' ')
  const lastX = w
  const lastY = h - ((data[data.length - 1] - min) / range) * (h - 4) - 2
  return (
    <svg width={w} height={h} className="block flex-shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  )
}

// ============================================================================
// GLASS CARD WRAPPER
// ============================================================================

function GlassCard({ children, className = '', onClick }: {
  children: React.ReactNode; className?: string; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-white/80 backdrop-blur-sm rounded-2xl sm:rounded-[20px]
        border border-white/60 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.03)]
        transition-all duration-300 
        ${onClick ? 'cursor-pointer hover:shadow-lg hover:bg-white/95 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

// ============================================================================
// KPI STAT CARD — Modern with sparkline & trend badge
// ============================================================================

interface KpiCardProps {
  label: string
  value: number | string
  subtitle?: string
  icon: React.ReactNode
  trend?: { value: number | string; isPositive: boolean }
  sparkData?: number[]
  accentColor: string
  iconBg: string
  onClick?: () => void
}

function KpiCard({ label, value, subtitle, icon, trend, sparkData, accentColor, iconBg, onClick }: KpiCardProps) {
  return (
    <GlassCard onClick={onClick} className="p-3.5 sm:p-5 relative overflow-hidden group">
      {/* Decorative corner gradient */}
      <div
        className="absolute top-0 right-0 w-20 h-20 sm:w-24 sm:h-24 rounded-bl-[60px] opacity-[0.06] transition-opacity group-hover:opacity-[0.1]"
        style={{ background: `linear-gradient(135deg, ${accentColor}, transparent)` }}
      />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-2.5 sm:mb-3">
          <div className={`p-2 sm:p-2.5 rounded-xl ${iconBg}`}>
            <span className="[&>svg]:w-[18px] [&>svg]:h-[18px] sm:[&>svg]:w-5 sm:[&>svg]:h-5">{icon}</span>
          </div>
          {sparkData && sparkData.length > 1 && (
            <Sparkline data={sparkData} color={accentColor} />
          )}
        </div>
        <div className="text-[26px] sm:text-[32px] font-bold tracking-tight leading-none text-gray-900">
          {typeof value === 'number' ? <AnimatedNumber target={value} /> : value}
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs sm:text-[13px] text-gray-500 font-medium">{label}</span>
          {trend && (
            <span
              className={`
                inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-lg
                ${trend.isPositive ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'}
              `}
            >
              {trend.isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {trend.value}
            </span>
          )}
        </div>
        {subtitle && <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
      </div>
    </GlassCard>
  )
}

// ============================================================================
// SECTION HEADER
// ============================================================================

function SectionHeader({ title, icon, action }: {
  title: string; icon?: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-3 sm:mb-4">
      <div className="flex items-center gap-2">
        {icon && (
          <div className="p-1.5 rounded-lg" style={{ background: `${BRAND.secondary}15`, color: BRAND.secondary }}>
            {icon}
          </div>
        )}
        <h3 className="text-sm sm:text-[15px] font-bold text-gray-800 tracking-tight">{title}</h3>
      </div>
      {action}
    </div>
  )
}

// ============================================================================
// CUSTOM CHART TOOLTIP
// ============================================================================

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl border border-gray-100 shadow-lg px-3 py-2 text-xs">
      <p className="text-gray-500 font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ManagerDashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // ── State (unchanged) ──
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
  // ★ New dashboard sections
  const [todayAttendance, setTodayAttendance] = useState<{ present: number; absent: number; late: number; businessTrip: number; total: number }>({ present: 0, absent: 0, late: 0, businessTrip: 0, total: 0 })
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([])
  const [pendingOvertimes, setPendingOvertimes] = useState<any[]>([])
  const [activeTrips, setActiveTrips] = useState<any[]>([])
  const [monthlyWorkUnits, setMonthlyWorkUnits] = useState<any[]>([])
  const [absentEmployees, setAbsentEmployees] = useState<{ id: string; name: string; code: string }[]>([])
  const [perfKPIs, setPerfKPIs] = useState<{ total_evaluated: number; avg_score: number; total_completed: number; on_time_rate: number; grade_distribution: Record<string, number> }>({ total_evaluated: 0, avg_score: 0, total_completed: 0, on_time_rate: 0, grade_distribution: { A: 0, B: 0, C: 0, D: 0, F: 0 } })
  const [perfTopEmployees, setPerfTopEmployees] = useState<{ name: string; dept: string; score: number; grade: string; tasks: number }[]>([])
  // ★ Sales KPI (executive/admin only)
  const [salesKpi, setSalesKpi] = useState<{ revenue: number; orders: number; collected: number; uncollected: number } | null>(null)
  const [weeklyAttendance, setWeeklyAttendance] = useState<any[]>([])
  const [pendingTaskApprovals, setPendingTaskApprovals] = useState(0)

  const [projectStats, setProjectStats] = useState<{
    total: number; active: number; completed: number;
    recentProjects: { id: string; code: string; name: string; status: string; progress_pct: number }[]
  }>({ total: 0, active: 0, completed: 0, recentProjects: [] })

  // ── Data Loading (unchanged logic) ──
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
      // ★ Load new dashboard data
      try {
        const today = new Date().toISOString().split('T')[0]
        const now = new Date()
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`

        // Chấm công hôm nay
        const { count: totalActive } = await supabase.from('employees').select('*', { count: 'exact', head: true }).eq('status', 'active')
        const { data: todayAtts } = await supabase.from('attendance').select('status, late_minutes').eq('date', today)
        const present = (todayAtts || []).filter(a => a.status !== 'business_trip').length
        const late = (todayAtts || []).filter(a => a.status === 'late' || (a.late_minutes && a.late_minutes > 0)).length
        const bt = (todayAtts || []).filter(a => a.status === 'business_trip').length
        const total = totalActive || 0
        setTodayAttendance({ present, absent: Math.max(0, total - present - bt), late, businessTrip: bt, total })

        // Danh sách NV chưa check-in hôm nay (top 15)
        try {
          const { data: allActive } = await supabase.from('employees').select('id, code, full_name').eq('status', 'active')
          const { data: todayCheckedIn } = await supabase.from('attendance').select('employee_id').eq('date', today)
          const checkedInIds = new Set((todayCheckedIn || []).map((a: any) => a.employee_id))
          const VIP = ['huylv@huyanhrubber.com', 'thuyht@huyanhrubber.com', 'trunglxh@huyanhrubber.com']
          const absentList = (allActive || [])
            .filter((e: any) => !checkedInIds.has(e.id))
            .slice(0, 15)
            .map((e: any) => ({ id: e.id, name: e.full_name, code: e.code }))
          setAbsentEmployees(absentList)
        } catch {}

        // Đơn chờ duyệt
        const { data: leaves } = await supabase.from('leave_requests').select('id, employee_id, start_date, end_date, total_days, created_at, employee:employees!leave_requests_employee_id_fkey(full_name), leave_type:leave_types!leave_requests_leave_type_id_fkey(name)').eq('status', 'pending').order('created_at', { ascending: false }).limit(5)
        setPendingLeaves((leaves || []).map((l: any) => ({ ...l, employee: Array.isArray(l.employee) ? l.employee[0] : l.employee, leave_type: Array.isArray(l.leave_type) ? l.leave_type[0] : l.leave_type })))

        const { data: ots } = await supabase.from('overtime_requests').select('id, employee_id, overtime_date, hours, created_at, employee:employees(full_name)').eq('status', 'pending').order('created_at', { ascending: false }).limit(5)
        setPendingOvertimes((ots || []).map((o: any) => ({ ...o, employee: Array.isArray(o.employee) ? o.employee[0] : o.employee })))

        // ★ Task chờ phê duyệt (evaluation_status = pending_approval)
        const { count: taskPendingCount } = await supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('evaluation_status', 'pending_approval')
        setPendingTaskApprovals(taskPendingCount || 0)

        // Công tác đang diễn ra
        const btTypeId = await (async () => { const { data } = await supabase.from('leave_types').select('id').eq('code', 'BUSINESS_TRIP').maybeSingle(); return data?.id })()
        if (btTypeId) {
          const { data: trips } = await supabase.from('leave_requests').select('id, start_date, end_date, trip_destination, trip_purpose, employee:employees!leave_requests_employee_id_fkey(full_name)').eq('leave_type_id', btTypeId).eq('status', 'approved').lte('start_date', today).gte('end_date', today).limit(10)
          setActiveTrips((trips || []).map((t: any) => ({ ...t, employee: Array.isArray(t.employee) ? t.employee[0] : t.employee })))
        }

        // Tổng công tháng (top 10 thấp nhất)
        const { data: monthAtts } = await supabase.from('attendance').select('employee_id, work_units').gte('date', monthStart).lte('date', monthEnd)
        if (monthAtts) {
          const empMap: Record<string, number> = {}
          monthAtts.forEach((a: any) => { empMap[a.employee_id] = (empMap[a.employee_id] || 0) + (a.work_units || 1) })
          const empIds = Object.keys(empMap)
          if (empIds.length > 0) {
            const { data: emps } = await supabase.from('employees').select('id, code, full_name').in('id', empIds).eq('status', 'active')
            const list = (emps || []).map((e: any) => ({ ...e, totalCong: Math.round((empMap[e.id] || 0) * 10) / 10 })).sort((a: any, b: any) => a.totalCong - b.totalCong)
            setMonthlyWorkUnits(list.slice(0, 10))
          }
        }

        // Biểu đồ chấm công 7 ngày gần nhất
        const weekData: any[] = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i)
          const ds = d.toISOString().split('T')[0]
          const dayLabel = d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit' })
          const { data: dayAtts } = await supabase.from('attendance').select('status, late_minutes').eq('date', ds)
          const p = (dayAtts || []).filter((a: any) => a.status !== 'business_trip').length
          const l = (dayAtts || []).filter((a: any) => a.status === 'late' || (a.late_minutes && a.late_minutes > 0)).length
          const b = (dayAtts || []).filter((a: any) => a.status === 'business_trip').length
          weekData.push({ date: dayLabel, 'Đi làm': p, 'Trễ': l, 'Công tác': b })
        }
        setWeeklyAttendance(weekData)
      } catch (e) { console.error('New dashboard sections error:', e) }

      try {
        const { count: totalProjects } = await supabase
          .from('projects').select('*', { count: 'exact', head: true })
        const { count: activeProjects } = await supabase
          .from('projects').select('*', { count: 'exact', head: true })
          .in('status', ['in_progress', 'approved', 'planning'])
        const { count: completedProjects } = await supabase
          .from('projects').select('*', { count: 'exact', head: true })
          .eq('status', 'completed')
        const { data: recentProjs } = await supabase
          .from('projects')
          .select('id, code, name, status, progress_pct')
          .neq('status', 'cancelled')
          .order('updated_at', { ascending: false })
          .limit(5)
        setProjectStats({
          total: totalProjects || 0,
          active: activeProjects || 0,
          completed: completedProjects || 0,
          recentProjects: recentProjs || [],
        })
      } catch (e) { console.error('Project stats error:', e) }

      // ★ Hiệu suất nhân viên tháng hiện tại
      try {
        const now = new Date()
        const { performanceDashboardService } = await import('../../services/performanceService')
        const kpis = await performanceDashboardService.getKPIs({ month: now.getMonth() + 1, year: now.getFullYear() })
        setPerfKPIs(kpis)
        const ranking = await performanceDashboardService.getEmployeeRanking({ month: now.getMonth() + 1, year: now.getFullYear(), limit: 5 })
        setPerfTopEmployees(ranking.map((r: any) => ({
          name: r.employee_name, dept: r.department_name, score: r.final_score, grade: r.grade, tasks: r.completed_tasks,
        })))
      } catch (e) { console.error('Performance stats error:', e) }

      // ★ Sales KPI (executive/admin: role check via user metadata)
      try {
        const isExecOrAdmin = user?.role === 'admin' || (user?.position_level && user.position_level <= 3)
        if (isExecOrAdmin) {
          const now = new Date()
          const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
          const monthEnd = now.getMonth() === 11
            ? `${now.getFullYear() + 1}-01-01`
            : `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}-01`
          const { data: orders } = await supabase
            .from('sales_orders')
            .select('total_value_usd, actual_payment_amount, deposit_amount, status')
            .gte('order_date', monthStart)
            .lt('order_date', monthEnd)
            .not('status', 'eq', 'cancelled')
          if (orders) {
            const revenue = orders.reduce((s, o) => s + (o.total_value_usd || 0), 0)
            const collected = orders.reduce((s, o) => s + (o.actual_payment_amount || 0) + (o.deposit_amount || 0), 0)
            setSalesKpi({ revenue: Math.round(revenue), orders: orders.length, collected: Math.round(collected), uncollected: Math.round(revenue - collected) })
          }
        }
      } catch (e) { console.error('Sales KPI error:', e) }

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

  useEffect(() => { loadData() }, [loadData])

  // ── Helpers ──
  const formatTimeAgo = (dateString: string) => {
    const diffMs = Date.now() - new Date(dateString).getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffMins < 60) return `${diffMins}p trước`
    if (diffHours < 24) return `${diffHours}h trước`
    if (diffDays < 7) return `${diffDays} ngày trước`
    return new Date(dateString).toLocaleDateString('vi-VN')
  }

  // Build sparkline data from trend
  const trendSparkCreated = useMemo(() => taskTrend.map(t => t.created), [taskTrend])
  const trendSparkCompleted = useMemo(() => taskTrend.map(t => t.completed), [taskTrend])

  // Donut center text
  const donutTotal = useMemo(() => statusDistribution.reduce((s, d) => s + d.count, 0), [statusDistribution])

  // ── Loading State ──
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BRAND.bg }}>
        <div className="text-center">
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})` }}>
            <RefreshCw className="w-6 h-6 text-white animate-spin" />
          </div>
          <p className="text-sm text-gray-500 font-medium">Đang tải Dashboard...</p>
        </div>
      </div>
    )
  }

  // ── Computed values ──
  const attendanceRate = todayAttendance.total > 0 ? Math.round(todayAttendance.present / todayAttendance.total * 100) : 0
  const pendingTotal = pendingLeaves.length + pendingOvertimes.length + pendingTaskApprovals

  return (
    <div className="min-h-screen" style={{ background: '#F8FAFB' }}>

      {/* ══════════ HEADER ══════════ */}
      <div className="bg-gradient-to-r from-[#1B4D3E] to-[#2D8B6E] lg:sticky lg:top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                {user?.full_name || 'Quản lý'}
              </h1>
              <p className="text-emerald-200 text-xs sm:text-sm mt-0.5 font-medium truncate">
                {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {stats?.monthLabel ? ` • ${stats.monthLabel}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => loadData(true)} disabled={isRefreshing}
                className="p-2.5 rounded-xl bg-white/15 text-white hover:bg-white/25 transition-all disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => navigate('/tasks/create')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-[#1B4D3E] text-sm font-bold shadow-lg hover:shadow-xl transition-all">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Tạo CV</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ MAIN CONTENT ══════════ */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 sm:py-6 space-y-5">

        {/* ═══ TẦNG 1: HERO KPI ═══ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Đi làm hôm nay */}
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-4 text-white shadow-lg shadow-emerald-200">
            <div className="flex items-center justify-between mb-2">
              <UserCheck className="w-5 h-5 opacity-80" />
              <span className="text-[11px] font-medium bg-white/20 px-2 py-0.5 rounded-full">{attendanceRate}%</span>
            </div>
            <div className="text-3xl font-bold">{todayAttendance.present}</div>
            <div className="text-emerald-100 text-xs mt-0.5">Đi làm hôm nay / {todayAttendance.total}</div>
          </div>

          {/* CV hoàn thành */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-200">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle2 className="w-5 h-5 opacity-80" />
              <span className="text-[11px] font-medium bg-white/20 px-2 py-0.5 rounded-full">{stats?.completionRate || 0}%</span>
            </div>
            <div className="text-3xl font-bold">{stats?.completedTasks || 0}</div>
            <div className="text-blue-100 text-xs mt-0.5">CV hoàn thành tháng này</div>
          </div>

          {/* Chờ duyệt */}
          <div onClick={() => navigate('/tasks/approve-batch')}
            className={`rounded-2xl p-4 shadow-lg cursor-pointer transition-transform hover:-translate-y-0.5 ${pendingTotal > 0 ? 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-amber-200' : 'bg-white text-gray-700 shadow-gray-100 border border-gray-100'}`}>
            <div className="flex items-center justify-between mb-2">
              <Bell className="w-5 h-5 opacity-80" />
              {pendingTotal > 0 && <span className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />}
            </div>
            <div className="text-3xl font-bold">{pendingTotal}</div>
            <div className={`text-xs mt-0.5 ${pendingTotal > 0 ? 'text-amber-100' : 'text-gray-400'}`}>Chờ duyệt</div>
          </div>

          {/* Quá hạn */}
          <div onClick={() => navigate('/tasks?filter=overdue')}
            className={`rounded-2xl p-4 shadow-lg cursor-pointer transition-transform hover:-translate-y-0.5 ${(stats?.overdueTasks || 0) > 0 ? 'bg-gradient-to-br from-red-500 to-rose-600 text-white shadow-red-200' : 'bg-white text-gray-700 shadow-gray-100 border border-gray-100'}`}>
            <div className="flex items-center justify-between mb-2">
              <AlertTriangle className="w-5 h-5 opacity-80" />
            </div>
            <div className="text-3xl font-bold">{stats?.overdueTasks || 0}</div>
            <div className={`text-xs mt-0.5 ${(stats?.overdueTasks || 0) > 0 ? 'text-red-100' : 'text-gray-400'}`}>Quá hạn</div>
          </div>
        </div>

        {/* ═══ SALES KPI (executive/admin only) ═══ */}
        {salesKpi && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 text-white shadow-lg shadow-indigo-200 cursor-pointer hover:-translate-y-0.5 transition-transform" onClick={() => navigate('/sales/dashboard')}>
              <div className="flex items-center justify-between mb-2">
                <TrendingUp className="w-5 h-5 opacity-80" />
                <span className="text-[11px] font-medium bg-white/20 px-2 py-0.5 rounded-full">Doanh thu</span>
              </div>
              <div className="text-2xl font-bold">${salesKpi.revenue.toLocaleString('en-US')}</div>
              <div className="text-indigo-100 text-xs mt-0.5">{salesKpi.orders} đơn hàng tháng này</div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">Đã thu</div>
              <div className="text-2xl font-bold text-emerald-600">${salesKpi.collected.toLocaleString('en-US')}</div>
              <div className="text-xs text-gray-400 mt-0.5">{salesKpi.revenue > 0 ? Math.round(salesKpi.collected / salesKpi.revenue * 100) : 0}% doanh thu</div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">Chưa thu</div>
              <div className="text-2xl font-bold text-amber-600">${salesKpi.uncollected.toLocaleString('en-US')}</div>
              <div className="text-xs text-gray-400 mt-0.5">Cần theo dõi</div>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => navigate('/executive')}>
              <div className="text-xs text-gray-500 mb-1">Chi tiết bán hàng</div>
              <div className="text-lg font-bold text-gray-700 flex items-center gap-1">Xem thêm <ChevronRight className="w-4 h-4" /></div>
              <div className="text-xs text-gray-400 mt-0.5">Pipeline, shipments, KH...</div>
            </div>
          </div>
        )}

        {/* ═══ TẦNG 2: CHẤM CÔNG + ĐƠN DUYỆT ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Chấm công chi tiết */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-500" /> Chấm công hôm nay
              </h3>
              <button onClick={() => navigate('/attendance')} className="text-xs text-emerald-600 font-semibold flex items-center gap-0.5 hover:gap-1 transition-all">
                Chi tiết <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="p-4">
              {/* Progress bar lớn */}
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span>{todayAttendance.present} / {todayAttendance.total} nhân viên</span>
                  <span className="font-bold text-emerald-600">{attendanceRate}%</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all" style={{ width: `${attendanceRate}%` }} />
                </div>
              </div>
              {/* 4 stat pills */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Đi làm', val: todayAttendance.present, color: 'text-emerald-600 bg-emerald-50', icon: <UserCheck className="w-3.5 h-3.5" /> },
                  { label: 'Vắng', val: todayAttendance.absent, color: 'text-red-500 bg-red-50', icon: <UserX className="w-3.5 h-3.5" /> },
                  { label: 'Trễ', val: todayAttendance.late, color: 'text-amber-600 bg-amber-50', icon: <Clock className="w-3.5 h-3.5" /> },
                  { label: 'Công tác', val: todayAttendance.businessTrip, color: 'text-sky-600 bg-sky-50', icon: <Plane className="w-3.5 h-3.5" /> },
                ].map(s => (
                  <div key={s.label} className={`rounded-xl p-2.5 text-center ${s.color}`}>
                    <div className="flex justify-center mb-1">{s.icon}</div>
                    <div className="text-lg font-bold">{s.val}</div>
                    <div className="text-[10px] font-medium opacity-70">{s.label}</div>
                  </div>
                ))}
              </div>
              {/* Danh sách NV chưa check-in */}
              {absentEmployees.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-50">
                  <p className="text-[11px] text-gray-400 font-medium mb-2">
                    <UserX className="w-3 h-3 inline mr-1" />
                    Chưa check-in ({absentEmployees.length} NV)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {absentEmployees.map(e => (
                      <span key={e.id} className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded-lg text-[11px] font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        {e.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Biểu đồ 7 ngày */}
              <div className="mt-4 pt-3 border-t border-gray-50">
                <p className="text-[11px] text-gray-400 font-medium mb-2">7 ngày gần nhất</p>
                <div className="h-[140px]" style={{ minWidth: 100, minHeight: 100 }}>
                  <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
                    <BarChart data={weeklyAttendance} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} width={28} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="Đi làm" fill="#10B981" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Trễ" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Công tác" fill="#0EA5E9" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* Đơn chờ duyệt + Công tác */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            {/* Đơn chờ duyệt */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex-1 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" /> Chờ duyệt
                  {pendingTotal > 0 && <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] text-center">{pendingTotal}</span>}
                </h3>
              </div>
              <div className="p-3">
                {pendingLeaves.length === 0 && pendingOvertimes.length === 0 ? (
                  <div className="text-center py-4"><CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto mb-1" /><p className="text-xs text-gray-400">Không có đơn chờ</p></div>
                ) : (
                  <div className="space-y-1.5">
                    {pendingLeaves.map((l: any) => (
                      <div key={l.id} onClick={() => navigate('/leave-requests')} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-orange-50 cursor-pointer transition-colors">
                        <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0"><Calendar className="w-3.5 h-3.5 text-orange-600" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-gray-800 truncate">{l.employee?.full_name}</p>
                          <p className="text-[10px] text-gray-400">{l.leave_type?.name} • {l.total_days}d</p>
                        </div>
                      </div>
                    ))}
                    {pendingOvertimes.map((o: any) => (
                      <div key={o.id} onClick={() => navigate('/overtime')} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-purple-50 cursor-pointer transition-colors">
                        <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0"><Timer className="w-3.5 h-3.5 text-purple-600" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-semibold text-gray-800 truncate">{o.employee?.full_name}</p>
                          <p className="text-[10px] text-gray-400">Tăng ca {o.hours}h</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Công tác */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <Plane className="w-4 h-4 text-sky-500" /> Công tác
                  {activeTrips.length > 0 && <span className="text-[11px] text-sky-600 font-medium">{activeTrips.length} người</span>}
                </h3>
                <button onClick={() => navigate('/attendance/business-trips')} className="text-xs text-sky-600 font-semibold flex items-center gap-0.5">Xem <ChevronRight className="w-3 h-3" /></button>
              </div>
              <div className="p-3">
                {activeTrips.length === 0 ? (
                  <p className="text-center py-3 text-xs text-gray-400">Không ai đi công tác</p>
                ) : (
                  <div className="space-y-1.5">
                    {activeTrips.slice(0, 4).map((t: any) => (
                      <div key={t.id} className="flex items-center gap-2 p-2 bg-sky-50/50 rounded-lg">
                        <Briefcase className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                        <span className="text-[12px] font-medium text-gray-800 flex-1 truncate">{t.employee?.full_name}</span>
                        <div className="text-right flex-shrink-0">
                          <span className="text-[10px] text-sky-600 font-medium">{new Date(t.end_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ TẦNG 3: HIỆU SUẤT + TOP NV ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Hiệu suất phòng ban */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-500" /> Hiệu suất Phòng ban
              </h3>
            </div>
            <div className="p-4 space-y-3">
              {departmentPerformance.slice(0, 6).map((dept, i) => {
                const rate = dept.completion_rate
                const barColor = rate >= 80 ? '#10B981' : rate >= 60 ? '#F59E0B' : '#EF4444'
                return (
                  <div key={dept.department_id || i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-semibold text-gray-700 truncate flex-1">{dept.department_name}</span>
                      <span className="text-[12px] font-bold ml-2" style={{ color: barColor }}>{rate}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(rate, 100)}%`, background: barColor }} />
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                      <span>Tổng: {dept.total_tasks}</span>
                      <span className="text-emerald-500">HT: {dept.completed_tasks}</span>
                      {dept.avg_score > 0 && <span className="text-blue-500">Điểm: {dept.avg_score}</span>}
                    </div>
                  </div>
                )
              })}
              {departmentPerformance.length === 0 && <p className="text-center py-4 text-xs text-gray-400">Chưa có dữ liệu</p>}
            </div>
          </div>

          {/* ★ Tiến độ Dự án */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <FolderKanban className="w-4 h-4 text-violet-500" /> Tiến độ Dự án
              </h3>
              <button onClick={() => navigate('/projects')} className="text-xs text-emerald-600 font-semibold flex items-center gap-0.5">Tất cả <ChevronRight className="w-3 h-3" /></button>
            </div>
            <div className="p-3">
              {/* Summary */}
              <div className="flex items-center gap-3 mb-3 text-center">
                <div className="flex-1 p-2 bg-violet-50 rounded-lg">
                  <div className="text-lg font-bold text-violet-700">{projectStats.active}</div>
                  <div className="text-[10px] text-violet-500">Đang chạy</div>
                </div>
                <div className="flex-1 p-2 bg-emerald-50 rounded-lg">
                  <div className="text-lg font-bold text-emerald-700">{projectStats.completed}</div>
                  <div className="text-[10px] text-emerald-500">Hoàn thành</div>
                </div>
                <div className="flex-1 p-2 bg-gray-50 rounded-lg">
                  <div className="text-lg font-bold text-gray-700">{projectStats.total}</div>
                  <div className="text-[10px] text-gray-500">Tổng</div>
                </div>
              </div>

              {/* Project List with Progress */}
              {projectStats.recentProjects.length === 0 ? (
                <p className="text-center py-4 text-xs text-gray-400">Chưa có dự án</p>
              ) : (
                <div className="space-y-2">
                  {projectStats.recentProjects.map((p) => {
                    const statusColors: Record<string, string> = {
                      in_progress: 'text-blue-600', completed: 'text-emerald-600', planning: 'text-amber-600',
                      approved: 'text-violet-600', on_hold: 'text-gray-500', draft: 'text-gray-400',
                    }
                    const statusLabels: Record<string, string> = {
                      in_progress: 'Đang chạy', completed: 'Xong', planning: 'Lập KH',
                      approved: 'Đã duyệt', on_hold: 'Tạm dừng', draft: 'Nháp',
                    }
                    const pct = Math.min(p.progress_pct || 0, 100)
                    const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : pct >= 20 ? 'bg-amber-500' : 'bg-gray-300'
                    return (
                      <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="p-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] text-gray-400 mr-1.5">{p.code}</span>
                            <span className="text-[12px] font-semibold text-gray-800 truncate">{p.name}</span>
                          </div>
                          <span className={`text-[10px] font-bold ml-2 flex-shrink-0 ${statusColors[p.status] || 'text-gray-500'}`}>
                            {statusLabels[p.status] || p.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] font-bold text-gray-600 w-8 text-right">{pct}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ TẦNG 4: QUÁHẠN + CÔNG THÁNG + QUICK ACTIONS ═══ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* CV quá hạn */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" /> CV quá hạn
              </h3>
              <button onClick={() => navigate('/tasks?filter=overdue')} className="text-xs text-red-500 font-semibold flex items-center gap-0.5">Xem tất cả <ChevronRight className="w-3 h-3" /></button>
            </div>
            <div className="p-3">
              {overdueTasks.length === 0 ? (
                <div className="text-center py-4"><CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto mb-1" /><p className="text-xs text-gray-400">Không có CV quá hạn</p></div>
              ) : (
                <div className="space-y-1.5">
                  {overdueTasks.map((t) => (
                    <div key={t.id} onClick={() => navigate(`/tasks/${t.id}`)} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-red-50 cursor-pointer transition-colors">
                      <div className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.medium}`}>{PRIORITY_LABELS[t.priority] || 'TB'}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-gray-800 truncate">{t.name}</p>
                        <p className="text-[10px] text-gray-400">{t.assignee_name} • {t.department_name}</p>
                      </div>
                      <span className="text-[11px] font-bold text-red-500 flex-shrink-0">-{t.days_overdue}d</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ★ Hiệu suất nhân viên tháng */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" /> Hiệu suất T{new Date().getMonth() + 1}
              </h3>
              <button onClick={() => navigate('/performance')} className="text-xs text-emerald-600 font-semibold flex items-center gap-0.5">Chi tiết <ChevronRight className="w-3 h-3" /></button>
            </div>
            <div className="p-3">
              {/* KPI Summary */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 bg-blue-50 rounded-lg">
                  <div className="text-lg font-bold text-blue-700">{perfKPIs.avg_score || '—'}</div>
                  <div className="text-[10px] text-blue-500">Điểm TB</div>
                </div>
                <div className="text-center p-2 bg-emerald-50 rounded-lg">
                  <div className="text-lg font-bold text-emerald-700">{perfKPIs.total_completed}</div>
                  <div className="text-[10px] text-emerald-500">Task xong</div>
                </div>
                <div className="text-center p-2 bg-amber-50 rounded-lg">
                  <div className="text-lg font-bold text-amber-700">{perfKPIs.on_time_rate}%</div>
                  <div className="text-[10px] text-amber-500">Đúng hạn</div>
                </div>
              </div>

              {/* Grade Distribution */}
              <div className="flex items-center gap-1 mb-3">
                {(['A', 'B', 'C', 'D', 'F'] as const).map(g => {
                  const count = perfKPIs.grade_distribution[g] || 0
                  const total = perfKPIs.total_evaluated || 1
                  const pct = Math.round((count / total) * 100)
                  const colors: Record<string, string> = { A: 'bg-emerald-500', B: 'bg-blue-500', C: 'bg-amber-500', D: 'bg-orange-500', F: 'bg-red-500' }
                  return (
                    <div key={g} className="flex-1" title={`Hạng ${g}: ${count} NV (${pct}%)`}>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${colors[g]}`} style={{ width: `${count > 0 ? Math.max(pct, 10) : 0}%` }} />
                      </div>
                      <div className="text-center mt-1">
                        <span className="text-[10px] font-bold text-gray-500">{g}</span>
                        {count > 0 && <span className="text-[9px] text-gray-400 ml-0.5">{count}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Top 5 Employees */}
              {perfTopEmployees.length === 0 ? (
                <p className="text-center py-2 text-xs text-gray-400">Chưa có đánh giá</p>
              ) : (
                <div className="space-y-1.5">
                  {perfTopEmployees.map((emp, i) => {
                    const gradeColors: Record<string, string> = { A: 'bg-emerald-100 text-emerald-700', B: 'bg-blue-100 text-blue-700', C: 'bg-amber-100 text-amber-700', D: 'bg-orange-100 text-orange-700', F: 'bg-red-100 text-red-700' }
                    return (
                      <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                        <span className="text-[11px] font-bold text-gray-400 w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-[12px] font-medium text-gray-800 truncate block">{emp.name}</span>
                          <span className="text-[10px] text-gray-400">{emp.dept} • {emp.tasks} task</span>
                        </div>
                        <span className="text-sm font-bold text-gray-700">{emp.score}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gradeColors[emp.grade] || gradeColors.F}`}>{emp.grade}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ QUICK ACTIONS ═══ */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-gray-400" /> Thao tác nhanh
          </h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: 'Tạo CV', icon: <ClipboardList className="w-5 h-5" />, path: '/tasks/create', bg: 'bg-blue-50 text-blue-600 hover:bg-blue-100' },
              { label: 'CV của tôi', icon: <CheckCircle2 className="w-5 h-5" />, path: '/my-tasks', bg: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' },
              { label: 'Phê duyệt', icon: <Clock className="w-5 h-5" />, path: '/approvals', bg: 'bg-amber-50 text-amber-600 hover:bg-amber-100' },
              { label: 'Chấm công', icon: <UserCheck className="w-5 h-5" />, path: '/attendance', bg: 'bg-teal-50 text-teal-600 hover:bg-teal-100' },
              { label: 'Phân ca', icon: <Calendar className="w-5 h-5" />, path: '/shift-assignments', bg: 'bg-violet-50 text-violet-600 hover:bg-violet-100' },
              { label: 'Bảng công', icon: <BarChart3 className="w-5 h-5" />, path: '/attendance/monthly', bg: 'bg-pink-50 text-pink-600 hover:bg-pink-100' },
            ].map(a => (
              <button key={a.path} onClick={() => navigate(a.path)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors ${a.bg}`}>
                {a.icon}
                <span className="text-[10px] font-semibold text-center">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

export default ManagerDashboard
