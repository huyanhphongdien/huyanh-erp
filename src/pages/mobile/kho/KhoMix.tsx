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
import { rawLotService, type LenhChay, type RawLotBalance, type RawLotChen } from '../../../services/wms/rawLotService'
import { guiMailKetThuc } from '../../../services/wms/maTongKetMail'
import { firstName } from '../opsUtil'
import { FacilitySelect, fmtD, fmtDt, fmtKg, todayLocal, useKhoFacility } from './khoCommon'
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
  // sổ mã đang chạy (một mã chạy nhiều ca; khai một lần, kết thúc khi xong)
  const [lenhs, setLenhs] = useState<LenhChay[]>([])   // lệnh đang chạy (SQL p13): một lệnh = 1..n mã gộp
  const [maMo, setMaMo] = useState<RawLotBalance[]>([])
  const [chonMa, setChonMa] = useState(false)
  const [chonIds, setChonIds] = useState<string[]>([])   // mã chọn để bắt đầu lệnh (gộp được nhiều mã: KHMN-15 + 17)
  const [hoiThay, setHoiThay] = useState<string[] | null>(null)   // bắt đầu lệnh khi đang có lệnh khác chạy: thay thế (mặc định) / song song / gộp
  const [hoiKetThuc, setHoiKetThuc] = useState<LenhChay | null>(null)
  const [busyMa, setBusyMa] = useState<string | null>(null)
  const [msgMa, setMsgMa] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const now = useMemo(() => new Date(), [])

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setErr(null)
    try {
      const [b, o, t, d, l, c, r, m] = await Promise.all([
        mixService.balance(facilityId),
        mixService.listIssues({ facilityId, status: ['issued', 'returned', 'submitted', 'qc_confirmed'] }),
        mixService.listIssues({ facilityId, date: todayLocal(), limit: 100 }),
        mixService.listIssues({ facilityId, status: ['received'], limit: 3 }),
        mixService.listLots(facilityId),
        rawLotService.chen(facilityId).catch(() => [] as RawLotChen[]),
        rawLotService.lenhDangChay(facilityId).catch(() => [] as LenhChay[]),
        rawLotService.list(facilityId).catch(() => [] as RawLotBalance[]),
      ])
      setBal(b); setOpen(o); setToday(t.filter((x) => x.status !== 'cancelled')); setDone(d); setLots(l); setChenMa(new Map(c.map((x) => [x.ma, x]))); setLenhs(r); setMaMo(m)
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
  const maChuaChay = maMo.filter((x) => !lenhs.some((g) => g.raw_lot_ids.includes(x.raw_lot_id))).sort((a, b) => (b.ngay_cuoi ?? '').localeCompare(a.ngay_cuoi ?? '')).slice(0, 8)
  const maTen = (ids: string[]) => ids.map((id) => maMo.find((x) => x.raw_lot_id === id)?.ma ?? '?').join(' + ')
  // bắt đầu lệnh 1..n mã; đang có lệnh chạy → hỏi: thay thế (mặc định 30/10) / chạy song song / gộp vào lệnh đang chạy
  async function batDauLenh(ids: string[], opts?: { thayThe?: boolean; gopVao?: string }) {
    if (!ids.length) return
    if (lenhs.length && !opts) { setHoiThay(ids); return }
    setBusyMa('lenh'); setMsgMa(null); setHoiThay(null)
    try {
      const r = await rawLotService.batDauLenh(ids, { thayThe: opts?.thayThe ?? true, gopVao: opts?.gopVao ?? null })
      setMsgMa(r.da_chay ? `${r.ma_gop} đã đang chạy rồi (${r.code})` : r.gop ? `Đã gộp vào ${r.code}: ${r.ma_gop}` : r.da_thay.length ? `Đã thay ${r.da_thay.join(', ')} bằng lệnh ${r.code} (${r.ma_gop})` : `Đã bắt đầu lệnh ${r.code}: ${r.ma_gop}${r.da_gan ? ` · đã gắn ${r.da_gan} lần chèn lấy trước đó` : ''}`)
      setChonMa(false); setChonIds([]); await load()
    } catch (e: any) { setMsgMa(e?.message || 'Không khai được (cần chạy SQL p13)') }
    finally { setBusyMa(null) }
  }
  // kết thúc lệnh → sang trang tổng kết (khối lượng chèn + mail BGĐ)
  // kết thúc lệnh → máy tự tổng kết + gửi mail (kèm ảnh) cho BGĐ → sang trang tổng kết báo kết quả gửi
  async function ketThucLenh(g: LenhChay) {
    setBusyMa(g.id); setMsgMa(null); setHoiKetThuc(null)
    try { await rawLotService.ketThucLenh(g.id) }
    catch (e: any) { setMsgMa(e?.message || 'Không kết thúc được'); setBusyMa(null); return }
    let q = 'vua=1'
    try { const r = await guiMailKetThuc({ lenhId: g.id, nguoiLap: user?.full_name ?? null }); q += r.to.length ? `&mail=${r.ok.length}&loi=${r.loi.length}` : '&mail=none' }
    catch { q += '&mail=err' }
    nav(`/m/kho/chen/lenh/${g.id}/tong-ket?${q}`)
  }
  const tongMa = (ma: string) => ma.split(' + ').map((x) => chenMa.get(x.trim())).filter(Boolean) as RawLotChen[]
  // các lần chèn của ca hiện tại chia theo LỆNH (lệnh tạo trước lên đầu, 31/10 chủ DN); phiếu không thuộc lệnh nào → "chưa gắn lệnh"
  const lenhsAsc = [...lenhs].sort((a, b) => a.started_at.localeCompare(b.started_at))
  const thuocLenh = (i: MixIssue, g: LenhChay) => i.lenh_id === g.id || (!i.lenh_id && !!i.ma_goc_all && i.ma_goc_all === g.ma_gop)
  const itemsCuaLenh = (g: LenhChay) => (cur ? cur.items.filter((i) => thuocLenh(i, g)) : [])
  const itemsChuaLenh = cur ? cur.items.filter((i) => !lenhsAsc.some((g) => thuocLenh(i, g))) : []
  const tongCua = (items: MixIssue[]) => ({
    lay: items.reduce((s, i) => s + i.kg_out, 0), banh: items.reduce((s, i) => s + (i.so_banh ?? 0), 0), tieuHao: items.reduce((s, i) => s + (i.kg_used ?? 0), 0),
    dayChuyen: items.filter((i) => i.status === 'issued').reduce((s, i) => s + i.kg_out, 0), issued: items.filter((i) => i.status === 'issued').length,
  })
  const nhanCa = cur ? (fmtD(cur.shift_date) === fmtD(now.toISOString()) ? 'Ca này' : `Ca ${fmtD(cur.shift_date)}`) : 'Ca này'
  const dongLan = (i: MixIssue, n: number) => {
    const chip = CHIP[i.status]
    return (
                          <div key={i.id} className="kmx-li" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                            <Link to={`/m/kho/chen/phieu/${i.id}`} className="kmx-col" style={{ textDecoration: 'none', color: 'inherit', gap: 3, minWidth: 0 }}>
                              <span className="kmx-row" style={{ gap: 8, alignItems: 'center' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                  <span className="kmx-mono" style={{ fontSize: 14, fontWeight: 800, color: '#0D2E25', background: '#E8F5F0', borderRadius: 8, padding: '2px 7px', flex: '0 0 auto' }}>L{n}</span>
                                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0D2E25', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.so_banh !== null ? `${i.so_banh} b · ` : ''}{i.lot_so_lo || i.lot_code}</span>
                                </span>
                                <span className={`kmx-chip ${chip.cls}`} style={{ flex: '0 0 auto' }}>{chip.text}</span>
                              </span>
                              <span className="kmx-sm">{i.vi_tri ? `${MIX_VI_TRI_LABELS[i.vi_tri]} · ` : ''}{i.gross_kg !== null ? (i.pallet_kg !== null ? `cả pallet ${kg1(i.gross_kg)} − bì ${kg1(i.pallet_kg)} = ` : 'cả pallet ') : ''}<b className="kmx-mono" style={{ color: '#0D2E25' }}>{kg1(i.kg_out)} kg</b>{i.gross_kg !== null && i.pallet_kg === null ? ' (bì trừ lúc trả)' : ''}{i.kg_return !== null ? ` · trả ${kg1(i.kg_return)} · tiêu hao ${kg1(i.kg_used)}` : ''} · {hm(i.out_at)}{i.out_by && i.out_by !== me && i.out_name ? ` · ${firstName(i.out_name)}` : ''}</span>
                            </Link>
                            {i.status === 'issued' && <Link to={`/m/kho/chen/phieu/${i.id}`} className="kmx-btn sec" style={{ minHeight: 42, fontSize: 14, textDecoration: 'none' }}>{I.lines}Trả L{n} · cân cuối ca</Link>}
                          </div>
    )
  }
  const btnLay = (cls: string) => (
    <Link to="/m/kho/chen/lay" className={cls} aria-disabled={!canTake} onClick={(e) => { if (!canTake) e.preventDefault() }} style={!canTake ? { opacity: 0.45 } : undefined}>{I.plus}Lấy lần {lanKe}</Link>   // phương án B: không cần kho chèn có lô
  )

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <div className="kmx-hd-txt">
          <span className="kmx-eyebrow">Hàng chèn · {facility?.code || ''}</span>
          <span className="kmx-title">{cur ? cur.shift_name : 'Hôm nay'}</span>
        </div>
        <span className="kmx-hd-right">{now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} · {hm(now.toISOString())}<br />{firstName(user?.full_name) || ''}{cur?.team ? ` · Ca ${cur.team}` : ''}</span>
        <FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />
      </header>
      <div className="kmx-body">
        <div className="kmx-inner">
          {err && <div className="kmx-msg err">{err}</div>}
          {loading && !open.length && !lots.length && <><div className="kmx-skel" /><div className="kmx-skel" /></>}

          <section className="kmx-card" aria-label="Lệnh đang chạy" style={{ gap: 8, borderColor: lenhs.length ? '#E5E7EB' : '#FDE68A' }}>
            <div className="kmx-row">
              <span className="kmx-strong" style={{ fontSize: 13 }}>Lệnh đang chạy · mã nguyên liệu</span>
              {canTake && <button type="button" className="kmx-pill sm" onClick={() => { setChonMa((v) => !v); setChonIds([]); setHoiThay(null) }}>{chonMa ? 'Đóng' : 'Bắt đầu lệnh…'}</button>}
            </div>
            {msgMa && <span className="kmx-sm" style={{ color: '#1B4D3E', fontWeight: 600 }}>{msgMa}</span>}
            {!lenhs.length && <span className="kmx-sm" style={{ color: '#B45309', fontWeight: 600 }}>Chưa khai lệnh đang chạy. Khai một lần (một hay nhiều mã gộp, ví dụ KHMN-15 + 17); mỗi lệnh là một thẻ bên dưới với các lần chèn và nút Lấy riêng.</span>}
            {chonMa && (
              <div className="kmx-col" style={{ gap: 6 }}>
                <span className="kmx-sm">Chạm một hay nhiều mã chạy chung một lệnh, rồi bấm Bắt đầu.</span>
                {maChuaChay.length ? <div className="kmx-seg">{maChuaChay.map((m) => <button key={m.raw_lot_id} type="button" className={chonIds.includes(m.raw_lot_id) ? 'on' : ''} onClick={() => setChonIds((cur) => (cur.includes(m.raw_lot_id) ? cur.filter((x) => x !== m.raw_lot_id) : [...cur, m.raw_lot_id]))}>{m.ma}</button>)}</div> : <span className="kmx-sm">Không còn mã nào chưa chạy. Mã mới sinh ra khi nhận phiếu cân vào kho.</span>}
                {chonIds.length > 0 && !hoiThay && <button type="button" className="kmx-btn sec" disabled={busyMa === 'lenh'} onClick={() => batDauLenh(chonIds)}>{busyMa === 'lenh' ? 'Đang khai…' : `Bắt đầu lệnh: ${maTen(chonIds)}`}</button>}
                {hoiThay && (
                  <div className="kmx-tint col" style={{ alignItems: 'stretch', gap: 6 }}>
                    <span className="kmx-sm" style={{ color: '#0D2E25' }}>Bắt đầu <b>{maTen(hoiThay)}</b>: đang chạy {lenhs.map((g) => g.ma_gop).join(' · ')}. Mặc định kết thúc lệnh cũ, thay bằng lệnh mới.</span>
                    <div className="kmx-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" className="kmx-pill sm" style={{ background: '#1B4D3E', color: '#fff', borderColor: '#1B4D3E', flex: 1 }} disabled={busyMa === 'lenh'} onClick={() => batDauLenh(hoiThay, { thayThe: true })}>Thay thế</button>
                      <button type="button" className="kmx-pill sm" disabled={busyMa === 'lenh'} onClick={() => batDauLenh(hoiThay, { thayThe: false })}>Chạy song song</button>
                      {lenhs.map((g) => <button key={g.id} type="button" className="kmx-pill sm" disabled={busyMa === 'lenh'} onClick={() => batDauLenh(hoiThay, { thayThe: false, gopVao: g.id })}>Gộp vào {g.ma_gop}</button>)}
                      <button type="button" className="kmx-pill sm" onClick={() => setHoiThay(null)}>Hủy</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {lenhsAsc.map((g, gi) => {
            const items = itemsCuaLenh(g); const tg = tongCua(items); const tm = tongMa(g.ma_gop)
            return (
              <section key={g.id} className="kmx-card hero" aria-label={`Lệnh ${g.ma_gop}`} style={{ gap: 10 }}>
                <div className="kmx-row" style={{ alignItems: 'flex-start' }}>
                  <span className="kmx-col" style={{ gap: 1, minWidth: 0 }}>
                    <span className="kmx-lbl ok">Lệnh {gi + 1}{lenhsAsc.length > 1 ? `/${lenhsAsc.length}` : ''}</span>
                    <span className="kmx-mono" style={{ fontSize: 20, fontWeight: 800, color: '#0D2E25' }}>{g.ma_gop}</span>
                    <span className="kmx-sm">{g.code} · từ {fmtDt(g.started_at)}{g.started_name ? ` · ${firstName(g.started_name)}` : ''}{tm.length ? ` · đã nhận ${fmtKg(tm.reduce((s2, x) => s2 + x.chen_kg, 0))} kg` : ''}</span>
                  </span>
                  {canTake && <button type="button" className="kmx-pill sm" disabled={busyMa === g.id} onClick={() => setHoiKetThuc(g)}>{busyMa === g.id ? 'Đang gửi…' : 'Kết thúc'}</button>}
                </div>
                {hoiKetThuc?.id === g.id && (
              <div className="kmx-tint col" style={{ alignItems: 'stretch', gap: 6 }}>
                <span className="kmx-sm" style={{ color: '#0D2E25' }}>Kết thúc lệnh <b>{hoiKetThuc.ma_gop}</b> ({hoiKetThuc.code})? Phiếu ca, phiếu chèn, lô TP sẽ không tự gắn lệnh này nữa. Máy tự tổng kết và gửi mail báo cáo (kèm ảnh từng lần chèn) cho Ban Giám đốc.</span>
                <div className="kmx-row" style={{ gap: 6 }}>
                  <button type="button" className="kmx-pill sm" style={{ background: '#1B4D3E', color: '#fff', borderColor: '#1B4D3E', flex: 1 }} disabled={busyMa === hoiKetThuc.id} onClick={() => ketThucLenh(hoiKetThuc)}>{busyMa === hoiKetThuc.id ? 'Đang kết thúc, gửi mail…' : 'Kết thúc và gửi mail BGĐ'}</button>
                  <button type="button" className="kmx-pill sm" onClick={() => setHoiKetThuc(null)}>Hủy</button>
                </div>
              </div>
            )}
                <div className="kmx-row">
                  <span className="kmx-lbl">{nhanCa} · đã chèn {items.length} lần</span>
                  <span className={`kmx-chip ${tg.issued ? 'amb' : items.length ? 'ok' : 'mut'}`}>{tg.issued ? `${tg.issued} lần đang ở dây chuyền` : items.length ? 'đã trả hết' : 'chưa chèn lần nào'}</span>
                </div>
                {items.length > 0 && (
                  <div className="kmx-grid3">
                    <div className="kmx-stat"><span className="kmx-lbl" style={{ fontSize: 10 }}>Đã lấy</span><span className="kmx-num md">{fmtKg(tg.lay)}</span><span className="kmx-sm">{tg.banh ? `${tg.banh} bành` : 'kg'}</span></div>
                    <div className="kmx-stat" style={tg.dayChuyen > 0 ? { background: '#FEF3C7' } : undefined}><span className="kmx-lbl" style={{ fontSize: 10 }}>Dây chuyền</span><span className="kmx-num md" style={tg.dayChuyen > 0 ? { color: '#B45309' } : undefined}>{fmtKg(tg.dayChuyen)}</span><span className="kmx-sm">kg chưa trả</span></div>
                    <div className="kmx-stat ok"><span className="kmx-lbl ok" style={{ fontSize: 10 }}>Tiêu hao</span><span className="kmx-num md ok">{fmtKg(tg.tieuHao)}</span><span className="kmx-sm">kg đã trả</span></div>
                  </div>
                )}
                {items.length > 0 && <div className="kmx-list">{items.map((i, k) => dongLan(i, k + 1))}</div>}
                <Link to={`/m/kho/chen/lay?lenh=${g.id}`} className="kmx-btn" aria-disabled={!canTake} onClick={(e) => { if (!canTake) e.preventDefault() }} style={!canTake ? { opacity: 0.45 } : undefined}>{I.plus}Lấy lần {items.length + 1}</Link>
              </section>
            )
          })}
          {itemsChuaLenh.length > 0 && (
            <section className="kmx-card" aria-label="Chưa gắn lệnh" style={{ gap: 8, borderColor: '#FDE68A' }}>
              <div className="kmx-row"><span className="kmx-strong" style={{ fontSize: 13 }}>Chưa gắn lệnh · {itemsChuaLenh.length} lần</span><span className="kmx-chip amb">{kg1(tongCua(itemsChuaLenh).lay)} kg</span></div>
              <span className="kmx-sm">Lấy trước khi khai lệnh. Khai lệnh duy nhất thì máy tự gắn; còn lại mở phiếu → Đổi mã.</span>
              <div className="kmx-list">{itemsChuaLenh.map((i, k) => dongLan(i, k + 1))}</div>
            </section>
          )}
          {!lenhsAsc.length && (
            <section className="kmx-card hero" aria-label="Việc tiếp theo">
              <span className="kmx-lbl ok">Đầu ca</span>
              <span className="kmx-strong" style={{ fontSize: 18 }}>Chưa khai lệnh đang chạy</span>
              <span className="kmx-md">Bấm "Bắt đầu lệnh…" ở trên, chạm mã chạy (một hay nhiều mã), rồi lấy hàng chèn trong thẻ của lệnh. Lấy trước vẫn được nhưng phiếu nằm ở "chưa gắn lệnh".</span>
              {btnLay('kmx-btn')}
              {!canTake && !role.loading && <span className="kmx-sm kmx-center">Tài khoản này chưa được phân công khai báo hàng chèn (QS). BGĐ phân công ở máy tính: Hàng chèn → Phân công.</span>}
            </section>
          )}
          <span className="kmx-sm kmx-center" style={{ color: '#9CA3AF' }}>Mỗi lần lấy = một pallet · cuối ca trả 3 lần cân, 2 ảnh · Kết thúc = đóng lệnh + mail BGĐ</span>

          {otherIssued.length > 0 && (
            <section aria-label="Đang ở dây chuyền ca khác" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h2 className="kmx-h2">Ca khác còn ở dây chuyền · {otherIssued.length}</h2>
              <div className="kmx-list">
                {otherIssued.map((i) => (
                  <Link key={i.id} to={`/m/kho/chen/phieu/${i.id}`} className="kmx-li" style={{ textDecoration: 'none', color: 'inherit' }}>
                    <span className="kmx-col"><span className="kmx-mono" style={{ fontSize: 13, fontWeight: 700, color: '#0D2E25' }}>{i.code}</span><span className="kmx-sm">{fmtD(i.shift_date)} · {i.shift_name || 'chưa gắn ca'}{i.team ? ` · Ca ${i.team}` : ''} · {i.lot_so_lo || i.lot_code} · {hm(i.out_at)}</span></span>
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
                  <span className="kmx-sm">{choKy[0].shift_name || fmtD(choKy[0].shift_date)}{choKy[0].team ? ` · Ca ${choKy[0].team}` : ''} · tiêu hao {fmtKg(choKy[0].kg_used)} kg · {MIX_ISSUE_STATUS_LABELS[choKy[0].status]}{choKy.length > 1 ? ` · và ${choKy.length - 1} phiếu khác` : ''}</span>
                </span>
                {I.chev}
              </Link>
            )}
            {choKy.length > 1 && <span className="kmx-sm" style={{ padding: '0 2px' }}>Mở Chờ ký để ký một chạm cho cả ca.</span>}
          </section>

          <section aria-label="Kho chèn" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="kmx-col" style={{ padding: '0 2px', gap: 2 }}>
              <Link to="/m/kho/chen/kho" className="kmx-h2" style={{ display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: '#1B4D3E' }}>Kho chèn{I.chev}</Link>
              <span className="kmx-sm">Tại kho <b className="kmx-mono" style={{ color: '#0D2E25' }}>{fmtKg(bal?.tai_kho_kg)} kg</b> · {bal?.so_lo ?? 0} lô{(bal?.o_day_chuyen_kg ?? 0) > 0 ? ` · đang ở dây chuyền ${fmtKg(bal?.o_day_chuyen_kg)} kg` : ''}</span>
            </div>
            {lots.length > 0 ? (
              <div className="kmx-list">
                {lots.map((l) => {
                  const khoa = l.source_type === 'dkl' && !l.metal_cleared
                  return (
                    <div key={l.id} className="kmx-li">
                      <span className="kmx-col" style={{ minWidth: 0, flex: 1 }}>
                        <span className="kmx-mono" style={{ fontSize: 15, fontWeight: 800, color: khoa ? '#6B7280' : l.so_lo ? '#0D2E25' : '#B91C1C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.so_lo || 'Chưa có số lô'} <span className="kmx-sm kmx-mono" style={{ fontWeight: 500 }}>{l.code}</span></span>
                        <span className="kmx-sm" style={{ ...(khoa ? { color: '#B91C1C', fontWeight: 500 } : {}), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{khoa ? 'Dính kim loại · chưa xử lý, chưa lấy được' : (l.source_desc || `${MIX_SOURCE_LABELS[l.source_type]}${l.grade ? ` · ${l.grade}` : ''}`)}</span>
                      </span>
                      <span className="kmx-col" style={{ alignItems: 'flex-end', flex: '0 0 auto', gap: 0 }}>
                        <span className={`kmx-num sm${khoa ? ' mut' : ''}`} style={{ whiteSpace: 'nowrap' }}>{fmtKg(l.ton_kg)} <span className="kmx-sm">kg</span></span>
                        <span className="kmx-sm" style={{ whiteSpace: 'nowrap' }}>{l.ton_banh} bành{l.kg_at_line > 0 ? ` · ${fmtKg(l.kg_at_line)} ở dây chuyền` : ''}</span>
                      </span>
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
                    <span className="kmx-col"><span className="kmx-mono" style={{ fontSize: 13, fontWeight: 700, color: '#0D2E25' }}>{i.code}</span><span className="kmx-sm">{fmtD(i.shift_date)}{i.shift_name ? ` · ${i.shift_name}` : ''}{i.team ? ` · Ca ${i.team}` : ''} · {i.lot_so_lo || i.lot_code}</span></span>
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
