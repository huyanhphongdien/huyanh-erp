// ============================================================
// ATTENDANCE LIST PAGE V6 — Uses attendanceService V3
// File: src/features/attendance/AttendanceListPage.tsx
// Huy Anh ERP System - Chấm công V3
// ============================================================
// CHANGES from V5:
//   ★ Uses attendanceService.getAll() instead of direct Supabase
//   ★ Stats: properly caps working_minutes for auto_checkout
//   ★ Stats: late_minutes capped at shift standard_hours
//   ★ Widget: warns clearly when no shift assigned
//   ★ Mobile-first: 44px+ touch targets, active: states
//   ★ FIX: null safety for departments/shifts/teams arrays
// ============================================================

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Clock,
  Search,
  ChevronLeft,
  ChevronRight,
  Calendar,
  AlertTriangle,
  Zap,
  User,
  Building2,
  MapPin,
  MapPinOff,
  Filter,
  ChevronDown,
  Monitor,
  Users,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { attendanceService } from '../../services/attendanceService'
import type { AttendanceRecord } from '../../services/attendanceService'
import { CheckInOutWidget } from './CheckInOutWidget'

// ============================================================
// HELPERS
// ============================================================

function formatTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatShiftTime(t: string): string {
  return t?.substring(0, 5) || ''
}

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m.toString().padStart(2, '0')}p`
}

function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '—'
  if (minutes < 60) return `${minutes}p`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}p` : `${h}h`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const dayNames = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7']
  const day = d.getDate().toString().padStart(2, '0')
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  return `${dayNames[d.getDay()]}, ${day}/${month}`
}

/** Cap working_minutes for auto_checkout records */
function getEffectiveWorkingMinutes(record: AttendanceRecord): number {
  const raw = record.working_minutes || 0
  if (!raw) return 0

  // auto_checkout records: cap at shift's standard_hours
  if (record.auto_checkout && record.shift?.standard_hours) {
    const capMinutes = record.shift.standard_hours * 60
    return Math.min(raw, capMinutes)
  }

  return raw
}

/** Cap late_minutes for sanity (max = shift standard_hours * 60) */
function getEffectiveLateMinutes(record: AttendanceRecord): number {
  const raw = record.late_minutes || 0
  if (!raw) return 0

  // Cap at shift standard hours (e.g., max 480 for 8h shift)
  if (record.shift?.standard_hours) {
    return Math.min(raw, record.shift.standard_hours * 60)
  }

  // Default cap: 8 hours
  return Math.min(raw, 480)
}

// Default date range: last 7 days
function getDefaultDateRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date()
  from.setDate(from.getDate() - 6)
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

// Status config
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  present: { label: 'Đúng giờ', className: 'bg-green-100 text-green-700' },
  late: { label: 'Đi trễ', className: 'bg-amber-100 text-amber-700' },
  early_leave: { label: 'Về sớm', className: 'bg-orange-100 text-orange-700' },
  absent: { label: 'Vắng', className: 'bg-red-100 text-red-700' },
  auto_checkout: { label: 'auto_checkout', className: 'bg-gray-100 text-gray-600' },
}

const TEAM_BADGE: Record<string, string> = {
  A: 'bg-blue-50 text-blue-700 border-blue-200',
  B: 'bg-rose-50 text-rose-700 border-rose-200',
}

// ============================================================
// COMPONENT
// ============================================================

export default function AttendanceListPage() {
  const { user } = useAuthStore()
  const employeeId = user?.employee_id
  const userDepartmentId = user?.department_id
  const isManager = (user?.position_level ?? 99) <= 5

  // ── State ──
  const defaultRange = getDefaultDateRange()
  const [scope, setScope] = useState<'mine' | 'department' | 'all'>(
    isManager ? 'department' : 'mine'
  )
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState(defaultRange.from)
  const [toDate, setToDate] = useState(defaultRange.to)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [shiftFilter, setShiftFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const pageSize = 50

  // ── Departments list (for filter) ──
  const { data: departmentsRaw } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name, code')
        .order('name')
      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })
  const departments = departmentsRaw || []

  // ── Shifts list (for filter) ──
  const { data: shiftsRaw } = useQuery({
    queryKey: ['shifts-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('id, code, name, start_time, end_time, standard_hours, crosses_midnight')
        .eq('is_active', true)
        .order('start_time')
      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })
  const shifts = shiftsRaw || []

  // ── Teams list (for filter) ──
  const { data: teamsRaw } = useQuery({
    queryKey: ['teams-list'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('shift_teams')
          .select('id, code, name')
          .eq('is_active', true)
          .order('code')
        if (error) throw error
        return data || []
      } catch {
        return [] // Table may not exist yet
      }
    },
    staleTime: 5 * 60 * 1000,
  })
  const teams = teamsRaw || []

  // ── Team members mapping ──
  const { data: teamMembersRaw } = useQuery({
    queryKey: ['team-members-map'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('shift_team_members')
          .select('employee_id, team:shift_teams!shift_team_members_team_id_fkey(code, name)')
          .is('effective_to', null)
        if (error) throw error
        const map: Record<string, { code: string; name: string }> = {}
        for (const m of data || []) {
          const t = m.team as any
          if (t) map[m.employee_id] = { code: t.code, name: t.name }
        }
        return map
      } catch {
        return {}
      }
    },
    staleTime: 60 * 1000,
  })
  const teamMembers = teamMembersRaw || {}

  // ── Main attendance query (via service V3) ──
  const effectiveDepartmentId =
    scope === 'department' ? (departmentFilter !== 'all' ? departmentFilter : userDepartmentId) : 
    scope === 'all' ? (departmentFilter !== 'all' ? departmentFilter : undefined) :
    undefined

  const { data: attendanceData, isLoading } = useQuery({
    queryKey: [
      'attendance', 'list',
      page, pageSize, scope, search,
      effectiveDepartmentId, fromDate, toDate,
      statusFilter, shiftFilter, employeeId,
    ],
    queryFn: () =>
      attendanceService.getAll({
        page,
        pageSize,
        search: search || undefined,
        employee_id: scope === 'mine' ? employeeId || undefined : undefined,
        department_id: effectiveDepartmentId || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        shift_id: shiftFilter !== 'all' ? shiftFilter : undefined,
        scope,
        current_employee_id: employeeId || undefined,
      }),
    enabled: !!employeeId,
    staleTime: 10 * 1000,
  })

  const records = attendanceData?.data || []
  const totalRecords = attendanceData?.total || 0
  const totalPages = attendanceData?.totalPages || 1

  // ── Post-filter by team (client-side) ──
  const filteredRecords = useMemo(() => {
    if (teamFilter === 'all') return records
    return records.filter((r) => {
      const team = teamMembers[r.employee_id]
      if (teamFilter === 'none') return !team
      return team?.code === teamFilter
    })
  }, [records, teamFilter, teamMembers])

  // ── Summary stats (capped values) ──
  const stats = useMemo(() => {
    const uniqueDays = new Set(filteredRecords.map((r) => r.date))
    let totalWorking = 0
    let totalLate = 0
    let totalEarlyLeave = 0
    let totalOT = 0

    for (const r of filteredRecords) {
      totalWorking += getEffectiveWorkingMinutes(r)
      totalLate += getEffectiveLateMinutes(r)
      totalEarlyLeave += r.early_leave_minutes || 0
      totalOT += r.overtime_minutes || 0
    }

    return {
      days: uniqueDays.size,
      totalWorking,
      totalLate,
      totalEarlyLeave,
      totalOT,
    }
  }, [filteredRecords])

  // ── Active filter count (for mobile badge) ──
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (statusFilter !== 'all') count++
    if (shiftFilter !== 'all') count++
    if (teamFilter !== 'all') count++
    if (fromDate !== defaultRange.from || toDate !== defaultRange.to) count++
    return count
  }, [statusFilter, shiftFilter, teamFilter, fromDate, toDate, defaultRange])

  // ── Callback: invalidate from widget ──
  const handleWidgetAction = useCallback(() => {
    // Widget already invalidates its own queries
  }, [])

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="max-w-[1600px] mx-auto">
      {/* ── Header ── */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Bảng chấm công</h1>
        <p className="text-sm text-gray-500">
          {scope === 'mine' ? 'Của tôi' : scope === 'department' ? 'Phòng ban của bạn' : 'Tất cả'}
        </p>
      </div>

      {/* ── Check-in/out Widget ── */}
      <div className="mb-4">
        <CheckInOutWidget onCheckInOut={handleWidgetAction} />
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 mb-4">
        <StatCard icon={Calendar} label="Ngày" value={String(stats.days)} color="blue" />
        <StatCard
          icon={Clock}
          label="Tổng giờ"
          value={formatDuration(stats.totalWorking)}
          color="emerald"
        />
        <StatCard
          icon={AlertTriangle}
          label="Trễ"
          value={formatMinutes(stats.totalLate)}
          color={stats.totalLate > 0 ? 'amber' : 'gray'}
        />
        <StatCard
          icon={Zap}
          label="Về sớm"
          value={formatMinutes(stats.totalEarlyLeave)}
          color={stats.totalEarlyLeave > 0 ? 'orange' : 'gray'}
        />
        <StatCard
          icon={Clock}
          label="OT"
          value={formatMinutes(stats.totalOT)}
          color={stats.totalOT > 0 ? 'purple' : 'gray'}
        />
      </div>

      {/* ── Filter Bar ── */}
      <div className="bg-white rounded-xl border shadow-sm mb-4">
        {/* Row 1: Scope + Department + Team + Search */}
        <div className="px-3 py-2 flex flex-wrap items-center gap-2">
          {/* Scope toggle */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => { setScope('mine'); setPage(1) }}
              className={`px-3 py-2 text-xs font-medium min-h-[44px] flex items-center gap-1
                ${scope === 'mine' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 active:bg-gray-100'}`}
            >
              <User size={13} /> Của tôi
            </button>
            {isManager && (
              <button
                onClick={() => { setScope('department'); setPage(1) }}
                className={`px-3 py-2 text-xs font-medium min-h-[44px] flex items-center gap-1 border-l
                  ${scope === 'department' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 active:bg-gray-100'}`}
              >
                <Building2 size={13} /> PB
              </button>
            )}
            {isManager && (
              <button
                onClick={() => { setScope('all'); setPage(1) }}
                className={`px-3 py-2 text-xs font-medium min-h-[44px] flex items-center gap-1 border-l
                  ${scope === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 active:bg-gray-100'}`}
              >
                <Monitor size={13} /> Tất cả
              </button>
            )}
          </div>

          {/* Department filter (desktop + when scope=all) */}
          {(scope === 'department' || scope === 'all') && (
            <select
              value={departmentFilter}
              onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1) }}
              className="hidden lg:block px-2 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            >
              <option value="all">Tất cả PB</option>
              {departments.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}

          {/* Team filter (desktop) */}
          {teams.length > 0 && (
            <select
              value={teamFilter}
              onChange={(e) => { setTeamFilter(e.target.value); setPage(1) }}
              className="hidden lg:block px-2 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            >
              <option value="all">Tất cả đội</option>
              {teams.map((t: any) => (
                <option key={t.id} value={t.code}>{t.name}</option>
              ))}
              <option value="none">Chưa phân đội</option>
            </select>
          )}

          {/* Search */}
          <div className="relative flex-1 min-w-[150px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm nhân viên..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-[15px] min-h-[44px]"
            />
          </div>

          {/* Date range (desktop) */}
          <div className="hidden lg:flex items-center gap-1">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
              className="px-2 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            />
            <span className="text-gray-400">—</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1) }}
              className="px-2 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            />
          </div>

          {/* Status filter (desktop) */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="hidden lg:block px-2 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="present">Đúng giờ</option>
            <option value="late">Đi trễ</option>
            <option value="early_leave">Về sớm</option>
            <option value="auto_checkout">Auto checkout</option>
          </select>

          {/* Shift filter (desktop) */}
          <select
            value={shiftFilter}
            onChange={(e) => { setShiftFilter(e.target.value); setPage(1) }}
            className="hidden lg:block px-2 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
          >
            <option value="all">Tất cả ca</option>
            {shifts.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {/* Mobile: toggle filters button */}
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="lg:hidden flex items-center gap-1 px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px] active:bg-gray-50 relative"
          >
            <Filter size={14} />
            <span>Lọc</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* ── Mobile expanded filters ── */}
        {showMobileFilters && (
          <div className="lg:hidden px-3 pb-3 space-y-2 border-t pt-2">
            {/* Dept filter mobile */}
            {(scope === 'department' || scope === 'all') && (
              <select
                value={departmentFilter}
                onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1) }}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
              >
                <option value="all">Tất cả PB</option>
                {departments.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            )}

            {/* Date range mobile */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
              />
              <span className="text-gray-400">—</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setPage(1) }}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
              />
            </div>

            {/* Status + Shift mobile */}
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
              >
                <option value="all">Trạng thái</option>
                <option value="present">Đúng giờ</option>
                <option value="late">Đi trễ</option>
                <option value="early_leave">Về sớm</option>
                <option value="auto_checkout">Auto checkout</option>
              </select>
              <select
                value={shiftFilter}
                onChange={(e) => { setShiftFilter(e.target.value); setPage(1) }}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
              >
                <option value="all">Tất cả ca</option>
                {shifts.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {teams.length > 0 && (
              <select
                value={teamFilter}
                onChange={(e) => { setTeamFilter(e.target.value); setPage(1) }}
                className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
              >
                <option value="all">Tất cả đội</option>
                {teams.map((t: any) => (
                  <option key={t.id} value={t.code}>{t.name}</option>
                ))}
                <option value="none">Chưa phân đội</option>
              </select>
            )}
          </div>
        )}
      </div>

      {/* ══════════ TABLE (Desktop) ══════════ */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {/* Desktop table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Ngày</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Nhân viên</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Đội</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Ca</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Check-in</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Check-out</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Giờ làm</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Trễ</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Về sớm</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">OT</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">GPS</th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                      Đang tải...
                    </div>
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-12 text-gray-400">
                    Không có dữ liệu chấm công
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const team = teamMembers[r.employee_id]
                  const effectiveWorking = getEffectiveWorkingMinutes(r)
                  const effectiveLate = getEffectiveLateMinutes(r)
                  const isLate = r.status === 'late' || effectiveLate > 0
                  const statusCfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.present

                  return (
                    <tr key={r.id} className="active:bg-gray-50">
                      {/* Ngày */}
                      <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                        {formatDate(r.date)}
                      </td>

                      {/* Nhân viên */}
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-gray-900">{r.employee?.full_name || '—'}</div>
                        <div className="text-xs text-gray-400">
                          {r.employee?.code}
                          {r.employee?.department?.name && (
                            <> • {r.employee.department.name}</>
                          )}
                        </div>
                      </td>

                      {/* Đội */}
                      <td className="px-3 py-2.5">
                        {team ? (
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${TEAM_BADGE[team.code] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {team.name}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Ca */}
                      <td className="px-3 py-2.5">
                        {r.shift ? (
                          <div>
                            <div className="font-medium text-gray-800 text-xs">{r.shift.name}</div>
                            <div className="text-[10px] text-gray-400">
                              {formatShiftTime(r.shift.start_time)}-{formatShiftTime(r.shift.end_time)}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Check-in */}
                      <td className="px-3 py-2.5 text-center">
                        <span className={isLate ? 'text-amber-600 font-medium' : 'text-gray-700'}>
                          {formatTime(r.check_in_time)}
                        </span>
                      </td>

                      {/* Check-out */}
                      <td className="px-3 py-2.5 text-center">
                        <span className={r.auto_checkout ? 'text-gray-400' : 'text-gray-700'}>
                          {formatTime(r.check_out_time)}
                        </span>
                        {r.auto_checkout && (
                          <span className="ml-1 text-[9px] text-gray-400">⚡</span>
                        )}
                      </td>

                      {/* Giờ làm */}
                      <td className="px-3 py-2.5 text-center font-medium text-gray-700">
                        {formatDuration(effectiveWorking)}
                      </td>

                      {/* Trễ */}
                      <td className="px-3 py-2.5 text-center">
                        {effectiveLate > 0 ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-xs font-medium">
                            <AlertTriangle size={10} />
                            {formatMinutes(effectiveLate)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* Về sớm */}
                      <td className="px-3 py-2.5 text-center">
                        {r.early_leave_minutes > 0 ? (
                          <span className="text-orange-600 text-xs font-medium">
                            {formatMinutes(r.early_leave_minutes)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* OT */}
                      <td className="px-3 py-2.5 text-center">
                        {(r.overtime_minutes || 0) > 0 ? (
                          <span className="text-purple-600 text-xs font-medium">
                            {formatMinutes(r.overtime_minutes)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>

                      {/* GPS */}
                      <td className="px-3 py-2.5 text-center">
                        {r.is_gps_verified ? (
                          <MapPin size={14} className="inline text-green-500" />
                        ) : (
                          <MapPinOff size={14} className="inline text-red-400" />
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${statusCfg.className}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ══════════ MOBILE CARDS ══════════ */}
        <div className="lg:hidden">
          {isLoading ? (
            <div className="text-center py-12 text-gray-400">
              <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
              <span className="text-sm">Đang tải...</span>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              Không có dữ liệu chấm công
            </div>
          ) : (
            <div className="divide-y">
              {filteredRecords.map((r) => {
                const team = teamMembers[r.employee_id]
                const effectiveWorking = getEffectiveWorkingMinutes(r)
                const effectiveLate = getEffectiveLateMinutes(r)
                const statusCfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.present

                return (
                  <div key={r.id} className="px-3 py-3 active:bg-gray-50">
                    {/* Row 1: Date + Employee + Status */}
                    <div className="flex items-start justify-between mb-1.5">
                      <div>
                        <div className="text-xs text-gray-400">{formatDate(r.date)}</div>
                        <div className="font-medium text-gray-900 text-sm">
                          {r.employee?.full_name || '—'}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {r.employee?.code}
                          {r.employee?.department?.name && <> • {r.employee.department.name}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {team && (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${TEAM_BADGE[team.code] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {team.code}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusCfg.className}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Shift + GPS */}
                    {r.shift && (
                      <div className="flex items-center gap-2 mb-1.5 text-xs text-gray-500">
                        <span className="font-medium text-gray-700">{r.shift.name}</span>
                        <span>
                          {formatShiftTime(r.shift.start_time)}-{formatShiftTime(r.shift.end_time)}
                        </span>
                        {r.shift.crosses_midnight && (
                          <span className="px-1 py-px bg-indigo-50 text-indigo-500 rounded text-[9px]">
                            qua đêm
                          </span>
                        )}
                        {r.is_gps_verified ? (
                          <MapPin size={10} className="text-green-500" />
                        ) : (
                          <MapPinOff size={10} className="text-red-400" />
                        )}
                      </div>
                    )}

                    {/* Row 3: Check-in/out/Working grid */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[10px] text-gray-400">Check-in</div>
                        <div className={`text-sm font-medium ${effectiveLate > 0 ? 'text-amber-600' : 'text-gray-700'}`}>
                          {formatTime(r.check_in_time)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400">Check-out</div>
                        <div className={`text-sm font-medium ${r.auto_checkout ? 'text-gray-400' : 'text-gray-700'}`}>
                          {formatTime(r.check_out_time)}
                          {r.auto_checkout && <span className="ml-0.5 text-[9px]">⚡</span>}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-400">Giờ làm</div>
                        <div className="text-sm font-medium text-gray-700">
                          {formatDuration(effectiveWorking)}
                        </div>
                      </div>
                    </div>

                    {/* Row 4: Badges (if any) */}
                    {(effectiveLate > 0 || (r.early_leave_minutes || 0) > 0 || (r.overtime_minutes || 0) > 0) && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {effectiveLate > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-medium">
                            <AlertTriangle size={9} /> Trễ {formatMinutes(effectiveLate)}
                          </span>
                        )}
                        {(r.early_leave_minutes || 0) > 0 && (
                          <span className="px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded text-[10px] font-medium">
                            Về sớm {formatMinutes(r.early_leave_minutes)}
                          </span>
                        )}
                        {(r.overtime_minutes || 0) > 0 && (
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded text-[10px] font-medium">
                            OT {formatMinutes(r.overtime_minutes)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-3 py-2.5 border-t bg-gray-50">
            <span className="text-xs text-gray-500">
              {totalRecords} bản ghi
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-gray-300 active:bg-white disabled:opacity-40 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <ChevronLeft size={15} />
              </button>

              {/* Desktop page numbers */}
              <div className="hidden sm:flex gap-1">
                {getPageNumbers(page, totalPages).map((pageNum, i) =>
                  pageNum === '...' ? (
                    <span key={`dots-${i}`} className="px-2 py-1.5 text-gray-400 text-sm">
                      ...
                    </span>
                  ) : (
                    <button
                      key={pageNum}
                      onClick={() => setPage(Number(pageNum))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium min-w-[44px] min-h-[44px]
                        ${page === pageNum ? 'bg-blue-600 text-white' : 'text-gray-600 active:bg-gray-100'}`}
                    >
                      {pageNum}
                    </button>
                  )
                )}
              </div>

              {/* Mobile: current page */}
              <span className="sm:hidden text-xs font-medium text-gray-700 px-2 min-h-[44px] flex items-center">
                {page}/{totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-gray-300 active:bg-white disabled:opacity-40 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// SUB-COMPONENTS
// ============================================================

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any
  label: string
  value: string
  color: string
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
    gray: 'bg-gray-50 text-gray-400',
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.gray}`}>
          <Icon size={12} />
        </div>
        <span className="text-[10px] text-gray-400 uppercase font-medium">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color === 'gray' ? 'text-gray-400' : `text-${color}-600`}`}>
        {value}
      </div>
    </div>
  )
}

function getPageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | string)[] = [1]
  if (current > 3) pages.push('...')
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i)
  }
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

export { AttendanceListPage }