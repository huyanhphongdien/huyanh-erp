// ============================================================================
// OpsTimesheet — tab "Công": chấm công tháng này của thợ.
// Tóm tắt: số ngày công, số lần trễ, tổng tăng ca. Bên dưới liệt kê từng ngày.
// ============================================================================
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../../stores/authStore'
import { getMonthAttendance, vnMonthRange } from '../../services/opsService'
import { hhmm, weekdayVi, ddmm, minutesVi } from './opsUtil'

export default function OpsTimesheet() {
  const { user } = useAuthStore()
  const emp = user?.employee_id || ''
  const q = useQuery({ queryKey: ['ops-month-att', emp], queryFn: () => getMonthAttendance(emp), enabled: !!emp })
  const { first } = vnMonthRange()
  const monthLabel = `Tháng ${Number(first.split('-')[1])}/${first.split('-')[0]}`

  const rows = q.data || []
  const worked = rows.filter(r => r.check_in_time).length
  const lateCount = rows.filter(r => (r.late_minutes || 0) > 0).length
  const otMin = rows.reduce((s, r) => s + (r.overtime_minutes || 0), 0)

  return (
    <>
      <header className="ops-appbar">
        <span className="ops-av">🕐</span>
        <div>
          <div className="ops-tt">Bảng công</div>
          <div className="ops-su">{monthLabel}</div>
        </div>
      </header>

      <div className="ops-body" style={{ gap: 9 }}>
        <div className="ops-inner" style={{ gap: 9 }}>
          {/* Tóm tắt */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9 }}>
            <div className="ops-card" style={{ textAlign: 'center' }}>
              <div className="ops-big" style={{ fontSize: 26 }}>{worked}</div>
              <div className="ops-sm">Ngày công</div>
            </div>
            <div className="ops-card" style={{ textAlign: 'center' }}>
              <div className="ops-big" style={{ fontSize: 26, color: lateCount > 0 ? 'var(--amber)' : undefined }}>{lateCount}</div>
              <div className="ops-sm">Lần trễ</div>
            </div>
            <div className="ops-card" style={{ textAlign: 'center' }}>
              <div className="ops-big" style={{ fontSize: 20 }}>{otMin > 0 ? minutesVi(otMin) : '0'}</div>
              <div className="ops-sm">Tăng ca</div>
            </div>
          </div>

          <div className="ops-sh">Chi tiết từng ngày</div>
          {q.isLoading ? <>{[0, 1, 2, 3].map(i => <div key={i} className="ops-skel" style={{ height: 54 }} />)}</>
            : rows.length === 0 ? (
              <div className="ops-empty"><div className="em">🗓️</div><div className="et">Chưa có công tháng này</div></div>
            ) : rows.map(r => {
              const late = (r.late_minutes || 0) > 0
              return (
                <div key={r.id} className="ops-card" style={{ padding: '10px 12px' }}>
                  <div className="ops-rw">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <span style={{ width: 40, textAlign: 'center' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--ink-2)' }}>{weekdayVi(r.date)}</div>
                        <div className="ops-sm ops-mono">{ddmm(r.date)}</div>
                      </span>
                      <span className="ops-mono" style={{ fontSize: 14, fontWeight: 650 }}>
                        {hhmm(r.check_in_time)} → {r.check_out_time ? hhmm(r.check_out_time) : '…'}
                      </span>
                    </span>
                    {late ? <span className="ops-chip amb">Trễ {r.late_minutes}′</span>
                      : r.check_out_time ? <span className="ops-chip ok">Đủ ca</span>
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
