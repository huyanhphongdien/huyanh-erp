// ============================================================================
// KhoMix — tab "Hàng chèn" (trang chính theo mockup 30/10): MỘT việc tiếp theo
// (Trả cuối ca nếu đang có hàng ở dây chuyền, không thì Lấy đầu ca), phiếu chờ ký, kho chèn.
// File: src/pages/mobile/kho/KhoMix.tsx · Route: /m/kho/chen
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../stores/authStore'
import { mixService, MIX_ISSUE_STATUS_LABELS, MIX_PURPOSE_LABELS, MIX_SOURCE_LABELS, type MixBalance, type MixIssue, type MixLot } from '../../../services/wms/mixService'
import { useMixRole } from '../../../hooks/useMixRole'
import { firstName } from '../opsUtil'
import { FacilitySelect, fmtD, fmtKg, useKhoFacility } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

const hm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '')

export default function KhoMix() {
  const nav = useNavigate()
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const role = useMixRole(facilityId)
  const user = useAuthStore((s) => s.user)
  const [bal, setBal] = useState<MixBalance | null>(null)
  const [open, setOpen] = useState<MixIssue[]>([])
  const [done, setDone] = useState<MixIssue[]>([])
  const [lots, setLots] = useState<MixLot[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const now = useMemo(() => new Date(), [])

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setErr(null)
    try {
      const [b, o, d, l] = await Promise.all([
        mixService.balance(facilityId),
        mixService.listIssues({ facilityId, status: ['issued', 'returned', 'submitted', 'qc_confirmed'] }),
        mixService.listIssues({ facilityId, status: ['received'], limit: 3 }),
        mixService.listLots(facilityId),
      ])
      setBal(b); setOpen(o); setDone(d); setLots(l)
    } catch (e: any) { setErr(e?.message || 'Không tải được hàng chèn') }
    finally { setLoading(false) }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const me = user?.employee_id || null
  const active = useMemo(() => open.filter((i) => i.status === 'issued').sort((a, b) => (Number(b.out_by === me) - Number(a.out_by === me)) || b.out_at.localeCompare(a.out_at)), [open, me])
  const hero = active[0]
  const others = active.slice(1)
  const choKy = useMemo(() => open.filter((i) => i.status !== 'issued'), [open])
  const lotsCoHang = lots.filter((l) => l.ton_kg > 0.005)
  const canTake = role.khaiBao

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <div className="kmx-hd-txt">
          <span className="kmx-eyebrow">Hàng chèn · {facility?.name || facility?.code || ''}</span>
          <span className="kmx-title">{hero ? `${hero.shift_name || 'Ca ?'}${hero.team ? ` · Tổ ${hero.team}` : ''}` : 'Hôm nay'}</span>
        </div>
        <span className="kmx-hd-right">{now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} · {hm(now.toISOString())}<br />{firstName(user?.full_name) || ''}</span>
        <FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />
      </header>
      <div className="kmx-body">
        <div className="kmx-inner">
          {err && <div className="kmx-msg err">{err}</div>}
          {loading && !open.length && !lots.length && <><div className="kmx-skel" /><div className="kmx-skel" /></>}

          {hero ? (
            <section className="kmx-card hero" aria-label="Việc tiếp theo">
              <div className="kmx-row">
                <span className="kmx-lbl ok">Đang ở dây chuyền</span>
                <span className={`kmx-chip ${hero.so_anh_lay >= 2 ? 'ok' : 'red'}`}>{hero.so_anh_lay >= 2 ? <>{I.checkSm}2 ảnh lúc lấy</> : `thiếu ảnh lúc lấy (${hero.so_anh_lay}/2)`}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span className="kmx-num xl">{fmtKg(hero.kg_out)}</span><span className="kmx-unit">kg</span></div>
              <span className="kmx-md">Lấy lúc <b>{hm(hero.out_at)}</b>{fmtD(hero.shift_date) !== fmtD(now.toISOString()) ? ` ngày ${fmtD(hero.shift_date)}` : ''} từ lô <span className="kmx-mono" style={{ fontWeight: 600, color: '#0D2E25' }}>{hero.lot_code}</span> · {MIX_SOURCE_LABELS[hero.source_type].toLowerCase()} · {MIX_PURPOSE_LABELS[hero.purpose].toLowerCase()}{hero.out_by && hero.out_by !== me && hero.out_name ? ` · ${hero.out_name}` : ''}</span>
              <Link to={`/m/kho/chen/phieu/${hero.id}`} className="kmx-btn">{I.lines}Trả cuối ca</Link>
              <span className="kmx-sm kmx-center">Cuối ca: cân phần còn lại (dùng hết thì không cần ảnh), một chạm là xong</span>
            </section>
          ) : (
            <section className="kmx-card hero" aria-label="Việc tiếp theo">
              <span className="kmx-lbl ok">Đầu ca</span>
              <span className="kmx-strong" style={{ fontSize: 18 }}>Chưa lấy hàng chèn ca này</span>
              <span className="kmx-md">Chọn lô, đọc số cân, chụp 2 ảnh. Ba bước, xong trong một phút.</span>
              <Link to="/m/kho/chen/lay" className="kmx-btn" aria-disabled={!canTake || !lotsCoHang.length} onClick={(e) => { if (!canTake || !lotsCoHang.length) e.preventDefault() }} style={!canTake || !lotsCoHang.length ? { opacity: 0.45 } : undefined}>{I.plus}Lấy đầu ca</Link>
              {!lotsCoHang.length && !loading && <span className="kmx-sm kmx-center">Kho chèn chưa có lô. QS vào Kho chèn → Nhập lô chèn.</span>}
              {!canTake && !role.loading && <span className="kmx-sm kmx-center">Tài khoản này chưa được phân công khai báo hàng chèn (QS). BGĐ phân công ở máy tính: Hàng chèn → Phân công.</span>}
            </section>
          )}

          <div className="kmx-grid2">
            <Link to="/m/kho/chen/lay" className="kmx-btn sec" onClick={(e) => { if (!canTake || !lotsCoHang.length) e.preventDefault() }} style={!canTake || !lotsCoHang.length ? { opacity: 0.45 } : undefined}>{I.plus}Lấy thêm lô</Link>
            {hero ? <Link to={`/m/kho/chen/phieu/${hero.id}`} className="kmx-btn sec">{I.doc}Xem phiếu</Link> : <Link to="/m/kho/chen/phieu" className="kmx-btn sec">{I.doc}Lịch sử phiếu</Link>}
          </div>

          {others.length > 0 && (
            <section aria-label="Cũng đang ở dây chuyền" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 className="kmx-h2">Cũng đang ở dây chuyền · {others.length}</h2>
              <div className="kmx-list">
                {others.map((i) => (
                  <Link key={i.id} to={`/m/kho/chen/phieu/${i.id}`} className="kmx-li" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span className="kmx-col"><span className="kmx-mono" style={{ fontSize: 13, fontWeight: 700, color: '#0D2E25' }}>{i.code}</span><span className="kmx-sm">{i.shift_name || ''}{i.team ? ` · Tổ ${i.team}` : ''} · {i.out_name || ''} · {hm(i.out_at)}</span></span>
                    <span className="kmx-num sm">{fmtKg(i.kg_out)} <span className="kmx-sm">kg</span></span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section aria-label="Chờ ký" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="kmx-row" style={{ padding: '0 2px' }}>
              <h2 className="kmx-h2">Chờ ký</h2>
              <span className={`kmx-chip ${choKy.length ? 'amb' : 'mut'}`}>{choKy.length ? `${choKy.length} phiếu` : 'không có'}</span>
            </div>
            {choKy.length > 0 && (
              <Link to="/m/kho/chen/ky" className="kmx-link">
                <span className="kmx-ico amb">{I.pen}</span>
                <span className="kmx-col" style={{ flex: 1 }}>
                  <span className="kmx-mono" style={{ fontSize: 14, fontWeight: 700, color: '#0D2E25' }}>{choKy[0].code}</span>
                  <span className="kmx-sm">{choKy[0].shift_name || fmtD(choKy[0].shift_date)}{choKy[0].team ? ` · Tổ ${choKy[0].team}` : ''} · tiêu hao {fmtKg(choKy[0].kg_used)} kg · {MIX_ISSUE_STATUS_LABELS[choKy[0].status]}{choKy.length > 1 ? ` · và ${choKy.length - 1} phiếu khác` : ''}</span>
                </span>
                {I.chev}
              </Link>
            )}
          </section>

          <section aria-label="Kho chèn" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="kmx-row" style={{ padding: '0 2px', alignItems: 'baseline' }}>
              <Link to="/m/kho/chen/kho" className="kmx-h2" style={{ display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: '#1B4D3E' }}>Kho chèn{I.chev}</Link>
              <span className="kmx-md">Tại kho <b className="kmx-mono" style={{ color: '#0D2E25' }}>{fmtKg(bal?.tai_kho_kg)} kg</b> · {bal?.so_lo ?? 0} lô{(bal?.o_day_chuyen_kg ?? 0) > 0 ? ` · dây chuyền ${fmtKg(bal?.o_day_chuyen_kg)} kg` : ''}</span>
            </div>
            {lots.length > 0 ? (
              <div className="kmx-list">
                {lots.map((l) => {
                  const khoa = l.source_type === 'dkl' && !l.metal_cleared
                  return (
                    <div key={l.id} className="kmx-li">
                      <span className="kmx-col">
                        <span className="kmx-mono" style={{ fontSize: 13, fontWeight: 700, color: khoa ? '#6B7280' : '#0D2E25' }}>{l.code}</span>
                        <span className="kmx-sm" style={khoa ? { color: '#B91C1C', fontWeight: 500 } : undefined}>{khoa ? 'Dính kim loại · chưa xử lý, chưa lấy được' : `${MIX_SOURCE_LABELS[l.source_type]}${l.grade ? ` · ${l.grade}` : ''}${l.source_desc ? ` · ${l.source_desc}` : ''}`}</span>
                      </span>
                      <span className={`kmx-num sm${khoa ? ' mut' : ''}`} style={{ whiteSpace: 'nowrap' }}>{fmtKg(l.ton_kg)} <span className="kmx-sm">kg</span>{l.kg_at_line > 0 && <span className="kmx-sm" style={{ display: 'block', textAlign: 'right' }}>+{fmtKg(l.kg_at_line)} ở dây chuyền</span>}</span>
                    </div>
                  )
                })}
              </div>
            ) : !loading && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Kho chèn trống</div>}
          </section>

          {done.length > 0 && (
            <section aria-label="Đã nhận gần đây" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link to="/m/kho/chen/phieu" className="kmx-h2" style={{ display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: '#1B4D3E' }}>Đã nhận gần đây · xem tất cả{I.chev}</Link>
              <div className="kmx-list">
                {done.map((i) => (
                  <Link key={i.id} to={`/m/kho/chen/phieu/${i.id}`} className="kmx-li" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span className="kmx-col"><span className="kmx-mono" style={{ fontSize: 13, fontWeight: 700, color: '#0D2E25' }}>{i.code}</span><span className="kmx-sm">{fmtD(i.shift_date)}{i.shift_name ? ` · ${i.shift_name}` : ''}{i.team ? ` · Tổ ${i.team}` : ''} · {i.lot_code}</span></span>
                    <span className="kmx-num sm ok">{fmtKg(i.kg_used)} <span className="kmx-sm">kg</span></span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <button type="button" className="kmx-btn ghost" onClick={() => { nav('/m/kho/chen'); load() }}>Làm mới</button>
        </div>
      </div>
    </div>
  )
}
