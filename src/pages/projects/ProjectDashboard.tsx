// ============================================================================
// FILE: src/pages/projects/ProjectDashboard.tsx
// MODULE: Quản lý Dự án — Huy Anh Rubber ERP
// PHASE: PM9 — Bước 9.3: Dashboard tổng quan
// ============================================================================
// Trang chính module Dự án — Dashboard cho BGĐ và PM
// Row 1: Summary Cards (Tổng | On Track | At Risk | Behind)
// Row 2: Charts (Status Donut + Department Bar)
// Row 3: My Projects (card list)
// Row 4: Upcoming Milestones (timeline)
// Row 5: Recent Activities (feed)
// Design: Industrial Rubber Theme, mobile-first
// ============================================================================

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3, PieChart, FolderKanban, Target, Activity,
  Plus, RefreshCcw, Loader2, TrendingUp, AlertTriangle,
  Clock, CheckCircle2, Briefcase, ArrowRight, Calendar,
  ChevronRight, Filter, LayoutDashboard,
} from 'lucide-react'
import ProjectStatusCard from '../../components/project/ProjectStatusCard'
import { projectDashboardService } from '../../services/project/projectDashboardService'
import type {
  DashboardOverview,
  MyDashboardData,
  ProjectHealthItem,
  MilestoneDue,
  HealthStatus,
} from '../../services/project/projectDashboardService'
import { useAuthStore } from '../../stores/authStore'

// ============================================
// HEALTH CONFIG
// ============================================

const HEALTH_LABELS: Record<HealthStatus, { label: string; color: string; bgLight: string; icon: typeof TrendingUp }> = {
  on_track: { label: 'Đúng tiến độ', color: '#10B981', bgLight: 'bg-emerald-50', icon: CheckCircle2 },
  at_risk: { label: 'Có rủi ro', color: '#F59E0B', bgLight: 'bg-amber-50', icon: AlertTriangle },
  behind_schedule: { label: 'Chậm tiến độ', color: '#EF4444', bgLight: 'bg-red-50', icon: Clock },
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  planning: 'Lập KH',
  approved: 'Đã duyệt',
  in_progress: 'Đang thực hiện',
  on_hold: 'Tạm dừng',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
}

// ============================================
// MAIN COMPONENT
// ============================================

const ProjectDashboard: React.FC = () => {
  const navigate = useNavigate()
  // ✅ FIX: AuthStore chỉ có `user`, không có `employee`
  // user.employee_id = employee UUID trong bảng employees
  const { user } = useAuthStore()

  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [myDashboard, setMyDashboard] = useState<MyDashboardData | null>(null)
  const [healthSummary, setHealthSummary] = useState<ProjectHealthItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadDashboard = async () => {
    setLoading(true)
    setError(null)
    try {
      const [overviewData, healthData] = await Promise.all([
        projectDashboardService.getOverview(),
        projectDashboardService.getHealthSummary(),
      ])
      setOverview(overviewData)
      setHealthSummary(healthData)

      // ✅ FIX: Dùng user.employee_id thay vì employee.id
      if (user?.employee_id) {
        const myData = await projectDashboardService.getMyDashboard(user.employee_id)
        setMyDashboard(myData)
      }
    } catch (err: any) {
      console.error('Dashboard error:', err)
      setError(err.message || 'Không thể tải dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
    // Auto refresh every 5 minutes
    const interval = setInterval(loadDashboard, 5 * 60 * 1000)
    return () => clearInterval(interval)
    // ✅ FIX: dependency dùng user?.employee_id
  }, [user?.employee_id])

  if (loading && !overview) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#1B4D3E] mx-auto mb-3" />
          <p className="text-sm text-gray-500">Đang tải dashboard...</p>
        </div>
      </div>
    )
  }

  // Health counts
  const onTrackCount = healthSummary.filter(h => h.health === 'on_track').length
  const atRiskCount = healthSummary.filter(h => h.health === 'at_risk').length
  const behindCount = healthSummary.filter(h => h.health === 'behind_schedule').length

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* ===== HEADER ===== */}
      <div className="bg-[#1B4D3E] text-white px-4 pt-12 pb-6 safe-area-top">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-[#E8A838]" />
              <h1 className="text-lg font-bold">Dashboard Dự án</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadDashboard}
                disabled={loading}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => navigate('/projects/new')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#E8A838] text-[#1B4D3E] font-semibold text-sm hover:bg-[#E8A838]/90 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Tạo DA</span>
              </button>
            </div>
          </div>
          <p className="text-sm text-white/70">
            Tổng quan tất cả dự án đang hoạt động
          </p>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 -mt-3">

        {/* ===== ROW 1: SUMMARY CARDS ===== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {/* Tổng dự án */}
          <SummaryCard
            label="Tổng dự án"
            value={overview?.total_projects || 0}
            sublabel={`${overview?.active_projects || 0} đang chạy`}
            icon={FolderKanban}
            color="bg-[#1B4D3E]"
            iconColor="text-white"
          />
          {/* On Track */}
          <SummaryCard
            label="Đúng tiến độ"
            value={onTrackCount}
            sublabel="On Track"
            icon={CheckCircle2}
            color="bg-emerald-500"
            iconColor="text-white"
          />
          {/* At Risk */}
          <SummaryCard
            label="Có rủi ro"
            value={atRiskCount}
            sublabel="At Risk"
            icon={AlertTriangle}
            color="bg-amber-500"
            iconColor="text-white"
          />
          {/* Behind */}
          <SummaryCard
            label="Chậm tiến độ"
            value={behindCount}
            sublabel="Behind Schedule"
            icon={Clock}
            color="bg-red-500"
            iconColor="text-white"
          />
        </div>

        {/* ===== ROW 2: CHARTS ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Status Donut Chart */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <PieChart className="w-4 h-4 text-[#1B4D3E]" />
              <h3 className="text-sm font-semibold text-gray-800">Theo trạng thái</h3>
            </div>
            <StatusDonutChart data={overview?.by_status || []} total={overview?.total_projects || 0} />
          </div>

          {/* Department Bar Chart */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4 text-[#1B4D3E]" />
              <h3 className="text-sm font-semibold text-gray-800">Theo phòng ban</h3>
            </div>
            <DepartmentBarChart data={overview?.by_department || []} />
          </div>
        </div>

        {/* ===== ROW 3: HEALTH SUMMARY TABLE ===== */}
        {healthSummary.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 mb-6">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#1B4D3E]" />
                <h3 className="text-sm font-semibold text-gray-800">Tình trạng sức khỏe DA</h3>
              </div>
              <button
                onClick={() => navigate('/projects/list')}
                className="text-xs text-[#1B4D3E] font-medium flex items-center gap-1 hover:underline"
              >
                Xem tất cả <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {/* Mobile: Card view */}
            <div className="lg:hidden p-4 space-y-3">
              {healthSummary.slice(0, 5).map(item => (
                <HealthCard key={item.id} item={item} onClick={() => navigate(`/projects/${item.id}`)} />
              ))}
            </div>

            {/* Desktop: Table view */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 text-left font-medium">Mã</th>
                    <th className="px-4 py-3 text-left font-medium">Tên dự án</th>
                    <th className="px-4 py-3 text-center font-medium">Sức khỏe</th>
                    <th className="px-4 py-3 text-center font-medium">Tiến độ</th>
                    <th className="px-4 py-3 text-center font-medium">Gap</th>
                    <th className="px-4 py-3 text-center font-medium">MS trễ</th>
                    <th className="px-4 py-3 text-center font-medium">Rủi ro</th>
                    <th className="px-4 py-3 text-center font-medium">Vấn đề</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {healthSummary.map(item => {
                    const cfg = HEALTH_LABELS[item.health]
                    return (
                      <tr
                        key={item.id}
                        onClick={() => navigate(`/projects/${item.id}`)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.code}</td>
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-[240px] truncate">{item.name}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bgLight} ${item.health === 'on_track' ? 'text-emerald-700' : item.health === 'at_risk' ? 'text-amber-700' : 'text-red-700'}`}>
                            <cfg.icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center gap-2 justify-center">
                            <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${item.progress_pct}%`, backgroundColor: cfg.color }}
                              />
                            </div>
                            <span className="text-xs font-mono text-gray-600">{item.progress_pct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className={`px-4 py-3 text-center text-xs font-mono font-semibold ${item.gap >= 0 ? 'text-emerald-600' : item.gap > -15 ? 'text-amber-600' : 'text-red-600'}`}>
                          {item.gap > 0 ? '+' : ''}{item.gap.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-mono ${item.overdue_milestones > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                            {item.overdue_milestones}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-mono ${item.critical_risks > 0 ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>
                            {item.critical_risks}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-mono ${item.critical_issues > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                            {item.critical_issues}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== ROW 4: MY PROJECTS ===== */}
        {myDashboard && myDashboard.my_projects.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-[#1B4D3E]" />
                <h3 className="text-sm font-semibold text-gray-800">Dự án của tôi</h3>
                <span className="text-xs bg-[#1B4D3E]/10 text-[#1B4D3E] px-2 py-0.5 rounded-full font-medium">
                  {myDashboard.my_projects.length}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {myDashboard.my_projects.map(proj => (
                <ProjectStatusCard
                  key={proj.id}
                  {...proj}
                />
              ))}
            </div>
          </div>
        )}

        {/* ===== ROW 5: UPCOMING MILESTONES ===== */}
        {myDashboard && myDashboard.upcoming_milestones.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 mb-6">
            <div className="flex items-center gap-2 p-4 border-b border-gray-100">
              <Target className="w-4 h-4 text-[#1B4D3E]" />
              <h3 className="text-sm font-semibold text-gray-800">Mốc sắp đến hạn</h3>
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                30 ngày tới
              </span>
            </div>
            <div className="p-4 space-y-3">
              {myDashboard.upcoming_milestones.map(ms => (
                <MilestoneRow key={ms.id} milestone={ms} />
              ))}
            </div>
          </div>
        )}

        {/* ===== ROW 6: RECENT ACTIVITIES ===== */}
        {myDashboard && myDashboard.recent_activities.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 mb-6">
            <div className="flex items-center gap-2 p-4 border-b border-gray-100">
              <Activity className="w-4 h-4 text-[#1B4D3E]" />
              <h3 className="text-sm font-semibold text-gray-800">Hoạt động gần đây</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {myDashboard.recent_activities.slice(0, 10).map(act => (
                <div key={act.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1B4D3E]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-xs font-semibold text-[#1B4D3E]">
                      {act.actor_name.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium text-gray-900">{act.actor_name}</span>
                      {' '}{formatAction(act.action)}{' '}
                      <span className="font-medium">{act.entity_name}</span>
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                      <span className="font-mono">{act.project_code}</span>
                      <span>•</span>
                      <span>{timeAgo(act.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface SummaryCardProps {
  label: string
  value: number
  sublabel: string
  icon: React.FC<{ className?: string }>
  color: string
  iconColor: string
}

const SummaryCard: React.FC<SummaryCardProps> = ({ label, value, sublabel, icon: Icon, color, iconColor }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-4">
    <div className="flex items-center justify-between mb-2">
      <span className="text-xs text-gray-500 font-medium">{label}</span>
      <div className={`w-8 h-8 ${color} rounded-lg flex items-center justify-center`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
    </div>
    <div className="text-2xl font-bold text-gray-900 font-mono">{value}</div>
    <div className="text-xs text-gray-400 mt-0.5">{sublabel}</div>
  </div>
)

// Simple donut chart using SVG
const StatusDonutChart: React.FC<{ data: { status: string; count: number; color: string }[]; total: number }> = ({ data, total }) => {
  if (total === 0) {
    return <div className="text-center text-sm text-gray-400 py-8">Chưa có dự án</div>
  }

  const radius = 50
  const stroke = 14
  const normalizedRadius = radius - stroke / 2
  const circumference = normalizedRadius * 2 * Math.PI
  let offset = 0

  return (
    <div className="flex items-center gap-6">
      <div className="relative w-[120px] h-[120px] flex-shrink-0">
        <svg width="120" height="120" viewBox="0 0 100 100" className="-rotate-90">
          {data.map((item, idx) => {
            const pct = (item.count / total) * 100
            const dashArray = `${(pct / 100) * circumference} ${circumference}`
            const dashOffset = -(offset / 100) * circumference
            offset += pct
            return (
              <circle
                key={idx}
                cx="50" cy="50"
                r={normalizedRadius}
                fill="none"
                stroke={item.color}
                strokeWidth={stroke}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-xl font-bold text-gray-900 font-mono">{total}</div>
            <div className="text-[10px] text-gray-400">Dự án</div>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        {data.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className="text-gray-600 flex-1">{STATUS_LABELS[item.status] || item.status}</span>
            <span className="font-mono font-semibold text-gray-700">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Simple bar chart using divs
const DepartmentBarChart: React.FC<{ data: { department: string; count: number }[] }> = ({ data }) => {
  if (data.length === 0) {
    return <div className="text-center text-sm text-gray-400 py-8">Chưa có dữ liệu</div>
  }

  const maxCount = Math.max(...data.map(d => d.count), 1)

  return (
    <div className="space-y-2.5">
      {data.sort((a, b) => b.count - a.count).map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <span className="text-xs text-gray-600 w-24 truncate text-right flex-shrink-0" title={item.department}>
            {item.department}
          </span>
          <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
            <div
              className="h-full bg-[#1B4D3E] rounded-full flex items-center justify-end pr-2 transition-all duration-500"
              style={{ width: `${Math.max(10, (item.count / maxCount) * 100)}%` }}
            >
              <span className="text-[10px] font-mono font-bold text-white">{item.count}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Health card for mobile view
const HealthCard: React.FC<{ item: ProjectHealthItem; onClick: () => void }> = ({ item, onClick }) => {
  const cfg = HEALTH_LABELS[item.health]
  const HealthIcon = cfg.icon
  return (
    <div onClick={onClick} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer active:bg-gray-100">
      <div className={`w-10 h-10 rounded-lg ${cfg.bgLight} flex items-center justify-center flex-shrink-0`}>
        <HealthIcon className="w-5 h-5" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-gray-500 font-mono">{item.code}</div>
        <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
        <div className="flex items-center gap-3 mt-1">
          <div className="flex items-center gap-1">
            <div className="w-12 bg-gray-200 rounded-full h-1.5">
              <div
                className="h-full rounded-full"
                style={{ width: `${item.progress_pct}%`, backgroundColor: cfg.color }}
              />
            </div>
            <span className="text-[10px] font-mono text-gray-500">{item.progress_pct.toFixed(0)}%</span>
          </div>
          <span className={`text-[10px] font-mono font-semibold ${item.gap >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            Gap: {item.gap > 0 ? '+' : ''}{item.gap.toFixed(1)}%
          </span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
    </div>
  )
}

// Milestone row
const MilestoneRow: React.FC<{ milestone: MilestoneDue }> = ({ milestone: ms }) => {
  const isOverdue = ms.is_overdue
  const isApproaching = !isOverdue && ms.status === 'approaching'
  return (
    <div className="flex items-center gap-3">
      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
        isOverdue ? 'bg-red-500' : isApproaching ? 'bg-amber-500' : 'bg-blue-500'
      }`} />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-800 font-medium truncate">{ms.name}</div>
        <div className="text-xs text-gray-400">
          <span className="font-mono">{ms.project_code}</span>
          {ms.phase_name && <span> • {ms.phase_name}</span>}
        </div>
      </div>
      <div className={`text-xs font-mono flex-shrink-0 ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
        {new Date(ms.due_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
      </div>
      {isOverdue && (
        <span className="text-[10px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
          Trễ
        </span>
      )}
      {isApproaching && (
        <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
          Sắp tới
        </span>
      )}
    </div>
  )
}

// ============================================
// HELPERS
// ============================================

function formatAction(action: string): string {
  const MAP: Record<string, string> = {
    created: 'đã tạo',
    updated: 'đã cập nhật',
    deleted: 'đã xóa',
    status_changed: 'đã đổi trạng thái',
    member_added: 'đã thêm thành viên vào',
    member_removed: 'đã xóa thành viên khỏi',
    milestone_completed: 'đã hoàn thành mốc',
    risk_added: 'đã thêm rủi ro',
    issue_resolved: 'đã giải quyết vấn đề',
    file_uploaded: 'đã tải lên',
    comment_added: 'đã bình luận về',
  }
  return MAP[action] || action
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = Math.floor((now - then) / 1000)

  if (diff < 60) return 'vừa xong'
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`
  return new Date(dateStr).toLocaleDateString('vi-VN')
}

export default ProjectDashboard