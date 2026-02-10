// ============================================================
// CHECK-IN/OUT WIDGET V3 — Uses attendanceService V3
// File: src/features/attendance/CheckInOutWidget.tsx
// ============================================================
// Thay đổi so với bản cũ:
//   ① Dùng attendanceService thay vì query Supabase trực tiếp
//   ② Logic check-in/out đã nằm trong service (DRY)
//   ③ GPS flow giữ nguyên (mobile bắt buộc, desktop bypass)
//   ④ Multi-shift display + ca qua đêm hoạt động đúng
//   ⑤ Mobile-first: 48px buttons, active: states, safe-area
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  LogIn,
  LogOut,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { attendanceService } from '../../services/attendanceService'
import type {
  ShiftInfo,
  AttendanceRecord,
  TodayShiftAssignment,
  GPSData,
} from '../../services/attendanceService'

// ============================================================
// TYPES
// ============================================================

type GPSStatus = 'idle' | 'checking' | 'requesting' | 'available' | 'denied' | 'unavailable' | 'error'

interface Props {
  onCheckInOut?: () => void
  compact?: boolean
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function formatTime(t: string): string {
  if (!t) return ''
  return t.substring(0, 5)
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0h 00p'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m.toString().padStart(2, '0')}p`
}

/** Detect current shift from assignments + attendances */
function detectCurrentShift(
  shifts: TodayShiftAssignment[],
  attendances: AttendanceRecord[]
): TodayShiftAssignment | null {
  if (shifts.length === 0) return null
  if (shifts.length === 1) return shifts[0]

  // ① Ca chưa hoàn thành (đã check-in, chưa check-out)
  for (const sa of shifts) {
    const att = attendances.find((a) => a.shift_id === sa.shift_id)
    if (att && att.check_in_time && !att.check_out_time) {
      return sa
    }
  }

  // ② Ca đang trong window + chưa check-in
  for (const sa of shifts) {
    const att = attendances.find((a) => a.shift_id === sa.shift_id)
    if (!att && isShiftActive(sa.shift)) {
      return sa
    }
  }

  // ③ Ca chưa check-in (bất kỳ)
  for (const sa of shifts) {
    const att = attendances.find((a) => a.shift_id === sa.shift_id)
    if (!att) return sa
  }

  // ④ Tất cả đã hoàn thành → trả về ca cuối
  return shifts[shifts.length - 1]
}

/** Check if current time is within shift window (±2h buffer) */
function isShiftActive(shift: ShiftInfo): boolean {
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  const [sh, sm] = shift.start_time.split(':').map(Number)
  const [eh, em] = shift.end_time.split(':').map(Number)
  const startMin = sh * 60 + (sm || 0)
  const endMin = eh * 60 + (em || 0)

  const bufferBefore = 120
  const bufferAfter = 60

  if (shift.crosses_midnight) {
    const earlyStart = startMin - bufferBefore
    const lateEnd = endMin + bufferAfter
    if (earlyStart < 0) {
      return nowMinutes >= earlyStart + 1440 || nowMinutes <= lateEnd
    }
    return nowMinutes >= earlyStart || nowMinutes <= lateEnd
  } else {
    const earlyStart = Math.max(0, startMin - bufferBefore)
    const lateEnd = Math.min(1440, endMin + bufferAfter)
    return nowMinutes >= earlyStart && nowMinutes <= lateEnd
  }
}

// Team badge colors
const TEAM_COLORS: Record<string, string> = {
  A: 'bg-blue-100 text-blue-700 border-blue-200',
  B: 'bg-rose-100 text-rose-700 border-rose-200',
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function CheckInOutWidget({ onCheckInOut, compact = false }: Props) {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const employeeId = user?.employee_id

  // ── State ──
  const [currentTime, setCurrentTime] = useState(new Date())
  const [gpsStatus, setGpsStatus] = useState<GPSStatus>('idle')
  const [gpsPosition, setGpsPosition] = useState<GPSData | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [showAllShifts, setShowAllShifts] = useState(false)
  const [toast, setToast] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // ── Clock ──
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // ── Toast auto-dismiss ──
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  // ── GPS initialization ──
  const requestGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsStatus('unavailable')
      setGpsError('Thiết bị không hỗ trợ GPS')
      return
    }

    setGpsStatus('requesting')
    setGpsError(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsPosition({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
        setGpsStatus('available')
      },
      (err) => {
        if (err.code === 1) {
          setGpsStatus('denied')
          setGpsError(
            'Bạn đã từ chối quyền vị trí. Vui lòng bật GPS trong cài đặt.'
          )
        } else if (err.code === 2) {
          setGpsStatus('unavailable')
          setGpsError('Không thể xác định vị trí. Kiểm tra GPS.')
        } else {
          setGpsStatus('error')
          setGpsError('Lỗi GPS. Vui lòng thử lại.')
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  }, [])

  // Auto-request GPS on mount
  useEffect(() => {
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    if (!isMobile) {
      setGpsStatus('available') // Desktop = bypass GPS
      return
    }
    requestGPS()
  }, [requestGPS])

  // ── Query: Today's shift assignments (via service) ──
  const { data: todayShifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ['today-shifts', employeeId],
    queryFn: () => attendanceService.getTodayShifts(employeeId!),
    enabled: !!employeeId,
    staleTime: 60 * 1000,
  })

  // ── Query: Today's attendance records (via service) ──
  const { data: todayAttendances = [], isLoading: attendanceLoading } =
    useQuery({
      queryKey: ['today-attendances', employeeId],
      queryFn: () => attendanceService.getTodayAttendances(employeeId!),
      enabled: !!employeeId,
      staleTime: 10 * 1000,
    })

  // ── Query: Open attendance (chưa check-out, kể cả ca đêm hôm qua) ──
  const { data: openAttendance, isLoading: openLoading } = useQuery({
    queryKey: ['open-attendance', employeeId],
    queryFn: () => attendanceService.getOpenAttendance(employeeId!),
    enabled: !!employeeId,
    staleTime: 10 * 1000,
  })

  // ── Detect current shift ──
  const currentShiftAssignment = detectCurrentShift(
    todayShifts,
    todayAttendances
  )
  const currentShift = currentShiftAssignment?.shift || null

  // ── Determine current attendance record ──
  // Ưu tiên: open attendance (cho ca qua đêm), sau đó tìm theo shift hôm nay
  const currentAttendance: AttendanceRecord | null = (() => {
    // Nếu có record đang mở (kể cả ca đêm hôm qua) → dùng nó
    if (openAttendance) return openAttendance

    // Nếu không → tìm record hôm nay theo current shift
    if (currentShift) {
      return (
        todayAttendances.find((a) => a.shift_id === currentShift.id) || null
      )
    }

    // Fallback: record đầu tiên hôm nay
    return todayAttendances[0] || null
  })()

  // ── Shift info for display (có thể từ open attendance hoặc current shift) ──
  const displayShift: ShiftInfo | null =
    openAttendance?.shift || currentShift || null

  const isCheckedIn = !!currentAttendance?.check_in_time
  const isComplete = !!(
    currentAttendance?.check_in_time && currentAttendance?.check_out_time
  )
  const allComplete =
    todayShifts.length > 0 &&
    !openAttendance &&
    todayShifts.every((sa) => {
      const att = todayAttendances.find((a) => a.shift_id === sa.shift_id)
      return att?.check_in_time && att?.check_out_time
    })

  // ── Permission checks ──
  const canCheckIn =
    gpsStatus === 'available' && !isCheckedIn && !isComplete && !openAttendance
  const canCheckOut = !!openAttendance || (isCheckedIn && !isComplete)

  // ── Invalidate all related queries ──
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['today-shifts'] })
    queryClient.invalidateQueries({ queryKey: ['today-attendances'] })
    queryClient.invalidateQueries({ queryKey: ['today-attendance'] })
    queryClient.invalidateQueries({ queryKey: ['open-attendance'] })
    queryClient.invalidateQueries({ queryKey: ['attendance'] })
    onCheckInOut?.()
  }, [queryClient, onCheckInOut])

  // ── Check-in mutation (via service) ──
  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId)
        throw new Error('Không tìm thấy thông tin nhân viên')

      return attendanceService.checkIn(employeeId, {
        targetShiftId: currentShift?.id,
        gps: gpsPosition,
        isGpsVerified: gpsStatus === 'available' && !!gpsPosition,
      })
    },
    onSuccess: (data) => {
      const shiftName = data.shift?.name || displayShift?.name
      setToast({
        type: 'success',
        message: `✅ Check-in thành công${shiftName ? ` — ${shiftName}` : ''}`,
      })
      invalidateAll()
    },
    onError: (err: Error) => {
      setToast({ type: 'error', message: err.message || 'Lỗi check-in' })
    },
  })

  // ── Check-out mutation (via service) ──
  const checkOutMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('Chưa check-in')

      return attendanceService.checkOut(employeeId, {
        gps: gpsPosition,
      })
    },
    onSuccess: (data) => {
      const shiftName = data.shift?.name || displayShift?.name
      const workStr = data.working_minutes
        ? ` — ${formatDuration(data.working_minutes)}`
        : ''
      setToast({
        type: 'success',
        message: `✅ Check-out thành công${shiftName ? ` (${shiftName})` : ''}${workStr}`,
      })
      invalidateAll()
    },
    onError: (err: Error) => {
      setToast({ type: 'error', message: err.message || 'Lỗi check-out' })
    },
  })

  // ── Progress ──
  const progressPercent = (() => {
    if (!currentAttendance?.check_in_time) return 0
    const stdHours = displayShift?.standard_hours || 8
    const checkIn = new Date(currentAttendance.check_in_time)
    const now = new Date()
    const elapsed = (now.getTime() - checkIn.getTime()) / (1000 * 60)
    const total = stdHours * 60
    return Math.min(100, Math.round((elapsed / total) * 100))
  })()

  // ── Loading state ──
  const isLoading = shiftsLoading || attendanceLoading || openLoading
  const isActionLoading =
    checkInMutation.isPending || checkOutMutation.isPending

  if (!employeeId) return null

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* ── Header: Clock + GPS ── */}
      <div className="px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={16} />
            <span className="text-lg font-mono font-bold tracking-wider">
              {currentTime.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </div>

          {/* GPS indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            {gpsStatus === 'available' ? (
              <span className="flex items-center gap-1 bg-green-500/20 text-green-100 px-2 py-0.5 rounded-full">
                <MapPin size={10} />
                GPS ✓
              </span>
            ) : gpsStatus === 'requesting' || gpsStatus === 'checking' ? (
              <span className="flex items-center gap-1 bg-yellow-500/20 text-yellow-100 px-2 py-0.5 rounded-full">
                <Loader2 size={10} className="animate-spin" />
                Đang lấy GPS...
              </span>
            ) : (
              <button
                onClick={requestGPS}
                className="flex items-center gap-1 bg-red-500/20 text-red-100 px-2 py-0.5 rounded-full active:bg-red-500/40"
              >
                <AlertCircle size={10} />
                Bật GPS
              </button>
            )}
          </div>
        </div>

        {/* Current shift info */}
        {displayShift && (
          <div className="mt-1.5 flex items-center gap-2 text-blue-100 text-xs">
            <span className="font-medium text-white">
              {displayShift.name}
            </span>
            <span>
              ({formatTime(displayShift.start_time)} -{' '}
              {formatTime(displayShift.end_time)})
            </span>
            {displayShift.crosses_midnight && (
              <span className="px-1 py-0.5 rounded text-[10px] bg-indigo-500/30 text-indigo-100">
                Qua đêm
              </span>
            )}
            {currentShiftAssignment?.team_code && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold
                ${
                  currentShiftAssignment.team_code === 'A'
                    ? 'bg-blue-500/30 text-blue-100'
                    : 'bg-rose-500/30 text-rose-100'
                }`}
              >
                Đội {currentShiftAssignment.team_code}
              </span>
            )}
          </div>
        )}

        {/* Ca qua đêm hôm qua đang mở */}
        {openAttendance &&
          openAttendance.date !== new Date().toISOString().split('T')[0] && (
            <div className="mt-1.5 flex items-center gap-1.5 text-yellow-200 text-xs">
              <AlertCircle size={10} />
              <span>Ca từ hôm qua — cần check-out</span>
            </div>
          )}

        {!displayShift && !isLoading && todayShifts.length === 0 && !openAttendance && (
          <div className="mt-1.5 text-xs text-blue-200">
            Chưa phân ca hôm nay
          </div>
        )}
      </div>

      {/* ── GPS Warning Banner ── */}
      {gpsStatus !== 'available' &&
        gpsStatus !== 'checking' &&
        gpsStatus !== 'requesting' && (
          <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex items-start gap-2">
            <AlertCircle
              size={16}
              className="text-amber-600 mt-0.5 flex-shrink-0"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">
                Cần bật GPS để điểm danh
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {gpsError ||
                  'Vui lòng cho phép truy cập vị trí trong cài đặt trình duyệt.'}
              </p>
              <button
                onClick={requestGPS}
                className="mt-1.5 text-xs font-medium text-amber-700 underline active:text-amber-900"
              >
                Thử lại
              </button>
            </div>
          </div>
        )}

      {/* ── Main Action Area ── */}
      <div className="px-4 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" />
            <span className="text-sm">Đang tải...</span>
          </div>
        ) : allComplete ? (
          /* All shifts complete */
          <div className="flex flex-col items-center py-3 text-green-700">
            <CheckCircle2 size={28} className="mb-1" />
            <span className="text-sm font-semibold">
              Đã hoàn thành
              {todayShifts.length > 1
                ? ` ${todayShifts.length} ca`
                : ' ca hôm nay'}
            </span>
            {todayAttendances.length > 0 && (
              <span className="text-xs text-green-500 mt-1">
                Tổng:{' '}
                {formatDuration(
                  todayAttendances.reduce(
                    (sum, a) => sum + (a.working_minutes || 0),
                    0
                  )
                )}
              </span>
            )}
          </div>
        ) : (
          <>
            {/* Progress bar (when checked in, not complete) */}
            {isCheckedIn && !isComplete && (
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Đang làm việc</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {currentAttendance?.check_in_time && (
                  <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                    <span>
                      Vào: {formatDateTime(currentAttendance.check_in_time)}
                    </span>
                    {displayShift && (
                      <span>
                        Dự kiến ra: {formatTime(displayShift.end_time)}
                        {displayShift.crosses_midnight ? ' (+1)' : ''}
                      </span>
                    )}
                  </div>
                )}
                {/* Late badge */}
                {currentAttendance?.status === 'late' &&
                  currentAttendance.late_minutes > 0 && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-600">
                      <AlertCircle size={10} />
                      <span>
                        Đi trễ {currentAttendance.late_minutes} phút
                      </span>
                    </div>
                  )}
              </div>
            )}

            {/* Check-in button */}
            {canCheckIn && (
              <button
                onClick={() => checkInMutation.mutate()}
                disabled={isActionLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold
                  min-h-[48px] transition-colors bg-green-600 text-white active:bg-green-700
                  disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isActionLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <LogIn size={18} />
                )}
                {isActionLoading ? 'Đang xử lý...' : 'Check-in'}
              </button>
            )}

            {/* Check-out button */}
            {canCheckOut && (
              <button
                onClick={() => checkOutMutation.mutate()}
                disabled={isActionLoading}
                className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 text-white rounded-xl
                  text-sm font-semibold min-h-[48px] active:bg-red-700 disabled:opacity-60"
              >
                {isActionLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <LogOut size={18} />
                )}
                {isActionLoading ? 'Đang xử lý...' : 'Check-out'}
              </button>
            )}

            {/* GPS chưa sẵn sàng + chưa check-in */}
            {!canCheckIn && !canCheckOut && !isComplete && gpsStatus !== 'available' && (
              <button
                disabled
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold
                  min-h-[48px] bg-gray-200 text-gray-400 cursor-not-allowed"
              >
                <LogIn size={18} />
                Check-in
              </button>
            )}
          </>
        )}
      </div>

      {/* ── Multi-shift list (expandable) ── */}
      {todayShifts.length > 1 && (
        <div className="border-t">
          <button
            onClick={() => setShowAllShifts(!showAllShifts)}
            className="w-full px-4 py-2 flex items-center justify-between text-xs text-gray-500 active:bg-gray-50"
          >
            <span>
              Tất cả ca hôm nay ({todayShifts.length} ca)
            </span>
            {showAllShifts ? (
              <ChevronUp size={14} />
            ) : (
              <ChevronDown size={14} />
            )}
          </button>

          {showAllShifts && (
            <div className="px-4 pb-3 space-y-2">
              {todayShifts
                .sort((a, b) =>
                  a.shift.start_time.localeCompare(b.shift.start_time)
                )
                .map((sa) => {
                  const att = todayAttendances.find(
                    (a) => a.shift_id === sa.shift_id
                  )
                  const isThisCurrent = displayShift?.id === sa.shift_id
                  const done = att?.check_in_time && att?.check_out_time
                  const inProgress =
                    att?.check_in_time && !att?.check_out_time

                  return (
                    <div
                      key={sa.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs
                        ${
                          isThisCurrent
                            ? 'bg-blue-50 border border-blue-200'
                            : 'bg-gray-50'
                        }
                      `}
                    >
                      {/* Status dot */}
                      <div
                        className={`w-2 h-2 rounded-full flex-shrink-0
                        ${
                          done
                            ? 'bg-green-500'
                            : inProgress
                              ? 'bg-blue-500 animate-pulse'
                              : 'bg-gray-300'
                        }`}
                      />

                      {/* Shift info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-800">
                            {sa.shift.name}
                          </span>
                          {sa.team_code && (
                            <span
                              className={`px-1 py-px rounded text-[9px] font-bold border
                              ${
                                TEAM_COLORS[sa.team_code] ||
                                'bg-gray-100 text-gray-600 border-gray-200'
                              }`}
                            >
                              {sa.team_code}
                            </span>
                          )}
                          {isThisCurrent && (
                            <span className="px-1 py-px bg-blue-100 text-blue-600 rounded text-[9px]">
                              hiện tại
                            </span>
                          )}
                          {sa.shift.crosses_midnight && (
                            <span className="px-1 py-px bg-indigo-50 text-indigo-500 rounded text-[9px]">
                              qua đêm
                            </span>
                          )}
                        </div>
                        <span className="text-gray-400">
                          {formatTime(sa.shift.start_time)} -{' '}
                          {formatTime(sa.shift.end_time)}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="text-right">
                        {done && (
                          <div className="flex items-center gap-1 text-green-600">
                            <CheckCircle2 size={14} />
                            {att?.working_minutes && (
                              <span className="text-[10px]">
                                {formatDuration(att.working_minutes)}
                              </span>
                            )}
                          </div>
                        )}
                        {inProgress && att?.check_in_time && (
                          <span className="text-blue-600 text-[10px]">
                            Vào {formatDateTime(att.check_in_time)}
                          </span>
                        )}
                        {!att && (
                          <span className="text-gray-400">Chưa</span>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="px-4 pb-3">
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
            ${
              toast.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 size={14} />
            ) : (
              <AlertCircle size={14} />
            )}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}

export default CheckInOutWidget