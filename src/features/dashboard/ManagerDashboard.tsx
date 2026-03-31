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

  return (
    <div className="min-h-screen" style={{ background: BRAND.bg }}>

      {/* ══════════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════════ */}
      <div className="bg-white/70 backdrop-blur-md border-b border-black/5 lg:sticky lg:top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-[22px] font-bold text-gray-900 tracking-tight truncate">
                Xin chào, {user?.full_name || 'Người dùng'}{' '}
                <span className="hidden sm:inline">👋</span>
              </h1>
              <p className="text-gray-400 text-xs sm:text-[13px] mt-0.5 font-medium truncate">
                {stats?.monthLabel || 'Tổng quan hệ thống'} • {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadData(true)}
                disabled={isRefreshing}
                className="p-2.5 rounded-xl bg-white/80 border border-gray-200/60 text-gray-500 hover:text-gray-700 hover:bg-white transition-all disabled:opacity-50"
                title="Làm mới"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => navigate('/tasks/create')}
                className="flex items-center gap-1.5 px-3.5 sm:px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0"
                style={{ background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.secondary})`, boxShadow: `0 4px 14px ${BRAND.primary}40` }}
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Tạo mới</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5">

        {/* ─── KPI CARDS — Bento Row ─── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
          <KpiCard
            label="Nhân viên"
            value={stats?.totalEmployees || 0}
            subtitle={stats?.newEmployeesThisMonth ? `+${stats.newEmployeesThisMonth} tháng này` : undefined}
            icon={<Users />}
            accentColor="#3B82F6"
            iconBg="bg-blue-50 text-blue-600"
            onClick={() => navigate('/employees')}
          />
          <KpiCard
            label="Công việc tháng"
            value={stats?.totalTasks || 0}
            subtitle={stats?.newTasksThisWeek ? `+${stats.newTasksThisWeek} tuần này` : 'Tạo trong tháng'}
            icon={<ClipboardList />}
            sparkData={trendSparkCreated}
            accentColor={BRAND.secondary}
            iconBg="bg-emerald-50 text-emerald-600"
            trend={stats?.newTasksThisWeek ? { value: `+${stats.newTasksThisWeek}`, isPositive: true } : undefined}
            onClick={() => navigate('/tasks')}
          />
          <KpiCard
            label="Hoàn thành"
            value={`${stats?.completionRate || 0}%`}
            subtitle={`${stats?.completedTasks || 0} CV trong tháng`}
            icon={<CheckCircle2 />}
            sparkData={trendSparkCompleted}
            accentColor="#10B981"
            iconBg="bg-green-50 text-green-600"
          />
          <KpiCard
            label="Quá hạn"
            value={stats?.overdueTasks || 0}
            subtitle="Trong tháng"
            icon={<AlertTriangle />}
            accentColor="#EF4444"
            iconBg="bg-red-50 text-red-500"
            onClick={() => navigate('/tasks?filter=overdue')}
          />
          <KpiCard
            label="Chờ duyệt"
            value={stats?.pendingApprovals || 0}
            subtitle="Đang chờ phê duyệt"
            icon={<Clock />}
            accentColor={BRAND.accent}
            iconBg="bg-amber-50 text-amber-600"
            onClick={() => navigate('/approvals')}
          />
        </div>

        {/* ─── PROJECTS (ẩn — chưa dùng) ─── */}
        {false && projectStats.total > 0 && (
          <GlassCard className="p-3.5 sm:p-5">
            <SectionHeader
              title="Dự án"
              icon={<FolderKanban className="w-4 h-4" />}
              action={
                <button onClick={() => navigate('/projects/list')}
                  className="text-xs sm:text-sm font-semibold flex items-center gap-0.5 hover:gap-1.5 transition-all"
                  style={{ color: BRAND.secondary }}>
                  Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
                </button>
              }
            />
            {/* Project summary pills */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-3.5">
              {[
                { label: 'Tổng DA', val: projectStats.total, color: 'bg-blue-50 text-blue-600' },
                { label: 'Đang chạy', val: projectStats.active, color: 'bg-emerald-50 text-emerald-600' },
                { label: 'Hoàn thành', val: projectStats.completed, color: 'bg-green-50 text-green-600' },
              ].map((p) => (
                <div key={p.label} className={`text-center p-2.5 sm:p-3 rounded-xl ${p.color}`}>
                  <div className="text-lg sm:text-xl font-bold">{p.val}</div>
                  <div className="text-[10px] sm:text-xs opacity-70 font-medium">{p.label}</div>
                </div>
              ))}
            </div>
            {/* Project list */}
            <div className="space-y-1.5">
              {projectStats.recentProjects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => navigate(`/projects/${proj.id}`)}
                  className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl hover:bg-black/[0.02] cursor-pointer transition-colors active:bg-black/[0.04]"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${BRAND.secondary}12` }}>
                    <FolderKanban className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: BRAND.secondary }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{proj.name}</p>
                    <p className="text-[10px] sm:text-xs text-gray-400">{proj.code}</p>
                  </div>
                  <div className="flex items-center gap-2.5 flex-shrink-0">
                    <div className="w-16 sm:w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${proj.progress_pct}%`,
                          background: proj.progress_pct >= 75 ? '#10B981' :
                            proj.progress_pct >= 40 ? BRAND.secondary : BRAND.accent,
                        }}
                      />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-gray-500 w-10 text-right">
                      {proj.progress_pct}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* ─── CHARTS ROW — Bento: 2/3 + 1/3 ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {/* Trend Area Chart */}
          <GlassCard className="lg:col-span-2 p-3.5 sm:p-5">
            <SectionHeader
              title={`Xu hướng Công việc ${stats?.monthLabel || ''}`}
              icon={<TrendingUp className="w-4 h-4" />}
              action={
                <div className="flex items-center gap-3 sm:gap-4 text-[10px] sm:text-xs text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: BRAND.secondary }} />
                    Hoàn thành
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-[2px] rounded" style={{ background: BRAND.accent, opacity: 0.7 }} />
                    Tạo mới
                  </span>
                </div>
              }
            />
            <div className="h-48 sm:h-56 lg:h-64 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={taskTrend}>
                  <defs>
                    <linearGradient id="gradCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND.secondary} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={BRAND.secondary} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND.accent} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={BRAND.accent} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E4DF" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="completed" name="Hoàn thành" stroke={BRAND.secondary}
                    strokeWidth={2.5} fill="url(#gradCompleted)" dot={{ fill: 'white', stroke: BRAND.secondary, strokeWidth: 2, r: 3 }}
                    activeDot={{ r: 5, stroke: BRAND.secondary, strokeWidth: 2 }} />
                  <Area type="monotone" dataKey="created" name="Tạo mới" stroke={BRAND.accent}
                    strokeWidth={2} strokeDasharray="6 4" fill="url(#gradCreated)"
                    dot={false} activeDot={{ r: 4, stroke: BRAND.accent, strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* Status Donut */}
          <GlassCard className="p-3.5 sm:p-5 flex flex-col">
            <SectionHeader title="Phân bổ Trạng thái" icon={<Target className="w-4 h-4" />} />
            <div className="flex-1 flex items-center justify-center -mt-2 sm:mt-0">
              <div className="relative h-40 sm:h-48 w-full max-w-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius="55%" outerRadius="80%"
                      paddingAngle={4} dataKey="count" strokeWidth={0}>
                      {statusDistribution.map((entry, index) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value, _name, props) => [`${value} CV`, (props as any).payload.label]}
                      contentStyle={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)', border: '1px solid #E5E7EB', borderRadius: '12px', fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl sm:text-3xl font-bold text-gray-800">{stats?.completionRate || 0}%</span>
                  <span className="text-[10px] sm:text-xs text-gray-400 font-medium">Hoàn thành</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5 sm:gap-3 justify-center mt-2">
              {statusDistribution.map((item) => (
                <div key={item.status} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] sm:text-xs text-gray-500">{item.label} ({item.count})</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* ─── DEPT PERFORMANCE + TOP EMPLOYEES — Bento 1:1 ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
          {/* Department Performance */}
          <GlassCard className="p-3.5 sm:p-5">
            <SectionHeader
              title="Hiệu suất Phòng ban"
              icon={<Building2 className="w-4 h-4" />}
              action={
                <button onClick={() => navigate('/tasks?tab=overview')}
                  className="text-xs sm:text-sm font-semibold flex items-center gap-0.5"
                  style={{ color: BRAND.secondary }}>
                  Chi tiết <ChevronRight className="w-3.5 h-3.5" />
                </button>
              }
            />
            {/* Custom horizontal bars */}
            <div className="space-y-2.5 sm:space-y-3">
              {departmentPerformance.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Chưa có dữ liệu</p>
              ) : (
                departmentPerformance.slice(0, 6).map((dept, i) => (
                  <div key={dept.department_id} className="flex items-center gap-2.5 sm:gap-3">
                    <span className="text-xs sm:text-[13px] text-gray-500 w-20 sm:w-24 text-right truncate flex-shrink-0 font-medium">
                      {dept.department_name}
                    </span>
                    <div className="flex-1 h-5 sm:h-6 bg-gray-100/80 rounded-lg overflow-hidden">
                      <div
                        className="h-full rounded-lg transition-all duration-700"
                        style={{
                          width: `${dept.completion_rate}%`,
                          background: `linear-gradient(90deg, ${BRAND.secondary}, ${BRAND.primary})`,
                        }}
                      />
                    </div>
                    <span className="text-xs sm:text-sm font-bold w-10 text-right flex-shrink-0"
                      style={{ color: dept.completion_rate >= 70 ? BRAND.secondary : dept.completion_rate >= 40 ? BRAND.accent : '#EF4444' }}>
                      {dept.completion_rate}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </GlassCard>

          {/* Top Employees */}
          <GlassCard className="p-3.5 sm:p-5">
            <SectionHeader title="Nhân viên Xuất sắc" icon={<Award className="w-4 h-4" />} />
            <div className="space-y-1.5 sm:space-y-2">
              {topEmployees.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Chưa có dữ liệu đánh giá</p>
              ) : (
                topEmployees.map((emp, index) => (
                  <div key={emp.employee_id}
                    className={`flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl transition-colors ${index === 0 ? 'bg-amber-50/50' : 'hover:bg-black/[0.015]'}`}>
                    <div className={`
                      w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0
                      ${index === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm' : ''}
                      ${index === 1 ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-white' : ''}
                      ${index === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-400 text-white' : ''}
                      ${index > 2 ? 'bg-gray-100 text-gray-500' : ''}
                    `}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{emp.employee_name}</p>
                      <p className="text-[10px] sm:text-xs text-gray-400 truncate">{emp.department_name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg sm:text-xl font-bold" style={{ color: emp.avg_score >= 90 ? '#10B981' : BRAND.secondary }}>
                        {emp.avg_score}
                      </p>
                      <p className="text-[10px] sm:text-xs text-gray-400">{emp.completed_tasks} CV</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>

        {/* ─── OVERDUE + UPCOMING — Bento 1:1 ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
          {/* Overdue Tasks */}
          <GlassCard className="p-3.5 sm:p-5">
            <SectionHeader
              title="Quá hạn"
              icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
              action={overdueTasks.length > 0 ? (
                <button onClick={() => navigate('/tasks?filter=overdue')}
                  className="text-xs sm:text-sm text-red-500 font-semibold flex items-center gap-0.5">
                  Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : undefined}
            />
            {overdueTasks.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400 font-medium">Không có công việc quá hạn</p>
              </div>
            ) : (
              <div className="space-y-1.5 sm:space-y-2">
                {overdueTasks.map((task) => (
                  <div key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-red-50/60 hover:bg-red-50 cursor-pointer transition-colors active:bg-red-100">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                      <Timer className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{task.name}</p>
                      <p className="text-[10px] sm:text-xs text-gray-400 truncate">{task.code} • {task.assignee_name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-sm font-bold text-red-500">-{task.days_overdue}d</span>
                      <span className={`block text-[10px] px-1.5 py-0.5 rounded-md mt-0.5 ${PRIORITY_COLORS[task.priority]}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Upcoming Tasks */}
          <GlassCard className="p-3.5 sm:p-5">
            <SectionHeader
              title="Sắp đến hạn (trong tháng)"
              icon={<Calendar className="w-4 h-4 text-amber-500" />}
              action={upcomingTasks.length > 0 ? (
                <button onClick={() => navigate('/tasks')}
                  className="text-xs sm:text-sm text-amber-600 font-semibold flex items-center gap-0.5">
                  Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : undefined}
            />
            {upcomingTasks.length === 0 ? (
              <div className="text-center py-8">
                <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400 font-medium">Không có công việc sắp đến hạn</p>
              </div>
            ) : (
              <div className="space-y-1.5 sm:space-y-2">
                {upcomingTasks.map((task) => (
                  <div key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-amber-50/50 hover:bg-amber-50 cursor-pointer transition-colors active:bg-amber-100">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{task.name}</p>
                      <p className="text-[10px] sm:text-xs text-gray-400 truncate">{task.code} • {task.assignee_name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-sm font-bold text-amber-600">
                        {task.days_until_due === 0 ? 'Hôm nay' : `${task.days_until_due}d`}
                      </span>
                      <span className={`block text-[10px] px-1.5 py-0.5 rounded-md mt-0.5 ${PRIORITY_COLORS[task.priority]}`}>
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* ─── ACTIVITIES + CONTRACTS — Bento 2:1 ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {/* Recent Activities */}
          <GlassCard className="lg:col-span-2 p-3.5 sm:p-5">
            <SectionHeader title="Hoạt động Gần đây" icon={<Activity className="w-4 h-4" />} />
            {recentActivities.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Chưa có hoạt động nào</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {recentActivities.map((activity) => (
                  <div key={activity.id}
                    className="flex items-start gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl hover:bg-black/[0.015] transition-colors">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${ACTIVITY_COLORS[activity.action] || 'bg-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
                        <span className="font-semibold text-gray-800">{activity.actor_name}</span>
                        {' '}
                        <span className="text-gray-500">{ACTION_LABELS[activity.action] || activity.action}</span>
                        {activity.task_name && (
                          <> "<span className="font-semibold" style={{ color: BRAND.secondary }}>{activity.task_name}</span>"</>
                        )}
                      </p>
                      <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">{formatTimeAgo(activity.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {/* Expiring Contracts (ẩn — chưa dùng) */}
          {false && <GlassCard className="p-3.5 sm:p-5">
            <SectionHeader
              title="HĐ Sắp hết hạn"
              icon={<FileText className="w-4 h-4 text-violet-500" />}
              action={expiringContracts.length > 0 ? (
                <button onClick={() => navigate('/contracts')}
                  className="text-xs sm:text-sm text-violet-600 font-semibold flex items-center gap-0.5">
                  Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : undefined}
            />
            {expiringContracts.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400 font-medium">Không có HĐ sắp hết hạn</p>
              </div>
            ) : (
              <div className="space-y-1.5 sm:space-y-2">
                {expiringContracts.map((contract) => (
                  <div key={contract.id}
                    onClick={() => navigate('/contracts')}
                    className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 rounded-xl bg-violet-50/50 hover:bg-violet-50 cursor-pointer transition-colors active:bg-violet-100">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <Briefcase className="w-4 h-4 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{contract.employee_name}</p>
                      <p className="text-[10px] sm:text-xs text-gray-400 truncate">{contract.contract_type}</p>
                    </div>
                    <span className="text-sm font-bold text-violet-600 flex-shrink-0">{contract.days_until_expiry}d</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>}
        </div>

        {/* ─── QUICK ACTIONS ─── */}
        <GlassCard className="p-3.5 sm:p-5">
          <SectionHeader title="Thao tác Nhanh" icon={<BarChart3 className="w-4 h-4" />} />
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-2.5">
            {[
              { label: 'Tạo CV', icon: <ClipboardList className="w-5 h-5" />, path: '/tasks/create', bg: 'bg-blue-50 text-blue-600 hover:bg-blue-100 active:bg-blue-200' },
              { label: 'CV của tôi', icon: <CheckCircle2 className="w-5 h-5" />, path: '/my-tasks', bg: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:bg-emerald-200' },
              { label: 'Phê duyệt', icon: <Clock className="w-5 h-5" />, path: '/approvals', bg: 'bg-amber-50 text-amber-600 hover:bg-amber-100 active:bg-amber-200' },
              { label: 'Nhân viên', icon: <Users className="w-5 h-5" />, path: '/employees', bg: 'bg-violet-50 text-violet-600 hover:bg-violet-100 active:bg-violet-200' },
              { label: 'Nghỉ phép', icon: <Calendar className="w-5 h-5" />, path: '/leave-requests', bg: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 active:bg-indigo-200' },
              { label: 'Thống kê', icon: <BarChart3 className="w-5 h-5" />, path: '/reports/tasks', bg: 'bg-pink-50 text-pink-600 hover:bg-pink-100 active:bg-pink-200' },
            ].map((action) => (
              <button key={action.path} onClick={() => navigate(action.path)}
                className={`flex flex-col items-center gap-1.5 sm:gap-2 p-3 sm:p-4 rounded-xl transition-colors ${action.bg}`}>
                {action.icon}
                <span className="text-[10px] sm:text-xs font-semibold text-center leading-tight">{action.label}</span>
              </button>
            ))}
          </div>
        </GlassCard>

      </div>
    </div>
  )
}

export default ManagerDashboard