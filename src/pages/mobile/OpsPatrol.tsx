// ============================================================================
// OpsPatrol — tab "Tuần tra": việc hôm nay của thợ theo dạng điểm dừng.
// Xong = xanh ✓, việc kế tiếp = viền chanh "đang tới", còn lại = số thứ tự.
// Tap 1 việc → mở chi tiết (/tasks/:id). Nút xanh chanh = quẹt QR tại máy.
// ============================================================================
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { getTodayTasks, taskDone } from '../../services/opsService'
import OpsQrScanner from './OpsQrScanner'

export default function OpsPatrol() {
  const nav = useNavigate()
  const { user } = useAuthStore()
  const emp = user?.employee_id || ''
  const [scan, setScan] = useState(false)
  const q = useQuery({ queryKey: ['ops-today-tasks', emp], queryFn: () => getTodayTasks(emp), enabled: !!emp })

  const list = q.data || []
  const done = list.filter(taskDone).length
  const firstUndone = list.findIndex(t => !taskDone(t))

  return (
    <>
      <header className="ops-appbar">
        <span className="ops-av">📋</span>
        <div style={{ minWidth: 0 }}>
          <div className="ops-tt">Việc hôm nay</div>
          <div className="ops-su">{list.length > 0 ? `${done}/${list.length} việc · theo giờ ca` : 'vòng việc trong ca'}</div>
        </div>
      </header>

      <div className="ops-body" style={{ gap: 8 }}>
        <div className="ops-inner" style={{ gap: 8 }}>
          {q.isLoading ? (
            <>{[0, 1, 2, 3].map(i => <div key={i} className="ops-skel" />)}</>
          ) : list.length === 0 ? (
            <div className="ops-empty">
              <div className="em">☑️</div>
              <div className="et">Chưa có việc hôm nay</div>
              <div className="ed">Lịch việc của tổ chưa bật, hoặc hôm nay không có việc định kỳ.<br />Máy hỏng vẫn báo bình thường ở nút 🔔.</div>
            </div>
          ) : (
            list.map((t, i) => {
              const d = taskDone(t)
              const now = !d && i === firstUndone
              return (
                <div key={t.id} className={`ops-pt${d ? ' done' : now ? ' now' : ''}`} onClick={() => nav(`/tasks/${t.id}`)} style={{ cursor: 'pointer' }}>
                  <span className="ops-ptn">{d ? '✓' : i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div className="ops-ptt" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                    <div className="ops-ptm">{d ? 'Đã xong' : t.work_category || 'chưa làm'}</div>
                  </span>
                  {now && <span className="ops-chip lime">đang tới</span>}
                </div>
              )
            })
          )}

          <button className="ops-btn l" style={{ marginTop: 6 }} onClick={() => setScan(true)}>📲 Quẹt QR tại máy</button>
        </div>
      </div>

      {scan && (
        <OpsQrScanner onClose={() => setScan(false)} onDetect={(code) => { setScan(false); nav(`/m/tb/${encodeURIComponent(code)}`) }} />
      )}
    </>
  )
}
