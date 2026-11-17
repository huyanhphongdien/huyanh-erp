// ============================================================================
// OpsTimesheet — tab "Công": chấm công theo tháng của thợ (mặc định tháng này,
// nút ‹ › xem lùi tối đa 3 tháng — đầu tháng thợ cần soát công tháng vừa xong để đối chiếu lương).
// Tóm tắt: số ngày công, số lần trễ, tổng tăng ca. Bên dưới liệt kê từng ngày.
// ============================================================================
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/authStore'
import { getMonthAttendance, vnMonthKey, shiftMonthKey, vnToday } from '../../services/opsService'
import { ATTENDANCE_STATUS_LABELS } from '../../services/attendanceService'
import { addDaysStr } from '../../utils/dateVN'
import { DASH } from '../../utils/format'
import { hhmm, weekdayVi, ddmm, minutesVi } from './opsUtil'
import OpsLoadError from './OpsLoadError'

const MAX_BACK_MONTHS = 3

export default function OpsTimesheet() {
  const { user } = useAuthStore()
  const emp = user?.employee_id || ''
  const thisMonth = vnMonthKey()
  const [ym, setYm] = useState(thisMonth)
  const q = useQuery({ queryKey: ['ops-month-att', emp, ym], queryFn: () => getMonthAttendance(emp, ym), enabled: !!emp })
  const [yy, mm] = ym.split('-')
  const monthLabel = `Tháng ${Number(mm)}/${yy}`
  const isThisMonth = ym === thisMonth
  const canBack = ym > shiftMonthKey(thisMonth, -MAX_BACK_MONTHS)
  const canNext = ym < thisMonth
  // Ca chưa ra từ trước hôm qua = quên chấm ra, KHÔNG phải "Đang làm" (ca qua đêm hôm qua vẫn còn đang làm)
  const staleBefore = addDaysStr(vnToday(), -1)
  const navBtn = (on: boolean): React.CSSProperties => ({
    width: 44, height: 44, borderRadius: 12, border: 0, background: 'rgba(255,255,255,.16)', color: '#fff',
    fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: on ? 'pointer' : 'default', opacity: on ? 1 : .35,
  })

  const rows = q.data || []
  const has = !!q.data   // đang tải / tải hỏng → tóm tắt hiện '—', đừng in "0 ngày công" giả
  const worked = rows.filter(r => r.check_in_time).length
  const lateCount = rows.filter(r => (r.late_minutes || 0) > 0).length
  const otMin = rows.reduce((s, r) => s + (r.overtime_minutes || 0), 0)

  return (
    <>
      <header className="ops-appbar">
        <span className="ops-av">🕐</span>
        <div style={{ minWidth: 0 }}>
          <div className="ops-tt">Bảng công</div>
          <div className="ops-su">{monthLabel}{isThisMonth ? ' · tháng này' : ''}</div>
        </div>
        <div className="ops-r" style={{ gap: 6 }}>
          <button type="button" style={navBtn(canBack)} disabled={!canBack} onClick={() => setYm(shiftMonthKey(ym, -1))} aria-label="Tháng trước">‹</button>
          <button type="button" style={navBtn(canNext)} disabled={!canNext} onClick={() => setYm(shiftMonthKey(ym, 1))} aria-label="Tháng sau">›</button>
        </div>
      </header>

      <div className="ops-body" style={{ gap: 9 }}>
        <div className="ops-inner" style={{ gap: 9 }}>
          {/* Tóm tắt */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
            <div className="ops-card" style={{ textAlign: 'center' }}>
              <div className="ops-big" style={{ fontSize: 26 }}>{has ? worked : DASH}</div>
              <div className="ops-sm">Ngày công</div>
            </div>
            <div className="ops-card" style={{ textAlign: 'center' }}>
              <div className="ops-big" style={{ fontSize: 26, color: lateCount > 0 ? 'var(--amber)' : undefined }}>{has ? lateCount : DASH}</div>
              <div className="ops-sm">Lần trễ</div>
            </div>
            <div className="ops-card" style={{ textAlign: 'center' }}>
              <div className="ops-big" style={{ fontSize: 20 }}>{!has ? DASH : otMin > 0 ? minutesVi(otMin) : '0'}</div>
              <div className="ops-sm">Tăng ca</div>
            </div>
          </div>

          <div className="ops-sh">Chi tiết từng ngày</div>
          {q.isLoading ? <>{[0, 1, 2, 3].map(i => <div key={i} className="ops-skel" style={{ height: 54 }} />)}</>
            : q.isError && !q.data ? (
              <OpsLoadError error={q.error} onRetry={() => q.refetch()} title={`Không tải được công ${monthLabel.toLowerCase()}`} />
            ) : rows.length === 0 ? (
              <div className="ops-empty"><div className="em">🗓️</div><div className="et">{isThisMonth ? 'Chưa có công tháng này' : `Không có công ${monthLabel.toLowerCase()}`}</div></div>
            ) : rows.map(r => {
              const late = (r.late_minutes || 0) > 0
              // Ngày nghỉ phép (duyệt đơn → dòng status 'leave', thường KHÔNG có giờ vào): không phải "Chưa chấm ra / Đang làm".
              // "Chưa chấm ra" chỉ khi CÓ giờ vào mà thiếu giờ ra.
              const nghi = r.status === 'leave'
              return (
                <div key={r.id} className="ops-card" style={{ padding: '10px 12px' }}>
                  <div className="ops-rw">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span style={{ width: 40, textAlign: 'center' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink-2)' }}>{weekdayVi(r.date)}</div>
                        <div className="ops-sm ops-mono">{ddmm(r.date)}</div>
                      </span>
                      <span className="ops-mono" style={{ fontSize: 14, fontWeight: 650 }}>
                        {r.check_in_time ? <>{hhmm(r.check_in_time)} → {r.check_out_time ? hhmm(r.check_out_time) : '…'}</> : DASH}
                      </span>
                    </span>
                    {nghi ? <span className="ops-chip mut">{ATTENDANCE_STATUS_LABELS.leave}</span>
                      : late ? <span className="ops-chip amb">Trễ {r.late_minutes}′</span>
                        : r.check_out_time ? <span className="ops-chip ok">Đủ ca</span>
                          : !r.check_in_time ? null
                            : r.date < staleBefore ? <span className="ops-chip amb">Chưa chấm ra</span>
                              : <span className="ops-chip lime">Đang làm</span>}
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    </>
  )
}
