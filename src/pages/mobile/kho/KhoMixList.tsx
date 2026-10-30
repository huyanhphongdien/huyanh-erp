// ============================================================================
// KhoMixList — danh sách / lịch sử phiếu chèn trên điện thoại: theo ngày, theo trạng thái, theo lô.
// File: src/pages/mobile/kho/KhoMixList.tsx · Route: /m/kho/chen/phieu
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { mixService, MIX_ISSUE_STATUS_LABELS, MIX_SOURCE_LABELS, type MixIssue } from '../../../services/wms/mixService'
import { FacilitySelect, fmtD, fmtKg, todayLocal, useKhoFacility } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

const CHIP: Record<MixIssue['status'], string> = { issued: 'ok', returned: 'amb', submitted: 'amb', qc_confirmed: 'blue', received: 'mut', cancelled: 'red' }
type Filter = 'ngay' | 'mo' | 'nhan' | 'huy'
const hm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '')

export default function KhoMixList() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const lotId = sp.get('lot')
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const [filter, setFilter] = useState<Filter>(lotId ? 'mo' : 'ngay')
  const [date, setDate] = useState(todayLocal())
  const [rows, setRows] = useState<MixIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setErr(null)
    try {
      const opts: Parameters<typeof mixService.listIssues>[0] = { facilityId, lotId: lotId || null, limit: 150 }
      if (lotId) { /* mọi phiếu của lô */ }
      else if (filter === 'ngay') opts.date = date
      else if (filter === 'mo') opts.status = ['issued', 'returned', 'submitted', 'qc_confirmed']
      else if (filter === 'nhan') opts.status = ['received']
      else opts.status = ['cancelled']
      setRows(await mixService.listIssues(opts))
    } catch (e: any) { setErr(e?.message || 'Không tải được phiếu') }
    finally { setLoading(false) }
  }, [facilityId, filter, date, lotId])
  useEffect(() => { load() }, [load])

  const tong = useMemo(() => ({ nhan: rows.filter((i) => i.status === 'received').reduce((s, i) => s + (i.kg_used ?? 0), 0), cho: rows.filter((i) => ['returned', 'submitted', 'qc_confirmed'].includes(i.status)).reduce((s, i) => s + (i.kg_used ?? 0), 0), day: rows.filter((i) => i.status === 'issued').reduce((s, i) => s + i.kg_out, 0) }), [rows])

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <button type="button" className="kmx-back" aria-label="Về hàng chèn" onClick={() => nav('/m/kho/chen')}>{I.back}</button>
        <div className="kmx-hd-txt"><span className="kmx-eyebrow">Hàng chèn · {facility?.code || ''}</span><span className="kmx-title">{lotId ? `Phiếu của lô ${rows[0]?.lot_code || ''}` : 'Phiếu chèn'}</span></div>
        <FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        {err && <div className="kmx-msg err">{err}</div>}
        {lotId ? (
          <Link to="/m/kho/chen/phieu" className="kmx-pill" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Bỏ lọc theo lô</Link>
        ) : (
          <>
            <div className="kmx-seg">
              {([['ngay', 'Theo ngày'], ['mo', 'Đang mở'], ['nhan', 'Đã nhận'], ['huy', 'Đã hủy']] as [Filter, string][]).map(([k, t]) => <button key={k} type="button" className={filter === k ? 'on' : ''} style={{ minWidth: 0, height: 40, fontSize: 13 }} onClick={() => setFilter(k)}>{t}</button>)}
            </div>
            {filter === 'ngay' && <input className="kmx-text" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value || todayLocal())} aria-label="Ngày" />}
          </>
        )}
        <section className="kmx-card kmx-grid3" style={{ display: 'grid' }} aria-label="Tổng">
          <div className="kmx-col kmx-center"><span className="kmx-lbl">Ở dây chuyền</span><span className="kmx-num md">{fmtKg(tong.day)}</span></div>
          <div className="kmx-col kmx-center"><span className="kmx-lbl">Chờ ký</span><span className="kmx-num md" style={{ color: tong.cho > 0 ? '#B45309' : undefined }}>{fmtKg(tong.cho)}</span></div>
          <div className="kmx-col kmx-center kmx-stat ok"><span className="kmx-lbl ok">Đã nhận</span><span className="kmx-num md ok">{fmtKg(tong.nhan)}</span></div>
        </section>
        {loading && !rows.length && <><div className="kmx-skel" /><div className="kmx-skel" /></>}
        {!loading && !rows.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Không có phiếu</div>}
        {rows.map((i) => (
          <Link key={i.id} to={`/m/kho/chen/phieu/${i.id}`} className="kmx-card press">
            <span className="kmx-row"><span className="kmx-mono" style={{ fontSize: 14, fontWeight: 700, color: '#0D2E25' }}>{i.code}</span><span className={`kmx-chip ${CHIP[i.status]}`}>{MIX_ISSUE_STATUS_LABELS[i.status]}</span></span>
            <span className="kmx-row" style={{ alignItems: 'flex-end' }}>
              <span className="kmx-col">
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{i.lot_code} · {MIX_SOURCE_LABELS[i.source_type].replace(/ \(.*\)/, '')}</span>
                <span className="kmx-sm">{fmtD(i.shift_date)}{i.shift_name ? ` · ${i.shift_name}` : ''}{i.team ? ` · Tổ ${i.team}` : ''} · lấy {hm(i.out_at)}{i.return_at ? ` · trả ${hm(i.return_at)}` : ''} · {i.out_name || ''}{i.handover_to_next ? ' · bàn giao' : ''}</span>
              </span>
              <span className="kmx-col" style={{ alignItems: 'flex-end' }}>
                <span className={`kmx-num md${i.status === 'received' ? ' ok' : i.status === 'cancelled' ? ' mut' : ''}`}>{i.kg_used !== null ? fmtKg(i.kg_used) : fmtKg(i.kg_out)}</span>
                <span className="kmx-sm">{i.kg_used !== null ? `tiêu hao · lấy ${fmtKg(i.kg_out)} trả ${fmtKg(i.kg_return)}` : 'kg đã lấy'}</span>
              </span>
            </span>
          </Link>
        ))}
      </div></div>
    </div>
  )
}
