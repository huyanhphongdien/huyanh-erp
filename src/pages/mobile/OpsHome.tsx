// ============================================================================
// OpsHome — tab "Hôm nay": chào thợ, cảnh báo máy đang chờ, việc hôm nay,
// chấm công GPS + TỰ CHỌN CA (làm được 2 ca liên tục), nhắc việc.
// ============================================================================
import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { attendanceService } from '../../services/attendanceService'
import { initWebPush, webPushState, type WebPushState } from '../../services/webPush'
import {
  getTodayTasks, getTodayAttendanceRows, getActiveShifts, getOpenIssues, taskDone,
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
  const att = useQuery({ queryKey: ['ops-today-att', emp], queryFn: () => getTodayAttendanceRows(emp), enabled: !!emp })
  const shifts = useQuery({ queryKey: ['ops-active-shifts'], queryFn: getActiveShifts, staleTime: 10 * 60 * 1000 })
  const issues = useQuery({ queryKey: ['ops-open-issues'], queryFn: getOpenIssues, refetchInterval: 20000, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true })
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [picker, setPicker] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [push, setPush] = useState<WebPushState>('native')
  useEffect(() => { setPush(webPushState()) }, [])
  async function enablePush() {
    setPush(await initWebPush(true))
  }

  async function punch(kind: 'in' | 'out', shiftId?: string) {
    setBusy(true); setMsg(null); setPicker(false)
    try {
      const gps = await getGps()
      if (kind === 'in') await attendanceService.checkIn(emp, { targetShiftId: shiftId, gps, isGpsVerified: !!gps })
      else await attendanceService.checkOut(emp, { gps })
      setMsg({ ok: true, text: kind === 'in' ? '✅ Đã vào ca' : '✅ Đã ra ca' })
      qc.invalidateQueries({ queryKey: ['ops-today-att', emp] })
      qc.invalidateQueries({ queryKey: ['open-attendance'] })
      qc.invalidateQueries({ queryKey: ['attendance'] })
      att.refetch()
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Lỗi chấm công' })
    } finally { setBusy(false) }
  }

  const list = tasks.data || []
  const done = list.filter(taskDone).length
  const total = list.length
  const nextTask = list.find(t => !taskDone(t))

  const rows = att.data || []
  const openRow = rows.find(r => r.check_in_time && !r.check_out_time) || null
  const doneRows = rows.filter(r => r.check_in_time && r.check_out_time)
  const open = issues.data || { total: 0, dung: 0 }
  const subtitle = openRow ? `Đang trong ca${openRow.shift?.name ? ` ${openRow.shift.name}` : ''}` : (user?.department_name || 'Nhân viên')

  return (
    <>
      <header className="ops-appbar">
        <span className="ops-av">👷</span>
        <div style={{ minWidth: 0 }}>
          <div className="ops-tt">Chào, anh {firstName(user?.full_name)}</div>
          <div className="ops-su" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>
        </div>
        <div className="ops-r">
          <button className="ops-bell" onClick={() => nav('/m/yeu-cau')} aria-label="Yêu cầu">
            🔔{open.total > 0 && <span className="dot">{open.total}</span>}
          </button>
        </div>
      </header>

      <div className="ops-body">
        <div className="ops-inner">
          {/* Chưa bật thông báo → máy hỏng sẽ không kêu. Nhắc ngay đầu màn. */}
          {(push === 'default' || push === 'denied') && (
            <div className="ops-card" style={{ borderLeft: '5px solid var(--amber)' }}>
              <div className="ops-mid" style={{ fontSize: 15 }}>🔔 Chưa bật thông báo</div>
              <div className="ops-sm" style={{ marginTop: 3 }}>
                {push === 'denied'
                  ? 'Máy đang CHẶN thông báo. Vào Cài đặt trình duyệt → Thông báo → cho phép huyanhrubber.vn, rồi mở lại trang.'
                  : 'Bật để nhận báo máy hỏng ngay cả khi tắt màn hình.'}
              </div>
              {push === 'default' && (
                <button className="ops-btn g" style={{ marginTop: 10 }} onClick={enablePush}>Bật thông báo</button>
              )}
            </div>
          )}

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

          {/* Ca hôm nay + chấm công GPS (tự chọn ca, 2 ca liên tục) */}
          <div className="ops-card">
            <div className="ops-rw">
              <span className="ops-lbl" style={{ margin: 0 }}>Ca hôm nay</span>
              {openRow
                ? <span className={`ops-chip ${openRow.late_minutes && openRow.late_minutes > 0 ? 'amb' : 'ok'}`}>{openRow.late_minutes && openRow.late_minutes > 0 ? `Trễ ${openRow.late_minutes}′` : 'Đang làm'}</span>
                : doneRows.length > 0 ? <span className="ops-chip ok">Xong {doneRows.length} ca</span> : <span className="ops-chip mut">Chưa vào ca</span>}
            </div>

            {/* Liệt kê các ca đã/đang chấm hôm nay */}
            {rows.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rows.map(r => (
                  <div key={r.id} className="ops-rw" style={{ fontSize: 13.5 }}>
                    <span style={{ fontWeight: 700 }}>{r.shift?.name || 'Ca'}</span>
                    <span className="ops-mono ops-sm">{hhmm(r.check_in_time)} → {r.check_out_time ? hhmm(r.check_out_time) : '…'}</span>
                  </div>
                ))}
                {openRow && (openRow.is_gps_verified || openRow.check_in_lat) && (
                  <div className="ops-sm">{openRow.is_gps_verified ? '📍 Đã xác thực vị trí' : '📍 Có vị trí (chưa xác thực)'}</div>
                )}
              </div>
            )}

            {openRow ? (
              <button className="ops-btn o" style={{ marginTop: 10 }} disabled={busy} onClick={() => punch('out')}>
                {busy ? 'Đang xử lý…' : '🏁 Ra ca'}
              </button>
            ) : (
              <button className="ops-btn g" style={{ marginTop: 10 }} disabled={busy} onClick={() => setPicker(true)}>
                {busy ? 'Đang xử lý…' : (doneRows.length > 0 ? '📍 Vào ca tiếp' : '📍 Vào ca')}
              </button>
            )}

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

      {/* Sheet chọn ca */}
      {picker && (
        <div onClick={() => setPicker(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, margin: '0 auto', background: 'var(--surf)', borderRadius: '20px 20px 0 0', padding: '16px 14px calc(20px + env(safe-area-inset-bottom))', boxShadow: 'var(--el3)' }}>
            <div style={{ width: 40, height: 4, borderRadius: 4, background: 'var(--line)', margin: '0 auto 12px' }} />
            <div className="ops-mid" style={{ marginBottom: 4 }}>Chọn ca vào làm</div>
            <div className="ops-sm" style={{ marginBottom: 10 }}>Chấm ca nào chọn ca đó. Làm 2 ca thì ra ca rồi vào ca tiếp.</div>
            {(shifts.data || []).length === 0 && <div className="ops-sm">Chưa có ca nào đang bật.</div>}
            {(shifts.data || []).map(s => (
              <button key={s.id} className="ops-card press" style={{ width: '100%', textAlign: 'left', marginBottom: 8, border: 0 }} onClick={() => punch('in', s.id)}>
                <div className="ops-rw">
                  <span>
                    <div className="ops-mid" style={{ fontSize: 15 }}>{s.name}</div>
                    <div className="ops-sm">{clock(s.start_time)}–{clock(s.end_time)}{s.crosses_midnight ? ' · qua đêm' : ''}</div>
                  </span>
                  <span className="ops-sm">›</span>
                </div>
              </button>
            ))}
            <button className="ops-btn o" style={{ marginTop: 4 }} onClick={() => setPicker(false)}>Đóng</button>
          </div>
        </div>
      )}
    </>
  )
}
