// ============================================================================
// OpsShift — tab "Ca": lịch ca tuần này của thợ (Thứ 2 → CN). Hôm nay nổi bật.
// Đăng ký ca sẽ mở ở GĐ sau — hiện là xem lịch được phân.
// Ngày không có dòng phân ca: có đơn nghỉ đã duyệt / chấm công 'leave' → "Nghỉ phép" (duyệt nghỉ XOÁ phân ca ngày đó),
// còn lại "Chưa phân ca". Mất mạng khi chưa có dữ liệu (query paused) → báo mất mạng, không vẽ 7 ngày trống.
// ============================================================================
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/authStore'
import { getWeekShifts, getWeekLeaveDates, vnWeekRange, vnToday } from '../../services/opsService'
import { ATTENDANCE_STATUS_LABELS } from '../../services/attendanceService'
import { weekdayVi, ddmm, clock } from './opsUtil'
import OpsLoadError, { OpsOffline } from './OpsLoadError'

export default function OpsShift() {
  const { user } = useAuthStore()
  const emp = user?.employee_id || ''
  const q = useQuery({
    queryKey: ['ops-week-shifts', emp],
    queryFn: async () => {
      const [shifts, leaveDays] = await Promise.all([getWeekShifts(emp), getWeekLeaveDates(emp)])
      return { shifts, leaveDays }
    },
    enabled: !!emp,
  })

  const { days } = vnWeekRange()
  const today = vnToday()
  const byDate = new Map((q.data?.shifts || []).map(s => [s.date, s]))
  const leave = new Set(q.data?.leaveDays || [])

  return (
    <>
      <header className="ops-appbar">
        <span className="ops-av"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M4 9.5h16M8 3v4M16 3v4" /></svg></span>
        <div>
          <div className="ops-tt">Ca tuần này</div>
          <div className="ops-su">{ddmm(days[0])} – {ddmm(days[6])}</div>
        </div>
      </header>

      <div className="ops-body" style={{ gap: 8 }}>
        <div className="ops-inner" style={{ gap: 8 }}>
          {q.isLoading ? <>{[0, 1, 2, 3, 4].map(i => <div key={i} className="ops-skel" style={{ height: 58 }} />)}</>
            // mất mạng: TanStack Query TẠM DỪNG (fetchStatus 'paused', isLoading = false) — trước rơi xuống vẽ 7 ngày "Chưa phân ca"
            : q.isPaused && !q.data ? <OpsOffline hint="Bật WiFi hoặc 4G — có mạng lại lịch ca tự tải." />
            // tải hỏng mà vẽ 7 ngày trống là báo sai lịch → khối lỗi + Thử lại
            : q.isError && !q.data ? <OpsLoadError error={q.error} onRetry={() => q.refetch()} title="Không tải được lịch ca tuần này" /> : (
            days.map(d => {
              const s = byDate.get(d)
              const sh = s?.shift
              const isToday = d === today
              const nghi = !sh && leave.has(d)
              return (
                <div key={d} className="ops-card" style={isToday ? { boxShadow: '0 0 0 2px var(--lime), var(--el1)' } : undefined}>
                  <div className="ops-rw">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 44, textAlign: 'center' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: isToday ? 'var(--g)' : 'var(--ink-2)' }}>{weekdayVi(d)}</div>
                        <div className="ops-sm ops-mono">{ddmm(d)}</div>
                      </span>
                      <span>
                        {/* không có dòng phân ca ≠ được nghỉ — cùng nhãn "Chưa phân ca" với lịch ca desktop (ShiftCell);
                            riêng ngày nghỉ phép đã duyệt (phân ca bị xoá khi duyệt) ghi "Nghỉ phép" */}
                        <div className="ops-mid" style={{ fontSize: 15, color: sh || nghi ? undefined : 'var(--ink-3)' }}>{sh ? sh.name : nghi ? ATTENDANCE_STATUS_LABELS.leave : 'Chưa phân ca'}</div>
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
