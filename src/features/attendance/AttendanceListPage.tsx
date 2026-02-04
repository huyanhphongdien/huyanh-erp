// ============================================================
// ATTENDANCE LIST PAGE V4 — MOBILE RESPONSIVE
// File: src/features/attendance/AttendanceListPage.tsx
// Huy Anh ERP System - Chấm công V2
// ============================================================
// V4: Tối ưu mobile
// - Mobile: card layout thay vì table
// - Filters: stack dọc trên mobile, nút "Lọc" mở rộng
// - Responsive padding, font size
// - Desktop: giữ nguyên table như V3
// ============================================================

import { useState, useMemo } from 'react'
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
  Monitor,
  MapPin,
  MapPinOff,
  Filter,
  ChevronDown,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'
import { CheckInOutWidget } from './CheckInOutWidget'

// ============================================================
// TYPES
// ============================================================

interface AttendanceRecord {
  id: string
  employee_id: string
  date: string
  check_in_time: string | null
  check_out_time: string | null
  working_minutes: number | null
  overtime_minutes: number | null
  status: string
  notes: string | null
  shift_id: string | null
  late_minutes: number
  early_leave_minutes: number
  is_gps_verified: boolean
  auto_checkout: boolean
  check_in_lat: number | null
  check_in_lng: number | null
  check_out_lat: number | null
  check_out_lng: number | null
  employee?: {
    id: string
    code: string
    full_name: string
    department_id?: string
    department?: { id: string; name: string; code: string }
  }
  shift?: {
    id: string
    code: string
    name: string
    start_time: string
    end_time: string
  }
}

interface ShiftOption {
  id: string
  code: string
  name: string
}

interface DepartmentOption {
  id: string
  code: string
  name: string
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function formatTime(isoStr: string | null): string {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}p`
  return `${h}h${m > 0 ? ` ${String(m).padStart(2, '0')}p` : ''}`
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'present':
      return { label: 'Đúng giờ', color: 'bg-green-100 text-green-700' }
    case 'late':
      return { label: 'Đi trễ', color: 'bg-yellow-100 text-yellow-700' }
    case 'early_leave':
      return { label: 'Về sớm', color: 'bg-orange-100 text-orange-700' }
    case 'absent':
      return { label: 'Vắng', color: 'bg-red-100 text-red-700' }
    default:
      return { label: status, color: 'bg-gray-100 text-gray-600' }
  }
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })
}

// ============================================================
// GPS STATUS BADGE
// ============================================================

function GPSBadge({
  isVerified,
  isAutoCheckout,
  hasCoords,
}: {
  isVerified: boolean
  isAutoCheckout: boolean
  hasCoords: boolean
}) {
  if (isAutoCheckout) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
        <Zap size={10} />
      </span>
    )
  }
  if (isVerified || hasCoords) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
        <MapPin size={10} />
        <span className="text-[10px]">✓</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-500 text-xs font-medium rounded">
      <Monitor size={10} />
    </span>
  )
}

// ============================================================
// MOBILE CARD COMPONENT
// ============================================================

function AttendanceCard({
  record,
  showEmployee,
}: {
  record: AttendanceRecord
  showEmployee: boolean
}) {
  const statusBadge = getStatusBadge(record.status)
  const shift = Array.isArray(record.shift) ? (record.shift as any)[0] : record.shift
  const dept = Array.isArray(record.employee?.department)
    ? (record.employee?.department as any)[0]
    : record.employee?.department
  const hasCoords = record.check_in_lat != null && record.check_in_lng != null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3.5 space-y-2.5">
      {/* Row 1: Date + Status + GPS */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-800">
          {formatDateShort(record.date)}
        </span>
        <div className="flex items-center gap-1.5">
          <GPSBadge isVerified={record.is_gps_verified} isAutoCheckout={record.auto_checkout} hasCoords={hasCoords} />
          <span className={`px-2 py-0.5 text-[11px] font-medium rounded ${statusBadge.color}`}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      {/* Row 2: Employee (nếu xem tất cả) */}
      {showEmployee && record.employee && (
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {record.employee.full_name?.charAt(0) || '?'}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{record.employee.full_name}</p>
            <p className="text-[10px] text-gray-400 truncate">
              {record.employee.code}{dept?.name ? ` • ${dept.name}` : ''}
            </p>
          </div>
        </div>
      )}

      {/* Row 3: Shift */}
      {shift && (
        <div className="text-xs text-gray-500">
          Ca: <span className="font-medium text-gray-700">{shift.name}</span>
          <span className="text-gray-400 ml-1">({shift.start_time?.substring(0, 5)} - {shift.end_time?.substring(0, 5)})</span>
        </div>
      )}

      {/* Row 4: Check-in / Check-out / Giờ làm */}
      <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-lg p-2.5">
        <div className="text-center">
          <p className="text-[10px] text-gray-400 mb-0.5">Check-in</p>
          <p className={`text-sm font-semibold ${record.status === 'late' ? 'text-yellow-600' : 'text-gray-800'}`}>
            {formatTime(record.check_in_time)}
          </p>
        </div>
        <div className="text-center border-x border-gray-200">
          <p className="text-[10px] text-gray-400 mb-0.5">Check-out</p>
          <div className="flex items-center justify-center gap-0.5">
            <p className={`text-sm font-semibold ${record.status === 'early_leave' ? 'text-orange-600' : 'text-gray-800'}`}>
              {formatTime(record.check_out_time)}
            </p>
            {record.auto_checkout && (
              <span title="Tự động checkout">
                <Zap size={10} className="text-orange-500" />
              </span>
            )}
          </div>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-gray-400 mb-0.5">Giờ làm</p>
          <p className="text-sm font-semibold text-gray-800">
            {formatDuration(record.working_minutes)}
          </p>
        </div>
      </div>

      {/* Row 5: Badges (Trễ, Về sớm, OT) */}
      {(record.late_minutes > 0 || record.early_leave_minutes > 0 || (record.overtime_minutes || 0) > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {record.late_minutes > 0 && (
            <span className="inline-flex items-center gap-0.5 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[11px] font-medium rounded">
              <AlertTriangle size={9} />
              Trễ {record.late_minutes}p
            </span>
          )}
          {record.early_leave_minutes > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 bg-orange-100 text-orange-700 text-[11px] font-medium rounded">
              Về sớm {record.early_leave_minutes}p
            </span>
          )}
          {(record.overtime_minutes || 0) > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 bg-purple-100 text-purple-700 text-[11px] font-medium rounded">
              OT {formatDuration(record.overtime_minutes)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function AttendanceListPage() {
  const { user } = useAuthStore()

  // Permission checks
  const isAdmin = user?.role === 'admin'
  const isManager = user?.role === 'admin' || user?.role === 'manager' || (user as any)?.is_manager
  const userLevel = (user as any)?.position_level || 7
  const isExecutive = userLevel <= 3
  const canSeeOthers = isAdmin || isExecutive || isManager

  // ── STATE ──
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [shiftFilter, setShiftFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [showOnlyMine, setShowOnlyMine] = useState(!canSeeOthers)
  const [showFilters, setShowFilters] = useState(false)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })

  // ── LOAD DEPARTMENTS ──
  const { data: departmentsData } = useQuery<DepartmentOption[]>({
    queryKey: ['departments-attendance-filter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, code, name')
        .eq('status', 'active')
        .order('name')
      if (error) throw error
      return data || []
    },
    enabled: canSeeOthers,
  })
  const departments = departmentsData || []

  // ── LOAD SHIFTS ──
  const { data: shiftsData } = useQuery<ShiftOption[]>({
    queryKey: ['shifts-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('id, code, name')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data || []
    },
  })
  const shifts = shiftsData || []

  // ── LOAD ATTENDANCE RECORDS ──
  const { data: attendanceData, isLoading } = useQuery({
    queryKey: [
      'attendance-list-v3',
      page, pageSize, statusFilter, shiftFilter,
      dateFrom, dateTo, departmentFilter,
      showOnlyMine, user?.employee_id,
    ],
    queryFn: async () => {
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('attendance')
        .select(`
          *,
          employee:employees!attendance_employee_id_fkey(
            id, code, full_name, department_id,
            department:departments!employees_department_id_fkey(id, name, code)
          ),
          shift:shifts(
            id, code, name, start_time, end_time
          )
        `, { count: 'exact' })

      if (showOnlyMine) {
        query = query.eq('employee_id', user?.employee_id || '')
      } else if (!isAdmin && !isExecutive && !isManager) {
        query = query.eq('employee_id', user?.employee_id || '')
      }

      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      if (dateFrom) query = query.gte('date', dateFrom)
      if (dateTo) query = query.lte('date', dateTo)
      if (shiftFilter !== 'all' && shiftFilter !== 'none') query = query.eq('shift_id', shiftFilter)
      if (shiftFilter === 'none') query = query.is('shift_id', null)

      const { data, error, count } = await query
        .order('date', { ascending: false })
        .order('check_in_time', { ascending: false })
        .range(from, to)

      if (error) throw error

      let records = (data || []) as AttendanceRecord[]

      if (!showOnlyMine && departmentFilter) {
        records = records.filter(r => {
          const dept = Array.isArray(r.employee?.department)
            ? (r.employee?.department as any)[0]
            : r.employee?.department
          return dept?.id === departmentFilter
        })
      }

      if (!showOnlyMine && isManager && !isExecutive && !isAdmin && !departmentFilter) {
        const myDeptId = (user as any)?.department_id
        if (myDeptId) {
          records = records.filter(r => {
            const dept = Array.isArray(r.employee?.department)
              ? (r.employee?.department as any)[0]
              : r.employee?.department
            return dept?.id === myDeptId
          })
        }
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim()
        records = records.filter(r =>
          r.employee?.full_name?.toLowerCase().includes(term) ||
          r.employee?.code?.toLowerCase().includes(term)
        )
      }

      return {
        data: records,
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      }
    },
    enabled: !!user?.employee_id,
  })

  const records = attendanceData?.data || []
  const totalPages = attendanceData?.totalPages || 1
  const totalRecords = attendanceData?.total || 0

  const subtitle = useMemo(() => {
    if (showOnlyMine) return 'Chấm công của tôi'
    if (isAdmin || isExecutive) return 'Tất cả nhân viên'
    if (isManager) return 'Phòng ban của bạn'
    return 'Chấm công của bạn'
  }, [showOnlyMine, isAdmin, isExecutive, isManager])

  const showEmployeeColumn = canSeeOthers && !showOnlyMine

  const activeFilterCount = [
    statusFilter !== 'all',
    shiftFilter !== 'all',
    departmentFilter !== '',
  ].filter(Boolean).length

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="p-3 sm:p-4 lg:p-6 max-w-[1500px] mx-auto space-y-3 sm:space-y-5">
      {/* ══════════ HEADER ══════════ */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Bảng chấm công</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>

      {/* ══════════ CHECK-IN/OUT WIDGET ══════════ */}
      <CheckInOutWidget />

      {/* ══════════ FILTER TOOLBAR ══════════ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
        {/* Row 1: Main actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Nút "Của tôi" */}
          {canSeeOthers && (
            <button
              onClick={() => { setShowOnlyMine(v => !v); setPage(1) }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border
                ${showOnlyMine
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
            >
              <User size={15} />
              <span className="hidden xs:inline">Của tôi</span>
            </button>
          )}

          {/* Phòng ban */}
          {canSeeOthers && !showOnlyMine && (
            <div className="flex items-center gap-1.5">
              <Building2 size={15} className="text-gray-400 hidden sm:block" />
              <select
                value={departmentFilter}
                onChange={e => { setDepartmentFilter(e.target.value); setPage(1) }}
                className="px-2 sm:px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 max-w-[150px] sm:max-w-none"
              >
                <option value="">Tất cả PB</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Search — desktop only */}
          {canSeeOthers && !showOnlyMine && (
            <div className="relative hidden sm:flex flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input
                type="text"
                placeholder="Tìm nhân viên..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {/* Date range — desktop */}
          <div className="hidden md:flex items-center gap-1.5">
            <Calendar size={15} className="text-gray-400" />
            <input type="date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1) }}
              className="px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            <span className="text-gray-400 text-xs">→</span>
            <input type="date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1) }}
              className="px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Status & Shift — desktop only */}
          <select value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="hidden lg:block px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
            <option value="all">Tất cả trạng thái</option>
            <option value="present">Đúng giờ</option>
            <option value="late">Đi trễ</option>
            <option value="early_leave">Về sớm</option>
            <option value="absent">Vắng</option>
          </select>

          <select value={shiftFilter}
            onChange={e => { setShiftFilter(e.target.value); setPage(1) }}
            className="hidden lg:block px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
            <option value="all">Tất cả ca</option>
            {shifts.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value="none">Không có ca</option>
          </select>

          {/* Nút Lọc — mobile/tablet */}
          <button
            onClick={() => setShowFilters(v => !v)}
            className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 ml-auto relative"
          >
            <Filter size={15} />
            <span className="hidden sm:inline">Lọc</span>
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Row 2: Expanded filters — mobile/tablet */}
        {showFilters && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 lg:hidden">
            {/* Search mobile */}
            {canSeeOthers && !showOnlyMine && (
              <div className="relative sm:hidden">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                <input type="text" placeholder="Tìm nhân viên..."
                  value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
            )}

            {/* Date range mobile */}
            <div className="flex items-center gap-1.5 md:hidden">
              <Calendar size={15} className="text-gray-400 flex-shrink-0" />
              <input type="date" value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
              <span className="text-gray-400 text-xs">→</span>
              <input type="date" value={dateTo}
                onChange={e => { setDateTo(e.target.value); setPage(1) }}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Status + Shift mobile */}
            <div className="flex gap-2">
              <select value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                <option value="all">Tất cả trạng thái</option>
                <option value="present">Đúng giờ</option>
                <option value="late">Đi trễ</option>
                <option value="early_leave">Về sớm</option>
                <option value="absent">Vắng</option>
              </select>
              <select value={shiftFilter}
                onChange={e => { setShiftFilter(e.target.value); setPage(1) }}
                className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
                <option value="all">Tất cả ca</option>
                {shifts.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                <option value="none">Không có ca</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ══════════ MOBILE: CARD LIST ══════════ */}
      <div className="lg:hidden space-y-2">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-flex items-center gap-2 text-gray-500">
              <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
              <span className="text-sm">Đang tải...</span>
            </div>
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            Không có dữ liệu chấm công
          </div>
        ) : (
          records.map(record => (
            <AttendanceCard key={record.id} record={record} showEmployee={showEmployeeColumn} />
          ))
        )}
      </div>

      {/* ══════════ DESKTOP: TABLE ══════════ */}
      <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Ngày</th>
                {showEmployeeColumn && (
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Nhân viên</th>
                )}
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Ca</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Check-in</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Check-out</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Giờ làm</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Trễ</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Về sớm</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">OT</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">GPS</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={11} className="text-center py-16">
                    <div className="inline-flex items-center gap-2 text-gray-500">
                      <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                      Đang tải dữ liệu...
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-16 text-gray-400">
                    Không có dữ liệu chấm công trong khoảng thời gian này
                  </td>
                </tr>
              ) : (
                records.map(record => {
                  const statusBadge = getStatusBadge(record.status)
                  const shift = Array.isArray(record.shift) ? (record.shift as any)[0] : record.shift
                  const dept = Array.isArray(record.employee?.department)
                    ? (record.employee?.department as any)[0]
                    : record.employee?.department
                  const hasCoords = record.check_in_lat != null && record.check_in_lng != null

                  return (
                    <tr key={record.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-medium text-gray-800 text-xs">{formatDateShort(record.date)}</span>
                      </td>
                      {showEmployeeColumn && (
                        <td className="px-4 py-2.5">
                          <div className="min-w-[140px]">
                            <p className="font-medium text-gray-800 text-xs truncate">{record.employee?.full_name || '—'}</p>
                            <p className="text-[10px] text-gray-400 truncate">
                              {record.employee?.code}{dept?.name ? ` • ${dept.name}` : ''}
                            </p>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-2.5">
                        {shift ? (
                          <div className="min-w-[90px]">
                            <p className="font-medium text-gray-700 text-xs">{shift.name}</p>
                            <p className="text-[10px] text-gray-400">{shift.start_time?.substring(0, 5)} - {shift.end_time?.substring(0, 5)}</p>
                          </div>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <span className={record.status === 'late' ? 'text-yellow-600 font-medium text-xs' : 'text-gray-700 text-xs'}>
                          {formatTime(record.check_in_time)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <span className={record.status === 'early_leave' ? 'text-orange-600 font-medium text-xs' : 'text-gray-700 text-xs'}>
                            {formatTime(record.check_out_time)}
                          </span>
                          {record.auto_checkout && (
                            <span title="Tự động checkout"><Zap size={11} className="text-orange-500" /></span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <span className="font-medium text-gray-700 text-xs">{formatDuration(record.working_minutes)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {record.late_minutes > 0 ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-[11px] font-medium rounded">
                            <AlertTriangle size={9} />{record.late_minutes}p
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {record.early_leave_minutes > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[11px] font-medium rounded">
                            {record.early_leave_minutes}p
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {(record.overtime_minutes || 0) > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[11px] font-medium rounded">
                            {formatDuration(record.overtime_minutes)}
                          </span>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <GPSBadge isVerified={record.is_gps_verified} isAutoCheckout={record.auto_checkout} hasCoords={hasCoords} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded ${statusBadge.color}`}>
                          {statusBadge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════ PAGINATION ══════════ */}
      <div className="flex items-center justify-between bg-white rounded-xl shadow-sm border border-gray-200 px-3 sm:px-4 py-3">
        <p className="text-xs text-gray-500">
          {totalRecords > 0 ? `${page}/${totalPages} — ${totalRecords} bản ghi` : 'Không có bản ghi'}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="p-1.5 rounded-lg border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft size={15} />
            </button>
            <div className="hidden sm:flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const startPage = Math.max(1, Math.min(page - 2, totalPages - 4))
                const pageNum = startPage + i
                if (pageNum > totalPages) return null
                return (
                  <button key={pageNum} onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors
                      ${pageNum === page ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {pageNum}
                  </button>
                )
              })}
            </div>
            <span className="sm:hidden text-xs font-medium text-gray-700 px-2">{page}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default AttendanceListPage