// ============================================================================
// KhoMixLotNew — đưa hàng vào kho chèn từ điện thoại, theo nguồn (audit C3, 30/10/2026):
//   · Hàng lỗi / Dính kim loại: chạm dòng LOI/DKL của sổ ca đã nhận (kg còn chưa chuyển) hoặc dòng sổ QC hàng không đạt
//   · Hàng chuẩn: chạm chủng loại còn trong kho TP → tạo lô chèn + tự ghi XUẤT BÀNH vào phiếu ca nháp của ca này
//   · Mua ngoài / khác: gõ tay như cũ
// File: src/pages/mobile/kho/KhoMixLotNew.tsx · Route: /m/kho/chen/kho/nhap
// ============================================================================
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../../stores/authStore'
import { mixService, MIX_SOURCE_LABELS, type MixNguonLoi, type MixNguonQc, type MixNguonTp, type MixSourceType } from '../../../services/wms/mixService'
import type { OpsShiftOption } from '../../../services/opsService'
import { fgLotService, FG_QC_LABELS, type FgLot } from '../../../services/wms/fgLotService'
import { fmtD, fmtKg, todayLocal, useKhoFacility } from './khoCommon'
import { detectShift, hhmm, I, type ShiftPick } from './khoMixUtil'
import './khoMix.css'

const GRADES = ['SVR 3L', 'SVR 5', 'SVR 10', 'SVR 20', 'SVR CV50', 'SVR CV60', 'SVR L', 'RSS 3', 'SBR 1502']
type Mode = 'lo_tp' | 'so_ca' | 'so_qc' | 'tay'

export default function KhoMixLotNew() {
  const nav = useNavigate()
  const { facilityId, facility } = useKhoFacility()
  const user = useAuthStore((s) => s.user)
  const [sourceType, setSourceType] = useState<MixSourceType>('loi')
  const [mode, setMode] = useState<Mode>('lo_tp')
  const [tpLoi, setTpLoi] = useState<FgLot[]>([])
  const [pickFg, setPickFg] = useState<FgLot | null>(null)
  const [banh, setBanh] = useState('')
  // nguồn
  const [loi, setLoi] = useState<MixNguonLoi[]>([])
  const [qc, setQc] = useState<MixNguonQc[]>([])
  const [tp, setTp] = useState<MixNguonTp[]>([])
  const [pickLine, setPickLine] = useState<MixNguonLoi | null>(null)
  const [pickQc, setPickQc] = useState<MixNguonQc | null>(null)
  const [pickTp, setPickTp] = useState<MixNguonTp | null>(null)
  const [shift, setShift] = useState<ShiftPick | null>(null)
  const [shifts, setShifts] = useState<OpsShiftOption[]>([])
  const [pickShift, setPickShift] = useState(false)
  // gõ tay
  const [desc, setDesc] = useState('')
  const [grade, setGrade] = useState('')
  const [gradeOther, setGradeOther] = useState(false)
  const [kg, setKg] = useState('')
  const [date, setDate] = useState(todayLocal())
  const [more, setMore] = useState(false)
  const [po, setPo] = useState(''); const [mooney, setMooney] = useState(''); const [pri, setPri] = useState('')
  const [mixPct, setMixPct] = useState('')
  const [rerun, setRerun] = useState(true)
  const [metal, setMetal] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!facilityId) return
    let alive = true
    Promise.all([mixService.listNguonLoi(facilityId), mixService.listNguonQc(facilityId), mixService.listNguonTp(facilityId), detectShift(user?.employee_id || null), fgLotService.list(facilityId, { qc: ['cxl', 'loai'], onlyTon: true }).catch(() => [] as FgLot[])])
      .then(([a, b, c, d, f]) => { if (!alive) return; setLoi(a); setQc(b); setTp(c); setShifts(d.shifts); setShift(d.pick); setTpLoi(f) })
      .catch((e) => alive && setMsg(e?.message || 'Không tải được nguồn hàng'))
    return () => { alive = false }
  }, [facilityId]) // eslint-disable-line react-hooks/exhaustive-deps

  const kgN = kg === '' ? null : Number(kg)
  const kgOk = kgN !== null && Number.isFinite(kgN) && kgN > 0
  const num = (s: string) => (s.trim() === '' ? null : Number.isFinite(Number(s)) ? Number(s) : null)
  const code = (s: string) => s.replace(/ \(.*\)/, '')
  const done = (text: string) => nav('/m/kho/chen/kho', { replace: true, state: { msg: text } })

  const chonNguon = (t: MixSourceType) => { setSourceType(t); setPickLine(null); setPickQc(null); setPickTp(null); setPickFg(null); setKg(''); setMsg(null); setMode(t === 'loi' || t === 'dkl' ? 'lo_tp' : 'tay') }
  async function ghiTuFg() {
    if (!pickFg) return
    const n = Number(banh)
    if (!Number.isInteger(n) || n <= 0 || n > pickFg.ton_banh) { setMsg(`Số bành phải từ 1 đến ${pickFg.ton_banh}`); return }
    setBusy(true); setMsg(null)
    try { await fgLotService.chuyenChen(pickFg.id, n, note.trim() || null, pickFg.material_code === 'DKL' ? metal : null); done(`Đã chuyển ${n} bành lô ${pickFg.so_lo} (${fmtKg(n * pickFg.kg_per_banh)} kg) vào kho chèn`) }
    catch (e: any) { setMsg(e?.message || 'Không chuyển được') }
    finally { setBusy(false) }
  }

  async function ghiTay() {
    if (!facilityId || !kgOk) return
    setBusy(true); setMsg(null)
    try {
      await mixService.createLot({ facilityId, sourceType, sourceDesc: desc.trim() || null, grade: grade.trim() || null, kgIn: kgN!, po: num(po), mooney: num(mooney), pri: num(pri), qcAllowMixPct: num(mixPct), qcAllowRerun: rerun, metalCleared: sourceType === 'dkl' ? metal : true, receivedDate: date || null, note: note.trim() || null })
      done(`Đã nhập lô chèn ${fmtKg(kgN)} kg (${code(MIX_SOURCE_LABELS[sourceType])})`)
    } catch (e: any) { setMsg(e?.message || 'Không nhập được') }
    finally { setBusy(false) }
  }
  async function ghiTuSoCa() {
    if (!pickLine || !kgOk) return
    setBusy(true); setMsg(null)
    try { await mixService.taoLoTuSoCa(pickLine.line_id, kgN, note.trim() || null, pickLine.material_code === 'DKL' ? metal : true); done(`Đã chuyển ${fmtKg(kgN)} kg ${pickLine.material_name} (${pickLine.shift_name || ''} ${fmtD(pickLine.report_date)}) vào kho chèn`) }
    catch (e: any) { setMsg(e?.message || 'Không chuyển được') }
    finally { setBusy(false) }
  }
  async function ghiTuQc() {
    if (!pickQc || !kgOk) return
    setBusy(true); setMsg(null)
    try { await mixService.taoLoTuQc(pickQc.reject_id, kgN!, note.trim() || null, true); done(`Đã chuyển ${fmtKg(kgN)} kg hàng không đạt (lô SX ${pickQc.so_lo || '?'}) vào kho chèn`) }
    catch (e: any) { setMsg(e?.message || 'Không chuyển được') }
    finally { setBusy(false) }
  }
  async function ghiHangChuan() {
    if (!facilityId || !pickTp || !kgOk) return
    if (!shift) { setMsg('Chọn ca để ghi xuất bành vào phiếu ca'); return }
    setBusy(true); setMsg(null)
    try { const r = await mixService.layHangChuan({ facilityId, materialId: pickTp.material_id, kg: kgN!, shiftDate: todayLocal(), shiftId: shift.id, note: note.trim() || null }); done(`Đã chuyển ${r.banh} bành ${r.material} (${fmtKg(r.kg)} kg) sang kho chèn, phiếu ca đã ghi xuất bành`) }
    catch (e: any) { setMsg(e?.message || 'Không chuyển được') }
    finally { setBusy(false) }
  }

  const banhTp = pickTp && kgOk && pickTp.weight_per_unit ? Math.max(Math.round(kgN! / pickTp.weight_per_unit), 1) : null

  const KgBox = ({ id, hint }: { id: string; hint?: string }) => (
    <section className="kmx-card" style={{ gap: 8 }}>
      <label htmlFor={id} className="kmx-strong" style={{ fontSize: 13 }}>Khối lượng (kg)</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input id={id} className="kmx-input" type="number" inputMode="decimal" placeholder="0" value={kg} onChange={(e) => setKg(e.target.value)} />
        <span style={{ fontSize: 18, fontWeight: 700, color: '#6B7280' }}>kg</span>
      </div>
      {hint && <span className="kmx-sm">{hint}</span>}
      <input className="kmx-text" placeholder="Ghi chú (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Ghi chú" />
    </section>
  )

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <button type="button" className="kmx-back" aria-label="Quay lại kho chèn" onClick={() => nav('/m/kho/chen/kho')}>{I.back}</button>
        <div className="kmx-hd-txt"><span className="kmx-eyebrow">Kho chèn · {facility?.code || ''}</span><span className="kmx-title">Đưa hàng vào kho chèn</span></div>
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        {msg && <div className="kmx-msg err">{msg}</div>}
        <section className="kmx-card" aria-label="Nguồn hàng" style={{ gap: 10 }}>
          <span className="kmx-lbl">Hàng từ đâu</span>
          <div className="kmx-seg">
            {(Object.keys(MIX_SOURCE_LABELS) as MixSourceType[]).map((k) => <button key={k} type="button" className={sourceType === k ? 'on' : ''} onClick={() => chonNguon(k)}>{code(MIX_SOURCE_LABELS[k])}</button>)}
          </div>
          {(sourceType === 'loi' || sourceType === 'dkl') && (
            <div className="kmx-seg">
              <button type="button" className={mode === 'lo_tp' ? 'on' : ''} style={{ height: 40, fontSize: 13 }} onClick={() => { setMode('lo_tp'); setPickLine(null); setPickQc(null) }}>Lô TP lỗi · {tpLoi.filter((f) => sourceType === 'dkl' ? f.material_code === 'DKL' : f.material_code !== 'DKL').length}</button>
              <button type="button" className={mode === 'so_ca' ? 'on' : ''} style={{ height: 40, fontSize: 13 }} onClick={() => { setMode('so_ca'); setPickQc(null); setPickFg(null) }}>Từ sổ ca · {loi.filter((l) => l.material_code === (sourceType === 'loi' ? 'LOI' : 'DKL')).length}</button>
              {sourceType === 'loi' && <button type="button" className={mode === 'so_qc' ? 'on' : ''} style={{ height: 40, fontSize: 13 }} onClick={() => { setMode('so_qc'); setPickLine(null) }}>Từ sổ QC · {qc.filter((q) => !q.da_chuyen).length}</button>}
              <button type="button" className={mode === 'tay' ? 'on' : ''} style={{ height: 40, fontSize: 13 }} onClick={() => { setMode('tay'); setPickLine(null); setPickQc(null) }}>Gõ tay</button>
            </div>
          )}
        </section>

        {/* ── Lô thành phẩm lỗi (GĐ7) ── */}
        {(sourceType === 'loi' || sourceType === 'dkl') && mode === 'lo_tp' && !pickFg && (
          <>
            <h2 className="kmx-h2" style={{ padding: '0 2px' }}>Lô TP bị QC đánh CXL / Loại · chạm để chuyển</h2>
            {!tpLoi.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Không có lô TP lỗi còn tồn. Dùng "Từ sổ ca" hoặc "Gõ tay".</div>}
            {tpLoi.filter((f) => sourceType === 'dkl' ? f.material_code === 'DKL' : f.material_code !== 'DKL').map((f) => (
              <button key={f.id} type="button" className="kmx-card press" style={{ font: 'inherit', textAlign: 'left', width: '100%' }} onClick={() => { setPickFg(f); setBanh(String(f.ton_banh)) }}>
                <span className="kmx-row"><span className="kmx-mono" style={{ fontSize: 15, fontWeight: 700, color: '#0D2E25' }}>{f.so_lo}</span><span className={`kmx-chip ${f.qc_status === 'loai' ? 'red' : 'amb'}`}>{FG_QC_LABELS[f.qc_status]}</span></span>
                <span className="kmx-row" style={{ alignItems: 'flex-end' }}>
                  <span className="kmx-col"><span style={{ fontSize: 14, fontWeight: 600 }}>{f.material_name}{f.ma_nvl ? ` · NVL ${f.ma_nvl}` : ''}</span><span className="kmx-sm">{fmtD(f.shift_date)}{f.team ? ` · tổ ${f.team}` : ''}{f.qc_ly_do ? ` · ${f.qc_ly_do}` : ''}</span></span>
                  <span className="kmx-col" style={{ alignItems: 'flex-end' }}><span className="kmx-num lg">{f.ton_banh}</span><span className="kmx-sm" style={{ fontWeight: 600 }}>bành · {fmtKg(f.ton_kg)} kg</span></span>
                </span>
              </button>
            ))}
          </>
        )}
        {pickFg && (
          <>
            <div className="kmx-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="kmx-col"><span className="kmx-lbl">Đã chọn · lô TP</span><span className="kmx-strong kmx-mono">{pickFg.so_lo}</span><span className="kmx-sm">{pickFg.material_name} · còn {pickFg.ton_banh} bành · {pickFg.kg_per_banh} kg/bành</span></span>
              <button type="button" className="kmx-pill sm" onClick={() => { setPickFg(null); setBanh('') }}>Đổi</button>
            </div>
            <section className="kmx-card" style={{ gap: 8 }}>
              <label htmlFor="fg-banh" className="kmx-strong" style={{ fontSize: 13 }}>Số bành chuyển</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><input id="fg-banh" className="kmx-input" type="number" inputMode="numeric" value={banh} onChange={(e) => setBanh(e.target.value)} /><span style={{ fontSize: 18, fontWeight: 700, color: '#6B7280' }}>bành</span></div>
              <div className="kmx-tint"><span>= {banh || 0} × {pickFg.kg_per_banh} kg</span><span className="kmx-num sm">{fmtKg(Number(banh || 0) * pickFg.kg_per_banh)} kg</span></div>
              {pickFg.material_code === 'DKL' && <label className="kmx-check-row" htmlFor="lot-metal3"><input id="lot-metal3" type="checkbox" checked={metal} onChange={(e) => setMetal(e.target.checked)} /><span><b>Đã xử lý kim loại</b></span></label>}
              <input className="kmx-text" placeholder="Ghi chú (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Ghi chú" />
            </section>
          </>
        )}

        {/* ── LOI / DKL từ sổ ca ── */}
        {(sourceType === 'loi' || sourceType === 'dkl') && mode === 'so_ca' && !pickLine && (
          <>
            <h2 className="kmx-h2" style={{ padding: '0 2px' }}>Dòng {sourceType === 'loi' ? 'LOI' : 'DKL'} của sổ ca đã nhận · chạm để chuyển</h2>
            {!loi.filter((l) => l.material_code === (sourceType === 'loi' ? 'LOI' : 'DKL')).length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Không còn dòng nào chưa chuyển trong 90 ngày. Dùng "Gõ tay" nếu hàng không qua sổ ca.</div>}
            {loi.filter((l) => l.material_code === (sourceType === 'loi' ? 'LOI' : 'DKL')).map((l) => (
              <button key={l.line_id} type="button" className="kmx-card press" style={{ font: 'inherit', textAlign: 'left', width: '100%' }} onClick={() => { setPickLine(l); setKg(String(Math.round(l.con_lai_kg))) }}>
                <span className="kmx-row"><span className="kmx-strong">{l.material_name} · {l.shift_name || 'ca ?'} {fmtD(l.report_date)}</span><span className={`kmx-chip ${l.material_code === 'DKL' ? 'red' : 'amb'}`}>{l.material_code}</span></span>
                <span className="kmx-row" style={{ alignItems: 'flex-end' }}>
                  <span className="kmx-sm">{l.team ? `Tổ ${l.team} · ` : ''}làm ra {l.nhap_banh} bành{l.nhap_kg !== null ? ` (${fmtKg(l.nhap_kg)} kg)` : ''}{l.da_chuyen_kg > 0 ? ` · đã chuyển ${fmtKg(l.da_chuyen_kg)}` : ''}</span>
                  <span className="kmx-col" style={{ alignItems: 'flex-end' }}><span className="kmx-num lg">{fmtKg(l.con_lai_kg)}</span><span className="kmx-sm" style={{ fontWeight: 600 }}>kg chưa chuyển</span></span>
                </span>
              </button>
            ))}
          </>
        )}
        {pickLine && (
          <>
            <div className="kmx-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="kmx-col"><span className="kmx-lbl">Đã chọn</span><span className="kmx-strong">{pickLine.material_name} · {pickLine.shift_name || ''} {fmtD(pickLine.report_date)}{pickLine.team ? ` · Tổ ${pickLine.team}` : ''}</span><span className="kmx-sm">chưa chuyển {fmtKg(pickLine.con_lai_kg)} kg</span></span>
              <button type="button" className="kmx-pill sm" onClick={() => { setPickLine(null); setKg('') }}>Đổi</button>
            </div>
            <KgBox id="kg-soca" hint={kgOk && kgN! > pickLine.con_lai_kg + 0.01 ? `Nhiều hơn phần chưa chuyển (${fmtKg(pickLine.con_lai_kg)} kg)` : 'Mặc định = phần chưa chuyển; sửa nếu chỉ chuyển một phần'} />
            {pickLine.material_code === 'DKL' && <label className="kmx-check-row kmx-card" htmlFor="lot-metal2"><input id="lot-metal2" type="checkbox" checked={metal} onChange={(e) => setMetal(e.target.checked)} /><span><b>Đã xử lý kim loại</b><br /><span className="kmx-sm">Chưa tick thì vào kho nhưng chưa lấy chèn được.</span></span></label>}
          </>
        )}

        {/* ── Hàng không đạt từ sổ QC ── */}
        {sourceType === 'loi' && mode === 'so_qc' && !pickQc && (
          <>
            <h2 className="kmx-h2" style={{ padding: '0 2px' }}>Sổ QC hàng không đạt · chạm để chuyển</h2>
            {!qc.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Sổ QC chưa có dòng nào trong 90 ngày.</div>}
            {qc.map((q) => (
              <button key={q.reject_id} type="button" className={`kmx-card${q.da_chuyen ? ' muted' : ' press'}`} disabled={q.da_chuyen} style={{ font: 'inherit', textAlign: 'left', width: '100%' }} onClick={() => { setPickQc(q); setKg('') }}>
                <span className="kmx-row"><span className="kmx-strong">{fmtD(q.ngay_sx)} · lô SX {q.so_lo || '?'}{q.to_sx ? ` · tổ ${q.to_sx}` : ''}</span><span className={`kmx-chip ${q.da_chuyen ? 'mut' : q.tinh_trang === 'LOAI' ? 'red' : 'amb'}`}>{q.da_chuyen ? `đã chuyển ${q.lot_code || ''}` : q.tinh_trang === 'LOAI' ? 'Loại' : 'Chờ xử lý'}</span></span>
                <span className="kmx-sm">{q.ly_do || 'không ghi lý do'}{q.po_min !== null || q.po_max !== null ? ` · Po ${q.po_min ?? ''}–${q.po_max ?? ''}` : ''}{q.ma_nguyen_lieu ? ` · NVL ${q.ma_nguyen_lieu}` : ''}</span>
              </button>
            ))}
          </>
        )}
        {pickQc && (
          <>
            <div className="kmx-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="kmx-col"><span className="kmx-lbl">Đã chọn · sổ QC</span><span className="kmx-strong">{fmtD(pickQc.ngay_sx)} · lô SX {pickQc.so_lo || '?'}</span><span className="kmx-sm">{pickQc.ly_do || ''}</span></span>
              <button type="button" className="kmx-pill sm" onClick={() => { setPickQc(null); setKg('') }}>Đổi</button>
            </div>
            <KgBox id="kg-qc" hint="Sổ QC không ghi kg: cân rồi gõ số thật" />
          </>
        )}

        {/* ── Hàng chuẩn từ kho TP ── */}
        {sourceType === 'std' && !pickTp && (
          <>
            <h2 className="kmx-h2" style={{ padding: '0 2px' }}>Chủng loại còn trong kho thành phẩm · chạm để chuyển</h2>
            {!tp.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Kho TP (theo sổ ca đã nhận) đang trống.</div>}
            {tp.map((t) => (
              <button key={t.material_id} type="button" className="kmx-card press" style={{ font: 'inherit', textAlign: 'left', width: '100%' }} onClick={() => { setPickTp(t); setKg('') }}>
                <span className="kmx-row" style={{ alignItems: 'flex-end' }}>
                  <span className="kmx-col"><span className="kmx-strong">{t.material_name}</span><span className="kmx-sm">{t.code}{t.weight_per_unit ? ` · ${t.weight_per_unit} kg/bành` : ' · chưa khai cỡ bành'}</span></span>
                  <span className="kmx-col" style={{ alignItems: 'flex-end' }}><span className="kmx-num lg">{t.ton_banh}</span><span className="kmx-sm" style={{ fontWeight: 600 }}>bành · {fmtKg(t.ton_kg)} kg</span></span>
                </span>
              </button>
            ))}
          </>
        )}
        {pickTp && (
          <>
            <div className="kmx-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="kmx-col"><span className="kmx-lbl">Đã chọn · kho TP</span><span className="kmx-strong">{pickTp.material_name}</span><span className="kmx-sm">còn {pickTp.ton_banh} bành · {fmtKg(pickTp.ton_kg)} kg</span></span>
              <button type="button" className="kmx-pill sm" onClick={() => { setPickTp(null); setKg('') }}>Đổi</button>
            </div>
            <KgBox id="kg-tp" hint={banhTp ? `= ${banhTp} bành × ${pickTp.weight_per_unit} kg = ${fmtKg(banhTp * (pickTp.weight_per_unit || 0))} kg (làm tròn theo bành)` : 'Máy quy ra số bành theo cỡ bành'} />
            <section className="kmx-card" aria-label="Ca ghi xuất bành" style={{ gap: 10, borderColor: shift ? '#E5E7EB' : '#FECACA' }}>
              <div className="kmx-row">
                <span className="kmx-col"><span className="kmx-lbl">Ghi xuất bành vào phiếu ca</span><span className="kmx-strong" style={{ fontSize: 15 }}>{shift ? `${shift.name}${shift.start_time ? ` · ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : ''}` : 'Chưa chọn ca'}</span><span className="kmx-sm">Phiếu ca của ca này phải đang là NHÁP (chưa ký)</span></span>
                <button type="button" className="kmx-pill sm" onClick={() => setPickShift((v) => !v)}>{pickShift ? 'Đóng' : 'Đổi ca'}</button>
              </div>
              {pickShift && <div className="kmx-seg">{shifts.map((s) => <button key={s.id} type="button" className={shift?.id === s.id ? 'on' : ''} onClick={() => { setShift({ id: s.id, name: s.name, code: s.code, start_time: s.start_time, end_time: s.end_time, nguon: 'tay' }); setPickShift(false) }}>{s.name}</button>)}</div>}
            </section>
          </>
        )}

        {/* ── Gõ tay ── */}
        {(mode === 'tay' || sourceType === 'mua_ngoai' || sourceType === 'khac') && !pickLine && !pickQc && !pickFg && (
          <>
            <section className="kmx-card" aria-label="Mô tả" style={{ gap: 10 }}>
              <div className="kmx-col" style={{ gap: 4 }}>
                <label htmlFor="lot-desc" className="kmx-lbl">Mô tả</label>
                <input id="lot-desc" className="kmx-text" placeholder={sourceType === 'loi' ? 'Ví dụ: Po thấp tổ Đen 27/10' : sourceType === 'mua_ngoai' ? 'Ví dụ: Cty Đại Lộc' : 'Ví dụ: DKL ca 2'} value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>
              <div className="kmx-col" style={{ gap: 6 }}>
                <span className="kmx-lbl">Grade</span>
                <div className="kmx-seg">
                  {GRADES.map((g) => <button key={g} type="button" className={!gradeOther && grade === g ? 'on' : ''} style={{ minWidth: 0, height: 40, fontSize: 13 }} onClick={() => { setGrade(g); setGradeOther(false) }}>{g}</button>)}
                  <button type="button" className={gradeOther ? 'on' : ''} style={{ minWidth: 0, height: 40, fontSize: 13 }} onClick={() => { setGradeOther(true); setGrade('') }}>Khác…</button>
                </div>
                {gradeOther && <input className="kmx-text" placeholder="Grade" value={grade} onChange={(e) => setGrade(e.target.value)} aria-label="Grade khác" />}
              </div>
            </section>
            <section className="kmx-card" aria-label="Khối lượng" style={{ gap: 8 }}>
              <label htmlFor="lot-kg" className="kmx-strong" style={{ fontSize: 13 }}>Khối lượng nhập (kg)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input id="lot-kg" className="kmx-input" type="number" inputMode="decimal" placeholder="0" value={kg} onChange={(e) => setKg(e.target.value)} />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#6B7280' }}>kg</span>
              </div>
              <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="lot-date" className="kmx-lbl">Ngày nhập</label><input id="lot-date" className="kmx-text" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} /></div>
            </section>
            {sourceType === 'dkl' && (
              <section className="kmx-card" aria-label="Kim loại" style={{ borderColor: '#FECACA' }}>
                <label className="kmx-check-row" htmlFor="lot-metal"><input id="lot-metal" type="checkbox" checked={metal} onChange={(e) => setMetal(e.target.checked)} /><span><b>Đã xử lý kim loại</b><br /><span className="kmx-sm">Chưa tick thì nhập được nhưng chưa lấy chèn được; sau xử lý vào Kho chèn bấm mở.</span></span></label>
              </section>
            )}
            <section className="kmx-card" aria-label="Chỉ số và QC" style={{ gap: 10 }}>
              <button type="button" className="kmx-row" style={{ background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer', width: '100%' }} onClick={() => setMore((v) => !v)} aria-expanded={more}>
                <span className="kmx-strong" style={{ fontSize: 13 }}>Chỉ số và QC cho phép <span style={{ fontWeight: 500, color: '#6B7280' }}>(không bắt buộc)</span></span>
                <span style={{ transform: more ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>{I.chev}</span>
              </button>
              {more && (
                <>
                  <div className="kmx-grid3">
                    <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="lot-po" className="kmx-lbl">Po</label><input id="lot-po" className="kmx-text" type="number" inputMode="decimal" value={po} onChange={(e) => setPo(e.target.value)} /></div>
                    <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="lot-mooney" className="kmx-lbl">Mooney</label><input id="lot-mooney" className="kmx-text" type="number" inputMode="decimal" value={mooney} onChange={(e) => setMooney(e.target.value)} /></div>
                    <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="lot-pri" className="kmx-lbl">PRI</label><input id="lot-pri" className="kmx-text" type="number" inputMode="decimal" value={pri} onChange={(e) => setPri(e.target.value)} /></div>
                  </div>
                  <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="lot-mix" className="kmx-lbl">Trộn tối đa (%) · trống = không giới hạn</label><input id="lot-mix" className="kmx-text" type="number" inputMode="decimal" value={mixPct} onChange={(e) => setMixPct(e.target.value)} /></div>
                  <label className="kmx-check-row" htmlFor="lot-rerun"><input id="lot-rerun" type="checkbox" checked={rerun} onChange={(e) => setRerun(e.target.checked)} /><span>QC cho phép chạy lại</span></label>
                  <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="lot-note" className="kmx-lbl">Ghi chú</label><input id="lot-note" className="kmx-text" value={note} onChange={(e) => setNote(e.target.value)} /></div>
                </>
              )}
            </section>
          </>
        )}
      </div></div>
      <div className="kmx-foot">
        {pickFg ? <button type="button" className="kmx-btn" disabled={busy || !(Number(banh) > 0)} onClick={ghiTuFg}>{I.check}{busy ? 'Đang chuyển…' : `Chuyển ${banh || 0} bành vào kho chèn`}</button>
          : pickLine ? <button type="button" className="kmx-btn" disabled={!kgOk || busy || (kgN! > pickLine.con_lai_kg + 0.01)} onClick={ghiTuSoCa}>{I.check}{busy ? 'Đang chuyển…' : `Chuyển vào kho chèn · ${fmtKg(kgN)} kg`}</button>
          : pickQc ? <button type="button" className="kmx-btn" disabled={!kgOk || busy} onClick={ghiTuQc}>{I.check}{busy ? 'Đang chuyển…' : `Chuyển vào kho chèn · ${fmtKg(kgN)} kg`}</button>
          : pickTp ? <button type="button" className="kmx-btn" disabled={!kgOk || busy || !shift} onClick={ghiHangChuan}>{I.check}{busy ? 'Đang chuyển…' : banhTp ? `Chuyển ${banhTp} bành sang kho chèn` : 'Chuyển sang kho chèn'}</button>
          : (mode === 'tay' || sourceType === 'mua_ngoai' || sourceType === 'khac') ? <button type="button" className="kmx-btn" disabled={!kgOk || busy} onClick={ghiTay}>{I.check}{busy ? 'Đang nhập…' : kgOk ? `Nhập kho chèn · ${fmtKg(kgN)} kg` : 'Nhập kho chèn'}</button>
          : <span className="kmx-sm kmx-center">Chạm một dòng ở trên để chuyển vào kho chèn</span>}
      </div>
    </div>
  )
}
