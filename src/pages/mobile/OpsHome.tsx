// ============================================================================
// OpsHome — tab "Hôm nay": chào thợ, cảnh báo máy đang chờ, việc hôm nay,
// trạng thái ca, nhắc việc kế tiếp. Dữ liệu thật theo employee đăng nhập.
// ============================================================================
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import {
  getTodayTasks, getTodayAttendance, getTodayShift, getOpenIssues, taskDone,
} from '../../services/opsService'
import { firstName, hhmm, clock } from './opsUtil'

export default function OpsHome() {
  const nav = useNavigate()
  const { user } = useAuthStore()
  const emp = user?.employee_id || ''

  const tasks = useQuery({ queryKey: ['ops-today-tasks', emp], queryFn: () => getTodayTasks(emp), enabled: !!emp })
  const att = useQuery({ queryKey: ['ops-today-att', emp], queryFn: () => getTodayAttendance(emp), enabled: !!emp })
  const shift = useQuery({ queryKey: ['ops-today-shift', emp], queryFn: () => getTodayShift(emp), enabled: !!emp })
  const issues = useQuery({ queryKey: ['ops-open-issues'], queryFn: getOpenIssues, refetchInterval: 30000 })

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

          {/* Ca hôm nay */}
          <div className="ops-card">
            <div className="ops-rw">
              <span>
                <div className="ops-lbl">Ca hôm nay</div>
                <div className="ops-mid">{a?.check_in_time ? `Đã vào ca ${hhmm(a.check_in_time)}` : 'Chưa chấm công'}</div>
              </span>
              {a?.check_in_time
                ? <span className={`ops-chip ${a.late_minutes && a.late_minutes > 0 ? 'amb' : 'ok'}`}>{a.late_minutes && a.late_minutes > 0 ? `Trễ ${a.late_minutes}′` : 'Đúng giờ'}</span>
                : <span className="ops-chip mut">—</span>}
            </div>
            {a?.check_in_time && (
              <div className="ops-sm" style={{ marginTop: 5 }}>
                {a.is_gps_verified || a.check_in_lat ? '📍 Đã xác thực vị trí' : '📍 Chưa có vị trí'}
                {a.check_out_time ? ` · Đã ra ca ${hhmm(a.check_out_time)}` : ''}
              </div>
            )}
            {!a?.check_in_time && (
              <div className="ops-sm" style={{ marginTop: 5 }}>Chấm công qua máy chấm/điện thoại khi vào nhà máy.</div>
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
