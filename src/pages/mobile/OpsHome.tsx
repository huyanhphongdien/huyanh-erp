// ============================================================================
// OpsHome — tab "Hôm nay": chào thợ, cảnh báo máy đang chờ, việc hôm nay,
// trạng thái ca, nhắc việc kế tiếp. Dữ liệu thật theo employee đăng nhập.
// ============================================================================
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { attendanceService } from '../../services/attendanceService'
import {
  getTodayTasks, getTodayAttendance, getTodayShift, getOpenIssues, taskDone,
} from '../../services/opsService'
import { firstName, hhmm, clock } from './opsUtil'

// Lấy vị trí GPS (không bắt buộc — service tự báo lỗi nếu công ty yêu cầu GPS)
function getGps(): Promise<{ latitude: number; longitude: number; accuracy: number } | undefined> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(undefined)
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  })
}

export default function OpsHome() {
  const nav = useNavigate()
  const { user } = useAuthStore()
  const emp = user?.employee_id || ''

  const tasks = useQuery({ queryKey: ['ops-today-tasks', emp], queryFn: () => getTodayTasks(emp), enabled: !!emp })
  const att = useQuery({ queryKey: ['ops-today-att', emp], queryFn: () => getTodayAttendance(emp), enabled: !!emp })
  const shift = useQuery({ queryKey: ['ops-today-shift', emp], queryFn: () => getTodayShift(emp), enabled: !!emp })
  const issues = useQuery({ queryKey: ['ops-open-issues'], queryFn: getOpenIssues, refetchInterval: 20000, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true })
  const qc = useQueryClient()
  const [busy, setBusy] = useState<'in' | 'out' | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function doPunch(kind: 'in' | 'out') {
    setBusy(kind); setMsg(null)
    try {
      const gps = await getGps()
      if (kind === 'in') await attendanceService.checkIn(emp, { gps, isGpsVerified: !!gps })
      else await attendanceService.checkOut(emp, { gps })
      setMsg({ ok: true, text: kind === 'in' ? '✅ Đã vào ca' : '✅ Đã ra ca' })
      qc.invalidateQueries({ queryKey: ['ops-today-att', emp] })
      qc.invalidateQueries({ queryKey: ['open-attendance'] })
      qc.invalidateQueries({ queryKey: ['attendance'] })
      att.refetch()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Lỗi chấm công' })
    } finally { setBusy(null) }
  }

  const list = tasks.data || []
  const done = list.filter(taskDone).length
  const total = list.length
  const nextTask = list.find(t => !taskDone(t))
  const a = att.data
  const sh = shift.data?.shift
  const shiftLabel = sh ? `Ca ${sh.name} · ${clock(sh.start_time)}–${clock(sh.end_time)}` : (user?.department_name || 'Nhân viên')
  const open = issues.data || { total: 0, dung: 0 }

  return (
    <>
      <header className="ops-appbar">
        <span className="ops-av">👷</span>
        <div style={{ minWidth: 0 }}>
          <div className="ops-tt">Chào, anh {firstName(user?.full_name)}</div>
          <div className="ops-su" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shiftLabel}</div>
        </div>
        <div className="ops-r">
          <button className="ops-bell" onClick={() => nav('/m/yeu-cau')} aria-label="Yêu cầu">
            🔔{open.total > 0 && <span className="dot">{open.total}</span>}
          </button>
        </div>
      </header>

      <div className="ops-body">
        <div className="ops-inner">
          {open.total > 0 && (
            <div className="ops-alert" onClick={() => nav('/m/yeu-cau')}>
              <span className="ic">{open.dung > 0 ? '🔴' : '🟡'}</span>
              <div>
                <div className="n">{open.total} máy đang chờ xử lý</div>
                <div className="d">{open.dung > 0 ? `${open.dung} máy đang DỪNG · bấm để nhận việc` : 'bấm để xem & nhận việc'}</div>
              </div>
              <span className="go">›</span>
            </div>
          )}

          {/* Việc hôm nay */}
          <div className="ops-card tint press" onClick={() => nav('/m/app/tuan-tra')}>
            <div className="ops-rw">
              <span className="ops-lbl" style={{ margin: 0 }}>Việc hôm nay</span>
              <span className="ops-chip lime">{total > 0 ? `${total} việc` : 'chưa có'}</span>
            </div>
            <div className="ops-rw" style={{ marginTop: 8 }}>
              <span className="ops-mid">{total === 0 ? 'Chưa có việc hôm nay' : done >= total ? 'Đã xong hết 🎉' : nextTask?.name || 'Vòng việc hôm nay'}</span>
              <span className="ops-sm ops-mono">{done}/{total}</span>
            </div>
            {total > 0 && (
              <div style={{ height: 6, borderRadius: 6, background: 'var(--line)', marginTop: 9, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.round((done / total) * 100)}%`, background: 'var(--lime)', borderRadius: 6 }} />
              </div>
            )}
          </div>

          {/* Ca hôm nay + chấm công GPS */}
          <div className="ops-card">
            <div className="ops-rw">
              <span>
                <div className="ops-lbl">Ca hôm nay</div>
                <div className="ops-mid">{a?.check_in_time ? `Đã vào ca ${hhmm(a.check_in_time)}` : 'Chưa vào ca'}</div>
              </span>
              {a?.check_in_time
                ? <span className={`ops-chip ${a.late_minutes && a.late_minutes > 0 ? 'amb' : 'ok'}`}>{a.late_minutes && a.late_minutes > 0 ? `Trễ ${a.late_minutes}′` : 'Đúng giờ'}</span>
                : <span className="ops-chip mut">—</span>}
            </div>
            {a?.check_in_time && (
              <div className="ops-sm" style={{ marginTop: 5 }}>
                {a.is_gps_verified ? '📍 Đã xác thực vị trí' : a.check_in_lat ? '📍 Có vị trí (chưa xác thực)' : '📍 Chưa có vị trí'}
                {a.check_out_time ? ` · Đã ra ca ${hhmm(a.check_out_time)}` : ''}
              </div>
            )}

            {!a?.check_in_time ? (
              <button className="ops-btn g" style={{ marginTop: 10 }} disabled={busy === 'in'} onClick={() => doPunch('in')}>
                {busy === 'in' ? 'Đang lấy vị trí…' : '📍 Vào ca'}
              </button>
            ) : !a.check_out_time ? (
              <button className="ops-btn o" style={{ marginTop: 10 }} disabled={busy === 'out'} onClick={() => doPunch('out')}>
                {busy === 'out' ? 'Đang lấy vị trí…' : '🏁 Ra ca'}
              </button>
            ) : null}

            {msg && (
              <div className="ops-sm" style={{ marginTop: 8, color: msg.ok ? 'var(--ok)' : 'var(--red)', fontWeight: 650 }}>{msg.text}</div>
            )}
          </div>

          {/* Nhắc */}
          {nextTask && (
            <div className="ops-card press" onClick={() => nav('/m/app/tuan-tra')}>
              <div className="ops-lbl">Nhắc</div>
              <div className="ops-rw">
                <span className="ops-mid" style={{ fontSize: 14 }}>{nextTask.name}</span>
                <span className="ops-sm">›</span>
              </div>
              {nextTask.work_category && <div className="ops-sm" style={{ marginTop: 2 }}>{nextTask.work_category}</div>}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
