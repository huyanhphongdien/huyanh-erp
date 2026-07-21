// ============================================================================
// OpsShift — tab "Ca": lịch ca tuần này của thợ (Thứ 2 → CN). Hôm nay nổi bật.
// Đăng ký ca sẽ mở ở GĐ sau — hiện là xem lịch được phân.
// ============================================================================
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/authStore'
import { getWeekShifts, vnWeekRange, vnToday } from '../../services/opsService'
import { weekdayVi, ddmm, clock } from './opsUtil'

export default function OpsShift() {
  const { user } = useAuthStore()
  const emp = user?.employee_id || ''
  const q = useQuery({ queryKey: ['ops-week-shifts', emp], queryFn: () => getWeekShifts(emp), enabled: !!emp })

  const { days } = vnWeekRange()
  const today = vnToday()
  const byDate = new Map((q.data || []).map(s => [s.date, s]))

  return (
    <>
      <header className="ops-appbar">
        <span className="ops-av">📅</span>
        <div>
          <div className="ops-tt">Ca tuần này</div>
          <div className="ops-su">{ddmm(days[0])} – {ddmm(days[6])}</div>
        </div>
      </header>

      <div className="ops-body" style={{ gap: 8 }}>
        <div className="ops-inner" style={{ gap: 8 }}>
          {q.isLoading ? <>{[0, 1, 2, 3, 4].map(i => <div key={i} className="ops-skel" style={{ height: 58 }} />)}</> : (
            days.map(d => {
              const s = byDate.get(d)
              const sh = s?.shift
              const isToday = d === today
              return (
                <div key={d} className="ops-card" style={isToday ? { boxShadow: '0 0 0 2px var(--lime), var(--el1)' } : undefined}>
                  <div className="ops-rw">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 44, textAlign: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: isToday ? 'var(--g)' : 'var(--ink-2)' }}>{weekdayVi(d)}</div>
                        <div className="ops-sm ops-mono">{ddmm(d)}</div>
                      </span>
                      <span>
                        <div className="ops-mid" style={{ fontSize: 15 }}>{sh ? sh.name : 'Nghỉ'}</div>
                        {sh && <div className="ops-sm">{clock(sh.start_time)}–{clock(sh.end_time)}</div>}
                      </span>
                    </span>
                    {isToday && <span className="ops-chip lime">Hôm nay</span>}
                  </div>
                </div>
              )
            })
          )}
          <div className="ops-sm" style={{ textAlign: 'center', marginTop: 8, padding: '0 12px' }}>
            Tự đăng ký ca &amp; xin tăng ca sẽ mở ở bản cập nhật tới.
          </div>
        </div>
      </div>
    </>
  )
}
