// ============================================================
// CHECK-IN/OUT WIDGET V2 — FIXED
// File: src/features/attendance/CheckInOutWidget.tsx
// Huy Anh ERP System - Chấm công V2
// ============================================================
// FIX 1: invalidateQueries dùng predicate → bắt TẤT CẢ query attendance
// FIX 2: Tính giờ làm từ timestamp (không dùng working_minutes từ DB)
// ============================================================
// LOGIC:
// - Mobile: GPS bắt buộc → canCheckIn = gpsStatus === 'available'
// - Desktop: GPS bỏ qua → canCheckIn = gpsStatus === 'desktop_bypass'
// - Hiển thị ca hôm nay + GPS banner + progress bar
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  LogIn,
  LogOut,
  Timer,
  AlertCircle,
  CheckCircle2,
  Calendar,
  MapPin,
  Monitor,
  Loader2,
} from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'
import { attendanceService } from '../../services/attendanceService'
import { supabase } from '../../lib/supabase'
import { GPSRequirementBanner, type GPSPosition, type GPSStatus } from './GPSRequirementBanner'

// ============================================================
// TYPES
// ============================================================

interface ShiftInfo {
  id: string
  code: string
  name: string
  start_time: string
  end_time: string
  crosses_midnight: boolean
  standard_hours: number
  break_minutes: number
}

interface TodayAttendance {
  id: string
  check_in_time: string | null
  check_out_time: string | null
  working_minutes: number | null
  overtime_minutes: number | null
  status: string
  shift_id: string | null
  late_minutes: number
  early_leave_minutes: number
  is_gps_verified: boolean
}

interface GPSConfig {
  enabled: boolean
  locations: {
    name: string
    latitude: number
    longitude: number
    radius_meters: number
  }[]
}

// ============================================================
// HELPERS
// ============================================================

function formatTime(timeStr: string): string {
  return timeStr.substring(0, 5)
}

function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m.toString().padStart(2, '0')}p`
}

// ★ FIX: Tính giờ làm từ timestamp thay vì dùng working_minutes từ DB
function calculateWorkingTime(checkIn?: string | null, checkOut?: string | null): string {
  if (!checkIn) return '0h 00p'
  const start = new Date(checkIn)
  const end = checkOut ? new Date(checkOut) : new Date()
  const diffMs = end.getTime() - start.getTime()
  if (diffMs <= 0) return '0h 00p'
  const totalMinutes = Math.floor(diffMs / (1000 * 60))
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h ${m.toString().padStart(2, '0')}p`
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function CheckInOutWidget() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const employeeId = user?.employee_id

  // GPS state
  const [gpsStatus, setGPSStatus] = useState<GPSStatus>('checking')
  const [gpsPosition, setGPSPosition] = useState<GPSPosition | null>(null)

  // Timer
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ============================================================
  // ★ FIX: Invalidate TẤT CẢ queries liên quan attendance
  // Dùng predicate thay vì queryKey prefix → bắt cả:
  //   ['attendance', 'list', ...] (AttendanceListPage)
  //   ['today-attendance', ...] (widget)
  //   ['today-shift', ...] (widget)
  //   ['attendance-list-v3', ...] (nếu còn tồn tại)
  // ============================================================
  const invalidateAllAttendance = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0]
        return typeof key === 'string' && (
          key === 'attendance' ||
          key.includes('attendance') ||
          key === 'today-attendance' ||
          key === 'today-shift'
        )
      }
    })
  }, [queryClient])

  // ============================================================
  // QUERIES
  // ============================================================

  const { data: gpsConfig } = useQuery<GPSConfig | null>({
    queryKey: ['gps-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_settings')
        .select('setting_value')
        .eq('setting_key', 'gps_config')
        .maybeSingle()
      if (error || !data) return null
      return data.setting_value as GPSConfig
    },
    staleTime: 5 * 60 * 1000,
  })

  const { data: todayShift, isLoading: loadingShift } = useQuery<ShiftInfo | null>({
    queryKey: ['today-shift', employeeId],
    queryFn: async () => {
      if (!employeeId) return null
      const today = new Date().toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('shift_assignments')
        .select(`
          shift_id,
          shift:shifts!shift_assignments_shift_id_fkey(
            id, code, name, start_time, end_time,
            crosses_midnight, standard_hours, break_minutes
          )
        `)
        .eq('employee_id', employeeId)
        .eq('date', today)
        .maybeSingle()

      if (error || !data?.shift) return null
      const shift = Array.isArray(data.shift) ? data.shift[0] : data.shift
      return shift as ShiftInfo
    },
    enabled: !!employeeId,
  })

  const { data: todayAttendance, isLoading: loadingAttendance } = useQuery<TodayAttendance | null>({
    queryKey: ['today-attendance', employeeId],
    queryFn: async () => {
      if (!employeeId) return null
      return attendanceService.getTodayAttendance(employeeId) as Promise<TodayAttendance | null>
    },
    enabled: !!employeeId,
    refetchInterval: 60000,
  })

  // ============================================================
  // TIMER
  // ============================================================

  useEffect(() => {
    if (todayAttendance?.check_in_time && !todayAttendance.check_out_time) {
      const checkIn = new Date(todayAttendance.check_in_time)

      const updateElapsed = () => {
        setElapsed(Math.floor((new Date().getTime() - checkIn.getTime()) / (1000 * 60)))
      }

      updateElapsed()
      timerRef.current = setInterval(updateElapsed, 60000)

      return () => {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    } else {
      setElapsed(0)
    }
  }, [todayAttendance])

  // ============================================================
  // MUTATIONS — ★ FIX: dùng invalidateAllAttendance
  // ============================================================

  const checkInMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('Không tìm thấy thông tin nhân viên')

      // Desktop: gpsPosition = null → service sẽ bỏ qua GPS validation
      // Mobile: gpsPosition có tọa độ → service validate GPS
      return attendanceService.checkIn(
        employeeId,
        gpsPosition
          ? { latitude: gpsPosition.latitude, longitude: gpsPosition.longitude }
          : undefined
      )
    },
    onSuccess: () => {
      // ★ FIX: Invalidate TẤT CẢ queries liên quan attendance
      invalidateAllAttendance()
    },
  })

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error('Không tìm thấy thông tin nhân viên')

      return attendanceService.checkOut(
        employeeId,
        gpsPosition
          ? { latitude: gpsPosition.latitude, longitude: gpsPosition.longitude }
          : undefined
      )
    },
    onSuccess: () => {
      // ★ FIX: Invalidate TẤT CẢ queries liên quan attendance
      invalidateAllAttendance()
    },
  })

  // ============================================================
  // GPS CALLBACKS
  // ============================================================

  const handleGPSReady = useCallback((pos: GPSPosition | null) => {
    // pos = null khi desktop bypass
    setGPSPosition(pos)
  }, [])

  const handleGPSStatusChange = useCallback((status: GPSStatus) => {
    setGPSStatus(status)
  }, [])

  // ============================================================
  // COMPUTED
  // ============================================================

  const isCheckedIn = !!todayAttendance?.check_in_time
  const isCheckedOut = !!todayAttendance?.check_out_time
  const isComplete = isCheckedIn && isCheckedOut

  // ★ KEY LOGIC: Desktop bypass cho phép check-in không cần GPS
  const isGPSReady = gpsStatus === 'available' || gpsStatus === 'desktop_bypass'
  const canCheckIn = isGPSReady && !isCheckedIn
  const canCheckOut = isCheckedIn && !isCheckedOut

  const getProgress = () => {
    if (!todayShift || !isCheckedIn || isComplete) return 0
    const standardMinutes = todayShift.standard_hours * 60
    return Math.min(100, Math.round((elapsed / standardMinutes) * 100))
  }

  const progress = getProgress()
  const isLoading = loadingShift || loadingAttendance

  // ============================================================
  // RENDER
  // ============================================================

  if (!employeeId) return null

  return (
    <div className="space-y-4">
      {/* ========== GPS BANNER ========== */}
      {!isComplete && (
        <GPSRequirementBanner
          gpsConfig={gpsConfig}
          onGPSReady={handleGPSReady}
          onStatusChange={handleGPSStatusChange}
          autoHideOnReady={false}
          compact={isCheckedIn}
        />
      )}

      {/* ========== SHIFT + CHECK-IN/OUT CARD ========== */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <Clock className="text-white" size={20} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Chấm công hôm nay</h3>
                <p className="text-blue-100 text-sm">
                  {new Date().toLocaleDateString('vi-VN', {
                    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </p>
              </div>
            </div>

            {todayAttendance && (
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                todayAttendance.status === 'present' ? 'bg-green-500/20 text-green-100' :
                todayAttendance.status === 'late' ? 'bg-yellow-500/20 text-yellow-100' :
                todayAttendance.status === 'early_leave' ? 'bg-orange-500/20 text-orange-100' :
                'bg-white/20 text-white'
              }`}>
                {todayAttendance.status === 'present' && '✓ Đúng giờ'}
                {todayAttendance.status === 'late' && `⏰ Trễ ${todayAttendance.late_minutes}p`}
                {todayAttendance.status === 'early_leave' && `↩ Về sớm ${todayAttendance.early_leave_minutes}p`}
                {todayAttendance.status === 'absent' && '✗ Vắng'}
              </div>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-blue-500" size={24} />
              <span className="ml-2 text-gray-500">Đang tải...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Shift Info */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Calendar className="text-gray-400" size={18} />
                <div>
                  <span className="text-sm text-gray-500">Ca làm việc: </span>
                  {todayShift ? (
                    <span className="font-medium text-gray-800">
                      {todayShift.name} ({formatTime(todayShift.start_time)} - {formatTime(todayShift.end_time)})
                    </span>
                  ) : (
                    <span className="text-orange-600 font-medium">
                      ⚠ Chưa được phân ca
                    </span>
                  )}
                </div>
              </div>

              {/* Check-in/out Times */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`p-3 rounded-lg border ${
                  isCheckedIn ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <LogIn size={14} className={isCheckedIn ? 'text-green-600' : 'text-gray-400'} />
                    <span className="text-xs text-gray-500 uppercase font-medium">Check-in</span>
                  </div>
                  <p className={`text-lg font-semibold ${isCheckedIn ? 'text-green-700' : 'text-gray-400'}`}>
                    {isCheckedIn ? formatDateTime(todayAttendance!.check_in_time!) : '—:—:—'}
                  </p>
                  {isCheckedIn && (
                    <span className={`inline-flex items-center gap-1 text-xs mt-1 ${
                      todayAttendance!.is_gps_verified ? 'text-green-600' : 'text-slate-500'
                    }`}>
                      {todayAttendance!.is_gps_verified 
                        ? <><MapPin size={10} /> GPS ✓</>
                        : <><Monitor size={10} /> Desktop</>
                      }
                    </span>
                  )}
                </div>

                <div className={`p-3 rounded-lg border ${
                  isCheckedOut ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <LogOut size={14} className={isCheckedOut ? 'text-blue-600' : 'text-gray-400'} />
                    <span className="text-xs text-gray-500 uppercase font-medium">Check-out</span>
                  </div>
                  <p className={`text-lg font-semibold ${isCheckedOut ? 'text-blue-700' : 'text-gray-400'}`}>
                    {isCheckedOut ? formatDateTime(todayAttendance!.check_out_time!) : '—:—:—'}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              {isCheckedIn && !isCheckedOut && todayShift && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Timer size={14} className="text-blue-600" />
                      <span className="font-medium text-gray-700">
                        Đã làm: {formatDuration(elapsed)}
                      </span>
                    </div>
                    <span className="text-gray-500">
                      / {todayShift.standard_hours}h ({progress}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-500 ${
                        progress >= 100 ? 'bg-green-500' :
                        progress >= 75 ? 'bg-blue-500' :
                        progress >= 50 ? 'bg-blue-400' :
                        'bg-blue-300'
                      }`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Working Summary — ★ FIX: tính từ timestamp */}
              {isComplete && todayAttendance && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Giờ làm: </span>
                      <span className="font-semibold text-gray-800">
                        {calculateWorkingTime(todayAttendance.check_in_time, todayAttendance.check_out_time)}
                      </span>
                    </div>
                    {(todayAttendance.overtime_minutes || 0) > 0 && (
                      <div>
                        <span className="text-gray-500">Tăng ca: </span>
                        <span className="font-semibold text-orange-600">
                          {formatDuration(todayAttendance.overtime_minutes || 0)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Error Messages */}
              {(checkInMutation.isError || checkOutMutation.isError) && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2 text-red-700 text-sm">
                    <AlertCircle size={16} />
                    <span>
                      {checkInMutation.error?.message || checkOutMutation.error?.message || 'Đã xảy ra lỗi'}
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2">
                {!isCheckedIn && (
                  <button
                    onClick={() => checkInMutation.mutate()}
                    disabled={!canCheckIn || checkInMutation.isPending}
                    className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-base font-semibold transition-all ${
                      canCheckIn
                        ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-200 active:scale-[0.98]'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {checkInMutation.isPending ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <LogIn size={20} />
                    )}
                    {checkInMutation.isPending ? 'Đang xử lý...' : 'Check-in'}
                  </button>
                )}

                {canCheckOut && (
                  <button
                    onClick={() => checkOutMutation.mutate()}
                    disabled={checkOutMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg text-base font-semibold hover:bg-blue-700 shadow-lg shadow-blue-200 active:scale-[0.98] transition-all"
                  >
                    {checkOutMutation.isPending ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <LogOut size={20} />
                    )}
                    {checkOutMutation.isPending ? 'Đang xử lý...' : 'Check-out'}
                  </button>
                )}

                {isComplete && (
                  <div className="flex items-center justify-center gap-2 py-3 text-green-700">
                    <CheckCircle2 size={20} />
                    <span className="font-semibold">Đã hoàn thành ca hôm nay</span>
                  </div>
                )}

                {/* Warning: mobile GPS not ready */}
                {!isCheckedIn && !isGPSReady && (
                  <p className="text-center text-sm text-red-500 mt-2">
                    ⚠ Vui lòng bật GPS trên điện thoại và di chuyển đến khu vực công ty
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default CheckInOutWidget