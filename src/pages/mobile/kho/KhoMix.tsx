// ============================================================================
// KhoMix — tab "Hàng chèn" (trang chính): CA HIỆN TẠI liệt kê từng LẦN CHÈN như sổ tay tổ ép
//   (L1, L2, … mỗi lần = một pallet: bành · lô · cả pallet − bì · kg · trạng thái), lần còn ở dây chuyền
//   có nút Trả riêng, nút chính "Lấy lần n+1"; phiếu chờ ký; kho chèn.
// File: src/pages/mobile/kho/KhoMix.tsx · Route: /m/kho/chen
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../stores/authStore'
import { mixService, MIX_ISSUE_STATUS_LABELS, MIX_SOURCE_LABELS, MIX_VI_TRI_LABELS, type MixBalance, type MixIssue, type MixLot } from '../../../services/wms/mixService'
import { useMixRole } from '../../../hooks/useMixRole'
import { rawLotService, type RawLotChen } from '../../../services/wms/rawLotService'
import { firstName } from '../opsUtil'
import { FacilitySelect, fmtD, fmtKg, todayLocal, useKhoFacility } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

const hm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '')
const kg1 = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1 }))
const CHIP: Record<MixIssue['status'], { cls: string; text: string }> = {
  issued: { cls: 'ok', text: 'Ở dây chuyền' }, returned: { cls: 'amb', text: 'Đã trả · chờ QS ký' }, submitted: { cls: 'gold', text: 'QS đã ký' },
  qc_confirmed: { cls: 'blue', text: 'QC đã duyệt' }, received: { cls: 'ok', text: 'Đã nhận' }, cancelled: { cls: 'red', text: 'Đã hủy' },
}

interface Ca { key: string; shift_date: string; shift_id: string | null; shift_name: string; team: string | null; items: MixIssue[]; lastAt: string }

export default function KhoMix() {
  const nav = useNavigate()
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const role = useMixRole(facilityId)
  const user = useAuthStore((s) => s.user)
  const [bal, setBal] = useState<MixBalance | null>(null)
  const [open, setOpen] = useState<MixIssue[]>([])
  const [today, setToday] = useState<MixIssue[]>([])
  const [done, setDone] = useState<MixIssue[]>([])
  const [lots, setLots] = useState<MixLot[]>([])
  const [chenMa, setChenMa] = useState<Map<string, RawLotChen>>(new Map())   // tổng chèn đã nhận theo mã gốc
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const now = useMemo(() => new Date(), [])

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setErr(null)
    try {
      const [b, o, t, d, l, c] = await Promise.all([
        mixService.balance(facilityId),
        mixService.listIssues({ facilityId, status: ['issued', 'returned', 'submitted', 'qc_confirmed'] }),
        mixService.listIssues({ facilityId, date: todayLocal(), limit: 100 }),
        mixService.listIssues({ facilityId, status: ['received'], limit: 3 }),
        mixService.listLots(facilityId),
        rawLotService.chen(facilityId).catch(() => [] as RawLotChen[]),
      ])
      setBal(b); setOpen(o); setToday(t.filter((x) => x.status !== 'cancelled')); setDone(d); setLots(l); setChenMa(new Map(c.map((x) => [x.ma, x])))
    } catch (e: any) { setErr(e?.message || 'Không tải được hàng chèn') }
    finally { setLoading(false) }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const me = user?.employee_id || null
  // gom theo ca: hôm nay + mọi phiếu còn mở; ca có hoạt động mới nhất đứng đầu
  const cas = useMemo<Ca[]>(() => {
    const seen = new Map<string, MixIssue>()
    for (const i of [...today, ...open]) seen.set(i.id, i)
    const m = new Map<string, Ca>()
    for (const i of seen.values()) {
      const key = `${i.shift_date}|${i.shift_id ?? ''}`
      const c = m.get(key) ?? { key, shift_date: i.shift_date, shift_id: i.shift_id, shift_name: i.shift_name || (i.shift_id ? 'Ca ?' : 'Chưa gắn ca'), team: i.team, items: [], lastAt: '' }
      c.items.push(i); if (!c.team && i.team) c.team = i.team
      if (i.out_at > c.lastAt) c.lastAt = i.out_at
      m.set(key, c)
    }
    for (const c of m.values()) c.items.sort((a, b) => a.out_at.localeCompare(b.out_at))
    return [...m.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt))
  }, [today, open])
  const cur = cas[0] ?? null
  const curIssued = cur ? cur.items.filter((i) => i.status === 'issued') : []
  const otherIssued = open.filter((i) => i.status === 'issued' && (!cur || !cur.items.some((x) => x.id === i.id)))
  const choKy = useMemo(() => open.filter((i) => i.status !== 'issued'), [open])
  const lotsCoHang = lots.filter((l) => l.ton_kg > 0.005)
  const canTake = role.khaiBao
  const tong = cur ? {
    lay: cur.items.reduce((s, i) => s + i.kg_out, 0),
    banh: cur.items.reduce((s, i) => s + (i.so_banh ?? 0), 0),
    tieuHao: cur.items.reduce((s, i) => s + (i.kg_used ?? 0), 0),
    dayChuyen: curIssued.reduce((s, i) => s + i.kg_out, 0),
  } : null
  const lanKe = (cur?.items.length ?? 0) + 1
  // gom các lần của ca theo MÃ GỐC đang chạy (số L vẫn đếm theo ca)
  const nhomMa = useMemo(() => {
    if (!cur) return []
    const m = new Map<string, { ma: string; idx: number[]; kg: number; banh: number; dayChuyen: number }>()
    cur.items.forEach((i, k) => {
      const key = i.ma_goc_all || ''
      const g = m.get(key) ?? { ma: key, idx: [], kg: 0, banh: 0, dayChuyen: 0 }
      g.idx.push(k); g.kg += i.kg_out; g.banh += i.so_banh ?? 0; if (i.status === 'issued') g.dayChuyen += i.kg_out
      m.set(key, g)
    })
    return [...m.values()]
  }, [cur])
  const tongMa = (ma: string) => ma.split(' + ').map((x) => chenMa.get(x.trim())).filter(Boolean) as RawLotChen[]
  const btnLay = (cls: string) => (
    <Link to="/m/kho/chen/lay" className={cls} aria-disabled={!canTake || !lotsCoHang.length} onClick={(e) => { if (!canTake || !lotsCoHang.length) e.preventDefault() }} style={!canTake || !lotsCoHang.length ? { opacity: 0.45 } : undefined}>{I.plus}Lấy lần {lanKe}</Link>
  )

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <div className="kmx-hd-txt">
          <span className="kmx-eyebrow">Hàng chèn · {facility?.name || facility?.code || ''}</span>
          <span className="kmx-title">{cur ? `${cur.shift_name}${cur.team ? ` · Tổ ${cur.team}` : ''}` : 'Hôm nay'}</span>
        </div>
        <span className="kmx-hd-right">{now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} · {hm(now.toISOString())}<br />{firstName(user?.full_name) || ''}</span>
        <FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />
      </header>
      <div className="kmx-body">
        <div className="kmx-inner">
          {err && <div className="kmx-msg err">{err}</div>}
          {loading && !open.length && !lots.length && <><div className="kmx-skel" /><div className="kmx-skel" /></>}

          {cur && tong ? (
            <section className="kmx-card hero" aria-label="Các lần chèn của ca" style={{ gap: 10 }}>
              <div className="kmx-row">
                <span className="kmx-lbl ok">{fmtD(cur.shift_date) === fmtD(now.toISOString()) ? 'Ca này' : `Ca ${fmtD(cur.shift_date)}`} · đã chèn {cur.items.length} lần</span>
                <span className={`kmx-chip ${curIssued.length ? 'amb' : 'ok'}`}>{curIssued.length ? `${curIssued.length} lần đang ở dây chuyền` : 'đã trả hết'}</span>
              </div>
              <div className="kmx-grid3">
                <div className="kmx-stat"><span className="kmx-lbl" style={{ fontSize: 10 }}>Đã lấy</span><span className="kmx-num md">{fmtKg(tong.lay)}</span><span className="kmx-sm">{tong.banh ? `${tong.banh} bành` : 'kg'}</span></div>
                <div className="kmx-stat" style={tong.dayChuyen > 0 ? { background: '#FEF3C7' } : undefined}><span className="kmx-lbl" style={{ fontSize: 10 }}>Dây chuyền</span><span className="kmx-num md" style={tong.dayChuyen > 0 ? { color: '#B45309' } : undefined}>{fmtKg(tong.dayChuyen)}</span><span className="kmx-sm">kg chưa trả</span></div>
                <div className="kmx-stat ok"><span className="kmx-lbl ok" style={{ fontSize: 10 }}>Tiêu hao</span><span className="kmx-num md ok">{fmtKg(tong.tieuHao)}</span><span className="kmx-sm">kg đã trả</span></div>
              </div>
              {nhomMa.map((g) => {
                const tm = tongMa(g.ma)
                return (
                  <div key={g.ma || '__none'} className="kmx-col" style={{ gap: 6 }}>
                    <div className="kmx-row" style={{ padding: '4px 2px 0', alignItems: 'flex-start', gap: 8 }}>
                      <span className="kmx-col" style={{ gap: 1 }}>
                        <span className="kmx-strong" style={{ fontSize: 13 }}>{g.ma ? <>Chèn vào mã <span className="kmx-mono" style={{ color: '#0D2E25' }}>{g.ma}</span></> : 'Chưa gắn mã gốc'}</span>
                        <span className="kmx-sm">{g.ma ? (tm.length ? tm.map((x) => `${x.ma}: đã nhận ${fmtKg(x.chen_kg)} kg${x.ty_le_chen_pct !== null ? ` (${x.ty_le_chen_pct} % hàng vào máy)` : ''}`).join(' · ') : 'mã chưa có phiếu nào được thủ kho nhận') : 'máy gắn theo phiếu ca lúc thủ kho nhận, hoặc mở phiếu bấm Đổi mã'}</span>
                      </span>
                      <span className="kmx-chip blue" style={{ flex: '0 0 auto' }}>{g.idx.length} lần · {kg1(g.kg)} kg{g.banh ? ` · ${g.banh} b` : ''}</span>
                    </div>
                    <div className="kmx-list">
                      {g.idx.map((k) => {
                        const i = cur.items[k]
                        const chip = CHIP[i.status]
                        return (
                          <div key={i.id} className="kmx-li" style={{ alignItems: 'stretch', gap: 10 }}>
                            <Link to={`/m/kho/chen/phieu/${i.id}`} className="kmx-col" style={{ flex: 1, textDecoration: 'none', color: 'inherit', gap: 3 }}>
                              <span className="kmx-row" style={{ justifyContent: 'flex-start', gap: 8 }}>
                                <span className="kmx-mono" style={{ fontSize: 14, fontWeight: 800, color: '#0D2E25', background: '#E8F5F0', borderRadius: 8, padding: '2px 7px' }}>L{k + 1}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: '#0D2E25' }}>{i.so_banh !== null ? `${i.so_banh} b · ` : ''}{i.lot_so_lo || i.lot_code}</span>
                                <span className={`kmx-chip ${chip.cls}`} style={{ marginLeft: 'auto' }}>{chip.text}</span>
                              </span>
                              <span className="kmx-sm">{i.vi_tri ? `${MIX_VI_TRI_LABELS[i.vi_tri]} · ` : ''}{i.gross_kg !== null ? `cả pallet ${kg1(i.gross_kg)} − bì ${kg1(i.pallet_kg ?? 0)} = ` : ''}<b className="kmx-mono" style={{ color: '#0D2E25' }}>{kg1(i.kg_out)} kg</b>{i.kg_return !== null ? ` · trả ${kg1(i.kg_return)} · tiêu hao ${kg1(i.kg_used)}` : ''} · {hm(i.out_at)}{i.out_by && i.out_by !== me && i.out_name ? ` · ${firstName(i.out_name)}` : ''}</span>
                            </Link>
                            {i.status === 'issued' && <Link to={`/m/kho/chen/phieu/${i.id}`} className="kmx-pill" style={{ flex: '0 0 auto', alignSelf: 'center', background: '#1B4D3E', color: '#fff', borderColor: '#1B4D3E', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', padding: '0 14px' }}>Trả L{k + 1}</Link>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {btnLay('kmx-btn')}
              <span className="kmx-sm kmx-center">Mỗi lần lấy = một pallet: chọn lô, cân cả pallet, máy trừ bì và tính bành. Lần nào dùng hết thì Trả · 0 kg, không cần ảnh.</span>
            </section>
          ) : (
            <section className="kmx-card hero" aria-label="Việc tiếp theo">
              <span className="kmx-lbl ok">Đầu ca</span>
              <span className="kmx-strong" style={{ fontSize: 18 }}>Chưa chèn lần nào ca này</span>
              <span className="kmx-md">Chọn lô, cân cả pallet, chụp 2 ảnh. Ba bước, xong trong một phút. Các lần sau hiện thành dòng L1, L2… như sổ tay.</span>
              {btnLay('kmx-btn')}
              {!lotsCoHang.length && !loading && <span className="kmx-sm kmx-center">Kho chèn chưa có lô. QS vào Kho chèn → Nhập lô chèn.</span>}
              {!canTake && !role.loading && <span className="kmx-sm kmx-center">Tài khoản này chưa được phân công khai báo hàng chèn (QS). BGĐ phân công ở máy tính: Hàng chèn → Phân công.</span>}
            </section>
          )}

          {otherIssued.length > 0 && (
            <section aria-label="Đang ở dây chuyền ca khác" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 className="kmx-h2">Ca khác còn ở dây chuyền · {otherIssued.length}</h2>
              <div className="kmx-list">
                {otherIssued.map((i) => (
                  <Link key={i.id} to={`/m/kho/chen/phieu/${i.id}`} className="kmx-li" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span className="kmx-col"><span className="kmx-mono" style={{ fontSize: 13, fontWeight: 700, color: '#0D2E25' }}>{i.code}</span><span className="kmx-sm">{fmtD(i.shift_date)} · {i.shift_name || 'chưa gắn ca'}{i.team ? ` · Tổ ${i.team}` : ''} · {i.lot_so_lo || i.lot_code} · {hm(i.out_at)}</span></span>
                    <span className="kmx-num sm">{fmtKg(i.kg_out)} <span className="kmx-sm">kg</span></span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="kmx-grid2">
            <Link to="/m/kho/chen/phieu" className="kmx-btn sec">{I.doc}Lịch sử phiếu</Link>
            <Link to="/m/kho/chen/kho" className="kmx-btn sec">{I.intake}Kho chèn</Link>
          </div>

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
            {choKy.length > 1 && <span className="kmx-sm" style={{ padding: '0 2px' }}>Mở Chờ ký để ký một chạm cho cả ca.</span>}
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
                        <span className="kmx-mono" style={{ fontSize: 13, fontWeight: 700, color: khoa ? '#6B7280' : l.so_lo ? '#0D2E25' : '#B91C1C' }}>{l.so_lo || 'Chưa có số lô'} <span className="kmx-sm kmx-mono" style={{ fontWeight: 500 }}>{l.code}</span></span>
                        <span className="kmx-sm" style={khoa ? { color: '#B91C1C', fontWeight: 500 } : undefined}>{khoa ? 'Dính kim loại · chưa xử lý, chưa lấy được' : `${MIX_SOURCE_LABELS[l.source_type]}${l.grade ? ` · ${l.grade}` : ''}${l.source_desc ? ` · ${l.source_desc}` : ''}`}</span>
                      </span>
                      <span className={`kmx-num sm${khoa ? ' mut' : ''}`} style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{fmtKg(l.ton_kg)} <span className="kmx-sm">kg · {l.ton_banh} b</span>{l.kg_at_line > 0 && <span className="kmx-sm" style={{ display: 'block' }}>+{fmtKg(l.kg_at_line)} ở dây chuyền</span>}</span>
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
                    <span className="kmx-col"><span className="kmx-mono" style={{ fontSize: 13, fontWeight: 700, color: '#0D2E25' }}>{i.code}</span><span className="kmx-sm">{fmtD(i.shift_date)}{i.shift_name ? ` · ${i.shift_name}` : ''}{i.team ? ` · Tổ ${i.team}` : ''} · {i.lot_so_lo || i.lot_code}</span></span>
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
