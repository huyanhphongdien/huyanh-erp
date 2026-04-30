// ============================================================================
// COVERAGE DASHBOARD — Real-time Shift Coverage (Idea #1 production)
// File: src/pages/operations/CoverageDashboardPage.tsx
// ============================================================================
// Hiển thị live trạng thái phân ca + chấm công cho mọi phòng có ca máy.
// Auto-refresh 60s. Cảnh báo NV chưa check-in sau giờ ca + 15 phút.
//
// PHÂN LOẠI 6 trạng thái NV theo ca:
//   ✅ Đã CI (present/late)
//   🕐 Trễ (late hoặc late_and_early)
//   🚪 Về sớm (early_leave hoặc late_and_early có check_out)
//   🛫 Công tác (BUSINESS_TRIP/CONG_TAC leave_request approved HOẶC attendance.status='business_trip')
//   📋 Nghỉ phép (PHEP_NAM/NGHI_OM/KHONG_LUONG/THAI_SAN/VIEC_RIENG approved HOẶC status='leave')
//   ❌ Vắng/Chưa CI (cần alert nếu đã quá grace)
//
// CROSSES MIDNIGHT: ca đêm (LONG_NIGHT 18:00-06:00, SHORT_3 22:00-06:00)
// được handle riêng — nowMin so với start sau midnight.
//
// Quyền: managerOnly (BGD + TP + PP, level <= 5)
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  CheckCircle2, AlertTriangle, Clock, RefreshCw,
  Phone, MessageSquare, UserCheck, Loader2, Users,
  Plane, FileText, LogOut as LogOutIcon,
} from 'lucide-react'
import { Card, Button, Tag, message, Empty } from 'antd'
import { supabase } from '../../lib/supabase'

// ============================================================================
// TYPES
// ============================================================================

type StatusCategory =
  | 'present'        // CI bình thường
  | 'late'           // CI nhưng trễ
  | 'early_leave'    // CI nhưng về sớm
  | 'on_trip'        // Công tác — đã được ghi nhận
  | 'on_leave'       // Nghỉ phép — đã được ghi nhận
  | 'missing'        // Chưa CI — cần alert

interface AssignmentRow {
  id: string
  date: string
  employee_id: string
  shift_id: string
  shift_code: string
  shift_name: string
  shift_start: string
  shift_end: string
  shift_crosses_midnight: boolean
  emp_code: string
  emp_full_name: string
  emp_phone?: string
  dept_id: string
  dept_code: string
  dept_name: string
  attendance_status: string | null
  check_in_time: string | null
  check_out_time: string | null
  late_minutes: number | null
  early_leave_minutes: number | null
  // Leave request info (nếu có)
  leave_type_code?: string | null
  leave_type_name?: string | null
  // Computed
  category: StatusCategory
}

interface ShiftCoverage {
  shift_id: string
  shift_code: string
  shift_name: string
  shift_start: string
  shift_end: string
  shift_crosses_midnight: boolean
  scheduled: number
  present: number      // CI bình thường
  late: number         // CI nhưng trễ (subset của present)
  early_leave: number  // Về sớm (subset của present)
  on_trip: number
  on_leave: number
  missing: AssignmentRow[]   // chưa CI
  state: 'pending' | 'full' | 'partial' | 'late'
  start_time_status: 'before' | 'started' | 'ended'
}

interface DeptCoverage {
  dept_id: string
  dept_code: string
  dept_name: string
  shifts: ShiftCoverage[]
  total_scheduled: number
  total_handled: number  // present + on_trip + on_leave
  total_missing: number
  has_alerts: boolean
}

interface OrphanAttendance {
  employee_id: string
  emp_code: string
  emp_full_name: string
  dept_name: string
  status: string
  check_in_time: string | null
}

// ============================================================================
// CONSTANTS
// ============================================================================

const REFRESH_MS = 60_000  // 1 phút
const LATE_GRACE_MIN = 15  // sau start + 15 phút mới flag missing
const TRIP_LEAVE_TYPES = ['BUSINESS_TRIP', 'CONG_TAC']
const LEAVE_TYPES_REGULAR = ['PHEP_NAM', 'NGHI_OM', 'KHONG_LUONG', 'THAI_SAN', 'VIEC_RIENG']

// ============================================================================
// HELPERS
// ============================================================================

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh'
  })
}

function fmtShortShiftTime(start: string, end: string): string {
  return `${start.substring(0, 5)}–${end.substring(0, 5)}`
}

function getNowMinutes(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/**
 * Tính start_time_status cho 1 ca, có handle crosses_midnight.
 * Ví dụ ca SHORT_3 (22:00-06:00 next day):
 *   - 18:00 → before
 *   - 22:30 → started
 *   - 03:00 (next day) → started
 *   - 07:00 (next day) → ended
 */
function getShiftStartStatus(
  shiftStart: string,
  shiftEnd: string,
  crossesMidnight: boolean,
  nowMin: number
): 'before' | 'started' | 'ended' {
  const startMin = timeToMinutes(shiftStart)
  const endMin = timeToMinutes(shiftEnd)

  if (!crossesMidnight) {
    if (nowMin < startMin) return 'before'
    if (nowMin > endMin) return 'ended'
    return 'started'
  }

  // Crosses midnight (vd 22:00-06:00):
  // started khi nowMin >= startMin (cùng ngày, vd 23:00) HOẶC nowMin <= endMin (sau midnight, vd 03:00)
  if (nowMin >= startMin || nowMin <= endMin) return 'started'
  return 'before'  // window 06:01–21:59 cùng ngày = chưa đến ca tối
}

/**
 * Phân loại 1 NV theo data attendance + leave + shift
 */
function categorize(
  attendanceStatus: string | null,
  checkInTime: string | null,
  leaveTypeCode: string | null
): StatusCategory {
  // 1. Có row attendance
  if (attendanceStatus) {
    if (attendanceStatus === 'business_trip') return 'on_trip'
    if (attendanceStatus === 'leave') return 'on_leave'
    if (attendanceStatus === 'early_leave' || attendanceStatus === 'late_and_early') return 'early_leave'
    if (attendanceStatus === 'late') return 'late'
    if (checkInTime) return 'present'
  }

  // 2. Không có attendance — check leave_request approved
  if (leaveTypeCode) {
    if (TRIP_LEAVE_TYPES.includes(leaveTypeCode)) return 'on_trip'
    if (LEAVE_TYPES_REGULAR.includes(leaveTypeCode)) return 'on_leave'
  }

  // 3. Không có gì → missing
  return 'missing'
}

// ============================================================================
// PAGE
// ============================================================================

export default function CoverageDashboardPage() {
  const [rows, setRows] = useState<AssignmentRow[]>([])
  const [orphans, setOrphans] = useState<OrphanAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [autoRefresh, setAutoRefresh] = useState(true)

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    try {
      // 1. Get shift_assignments hôm nay với JOIN shifts + employees + dept
      const { data: assignments, error: aErr } = await supabase
        .from('shift_assignments')
        .select(`
          id, date, employee_id, shift_id,
          shift:shifts!shift_assignments_shift_id_fkey(id, code, name, start_time, end_time, crosses_midnight),
          employee:employees!shift_assignments_employee_id_fkey(
            id, code, full_name, phone, status,
            department:departments!employees_department_id_fkey(id, code, name)
          )
        `)
        .eq('date', todayStr)

      if (aErr) throw aErr

      const empIds = [...new Set((assignments || []).map((a: any) => a.employee_id))]

      // 2. Get attendance hôm nay
      const { data: atts } = empIds.length === 0 ? { data: [] } : await supabase
        .from('attendance')
        .select('employee_id, shift_id, status, check_in_time, check_out_time, late_minutes, early_leave_minutes')
        .eq('date', todayStr)
        .in('employee_id', empIds)

      const attMap = new Map<string, any>()
      ;(atts || []).forEach(a => {
        // Multi-shift per day → key by employee_id + shift_id
        attMap.set(`${a.employee_id}|${a.shift_id}`, a)
        // Cũng map theo employee_id only (cho NV ca = 1)
        if (!attMap.has(a.employee_id)) attMap.set(a.employee_id, a)
      })

      // 3. Get leave_requests approved overlapping today
      const { data: leaves } = empIds.length === 0 ? { data: [] } : await supabase
        .from('leave_requests')
        .select(`
          employee_id, start_date, end_date, status, leave_type_id,
          leave_type:leave_types!leave_requests_leave_type_id_fkey(code, name)
        `)
        .in('employee_id', empIds)
        .eq('status', 'approved')
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)

      const leaveMap = new Map<string, { code: string | null; name: string | null }>()
      ;(leaves || []).forEach((l: any) => {
        const lt = Array.isArray(l.leave_type) ? l.leave_type[0] : l.leave_type
        leaveMap.set(l.employee_id, {
          code: lt?.code || null,
          name: lt?.name || null,
        })
      })

      // 4. Build flat rows + categorize
      const flat: AssignmentRow[] = (assignments || [])
        .filter((a: any) => {
          const emp = Array.isArray(a.employee) ? a.employee[0] : a.employee
          return emp && emp.status === 'active'
        })
        .map((a: any) => {
          const shift = Array.isArray(a.shift) ? a.shift[0] : a.shift
          const emp = Array.isArray(a.employee) ? a.employee[0] : a.employee
          const dept = emp?.department
            ? (Array.isArray(emp.department) ? emp.department[0] : emp.department)
            : null
          const att = attMap.get(`${a.employee_id}|${a.shift_id}`) || attMap.get(a.employee_id)
          const leaveInfo = leaveMap.get(a.employee_id)

          const category = categorize(att?.status || null, att?.check_in_time || null, leaveInfo?.code || null)

          return {
            id: a.id,
            date: a.date,
            employee_id: a.employee_id,
            shift_id: a.shift_id,
            shift_code: shift?.code || '',
            shift_name: shift?.name || '',
            shift_start: shift?.start_time || '',
            shift_end: shift?.end_time || '',
            shift_crosses_midnight: !!shift?.crosses_midnight,
            emp_code: emp?.code || '',
            emp_full_name: emp?.full_name || '',
            emp_phone: emp?.phone || '',
            dept_id: dept?.id || '',
            dept_code: dept?.code || '',
            dept_name: dept?.name || 'Không xác định',
            attendance_status: att?.status || null,
            check_in_time: att?.check_in_time || null,
            check_out_time: att?.check_out_time || null,
            late_minutes: att?.late_minutes ?? null,
            early_leave_minutes: att?.early_leave_minutes ?? null,
            leave_type_code: leaveInfo?.code || null,
            leave_type_name: leaveInfo?.name || null,
            category,
          }
        })

      // 5. Detect orphan attendance: NV có attendance hôm nay nhưng KHÔNG có shift_assignment
      const scheduledEmpIds = new Set(flat.map(r => r.employee_id))
      const orphanList: OrphanAttendance[] = []
      ;(atts || []).forEach((a: any) => {
        if (!scheduledEmpIds.has(a.employee_id)) {
          // NV này CI nhưng không có shift today
          // Cần lấy emp info — query riêng
          orphanList.push({
            employee_id: a.employee_id,
            emp_code: '',
            emp_full_name: '',
            dept_name: '',
            status: a.status,
            check_in_time: a.check_in_time,
          })
        }
      })

      if (orphanList.length > 0) {
        const orphanIds = orphanList.map(o => o.employee_id)
        const { data: orphanEmps } = await supabase
          .from('employees')
          .select('id, code, full_name, department:departments!employees_department_id_fkey(name)')
          .in('id', orphanIds)
        ;(orphanEmps || []).forEach((e: any) => {
          const dept = Array.isArray(e.department) ? e.department[0] : e.department
          const o = orphanList.find(x => x.employee_id === e.id)
          if (o) {
            o.emp_code = e.code
            o.emp_full_name = e.full_name
            o.dept_name = dept?.name || ''
          }
        })
      }

      setRows(flat)
      setOrphans(orphanList)
      setLastRefresh(new Date())
    } catch (err: any) {
      console.error('[CoverageDashboard] fetch error:', err)
      message.error('Lỗi tải dữ liệu: ' + (err.message || 'Unknown'))
    } finally {
      setLoading(false)
    }
  }, [todayStr])

  // Auto-refresh
  useEffect(() => {
    fetchData()
    if (!autoRefresh) return
    const id = setInterval(fetchData, REFRESH_MS)
    return () => clearInterval(id)
  }, [fetchData, autoRefresh])

  // ── Aggregate ──
  const deptCoverage: DeptCoverage[] = useMemo(() => {
    const nowMin = getNowMinutes()

    const deptMap = new Map<string, DeptCoverage>()
    const shiftMap = new Map<string, Map<string, ShiftCoverage>>()

    rows.forEach(r => {
      if (!deptMap.has(r.dept_code)) {
        deptMap.set(r.dept_code, {
          dept_id: r.dept_id,
          dept_code: r.dept_code,
          dept_name: r.dept_name,
          shifts: [],
          total_scheduled: 0,
          total_handled: 0,
          total_missing: 0,
          has_alerts: false,
        })
        shiftMap.set(r.dept_code, new Map())
      }
      const dept = deptMap.get(r.dept_code)!
      const dShifts = shiftMap.get(r.dept_code)!

      if (!dShifts.has(r.shift_id)) {
        const startStatus = getShiftStartStatus(
          r.shift_start, r.shift_end, r.shift_crosses_midnight, nowMin
        )
        dShifts.set(r.shift_id, {
          shift_id: r.shift_id,
          shift_code: r.shift_code,
          shift_name: r.shift_name,
          shift_start: r.shift_start,
          shift_end: r.shift_end,
          shift_crosses_midnight: r.shift_crosses_midnight,
          scheduled: 0,
          present: 0,
          late: 0,
          early_leave: 0,
          on_trip: 0,
          on_leave: 0,
          missing: [],
          state: 'pending',
          start_time_status: startStatus,
        })
      }
      const shift = dShifts.get(r.shift_id)!

      shift.scheduled++
      dept.total_scheduled++

      switch (r.category) {
        case 'present':
          shift.present++
          dept.total_handled++
          break
        case 'late':
          shift.present++
          shift.late++
          dept.total_handled++
          break
        case 'early_leave':
          shift.present++
          shift.early_leave++
          if (r.attendance_status === 'late_and_early') shift.late++
          dept.total_handled++
          break
        case 'on_trip':
          shift.on_trip++
          dept.total_handled++
          break
        case 'on_leave':
          shift.on_leave++
          dept.total_handled++
          break
        case 'missing':
          shift.missing.push(r)
          dept.total_missing++
          break
      }
    })

    // Compute state per shift
    deptMap.forEach((dept, deptCode) => {
      const dShifts = shiftMap.get(deptCode)!
      dShifts.forEach(shift => {
        const handled = shift.present + shift.on_trip + shift.on_leave

        if (shift.start_time_status === 'before') {
          shift.state = 'pending'
        } else if (handled === shift.scheduled) {
          shift.state = 'full'
        } else if (shift.start_time_status === 'started') {
          // Đã bắt đầu, có grace LATE_GRACE_MIN
          const startMin = timeToMinutes(shift.shift_start)
          const beyondGrace = !shift.shift_crosses_midnight
            ? nowMin > startMin + LATE_GRACE_MIN
            : (nowMin >= startMin && nowMin > startMin + LATE_GRACE_MIN) ||
              (nowMin <= timeToMinutes(shift.shift_end))  // crosses_midnight + sau midnight = chắc chắn quá grace
          if (beyondGrace) {
            shift.state = 'late'
            dept.has_alerts = true
          } else {
            shift.state = 'partial'
          }
        } else {
          // ended
          shift.state = handled === shift.scheduled ? 'full' : 'late'
          if (handled !== shift.scheduled) dept.has_alerts = true
        }
      })

      dept.shifts = Array.from(dShifts.values()).sort((a, b) =>
        timeToMinutes(a.shift_start) - timeToMinutes(b.shift_start)
      )
    })

    return Array.from(deptMap.values()).sort((a, b) => a.dept_code.localeCompare(b.dept_code))
  }, [rows])

  const allAlerts: AssignmentRow[] = useMemo(() => {
    const alerts: AssignmentRow[] = []
    deptCoverage.forEach(dept => {
      dept.shifts.forEach(shift => {
        if (shift.state === 'late') {
          alerts.push(...shift.missing)
        }
      })
    })
    return alerts
  }, [deptCoverage])

  const totalScheduled = deptCoverage.reduce((s, d) => s + d.total_scheduled, 0)
  const totalHandled = deptCoverage.reduce((s, d) => s + d.total_handled, 0)
  const totalMissing = deptCoverage.reduce((s, d) => s + d.total_missing, 0)
  const totalAlertNV = allAlerts.length

  const totalTrip = deptCoverage.reduce((s, d) => s + d.shifts.reduce((ss, sh) => ss + sh.on_trip, 0), 0)
  const totalLeave = deptCoverage.reduce((s, d) => s + d.shifts.reduce((ss, sh) => ss + sh.on_leave, 0), 0)

  // ── Action handlers ──
  function handleCall(phone?: string) {
    if (!phone) {
      message.warning('NV chưa có số điện thoại trong hệ thống')
      return
    }
    window.location.href = `tel:${phone}`
  }

  function handleSMS(phone?: string, name?: string) {
    if (!phone) {
      message.warning('NV chưa có số điện thoại')
      return
    }
    const text = encodeURIComponent(`Xin chào ${name || 'bạn'}, bạn có ca làm việc hôm nay nhưng chưa check-in. Vui lòng kiểm tra.`)
    window.location.href = `sms:${phone}?body=${text}`
  }

  async function handleMarkLateApproved(row: AssignmentRow) {
    const nowMin = getNowMinutes()
    const startMin = timeToMinutes(row.shift_start)
    const lateMin = Math.max(0, nowMin - startMin)

    try {
      const { error } = await supabase.from('attendance').insert({
        employee_id: row.employee_id,
        date: row.date,
        shift_id: row.shift_id,
        shift_date: row.date,
        check_in_time: new Date().toISOString(),
        status: 'late',
        late_minutes: lateMin,
        early_leave_minutes: 0,
        working_minutes: 0,
        overtime_minutes: 0,
        is_gps_verified: false,
        auto_checkout: false,
        notes: 'Manager xác nhận xin phép trễ',
      })
      if (error) throw error
      message.success(`Đã xác nhận xin phép trễ cho ${row.emp_full_name}`)
      fetchData()
    } catch (err: any) {
      message.error('Lỗi: ' + err.message)
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={32} />
      </div>
    )
  }

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>📍 Coverage Dashboard</h2>
          <p style={{ color: '#6b7280', marginTop: 4, fontSize: 13 }}>
            Hôm nay {todayStr} — refresh mỗi 60 giây · Cập nhật {fmtTime(lastRefresh.toISOString())}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type={autoRefresh ? 'primary' : 'default'}
            icon={<RefreshCw size={14} />}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Auto: ON' : 'Auto: OFF'}
          </Button>
          <Button icon={<RefreshCw size={14} />} onClick={fetchData}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Top metrics — 6 ô */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Card><MetricCard label="Tổng phân ca" value={totalScheduled} color="#1f2937" /></Card>
        <Card><MetricCard label="Đã CI" value={totalHandled} color="#16a34a" /></Card>
        <Card><MetricCard label="Tỷ lệ" value={`${totalScheduled > 0 ? Math.round((totalHandled / totalScheduled) * 100) : 0}%`} color="#2563eb" /></Card>
        <Card><MetricCard label="🛫 Công tác" value={totalTrip} color="#0891b2" /></Card>
        <Card><MetricCard label="📋 Nghỉ phép" value={totalLeave} color="#7c3aed" /></Card>
        <Card><MetricCard label="❌ Vắng/Alerts" value={totalAlertNV} color={totalAlertNV > 0 ? '#ef4444' : '#16a34a'} /></Card>
      </div>

      {/* Departments */}
      {deptCoverage.length === 0 ? (
        <Empty description="Chưa có phân ca cho hôm nay" />
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {deptCoverage.map(dept => (
            <Card key={dept.dept_code}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  Phòng <span style={{ color: dept.has_alerts ? '#ef4444' : '#1f2937' }}>{dept.dept_name}</span>
                </h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Tag color={dept.has_alerts ? 'red' : 'green'}>
                    {dept.total_handled}/{dept.total_scheduled} đã xử lý
                  </Tag>
                  {dept.total_missing > 0 && <Tag color="red">{dept.total_missing} vắng</Tag>}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {dept.shifts.map(shift => (
                  <ShiftRow
                    key={shift.shift_id}
                    shift={shift}
                    rows={rows.filter(r => r.shift_id === shift.shift_id && r.dept_code === dept.dept_code)}
                    onCall={handleCall}
                    onSMS={handleSMS}
                    onMarkLate={handleMarkLateApproved}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Orphan attendance */}
      {orphans.length > 0 && (
        <Card style={{ marginTop: 20, borderColor: '#fde68a' }}>
          <h3 style={{ margin: 0, marginBottom: 12, color: '#a16207', fontSize: 14 }}>
            ℹ️ {orphans.length} NV check-in nhưng KHÔNG có phân ca hôm nay
          </h3>
          <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            {orphans.map(o => (
              <div key={o.employee_id} style={{ padding: 6, background: '#fef9c3', borderRadius: 4 }}>
                <span style={{ fontWeight: 600 }}>{o.emp_code} {o.emp_full_name}</span>
                <span style={{ color: '#6b7280', marginLeft: 8 }}>
                  ({o.dept_name}) — CI lúc {fmtTime(o.check_in_time)} — status: {o.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Alerts panel */}
      {allAlerts.length > 0 && (
        <Card style={{ marginTop: 20, borderColor: '#fca5a5' }}>
          <h3 style={{ margin: 0, marginBottom: 12, color: '#dc2626', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={18} />
            ALERTS — {allAlerts.length} NV chưa check-in sau giờ ca + {LATE_GRACE_MIN} phút
          </h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {allAlerts.map(r => (
              <AlertRow key={r.id} row={r} onCall={handleCall} onSMS={handleSMS} onMarkLate={handleMarkLateApproved} />
            ))}
          </div>
        </Card>
      )}

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#9ca3af' }}>
        💡 Tip: NV đi công tác / nghỉ phép (đã được duyệt) tự động được ghi nhận, không cần action.
        Chỉ alert khi NV scheduled mà CHƯA có check-in / phép / công tác.
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function MetricCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </>
  )
}

function ShiftRow({
  shift, rows, onCall, onSMS, onMarkLate,
}: {
  shift: ShiftCoverage
  rows: AssignmentRow[]
  onCall: (phone?: string) => void
  onSMS: (phone?: string, name?: string) => void
  onMarkLate: (row: AssignmentRow) => void
}) {
  const stateConfig = {
    pending: { icon: <Clock size={16} />, color: '#9ca3af', label: 'Chưa đến giờ', bg: '#f3f4f6' },
    full: { icon: <CheckCircle2 size={16} />, color: '#16a34a', label: 'Đủ NV', bg: '#dcfce7' },
    partial: { icon: <Clock size={16} />, color: '#f59e0b', label: 'Đang vào ca', bg: '#fef3c7' },
    late: { icon: <AlertTriangle size={16} />, color: '#dc2626', label: 'Thiếu NV', bg: '#fee2e2' },
  }[shift.state]

  // Build description tags
  const breakdown: string[] = []
  if (shift.present > 0) breakdown.push(`${shift.present} CI`)
  if (shift.late > 0) breakdown.push(`${shift.late} trễ`)
  if (shift.early_leave > 0) breakdown.push(`${shift.early_leave} về sớm`)
  if (shift.on_trip > 0) breakdown.push(`🛫 ${shift.on_trip}`)
  if (shift.on_leave > 0) breakdown.push(`📋 ${shift.on_leave}`)
  if (shift.missing.length > 0) breakdown.push(`❌ ${shift.missing.length} chưa CI`)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '8px 12px',
      background: stateConfig.bg,
      borderRadius: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ color: stateConfig.color }}>{stateConfig.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>
            {shift.shift_name} <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 12 }}>
              ({fmtShortShiftTime(shift.shift_start, shift.shift_end)}{shift.shift_crosses_midnight ? ' qua đêm' : ''})
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {breakdown.join(' · ') || `0/${shift.scheduled}`}
            {shift.start_time_status === 'before' && <span> · start lúc {shift.shift_start.substring(0, 5)}</span>}
          </div>
        </div>
        <Tag color={
          shift.state === 'full' ? 'green' :
          shift.state === 'late' ? 'red' :
          shift.state === 'partial' ? 'orange' : 'default'
        }>
          {stateConfig.label}
        </Tag>
      </div>

      {shift.missing.length > 0 && (shift.state === 'late' || shift.state === 'partial') && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6b7280', paddingLeft: 28 }}>
            Xem {shift.missing.length} NV chưa CI
          </summary>
          <div style={{ marginTop: 8, marginLeft: 28, display: 'grid', gap: 4 }}>
            {shift.missing.map(r => (
              <AlertRow key={r.id} row={r} compact onCall={onCall} onSMS={onSMS} onMarkLate={onMarkLate} />
            ))}
          </div>
        </details>
      )}

      {/* Đã có on_trip / on_leave — show tóm tắt */}
      {(shift.on_trip + shift.on_leave > 0) && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: '#0891b2', paddingLeft: 28 }}>
            Xem {shift.on_trip + shift.on_leave} NV công tác / nghỉ phép
          </summary>
          <div style={{ marginTop: 8, marginLeft: 28, display: 'grid', gap: 4 }}>
            {rows.filter(r => r.category === 'on_trip' || r.category === 'on_leave').map(r => (
              <HandledRow key={r.id} row={r} />
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

function HandledRow({ row }: { row: AssignmentRow }) {
  const isTrip = row.category === 'on_trip'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 12 }}>
      {isTrip ? <Plane size={12} style={{ color: '#0891b2' }} /> : <FileText size={12} style={{ color: '#7c3aed' }} />}
      <span style={{ fontWeight: 600 }}>{row.emp_code} {row.emp_full_name}</span>
      <span style={{ color: '#6b7280' }}>
        — {row.leave_type_name || (isTrip ? 'Công tác' : 'Nghỉ phép')}
        {row.attendance_status && row.attendance_status !== 'leave' && row.attendance_status !== 'business_trip' &&
          ` (att: ${row.attendance_status})`}
      </span>
    </div>
  )
}

function AlertRow({
  row, compact = false, onCall, onSMS, onMarkLate,
}: {
  row: AssignmentRow
  compact?: boolean
  onCall: (phone?: string) => void
  onSMS: (phone?: string, name?: string) => void
  onMarkLate: (row: AssignmentRow) => void
}) {
  const nowMin = getNowMinutes()
  const startMin = timeToMinutes(row.shift_start)
  const lateMin = Math.max(0, nowMin - startMin)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: compact ? '4px 8px' : '6px 10px',
      background: compact ? 'transparent' : '#fff',
      borderRadius: 4,
      fontSize: compact ? 12 : 13,
      flexWrap: 'wrap',
    }}>
      <Users size={compact ? 12 : 14} style={{ color: '#dc2626' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{row.emp_code} {row.emp_full_name}</span>
        <span style={{ color: '#6b7280', marginLeft: 8 }}>
          ({row.shift_name}) — late {lateMin} phút
        </span>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <Button size="small" icon={<Phone size={12} />} onClick={() => onCall(row.emp_phone)}>
          Gọi
        </Button>
        <Button size="small" icon={<MessageSquare size={12} />} onClick={() => onSMS(row.emp_phone, row.emp_full_name)}>
          SMS
        </Button>
        <Button size="small" type="primary" icon={<UserCheck size={12} />} onClick={() => onMarkLate(row)}>
          Xác nhận xin trễ
        </Button>
      </div>
    </div>
  )
}
