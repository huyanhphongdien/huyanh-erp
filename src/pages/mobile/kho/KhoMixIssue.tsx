// ============================================================================
// KhoMixIssue — phiếu chèn trên điện thoại theo mockup 30/10:
//   · đang ở dây chuyền (issued): màn TRẢ CUỐI CA — cân phần còn lại, 2 ảnh, một chạm = ghi trả + ký bên giao
//   · sau đó: màn "đã trả" rồi DÒNG THỜI GIAN phiếu (ảnh gắn từng mốc) + nút ký của QS / thủ kho, sửa, hủy
// File: src/pages/mobile/kho/KhoMixIssue.tsx · Route: /m/kho/chen/phieu/:id
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { mixService, MIX_PURPOSE_LABELS, MIX_SOURCE_LABELS, MIX_VI_TRI_LABELS, type MixIssue, type MixViTri } from '../../../services/wms/mixService'
import { rawPhotoService, type RawPhoto } from '../../../services/wms/rawPhotoService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { rawLotService, type RawLotBalance } from '../../../services/wms/rawLotService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useMixRole } from '../../../hooks/useMixRole'
import { fmtD, fmtDt, fmtKg } from './khoCommon'
import { detectShift, hhmm, I, KmxPhotoTiles, Lightbox, type ShiftPick } from './khoMixUtil'
import { useAuthStore } from '../../../stores/authStore'
import type { OpsShiftOption } from '../../../services/opsService'
import './khoMix.css'

const hm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '')
const STATUS_CHIP: Record<MixIssue['status'], { cls: string; text: string }> = {
  issued: { cls: 'ok', text: 'Ở dây chuyền' }, returned: { cls: 'amb', text: 'Chờ QS ký' }, submitted: { cls: 'gold', text: 'Chờ QC duyệt' },
  qc_confirmed: { cls: 'blue', text: 'Chờ thủ kho nhận' }, received: { cls: 'ok', text: 'Đã nhận' }, cancelled: { cls: 'red', text: 'Đã hủy' },
}

export default function KhoMixIssue() {
  const { id } = useParams<{ id: string }>()
  const nav = useNavigate()
  const [i, setI] = useState<MixIssue | null>(null)
  const [pOut, setPOut] = useState<RawPhoto[]>([])
  const [pRet, setPRet] = useState<RawPhoto[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [kgRet, setKgRet] = useState('')
  // trả cũng cân cả pallet như sổ tay: số bành còn · hàng + pallet · bì → trả = cân − bì
  const [retMode, setRetMode] = useState<'pallet' | 'kg'>(() => { try { return localStorage.getItem('kmx_can_mode') === 'kg' ? 'kg' : 'pallet' } catch { return 'pallet' } })
  const [retSoBanh, setRetSoBanh] = useState('')
  const [retGross, setRetGross] = useState('')
  const [retPallet, setRetPallet] = useState(() => { try { return localStorage.getItem('kmx_pallet_kg') || '15' } catch { return '15' } })
  // đổi mã nguyên liệu gốc của phiếu
  const [maList, setMaList] = useState<RawLotBalance[] | null>(null)
  const [maChon, setMaChon] = useState<string[]>([])
  const [doiMa, setDoiMa] = useState(false)
  const [lan, setLan] = useState<number | null>(null)   // lần chèn thứ mấy trong ca
  const [viTriChon, setViTriChon] = useState<MixViTri | null>(null)
  const [handover, setHandover] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [justDone, setJustDone] = useState<{ kgUsed: number; signed: boolean } | null>(null)
  const [editRet, setEditRet] = useState(false)
  const [cancelAsk, setCancelAsk] = useState(false)
  // sửa cân lúc lấy (trước bước QS ký)
  const [editLay, setEditLay] = useState(false)
  const [lMode, setLMode] = useState<'pallet' | 'kg'>('pallet')
  const [lGross, setLGross] = useState(''); const [lPallet, setLPallet] = useState('15'); const [lKg, setLKg] = useState(''); const [lBanh, setLBanh] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  // C4: phiếu bàn giao chưa có ca → bắt chọn ca + tổ trước khi trả
  const user = useAuthStore((s) => s.user)
  const [shift, setShift] = useState<ShiftPick | null>(null)
  const [shifts, setShifts] = useState<OpsShiftOption[]>([])
  const [pickShift, setPickShift] = useState(false)
  const [team, setTeam] = useState('')
  const [teams, setTeams] = useState<string[]>(['Đen', 'Vàng'])
  const [big, setBig] = useState<{ src: string; cap: string } | null>(null)
  const role = useMixRole(i?.facility_id ?? null)

  const load = useCallback(async () => {
    if (!id) return
    setErr(null)
    try {
      const x = await mixService.getIssue(id)
      if (!x) { setErr('Không tìm thấy phiếu'); return }
      const [a, b, s] = await Promise.all([rawPhotoService.list('mix_issue_out', x.id), rawPhotoService.list('mix_issue_return', x.id), rawSettingsService.getForFacility(x.facility_id)])
      setI(x); setPOut(a); setPRet(b); setSettings(s)
      mixService.listIssues({ facilityId: x.facility_id, date: x.shift_date, limit: 100 })
        .then((list) => { const same = list.filter((y) => y.status !== 'cancelled' && y.shift_id === x.shift_id).sort((p, q) => p.out_at.localeCompare(q.out_at)); const k = same.findIndex((y) => y.id === x.id); setLan(k >= 0 ? k + 1 : null) })
        .catch(() => { /* bỏ qua */ })
    } catch (e: any) { setErr(e?.message || 'Không tải được phiếu') }
  }, [id])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!i || i.shift_id || i.status !== 'issued') return
    let alive = true
    detectShift(user?.employee_id || null).then((d) => { if (alive) { setShifts(d.shifts); setShift((cur) => cur ?? d.pick) } }).catch(() => { /* bỏ qua */ })
    mixService.listTeams(i.facility_id).then((t) => { if (alive) setTeams([...new Set([...t, 'Đen', 'Vàng'])]) }).catch(() => { /* bỏ qua */ })
    return () => { alive = false }
  }, [i?.id, i?.shift_id, i?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const required = settings.anh_bat_buoc?.length ? settings.anh_bat_buoc : ['toan_canh', 'man_hinh_can']
  const missOut = rawPhotoService.missing(pOut, required)
  const missRet = rawPhotoService.missing(pRet, required)
  // trả 0 kg (dùng hết) thì không bắt ảnh trả
  const missRetEff = (i?.kg_return ?? 0) > 0.005 ? missRet : []
  const editable = !!i && ['issued', 'returned'].includes(i.status)

  async function run(key: string, fn: () => Promise<any>, ok: string) {
    setBusy(key); setMsg(null)
    try { const r = await fn(); setMsg({ ok: true, text: ok }); await load(); return r }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Thao tác thất bại' }); return undefined }
    finally { setBusy(null) }
  }

  const retGrossN = retGross === '' ? null : Number(retGross)
  const retPalletN = retPallet === '' ? 0 : Number(retPallet)
  const kgRetN = retMode === 'pallet' && !editRet ? (retGrossN !== null && Number.isFinite(retGrossN) && Number.isFinite(retPalletN) ? Math.round((retGrossN - retPalletN) * 100) / 100 : null) : kgRet === '' ? null : Number(kgRet)
  const kgTxt = (n: number | null) => (n === null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 1 }))
  const retSoBanhAuto = i && kgRetN !== null && Number.isFinite(kgRetN) && kgRetN >= 0 ? Math.round(kgRetN / (i.lot_kg_per_banh || 35)) : null
  const retSoBanhN = retSoBanh === '' ? retSoBanhAuto : Math.round(Number(retSoBanh))
  const chinhBanhTra = (d: number) => setRetSoBanh(String(Math.max((retSoBanhN ?? 0) + d, 0)))
  const lGrossN = lGross === '' ? null : Number(lGross)
  const lPalletN = lPallet === '' ? 0 : Number(lPallet)
  const lKgN = lMode === 'pallet' ? (lGrossN !== null && Number.isFinite(lGrossN) ? Math.round((lGrossN - lPalletN) * 100) / 100 : null) : lKg === '' ? null : Number(lKg)
  const lKgOk = lKgN !== null && Number.isFinite(lKgN) && lKgN > 0
  const lBanhAuto = i && lKgOk ? Math.max(Math.round(lKgN! / (i.lot_kg_per_banh || 35)), 1) : null
  const lBanhN = lBanh === '' ? lBanhAuto : Math.round(Number(lBanh))
  const moSuaLay = () => {
    if (!i) return
    if (i.gross_kg !== null) { setLMode('pallet'); setLGross(String(i.gross_kg)); setLPallet(String(i.pallet_kg ?? 0)) } else { setLMode('kg'); setLKg(String(i.kg_out)) }
    setLBanh(''); setEditLay(true)
  }
  const kgRetOk = !!i && kgRetN !== null && Number.isFinite(kgRetN) && kgRetN >= 0 && kgRetN <= i.kg_out + 0.01

  async function traVaKy() {
    if (!i || !kgRetOk) return
    setBusy('tra'); setMsg(null)
    try {
      const r = await mixService.tra(i.id, kgRetN!, handover, note.trim() || null, null, i.shift_id ? null : shift?.id ?? null, i.shift_id ? null : (team.trim() || null), { grossKg: retMode === 'pallet' ? retGrossN : null, palletKg: retMode === 'pallet' ? retPalletN : null, soBanhTra: retSoBanhN })
      let signed = false
      try { await mixService.ky(i.id, 'submit'); signed = true }
      catch (e: any) { setMsg({ ok: false, text: `Đã ghi trả nhưng chưa ký được: ${e?.message || ''}` }) }
      setJustDone({ kgUsed: r.kg_used, signed }); await load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không ghi được' }) }
    finally { setBusy(null) }
  }

  async function moDoiMa() {
    if (!i) return
    if (doiMa) { setDoiMa(false); return }
    setDoiMa(true); setMaChon(i.raw_lot_ids ?? (i.raw_lot_id ? [i.raw_lot_id] : [])); setViTriChon(i.vi_tri)
    if (maList === null) {
      try { setMaList((await rawLotService.maDangChay(i.facility_id)).slice(0, 12)) } catch { setMaList([]) }
    }
  }

  async function luuSuaLay() {
    if (!i || !lKgOk) return
    const r = await run('sualay', () => mixService.suaLay(i.id, { kg: lMode === 'kg' ? lKgN : null, grossKg: lMode === 'pallet' ? lGrossN : null, palletKg: lMode === 'pallet' ? lPalletN : null, soBanh: lBanhN }), '')
    if (r) { setMsg({ ok: true, text: `Đã sửa cân lấy: ${kgTxt(r.kg_truoc)} → ${kgTxt(r.kg_sau)} kg · ${r.so_banh} bành` }); setEditLay(false) }
  }
  // thẻ sửa cân lúc lấy: hiện khi phiếu chưa qua QS ký và người dùng được khai báo
  const suaLayBox = () => {
    if (!i || !['issued', 'returned'].includes(i.status) || !role.khaiBao) return null
    if (!editLay) return <button type="button" className="kmx-btn ghost" style={{ color: '#1B4D3E', fontSize: 13 }} onClick={moSuaLay}>Gõ nhầm cân lúc lấy? Sửa cân lúc lấy</button>
    return (
      <section className="kmx-card" aria-label="Sửa cân lúc lấy" style={{ gap: 10, borderColor: '#1B4D3E' }}>
        <div className="kmx-row">
          <span className="kmx-strong" style={{ fontSize: 13 }}>Sửa cân lúc lấy · đang ghi {kgTxt(i.kg_out)} kg</span>
          <button type="button" className="kmx-pill sm" onClick={() => setLMode(lMode === 'pallet' ? 'kg' : 'pallet')}>{lMode === 'pallet' ? 'Gõ thẳng kg' : 'Cân cả pallet'}</button>
        </div>
        {lMode === 'pallet' ? (
          <>
            <div className="kmx-grid2">
              <label className="kmx-col" style={{ gap: 4 }}><span className="kmx-lbl">Hàng + pallet (kg)</span><input className="kmx-text kmx-mono" style={{ fontWeight: 700, fontSize: 17 }} type="number" inputMode="decimal" value={lGross} onChange={(e) => { setLGross(e.target.value); setLBanh('') }} aria-label="Hàng + pallet" /></label>
              <label className="kmx-col" style={{ gap: 4 }}><span className="kmx-lbl">Bì pallet (kg)</span><input className="kmx-text" type="number" inputMode="decimal" value={lPallet} onChange={(e) => { setLPallet(e.target.value); setLBanh('') }} aria-label="Bì pallet" /></label>
            </div>
            <div className="kmx-tint" style={{ background: '#E8F5F0', color: '#0D2E25' }}><span>Hàng chèn = {lGross || '0'} − bì {lPallet || '0'}</span><span className="kmx-num sm">{lKgN === null ? '—' : `${kgTxt(lKgN)} kg`}</span></div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><input className="kmx-input" type="number" inputMode="decimal" value={lKg} onChange={(e) => { setLKg(e.target.value); setLBanh('') }} aria-label="Kg lấy" /><span style={{ fontSize: 18, fontWeight: 700, color: '#6B7280' }}>kg</span></div>
        )}
        <div className="kmx-row" style={{ alignItems: 'center' }}>
          <span className="kmx-col"><span className="kmx-lbl">Số bành</span><span className="kmx-sm">tự tính {i.lot_kg_per_banh} kg/bành</span></span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="kmx-pill sm" style={{ width: 44, padding: 0, fontSize: 20 }} aria-label="Bớt 1 bành" disabled={lBanhN === null || lBanhN <= 0} onClick={() => setLBanh(String(Math.max((lBanhN ?? 0) - 1, 0)))}>−</button>
            <span className="kmx-num md" style={{ minWidth: 40, textAlign: 'center' }}>{lBanhN ?? '—'}</span>
            <button type="button" className="kmx-pill sm" style={{ width: 44, padding: 0, fontSize: 20 }} aria-label="Thêm 1 bành" disabled={lBanhN === null} onClick={() => setLBanh(String((lBanhN ?? 0) + 1))}>+</button>
          </div>
        </div>
        {i.kg_return !== null && lKgOk && lKgN! < i.kg_return && <span className="kmx-sm" style={{ color: '#B91C1C', fontWeight: 600 }}>Kg lấy mới nhỏ hơn kg đã trả ({kgTxt(i.kg_return)}), sửa kg trả trước.</span>}
        <div className="kmx-grid2">
          <button type="button" className="kmx-btn sec" style={{ background: '#1B4D3E', color: '#fff' }} disabled={!lKgOk || busy === 'sualay'} onClick={luuSuaLay}>{busy === 'sualay' ? 'Đang lưu…' : 'Lưu cân mới'}</button>
          <button type="button" className="kmx-btn sec" onClick={() => setEditLay(false)}>Thôi</button>
        </div>
        <span className="kmx-sm">Máy ghi lại ai sửa, lúc nào và số trước khi sửa. Tồn ở dây chuyền và tiêu hao tính lại theo số mới.</span>
      </section>
    )
  }

  async function ky(buoc: 'submit' | 'qc_confirm' | 'receive') {
    if (!i) return
    const r = await run(buoc, () => mixService.ky(i.id, buoc), buoc === 'receive' ? 'Thủ kho đã nhận, kho chèn và sổ ca đã cập nhật' : 'Đã ký')
    if (buoc === 'receive' && r?.next_issue_id) nav(`/m/kho/chen/phieu/${r.next_issue_id}`, { replace: true })
  }

  if (err) return <div className="kmx"><header className="kmx-hd"><button type="button" className="kmx-back" aria-label="Quay lại" onClick={() => nav('/m/kho/chen')}>{I.back}</button><div className="kmx-hd-txt"><span className="kmx-title">Phiếu chèn</span></div></header><div className="kmx-body"><div className="kmx-msg err">{err}</div></div></div>
  if (!i) return <div className="kmx"><header className="kmx-hd"><button type="button" className="kmx-back" aria-label="Quay lại" onClick={() => nav('/m/kho/chen')}>{I.back}</button><div className="kmx-hd-txt"><span className="kmx-title">Phiếu chèn</span></div></header><div className="kmx-body"><div className="kmx-skel" /><div className="kmx-skel" /></div></div>

  const st = i.status
  const caTo = `${i.shift_name || fmtD(i.shift_date)}${i.team ? ` · Tổ ${i.team}` : ''}`
  const canSubmit = role.khaiBao
  const canQc = role.duyetQc
  const canReceive = role.nhanKho
  const pct = i.kg_used !== null && i.kg_out > 0 ? Math.round((100 * i.kg_used) / i.kg_out) : 0

  // ── màn "đã trả" ngay sau một chạm ──
  if (justDone) {
    return (
      <div className="kmx">
        <header className="kmx-hd" style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 12, padding: 'calc(28px + env(safe-area-inset-top)) 24px 22px' }}>
          <span className="kmx-check sm"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
          <div className="kmx-col" style={{ alignItems: 'center', gap: 4 }}><span style={{ fontSize: 24, fontWeight: 800 }}>{justDone.signed ? 'Đã trả, bạn đã ký' : 'Đã trả, chưa ký'}</span><span style={{ fontSize: 13, color: '#D1E3DC' }}>{i.code} · {caTo} · {hm(i.return_at)}</span></div>
        </header>
        <div className="kmx-body"><div className="kmx-inner">
          {msg && !msg.ok && <div className="kmx-msg err">{msg.text}</div>}
          <section className="kmx-card kmx-grid3" aria-label="Kết quả ca" style={{ display: 'grid' }}>
            <div className="kmx-col kmx-center"><span className="kmx-lbl">Lấy</span><span className="kmx-num md">{fmtKg(i.kg_out)}</span></div>
            <div className="kmx-col kmx-center"><span className="kmx-lbl">Trả</span><span className="kmx-num md">{fmtKg(i.kg_return)}</span></div>
            <div className="kmx-col kmx-center kmx-stat ok"><span className="kmx-lbl ok">Tiêu hao</span><span className="kmx-num md ok">{fmtKg(i.kg_used)}</span></div>
          </section>
          <section className="kmx-card" aria-label="Tiến độ ký" style={{ gap: 0 }}>
            <h2 className="kmx-h2" style={{ marginBottom: 10 }}>{justDone.signed ? 'Còn 2 chữ ký nữa' : 'Còn 3 chữ ký'}</h2>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '6px 0' }}><span className={`kmx-tl-dot ${justDone.signed ? 'done' : 'now'}`} style={{ position: 'static' }}>{justDone.signed ? I.checkSm : '1'}</span><span className="kmx-col" style={{ paddingTop: 3 }}><span className="kmx-strong">{justDone.signed ? 'QS đã ký khai báo' : 'QS ký khai báo · chưa'}</span><span className="kmx-sm">{i.submitted_name || i.return_name || ''}{i.team ? ` · Tổ ${i.team}` : ''}{i.submitted_at ? ` · ${hm(i.submitted_at)}` : ''}</span></span></div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '6px 0' }}><span className={`kmx-tl-dot ${justDone.signed ? 'now' : 'todo'}`} style={{ position: 'static' }}>2</span><span className="kmx-col" style={{ paddingTop: 3 }}><span className="kmx-strong" style={{ color: justDone.signed ? '#B45309' : '#6B7280' }}>QC duyệt · đang chờ</span><span className="kmx-sm">QC thấy phiếu trong mục Chờ ký, ký được cả ca một chạm</span></span></div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '6px 0' }}><span className="kmx-tl-dot todo" style={{ position: 'static' }}>3</span><span className="kmx-col" style={{ paddingTop: 3 }}><span className="kmx-strong" style={{ color: '#6B7280' }}>Thủ kho nhận</span><span className="kmx-sm">Lúc này kho chèn mới trừ {fmtKg(i.kg_used)} kg, sổ ca tự điền dòng CHÈN</span></span></div>
          </section>
          <div className="kmx-note info">{I.info}<span>{justDone.signed ? 'Bạn không cần làm gì thêm. Có gì sai thì mở phiếu để sửa kg trả trước khi QS ký.' : 'Mở phiếu để chụp ảnh còn thiếu rồi bấm Ký bên giao.'}</span></div>
        </div></div>
        <div className="kmx-foot">
          <button type="button" className="kmx-btn" onClick={() => nav('/m/kho/chen')}>Về trang chính</button>
          <button type="button" className="kmx-btn ghost" onClick={() => setJustDone(null)}>Xem phiếu</button>
        </div>
      </div>
    )
  }

  // ── màn TRẢ CUỐI CA (đang ở dây chuyền) ──
  if (st === 'issued') {
    const tieuHao = kgRetN !== null && Number.isFinite(kgRetN) ? Math.max(i.kg_out - kgRetN, 0) : null
    const p = tieuHao !== null && i.kg_out > 0 ? Math.round((100 * tieuHao) / i.kg_out) : 0
    const ready = kgRetOk && (kgRetN === 0 || missRet.length === 0) && missOut.length === 0 && (!!i.shift_id || !!shift)
    return (
      <div className="kmx">
        <header className="kmx-hd">
          <button type="button" className="kmx-back" aria-label="Về trang chính" onClick={() => nav('/m/kho/chen')}>{I.back}</button>
          <div className="kmx-hd-txt"><span className="kmx-eyebrow">{lan ? `Lần ${lan} · ` : ''}{i.code} · {caTo}</span><span className="kmx-title">{lan ? `Trả lần ${lan}` : 'Trả cuối ca'}</span></div>
        </header>
        <div className="kmx-body"><div className="kmx-inner">
          {msg && <div className={`kmx-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
          <div className="kmx-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px' }}>
            <span className="kmx-col"><span className="kmx-lbl">Đã lấy đầu ca</span><span className="kmx-md">{hm(i.out_at)} · lô {i.lot_so_lo || i.lot_code}{i.vi_tri ? ` · ${MIX_VI_TRI_LABELS[i.vi_tri].toLowerCase()}` : ''}{i.so_banh !== null ? ` · ${i.so_banh} bành` : ''}{i.ma_goc_all ? ` · vào mã ${i.ma_goc_all}` : ''} · {pOut.length} ảnh</span></span>
            <span className="kmx-num md" style={{ whiteSpace: 'nowrap' }}>{fmtKg(i.kg_out)} <span className="kmx-sm">kg</span></span>
          </div>
          {suaLayBox()}
          {missOut.length > 0 && (
            <section className="kmx-card" style={{ borderColor: '#FECACA' }}>
              <div className="kmx-note red" style={{ padding: 0, background: 'transparent' }}>{I.info}<span>Lúc lấy còn thiếu {missOut.length} ảnh bắt buộc. Chụp bổ sung ở đây rồi mới ký được.</span></div>
              <KmxPhotoTiles refType="mix_issue_out" refId={i.id} photos={pOut} required={required} facilityCode={i.facility_code || undefined} onChange={load} onError={(t) => setMsg({ ok: false, text: t })} />
            </section>
          )}
          {!i.shift_id && (
            <section className="kmx-card" aria-label="Ca và tổ" style={{ gap: 10, borderColor: shift ? '#E5E7EB' : '#FECACA' }}>
              <div className="kmx-row">
                <span className="kmx-col"><span className="kmx-lbl">Ca nhận bàn giao · bắt buộc</span><span className="kmx-strong" style={{ fontSize: 15 }}>{shift ? `${shift.name}${shift.start_time ? ` · ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : ''}` : 'Chưa chọn ca'}</span><span className="kmx-sm" style={{ color: shift ? '#15803D' : '#B45309' }}>{shift?.nguon === 'cham_cong' ? 'tự nhận theo chấm công của bạn' : shift?.nguon === 'gio' ? 'tự nhận theo giờ hiện tại' : shift ? 'bạn chọn' : 'phiếu bàn giao từ ca trước, cần ghi rõ ca này'}</span></span>
                <button type="button" className="kmx-pill sm" onClick={() => setPickShift((v) => !v)}>{pickShift ? 'Đóng' : 'Đổi ca'}</button>
              </div>
              {pickShift && <div className="kmx-seg">{shifts.map((s) => <button key={s.id} type="button" className={shift?.id === s.id ? 'on' : ''} onClick={() => { setShift({ id: s.id, name: s.name, code: s.code, start_time: s.start_time, end_time: s.end_time, nguon: 'tay' }); setPickShift(false) }}>{s.name}</button>)}</div>}
              <div className="kmx-col" style={{ gap: 6 }}><span className="kmx-lbl">Tổ</span><div className="kmx-seg">{teams.map((t) => <button key={t} type="button" className={team === t ? 'on' : ''} onClick={() => setTeam(t)}>Tổ {t}</button>)}</div></div>
            </section>
          )}
          <section className="kmx-card" aria-label="Cân phần còn lại" style={{ gap: 10 }}>
            <div className="kmx-row">
              <span className="kmx-strong" style={{ fontSize: 13 }}>{retMode === 'pallet' ? 'Cân phần còn lại cả pallet' : 'Cân phần còn lại, đọc số trên cân'}</span>
              <button type="button" className="kmx-pill sm" onClick={() => setRetMode(retMode === 'pallet' ? 'kg' : 'pallet')}>{retMode === 'pallet' ? 'Gõ thẳng kg' : 'Cân cả pallet'}</button>
            </div>
            {retMode === 'pallet' ? (
              <>
                <label className="kmx-col" style={{ gap: 4 }}><span className="kmx-lbl">Bì pallet (kg) · sửa nếu khác</span><input className="kmx-text" type="number" inputMode="decimal" value={retPallet} onChange={(e) => setRetPallet(e.target.value)} aria-label="Bì pallet" /></label>
                <label htmlFor="kmx-ret" className="kmx-lbl">Hàng + pallet · số trên cân</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input id="kmx-ret" className={`kmx-input${retGross !== '' && !kgRetOk ? ' red' : ''}`} type="number" inputMode="decimal" placeholder="0" value={retGross} onChange={(e) => { setRetGross(e.target.value); setRetSoBanh('') }} />
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#6B7280' }}>kg</span>
                </div>
                <div className="kmx-tint" style={{ background: '#E8F5F0', color: '#0D2E25' }}><span>Trả = {retGross || '0'} − bì {retPallet || '0'}</span><span className="kmx-num sm">{kgRetN === null ? '—' : `${kgTxt(kgRetN)} kg`}</span></div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input id="kmx-ret" className={`kmx-input${kgRet !== '' && !kgRetOk ? ' red' : ''}`} type="number" inputMode="decimal" placeholder="0" value={kgRet} onChange={(e) => { setKgRet(e.target.value); setRetSoBanh('') }} />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#6B7280' }}>kg</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="kmx-pill" onClick={() => { setRetMode('kg'); setKgRet('0') }}>Dùng hết · 0 kg</button>
              <button type="button" className="kmx-pill" onClick={() => { setRetMode('kg'); setKgRet(String(i.kg_out)) }}>Chưa dùng · {fmtKg(i.kg_out)} kg</button>
            </div>
            <div className="kmx-row" style={{ alignItems: 'center' }}>
              <span className="kmx-col"><span className="kmx-lbl">Số bành còn</span><span className="kmx-sm">tự tính {i.lot_kg_per_banh} kg/bành{i.so_banh !== null ? ` · lấy ${i.so_banh} bành` : ''}{retSoBanh !== '' ? ' · bạn đã chỉnh' : ''}</span></span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className="kmx-pill sm" style={{ width: 44, padding: 0, fontSize: 20 }} aria-label="Bớt 1 bành" disabled={retSoBanhN === null || retSoBanhN <= 0} onClick={() => chinhBanhTra(-1)}>−</button>
                <span className="kmx-num md" style={{ minWidth: 40, textAlign: 'center' }}>{retSoBanhN ?? '—'}</span>
                <button type="button" className="kmx-pill sm" style={{ width: 44, padding: 0, fontSize: 20 }} aria-label="Thêm 1 bành" disabled={retSoBanhN === null} onClick={() => chinhBanhTra(1)}>+</button>
              </div>
            </div>
            {tieuHao !== null && (
              <div className="kmx-tint col">
                <div className="kmx-row"><span style={{ fontWeight: 600 }}>Tiêu hao ca này</span><span className="kmx-num md">{fmtKg(tieuHao)} kg</span></div>
                <div className="kmx-bar"><span style={{ width: `${Math.min(p, 100)}%` }} /></div>
                <div className="kmx-row" style={{ fontSize: 11, fontWeight: 600, color: '#4B5563' }}><span>Đã dùng {fmtKg(tieuHao)} kg ({p} %)</span><span>Trả {fmtKg(kgRetN)} kg</span></div>
              </div>
            )}
            {kgRetN !== null && !kgRetOk && <span className="kmx-sm" style={{ color: '#B91C1C', fontWeight: 600 }}>Số trả phải từ 0 đến {fmtKg(i.kg_out)} kg</span>}
            {settings.chen_ban_giao_ca && (
              <label className="kmx-check-row" htmlFor="kmx-handover">
                <input id="kmx-handover" type="checkbox" checked={handover} onChange={(e) => setHandover(e.target.checked)} />
                <span>Để <b>{kgRetN !== null && kgRetN > 0 ? `${fmtKg(kgRetN)} kg` : 'phần còn lại'}</b> lại dây chuyền cho ca sau<br /><span className="kmx-sm">Không cân về kho; máy tự mở phiếu cho ca kế khi thủ kho nhận.</span></span>
              </label>
            )}
          </section>
          {kgRetN === 0 ? <div className="kmx-note ok">{I.info}<span><b>Dùng hết, trả 0 kg:</b> không cần chụp ảnh trả. Chỉ khi còn hàng dư mang về mới cần 2 ảnh.</span></div> : <section className="kmx-card" aria-label="Chụp ảnh lúc trả">
            <div className="kmx-row"><span className="kmx-strong" style={{ fontSize: 13 }}>Chụp 2 ảnh phần trả</span><span className={`kmx-chip ${missRet.length ? 'red' : 'ok'}`}>{required.length - missRet.length}/{required.length}{missRet.length ? ` · thiếu ${missRet.length}` : ' đã chụp'}</span></div>
            <KmxPhotoTiles refType="mix_issue_return" refId={i.id} photos={pRet} required={required} facilityCode={i.facility_code || undefined} labels={{ toan_canh: 'Toàn cảnh phần trả', man_hinh_can: 'Màn hình cân' }} onChange={load} onError={(t) => setMsg({ ok: false, text: t })} />
            <span className="kmx-sm">Đủ 2 ảnh thì nút dưới mới sáng. Ảnh bổ sung không bắt buộc.</span>
          </section>}
          <div className="kmx-col" style={{ gap: 6 }}>
            <label htmlFor="kmx-rnote" className="kmx-sm" style={{ fontWeight: 600 }}>Ghi chú (không bắt buộc)</label>
            <input id="kmx-rnote" className="kmx-text" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="kmx-col" style={{ gap: 8, marginTop: 6 }}>
            {!cancelAsk ? <button type="button" className="kmx-btn ghost" style={{ color: '#B91C1C' }} onClick={() => setCancelAsk(true)}>Lấy nhầm? Hủy phiếu</button> : (
              <div className="kmx-card" style={{ borderColor: '#FECACA' }}>
                <input className="kmx-text" placeholder="Lý do hủy" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} aria-label="Lý do hủy" />
                <div className="kmx-grid2"><button type="button" className="kmx-btn red" disabled={busy === 'cancel'} onClick={() => run('cancel', () => mixService.ky(i.id, 'cancel', cancelReason.trim() || null), `Đã hủy, ${fmtKg(i.kg_out)} kg trả về tồn kho chèn`)}>Xác nhận hủy</button><button type="button" className="kmx-btn sec" onClick={() => setCancelAsk(false)}>Không</button></div>
              </div>
            )}
          </div>
        </div></div>
        <div className="kmx-foot">
          <button type="button" className="kmx-btn" disabled={!ready || busy === 'tra'} onClick={traVaKy}>{I.pen}{busy === 'tra' ? 'Đang ghi…' : 'Ghi trả và ký bên giao'}</button>
          <span className="kmx-sm kmx-center">Một chạm = ghi {kgRetN !== null && kgRetOk ? `${fmtKg(kgRetN)} kg trả` : 'kg trả'} + chữ ký 1/3 của bạn</span>
        </div>
      </div>
    )
  }

  // ── DÒNG THỜI GIAN phiếu ──
  const thumbs = (list: RawPhoto[]) => list.filter((p) => p.public_url).map((p) => (
    <button key={p.id} type="button" className="kmx-thumb" aria-label={`Xem ảnh ${p.kind}`} onClick={() => setBig({ src: p.public_url!, cap: `${p.kind === 'toan_canh' ? 'Toàn cảnh' : p.kind === 'man_hinh_can' ? 'Màn hình cân' : 'Bổ sung'} · ${fmtDt(p.taken_at)}` })}><img src={p.public_url!} alt="" /></button>
  ))
  const chip = STATUS_CHIP[st]
  const qsDot = st === 'cancelled' ? 'red' : i.qc_confirmed_at ? 'done' : st === 'submitted' ? 'now' : 'todo'
  const khoDot = st === 'cancelled' ? 'red' : i.received_at ? 'done' : st === 'qc_confirmed' ? 'now' : 'todo'

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <button type="button" className="kmx-back" aria-label="Về trang chính" onClick={() => nav('/m/kho/chen')}>{I.back}</button>
        <div className="kmx-hd-txt"><span className="kmx-eyebrow">{lan ? `Lần ${lan} · ` : 'Phiếu chèn · '}{caTo}</span><span className="kmx-title kmx-mono" style={{ fontSize: 19 }}>{i.code}</span></div>
        <span className={`kmx-chip ${chip.cls}`} style={{ flex: '0 0 auto' }}>{chip.text}</span>
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        {msg && <div className={`kmx-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        <section className="kmx-card" aria-label="Số liệu" style={{ gap: 10 }}>
          <div className="kmx-grid3">
            <div className="kmx-col kmx-center"><span className="kmx-lbl">Lấy</span><span className="kmx-num md">{fmtKg(i.kg_out)}</span></div>
            <div className="kmx-col kmx-center"><span className="kmx-lbl">Trả</span><span className="kmx-num md">{i.kg_return === null ? '—' : fmtKg(i.kg_return)}</span></div>
            <div className="kmx-col kmx-center kmx-stat ok"><span className="kmx-lbl ok">Tiêu hao</span><span className="kmx-num md ok">{i.kg_used === null ? '—' : fmtKg(i.kg_used)}</span></div>
          </div>
          {i.kg_used !== null && <div className="kmx-bar" style={{ height: 10 }}><span style={{ width: `${Math.min(pct, 100)}%` }} /></div>}
          <span className="kmx-md">Lô <span className="kmx-mono" style={{ fontWeight: 700, color: '#0D2E25' }}>{i.lot_so_lo || i.lot_code}</span>{i.lot_so_lo ? <span className="kmx-sm kmx-mono"> {i.lot_code}</span> : null} · {MIX_SOURCE_LABELS[i.source_type].toLowerCase()}{i.lot_grade ? ` · ${i.lot_grade}` : ''}{i.po !== null ? ` · Po ${i.po}` : ''} · {MIX_PURPOSE_LABELS[i.purpose].toLowerCase()}{i.target_index ? ` ${i.target_index}${i.target_value !== null ? ' → ' + i.target_value : ''}` : ''}</span>
          <div className="kmx-row" style={{ alignItems: 'center' }}>
            <span className="kmx-md">{i.vi_tri ? <>Chèn <b>{MIX_VI_TRI_LABELS[i.vi_tri]}</b> · </> : null}Chèn vào mã: {i.ma_goc_all ? <b className="kmx-mono" style={{ color: '#0D2E25' }}>{i.ma_goc_all}</b> : <span style={{ color: '#B45309' }}>chưa gắn · lấy theo phiếu ca khi thủ kho nhận</span>}{i.so_banh !== null ? ` · ${i.so_banh} bành` : ''}{i.gross_kg !== null ? ` · cả pallet ${kgTxt(i.gross_kg)} − bì ${kgTxt(i.pallet_kg ?? 0)}` : ''}{i.so_banh_tra !== null ? ` · còn ${i.so_banh_tra} bành` : ''}</span>
            {!['received', 'cancelled'].includes(st) && (role.khaiBao || role.duyetQc || role.nhanKho) && <button type="button" className="kmx-pill sm" onClick={moDoiMa}>{doiMa ? 'Đóng' : 'Đổi mã'}</button>}
          </div>
          {doiMa && (
            <div className="kmx-col" style={{ gap: 8 }}>
              <div className="kmx-seg">
                <button type="button" className={viTriChon === 'be_slap' ? 'on' : ''} onClick={() => setViTriChon('be_slap')}>Chèn bể Slap</button>
                <button type="button" className={viTriChon === 'may_mix' ? 'on' : ''} onClick={() => setViTriChon('may_mix')}>Chèn máy Mix</button>
              </div>
              {maList === null ? <div className="kmx-skel" /> : maList.length ? <div className="kmx-seg">{maList.map((m) => <button key={m.raw_lot_id} type="button" className={maChon.includes(m.raw_lot_id) ? 'on' : ''} onClick={() => setMaChon((c) => (c.includes(m.raw_lot_id) ? c.filter((x) => x !== m.raw_lot_id) : [...c, m.raw_lot_id]))}>{m.ma}{m.trang_thai === 'dang_chay' ? ' · đang chạy' : ''}</button>)}</div> : <span className="kmx-sm">Kho NVL không có mã nào đang mở.</span>}
              <span className="kmx-sm">Chọn nhiều mã nếu ca chèn chung (kg chia đều). Bỏ hết = máy lấy theo phiếu ca.</span>
              <button type="button" className="kmx-btn sec" style={{ background: '#1B4D3E', color: '#fff' }} disabled={busy === 'ma'} onClick={async () => { await run('ma', () => mixService.doiMaGoc(i.id, maChon, viTriChon), maChon.length ? 'Đã đổi mã gốc' : 'Đã bỏ mã gốc, máy sẽ lấy theo phiếu ca'); setDoiMa(false) }}>Lưu</button>
            </div>
          )}
          {i.out_edit_at && <span className="kmx-sm" style={{ color: '#B45309', fontWeight: 600 }}>Đã sửa cân lúc lấy: {kgTxt(i.out_kg_truoc)} → {kgTxt(i.kg_out)} kg · {i.out_edit_name || ''} · {fmtDt(i.out_edit_at)}</span>}
          {i.note && <span className="kmx-sm">Ghi chú: {i.note}</span>}
        </section>
        {suaLayBox()}

        <section className="kmx-card" aria-label="Dòng thời gian" style={{ gap: 0 }}>
          <div className="kmx-tl"><span className="kmx-tl-dot done">{I.checkSm}</span><div className="kmx-tl-body">
            <span className="kmx-row"><span className="kmx-strong">Lấy đầu ca · {fmtKg(i.kg_out)} kg</span><span className="kmx-sm">{hm(i.out_at)}</span></span>
            <span className="kmx-sm">{i.out_name || ''}{i.team ? ` · Tổ ${i.team}` : ''}{missOut.length ? ` · thiếu ${missOut.length} ảnh` : ''}</span>
            {pOut.length > 0 && <div className="kmx-thumbs">{thumbs(pOut)}</div>}
          </div></div>
          <div className={`kmx-tl${i.return_at ? '' : ' todo'}`}><span className={`kmx-tl-dot ${i.return_at ? 'done' : 'todo'}`}>{i.return_at ? I.checkSm : '·'}</span><div className="kmx-tl-body">
            <span className="kmx-row"><span className="kmx-strong" style={i.return_at ? undefined : { color: '#6B7280' }}>Trả cuối ca{i.return_at ? ` · ${fmtKg(i.kg_return)} kg` : ''}</span><span className="kmx-sm">{hm(i.return_at)}</span></span>
            {i.return_at && <span className="kmx-sm">{i.return_name || ''} · {i.handover_to_next ? 'để lại dây chuyền, bàn giao ca sau' : (i.kg_return ?? 0) <= 0.005 ? 'dùng hết, không cần ảnh trả' : 'về kho, không bàn giao'}{missRetEff.length ? ` · thiếu ${missRetEff.length} ảnh` : ''}</span>}
            {pRet.length > 0 && <div className="kmx-thumbs">{thumbs(pRet)}</div>}
          </div></div>
          <div className={`kmx-tl${i.submitted_at ? '' : ' todo'}`}><span className={`kmx-tl-dot ${i.submitted_at ? 'done' : st === 'returned' ? 'now' : 'todo'}`}>{i.submitted_at ? I.checkSm : '1'}</span><div className="kmx-tl-body">
            <span className="kmx-row"><span className="kmx-strong" style={i.submitted_at ? undefined : { color: st === 'returned' ? '#B45309' : '#6B7280' }}>QS ký khai báo{!i.submitted_at && st === 'returned' ? ' · đang chờ' : ''}</span><span className="kmx-sm">{hm(i.submitted_at)}</span></span>
            <span className="kmx-sm">{i.submitted_name || (st === 'returned' ? 'QS được phân công' : '')}</span>
          </div></div>
          <div className={`kmx-tl${i.qc_confirmed_at ? '' : ' todo'}`}><span className={`kmx-tl-dot ${qsDot}`}>{i.qc_confirmed_at ? I.checkSm : '2'}</span><div className="kmx-tl-body">
            <span className="kmx-row"><span className="kmx-strong" style={i.qc_confirmed_at ? undefined : { color: st === 'submitted' ? '#B45309' : '#6B7280' }}>QC duyệt{st === 'submitted' ? ' · đang chờ' : ''}</span><span className="kmx-sm">{hm(i.qc_confirmed_at)}</span></span>
            <span className="kmx-sm">{i.qc_confirmed_name || 'QC được phân công'}</span>
          </div></div>
          <div className="kmx-tl last todo"><span className={`kmx-tl-dot ${khoDot}`}>{i.received_at ? I.checkSm : '3'}</span><div className="kmx-tl-body">
            <span className="kmx-row"><span className="kmx-strong" style={i.received_at ? undefined : { color: st === 'qc_confirmed' ? '#B45309' : '#6B7280' }}>Thủ kho nhận · trừ kho chèn{st === 'qc_confirmed' ? ' · đang chờ' : ''}</span><span className="kmx-sm">{hm(i.received_at)}</span></span>
            <span className="kmx-sm">{i.received_name || (st === 'received' ? '' : 'Chưa đến lượt')}</span>
          </div></div>
          {st === 'cancelled' && <div className="kmx-note red" style={{ marginTop: 8 }}>{I.info}<span>Đã hủy{i.cancel_reason ? `: ${i.cancel_reason}` : ''}. Kg lấy đã trả về tồn kho chèn.</span></div>}
        </section>

        {st === 'returned' && (
          <section className="kmx-card" aria-label="Ký khai báo" style={{ gap: 10 }}>
            <h2 className="kmx-h2">Bước 1/3 · QS ký khai báo</h2>
            {(missOut.length > 0 || missRetEff.length > 0) && <div className="kmx-note red" style={{ padding: '8px 10px' }}>{I.info}<span>Thiếu ảnh bắt buộc{missOut.length ? ` lúc lấy (${missOut.length})` : ''}{missRetEff.length ? ` lúc trả (${missRetEff.length})` : ''}. Chụp đủ rồi mới ký được.</span></div>}
            {missOut.length > 0 && <KmxPhotoTiles refType="mix_issue_out" refId={i.id} photos={pOut} required={required} facilityCode={i.facility_code || undefined} onChange={load} onError={(t) => setMsg({ ok: false, text: t })} />}
            {missRetEff.length > 0 && <KmxPhotoTiles refType="mix_issue_return" refId={i.id} photos={pRet} required={required} facilityCode={i.facility_code || undefined} labels={{ toan_canh: 'Toàn cảnh phần trả', man_hinh_can: 'Màn hình cân' }} onChange={load} onError={(t) => setMsg({ ok: false, text: t })} />}
            <button type="button" className="kmx-btn md" disabled={!canSubmit || missOut.length > 0 || missRetEff.length > 0 || busy === 'submit'} onClick={() => ky('submit')}>{I.pen}Ký khai báo (QS)</button>
            {!editRet ? <button type="button" className="kmx-btn sec" onClick={() => { setKgRet(String(i.kg_return ?? '')); setHandover(i.handover_to_next); setEditRet(true) }}>Sửa kg trả</button> : (
              <div className="kmx-col" style={{ gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><input className="kmx-input" type="number" inputMode="decimal" value={kgRet} onChange={(e) => { setKgRet(e.target.value); setRetSoBanh('') }} aria-label="Kg trả" /><span style={{ fontSize: 18, fontWeight: 700, color: '#6B7280' }}>kg</span></div>
                {settings.chen_ban_giao_ca && <label className="kmx-check-row" htmlFor="kmx-handover2"><input id="kmx-handover2" type="checkbox" checked={handover} onChange={(e) => setHandover(e.target.checked)} /><span>Để lại dây chuyền cho ca sau</span></label>}
                <div className="kmx-grid2">
                  <button type="button" className="kmx-btn sec" style={{ background: '#1B4D3E', color: '#fff' }} disabled={!kgRetOk || busy === 'sua'} onClick={async () => { await run('sua', () => mixService.tra(i.id, kgRetN!, handover, null), 'Đã sửa kg trả'); setEditRet(false) }}>Lưu</button>
                  <button type="button" className="kmx-btn sec" onClick={() => setEditRet(false)}>Thôi</button>
                </div>
              </div>
            )}
          </section>
        )}
        {st === 'submitted' && (
          <section className="kmx-card" aria-label="QC duyệt" style={{ gap: 8 }}>
            <h2 className="kmx-h2">Bước 2/3 · QC duyệt</h2>
            {canQc ? <button type="button" className="kmx-btn md" disabled={busy === 'qc_confirm'} onClick={() => ky('qc_confirm')}>{I.check}Duyệt QC</button> : <span className="kmx-md">Chờ QC được phân công duyệt.</span>}
          </section>
        )}
        {st === 'qc_confirmed' && (
          <section className="kmx-card" aria-label="Thủ kho nhận" style={{ gap: 8 }}>
            <h2 className="kmx-h2">Bước 3/3 · thủ kho nhận</h2>
            {canReceive ? <button type="button" className="kmx-btn md" disabled={busy === 'receive'} onClick={() => ky('receive')}>{I.intake}Nhận · trừ kho chèn {fmtKg(i.kg_used)} kg</button> : <span className="kmx-md">Chờ thủ kho được phân công nhận. Sau bước này kho chèn mới trừ và sổ ca tự điền dòng CHÈN.</span>}
          </section>
        )}

        {st !== 'received' && st !== 'cancelled' && (
          <div className="kmx-col" style={{ gap: 8 }}>
            {!cancelAsk ? <button type="button" className="kmx-btn danger" onClick={() => setCancelAsk(true)}>Hủy phiếu</button> : (
              <div className="kmx-card" style={{ borderColor: '#FECACA' }}>
                <input className="kmx-text" placeholder="Lý do hủy" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} aria-label="Lý do hủy" />
                <div className="kmx-grid2"><button type="button" className="kmx-btn red" disabled={busy === 'cancel'} onClick={() => run('cancel', () => mixService.ky(i.id, 'cancel', cancelReason.trim() || null), 'Đã hủy phiếu, kg trả về tồn kho chèn')}>Xác nhận hủy</button><button type="button" className="kmx-btn sec" onClick={() => setCancelAsk(false)}>Không</button></div>
              </div>
            )}
            <span className="kmx-sm kmx-center">Hủy thì {fmtKg(i.kg_out)} kg trả về tồn kho chèn. Sửa kg trả chỉ được trước khi QS ký.</span>
          </div>
        )}
      </div></div>
      {big && <Lightbox src={big.src} caption={big.cap} onClose={() => setBig(null)} />}
    </div>
  )
}
