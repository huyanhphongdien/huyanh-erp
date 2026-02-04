// ============================================================
// ATTENDANCE LIST PAGE V3
// File: src/features/attendance/AttendanceListPage.tsx
// Huy Anh ERP System - Chấm công V2
// ============================================================
// CẬP NHẬT V3:
// - Nút "Của tôi" toggle với icon 👤
// - Lọc theo phòng ban 🏢
// - Fix join shift data cho cột Ca
// - GPS badge cải tiến
// - Phân quyền: Employee xem mình, Manager xem phòng, Executive xem tất cả
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

// ============================================================
// GPS STATUS BADGE (inline — tránh import lỗi)
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
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded"
        title="Tự động checkout"
      >
        <Zap size={10} />
      </span>
    )
  }

  if (isVerified || hasCoords) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded"
        title="GPS đã xác minh"
      >
        <MapPin size={10} />
        <span className="text-[10px]">✓</span>
      </span>
    )
  }

  // Không có GPS → desktop hoặc cũ
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-500 text-xs font-medium rounded"
      title="Desktop / Không GPS"
    >
      <Monitor size={10} />
    </span>
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

  // ── LOAD SHIFTS for filter ──
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
  // ★ Inline query thay vì dùng attendanceService.getAll — để join shift data
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

      // ── Scope based on role & "Của tôi" toggle ──
      if (showOnlyMine) {
        // Chỉ xem bản ghi của mình
        query = query.eq('employee_id', user?.employee_id || '')
      } else if (!isAdmin && !isExecutive && !isManager) {
        // Employee luôn xem của mình
        query = query.eq('employee_id', user?.employee_id || '')
      }
      // Manager/Executive without "Của tôi": xem tất cả (filter dept ở client)

      // ── Filters ──
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }
      if (dateFrom) {
        query = query.gte('date', dateFrom)
      }
      if (dateTo) {
        query = query.lte('date', dateTo)
      }
      if (shiftFilter !== 'all' && shiftFilter !== 'none') {
        query = query.eq('shift_id', shiftFilter)
      }
      if (shiftFilter === 'none') {
        query = query.is('shift_id', null)
      }

      const { data, error, count } = await query
        .order('date', { ascending: false })
        .order('check_in_time', { ascending: false })
        .range(from, to)

      if (error) throw error

      let records = (data || []) as AttendanceRecord[]

      // ── Client-side department filter ──
      if (!showOnlyMine && departmentFilter) {
        records = records.filter(r => {
          const dept = Array.isArray(r.employee?.department)
            ? (r.employee?.department as any)[0]
            : r.employee?.department
          return dept?.id === departmentFilter
        })
      }

      // ── Client-side department scope for managers ──
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

      // ── Client-side search ──
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

  // ── Subtitle text ──
  const subtitle = useMemo(() => {
    if (showOnlyMine) return 'Chấm công của tôi'
    if (isAdmin || isExecutive) return 'Tất cả nhân viên'
    if (isManager) return 'Phòng ban của bạn'
    return 'Chấm công của bạn'
  }, [showOnlyMine, isAdmin, isExecutive, isManager])

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="p-4 lg:p-6 max-w-[1500px] mx-auto space-y-5">
      {/* ══════════ HEADER ══════════ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bảng chấm công</h1>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>

      {/* ══════════ CHECK-IN/OUT WIDGET ══════════ */}
      <CheckInOutWidget />

      {/* ══════════ FILTER TOOLBAR ══════════ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3">
        <div className="flex flex-wrap items-center gap-2">

          {/* ★ Nút "Của tôi" */}
          <button
            onClick={() => {
              setShowOnlyMine(v => !v)
              setPage(1)
            }}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border
              ${showOnlyMine
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }
            `}
            title={showOnlyMine ? 'Đang xem chấm công của tôi' : 'Bấm để xem chấm công của tôi'}
          >
            <User size={15} />
            Của tôi
          </button>

          {/* ★ Lọc phòng ban (Manager+) */}
          {canSeeOthers && !showOnlyMine && (
            <div className="flex items-center gap-1.5">
              <Building2 size={15} className="text-gray-400" />
              <select
                value={departmentFilter}
                onChange={e => { setDepartmentFilter(e.target.value); setPage(1) }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Tất cả phòng ban</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Tìm nhân viên (Manager+, khi không ở "Của tôi") */}
          {canSeeOthers && !showOnlyMine && (
            <div className="relative flex-1 min-w-[180px]">
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

          {/* Date range */}
          <div className="flex items-center gap-1.5">
            <Calendar size={15} className="text-gray-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1) }}
              className="px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-400 text-xs">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1) }}
              className="px-2.5 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="present">Đúng giờ</option>
            <option value="late">Đi trễ</option>
            <option value="early_leave">Về sớm</option>
            <option value="absent">Vắng</option>
          </select>

          {/* Shift filter */}
          <select
            value={shiftFilter}
            onChange={e => { setShiftFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Tất cả ca</option>
            {shifts.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            <option value="none">Không có ca</option>
          </select>
        </div>
      </div>

      {/* ══════════ TABLE ══════════ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Ngày</th>
                {canSeeOthers && !showOnlyMine && (
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
                      {/* Ngày */}
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-medium text-gray-800 text-xs">
                          {new Date(record.date + 'T00:00:00').toLocaleDateString('vi-VN', {
                            weekday: 'short', day: '2-digit', month: '2-digit'
                          })}
                        </span>
                      </td>

                      {/* Nhân viên */}
                      {canSeeOthers && !showOnlyMine && (
                        <td className="px-4 py-2.5">
                          <div className="min-w-[140px]">
                            <p className="font-medium text-gray-800 text-xs truncate">
                              {record.employee?.full_name || '—'}
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">
                              {record.employee?.code}
                              {dept?.name ? ` • ${dept.name}` : ''}
                            </p>
                          </div>
                        </td>
                      )}

                      {/* Ca */}
                      <td className="px-4 py-2.5">
                        {shift ? (
                          <div className="min-w-[90px]">
                            <p className="font-medium text-gray-700 text-xs">
                              {shift.name}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {shift.start_time?.substring(0, 5)} - {shift.end_time?.substring(0, 5)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      {/* Check-in */}
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <span className={record.status === 'late' ? 'text-yellow-600 font-medium text-xs' : 'text-gray-700 text-xs'}>
                          {formatTime(record.check_in_time)}
                        </span>
                      </td>

                      {/* Check-out */}
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <span className={record.status === 'early_leave' ? 'text-orange-600 font-medium text-xs' : 'text-gray-700 text-xs'}>
                            {formatTime(record.check_out_time)}
                          </span>
                          {record.auto_checkout && (
                            <span title="Tự động checkout">
                              <Zap size={11} className="text-orange-500" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Giờ làm */}
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <span className="font-medium text-gray-700 text-xs">
                          {formatDuration(record.working_minutes)}
                        </span>
                      </td>

                      {/* Trễ */}
                      <td className="px-4 py-2.5 text-center">
                        {record.late_minutes > 0 ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-[11px] font-medium rounded">
                            <AlertTriangle size={9} />
                            {record.late_minutes}p
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Về sớm */}
                      <td className="px-4 py-2.5 text-center">
                        {record.early_leave_minutes > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[11px] font-medium rounded">
                            {record.early_leave_minutes}p
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* OT */}
                      <td className="px-4 py-2.5 text-center">
                        {(record.overtime_minutes || 0) > 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[11px] font-medium rounded">
                            {formatDuration(record.overtime_minutes)}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* GPS */}
                      <td className="px-4 py-2.5 text-center">
                        <GPSBadge
                          isVerified={record.is_gps_verified}
                          isAutoCheckout={record.auto_checkout}
                          hasCoords={hasCoords}
                        />
                      </td>

                      {/* Trạng thái */}
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

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50/50">
          <p className="text-xs text-gray-500">
            {totalRecords > 0
              ? `Trang ${page}/${totalPages} — ${totalRecords} bản ghi`
              : 'Không có bản ghi'}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={15} />
              </button>
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const startPage = Math.max(1, Math.min(page - 2, totalPages - 4))
                const pageNum = startPage + i
                if (pageNum > totalPages) return null
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors
                      ${pageNum === page
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                      }
                    `}
                  >
                    {pageNum}
                  </button>
                )
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded-lg border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AttendanceListPage