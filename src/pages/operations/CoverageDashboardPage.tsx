// ============================================================================
// COVERAGE DASHBOARD — Real-time Shift Coverage (Idea #1 mock)
// File: src/pages/operations/CoverageDashboardPage.tsx
// ============================================================================
// Hiển thị live trạng thái phân ca + chấm công cho mọi phòng có ca máy.
// Auto-refresh 60s. Cảnh báo NV chưa check-in sau giờ ca + 15 phút.
//
// DATA: JOIN shift_assignments × attendance × shifts × employees × departments
// theo ngày hiện tại. Group: department → shift → list NV
//
// Quyền: managerLevelOnly (BGD + TP + PP, level <= 5)
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  CheckCircle2, AlertTriangle, Clock, RefreshCw,
  Phone, MessageSquare, UserCheck, Loader2, Users,
} from 'lucide-react'
import { Card, Button, Tag, message, Empty } from 'antd'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'

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
  dept_code: string
  dept_name: string
  attendance_status: string | null
  check_in_time: string | null
  check_out_time: string | null
  late_minutes: number | null
}

interface ShiftCoverage {
  shift_id: string
  shift_code: string
  shift_name: string
  shift_start: string
  shift_end: string
  scheduled: number
  checked_in: number
  late: number
  missing: AssignmentRow[]
  state: 'pending' | 'partial' | 'full' | 'late'
  start_time_status: 'before' | 'started' | 'ended'
}

interface DeptCoverage {
  dept_id: string
  dept_code: string
  dept_name: string
  shifts: ShiftCoverage[]
  total_scheduled: number
  total_checked_in: number
  has_alerts: boolean
}

const REFRESH_MS = 60_000  // 1 phút
const LATE_GRACE_MIN = 15  // sau start + 15 phút mới flag missing

// Cả 2 phòng đều cần coverage view (ca máy + ca văn phòng)
// Nếu muốn lọc — uncomment dòng dưới
// const COVERAGE_DEPT_CODES: string[] = []  // empty = all

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

export default function CoverageDashboardPage() {
  const { user } = useAuthStore()
  const [rows, setRows] = useState<AssignmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [autoRefresh, setAutoRefresh] = useState(true)

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) // YYYY-MM-DD

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    try {
      // 1. Get shift_assignments cho hôm nay
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

      const taIds = (assignments || []).map((a: any) => a.employee_id)
      if (taIds.length === 0) {
        setRows([])
        setLastRefresh(new Date())
        return
      }

      // 2. Get attendance hôm nay cho các NV này
      const { data: atts } = await supabase
        .from('attendance')
        .select('employee_id, shift_id, status, check_in_time, check_out_time, late_minutes')
        .eq('date', todayStr)
        .in('employee_id', taIds)

      const attMap = new Map<string, any>()
      ;(atts || []).forEach(a => {
        // Key: employee_id|shift_id (multi-shift per day)
        attMap.set(`${a.employee_id}|${a.shift_id}`, a)
      })

      // 3. Flatten
      const flat: AssignmentRow[] = (assignments || []).map((a: any) => {
        const shift = Array.isArray(a.shift) ? a.shift[0] : a.shift
        const emp = Array.isArray(a.employee) ? a.employee[0] : a.employee
        const dept = emp?.department
          ? (Array.isArray(emp.department) ? emp.department[0] : emp.department)
          : null
        const att = attMap.get(`${a.employee_id}|${a.shift_id}`)

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
          dept_code: dept?.code || '',
          dept_name: dept?.name || 'Không xác định',
          attendance_status: att?.status || null,
          check_in_time: att?.check_in_time || null,
          check_out_time: att?.check_out_time || null,
          late_minutes: att?.late_minutes ?? null,
        }
      }).filter((r: AssignmentRow) => emp_active_filter(r))

      setRows(flat)
      setLastRefresh(new Date())
    } catch (err: any) {
      console.error('[CoverageDashboard] fetch error:', err)
      message.error('Lỗi tải dữ liệu: ' + (err.message || 'Unknown'))
    } finally {
      setLoading(false)
    }
  }, [todayStr])

  // (no-op filter để bỏ NV nếu cần extend sau — hiện trả true tất cả)
  function emp_active_filter(_r: AssignmentRow): boolean { return true }

  // Auto-refresh
  useEffect(() => {
    fetchData()
    if (!autoRefresh) return
    const id = setInterval(fetchData, REFRESH_MS)
    return () => clearInterval(id)
  }, [fetchData, autoRefresh])

  // ── Aggregate theo dept × shift ──
  const deptCoverage: DeptCoverage[] = useMemo(() => {
    const nowMin = getNowMinutes()

    const deptMap = new Map<string, DeptCoverage>()
    const shiftMap = new Map<string, Map<string, ShiftCoverage>>() // dept_id → shift_id → coverage

    rows.forEach(r => {
      // Init dept
      if (!deptMap.has(r.dept_code)) {
        deptMap.set(r.dept_code, {
          dept_id: r.dept_code,
          dept_code: r.dept_code,
          dept_name: r.dept_name,
          shifts: [],
          total_scheduled: 0,
          total_checked_in: 0,
          has_alerts: false,
        })
        shiftMap.set(r.dept_code, new Map())
      }
      const dept = deptMap.get(r.dept_code)!
      const dShifts = shiftMap.get(r.dept_code)!

      // Init shift
      if (!dShifts.has(r.shift_id)) {
        const startMin = timeToMinutes(r.shift_start)
        const endMin = timeToMinutes(r.shift_end)
        const crosses = r.shift_crosses_midnight
        const startTimeStatus: 'before' | 'started' | 'ended' =
          nowMin < startMin ? 'before' :
          (!crosses && nowMin > endMin) ? 'ended' :
          'started'

        dShifts.set(r.shift_id, {
          shift_id: r.shift_id,
          shift_code: r.shift_code,
          shift_name: r.shift_name,
          shift_start: r.shift_start,
          shift_end: r.shift_end,
          scheduled: 0,
          checked_in: 0,
          late: 0,
          missing: [],
          state: 'pending',
          start_time_status: startTimeStatus,
        })
      }
      const shift = dShifts.get(r.shift_id)!

      shift.scheduled++
      dept.total_scheduled++

      const hasCheckin = !!r.check_in_time
      if (hasCheckin) {
        shift.checked_in++
        dept.total_checked_in++
        if (r.attendance_status === 'late' || r.attendance_status === 'late_and_early') {
          shift.late++
        }
      } else {
        // Chưa check-in
        shift.missing.push(r)
      }
    })

    // Compute state cho mỗi shift
    deptMap.forEach((dept, deptCode) => {
      const dShifts = shiftMap.get(deptCode)!
      dShifts.forEach(shift => {
        // State logic
        if (shift.start_time_status === 'before') {
          shift.state = 'pending'
        } else if (shift.start_time_status === 'ended' && shift.checked_in === shift.scheduled) {
          shift.state = 'full'
        } else if (shift.checked_in === shift.scheduled) {
          shift.state = 'full'
        } else if (shift.start_time_status === 'started') {
          // Đã đến giờ ca, có grace LATE_GRACE_MIN phút sau start
          const startMin = timeToMinutes(shift.shift_start)
          if (nowMin > startMin + LATE_GRACE_MIN) {
            shift.state = 'late'  // alert
            dept.has_alerts = true
          } else {
            shift.state = 'partial'
          }
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
  const totalCheckedIn = deptCoverage.reduce((s, d) => s + d.total_checked_in, 0)
  const totalAlertNV = allAlerts.length

  // ── Action handlers (mock) ──
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
    // Mock: insert attendance row với late_minutes ước tính
    const nowMin = getNowMinutes()
    const startMin = timeToMinutes(row.shift_start)
    const lateMin = Math.max(0, nowMin - startMin)
    const note = 'Manager xác nhận xin phép trễ'

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
        notes: note,
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

      {/* Top metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Card>
          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>Tổng NV scheduled</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1f2937' }}>{totalScheduled}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>Đã check-in</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#16a34a' }}>{totalCheckedIn}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>Tỷ lệ</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#2563eb' }}>
            {totalScheduled > 0 ? Math.round((totalCheckedIn / totalScheduled) * 100) : 0}%
          </div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase' }}>Alerts</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: totalAlertNV > 0 ? '#ef4444' : '#16a34a' }}>
            {totalAlertNV}
          </div>
        </Card>
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
                <Tag color={dept.has_alerts ? 'red' : 'green'}>
                  {dept.total_checked_in}/{dept.total_scheduled} NV
                </Tag>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {dept.shifts.map(shift => (
                  <ShiftRow
                    key={shift.shift_id}
                    shift={shift}
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

      {/* Alerts panel */}
      {allAlerts.length > 0 && (
        <Card style={{ marginTop: 20, borderColor: '#fca5a5' }}>
          <h3 style={{ margin: 0, marginBottom: 12, color: '#dc2626', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={18} />
            ALERTS — {allAlerts.length} NV chưa check-in sau giờ ca
          </h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {allAlerts.map(r => (
              <AlertRow key={r.id} row={r} onCall={handleCall} onSMS={handleSMS} onMarkLate={handleMarkLateApproved} />
            ))}
          </div>
        </Card>
      )}

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#9ca3af' }}>
        💡 Tip: Trang này refresh tự động mỗi 60 giây. Nút trên góc phải để bật/tắt auto-refresh.
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function ShiftRow({
  shift, onCall, onSMS, onMarkLate,
}: {
  shift: ShiftCoverage
  onCall: (phone?: string) => void
  onSMS: (phone?: string, name?: string) => void
  onMarkLate: (row: AssignmentRow) => void
}) {
  const stateConfig = {
    pending: { icon: <Clock size={16} />, color: '#9ca3af', label: 'Chưa đến giờ', bg: '#f3f4f6' },
    full: { icon: <CheckCircle2 size={16} />, color: '#16a34a', label: 'Đủ', bg: '#dcfce7' },
    partial: { icon: <Clock size={16} />, color: '#f59e0b', label: 'Đang vào ca', bg: '#fef3c7' },
    late: { icon: <AlertTriangle size={16} />, color: '#dc2626', label: 'Thiếu NV', bg: '#fee2e2' },
  }[shift.state]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '8px 12px',
      background: stateConfig.bg,
      borderRadius: 6,
    }}>
      <div style={{ color: stateConfig.color }}>{stateConfig.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>
          {shift.shift_name} <span style={{ color: '#6b7280', fontWeight: 400, fontSize: 12 }}>
            ({fmtShortShiftTime(shift.shift_start, shift.shift_end)})
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {shift.checked_in}/{shift.scheduled} NV check-in
          {shift.late > 0 && <span style={{ color: '#f59e0b' }}> · {shift.late} trễ</span>}
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
      {shift.missing.length > 0 && shift.state === 'late' && (
        <details style={{ flexBasis: '100%', marginTop: 4 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: '#6b7280' }}>
            Xem {shift.missing.length} NV chưa check-in
          </summary>
          <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
            {shift.missing.map(r => (
              <AlertRow key={r.id} row={r} compact onCall={onCall} onSMS={onSMS} onMarkLate={onMarkLate} />
            ))}
          </div>
        </details>
      )}
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
