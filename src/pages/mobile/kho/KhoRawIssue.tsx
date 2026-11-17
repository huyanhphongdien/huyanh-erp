// ============================================================================
// KhoRawIssue — XUẤT SẢN XUẤT THEO MÃ trên điện thoại (GĐ6): chọn mã → gõ MỘT số cân cho cả mã
// → máy chia về từng lô xe → lệnh tạo + ký bên giao trong một chạm; QC / thủ kho ký ở dưới.
// Bước 2 là vai QC (fn_nvl_duoc_ky('qc_confirm') = phòng HAP-QC / raw_qc_signers) — xem ghi chú ở
// rawIssueService.RAW_ISSUE_STATUS_LABELS (vai khai báo bước 1 của hàng chèn là vai KHÁC).
// File: src/pages/mobile/kho/KhoRawIssue.tsx · Route: /m/kho/xuat
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { rawLotService, RAW_LOT_TRANG_THAI_CHIP, RAW_LOT_TRANG_THAI_LABELS, type RawLotBalance } from '../../../services/wms/rawLotService'
import { rawIssueService, RAW_ISSUE_STATUS_COLORS, RAW_ISSUE_STATUS_LABELS, type ProductionOrderLite, type RawIssueOrder, type RawIssueStatus } from '../../../services/wms/rawIssueService'
import { useRawRole } from '../../../hooks/useRawRole'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { fmtNum } from '../../../utils/format'
import { KhoLimitNote, KhoToast, Msg, XacNhanTaiCho, fmtD, fmtKg, kmxChip, useKhoFacility } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

// Nhãn + màu trạng thái lệnh: MỘT nguồn ở rawIssueService (máy tính dùng chung). Điện thoại thêm "bước kế" cho người ký.
const BUOC_KE: Partial<Record<RawIssueStatus, string>> = { submitted: 'chờ QC', qc_confirmed: 'chờ thủ kho' }
const LIMIT_LENH = 30   // lệnh đang mở tải một lần (mới nhất trước) — chạm trần thì báo
const nhanLenh = (s: RawIssueStatus) => `${RAW_ISSUE_STATUS_LABELS[s] ?? s}${BUOC_KE[s] ? ` · ${BUOC_KE[s]}` : ''}`

export default function KhoRawIssue() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { facilityId, facility } = useKhoFacility()
  const role = useRawRole(facilityId)
  const [lots, setLots] = useState<RawLotBalance[]>([])
  const [open, setOpen] = useState<RawIssueOrder[]>([])
  const [pos, setPos] = useState<ProductionOrderLite[]>([])
  const [lot, setLot] = useState<RawLotBalance | null>(null)
  const [kg, setKg] = useState('')
  const [poId, setPoId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)   // kết quả thao tác — ghim đáy / trong chân màn
  const [loadErr, setLoadErr] = useState<string | null>(null)   // lỗi TẢI — đầu trang, kèm Thử lại
  const [posErr, setPosErr] = useState<string | null>(null)   // danh sách lệnh SX không tải được — báo tại chỗ ô chọn lệnh
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setLoadErr(null)
    try {
      // Lệnh SX chỉ để GẮN (không bắt buộc): hỏng thì vẫn xuất được, nhưng nói ra — trước .catch(() => []) làm ô chọn lệnh biến mất im lặng
      const posP = rawIssueService.listProductionOrders().then((x) => ({ x, e: null as unknown }), (e: unknown) => ({ x: [] as ProductionOrderLite[], e }))
      const [l, o, p] = await Promise.all([rawLotService.list(facilityId, { onlyWithStock: true }), rawIssueService.list({ facilityId, status: 'open', limit: LIMIT_LENH }), posP])
      setLots(l); setOpen(o); setPos(p.x); setPosErr(p.e ? dichLoiHeThong(p.e, 'Lỗi tải lệnh sản xuất') : null)
      const pre = sp.get('lot'); if (pre && !lot) { const hit = l.find((x) => x.raw_lot_id === pre); if (hit) setLot(hit) }
    } catch (e: any) { setLoadErr(dichLoiHeThong(e, 'Không tải được mã và lệnh xuất')) }
    finally { setLoading(false) }
  }, [facilityId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  const kgN = kg === '' ? null : Number(kg)
  const kgOk = kgN !== null && Number.isFinite(kgN) && kgN > 0
  const qua = !!lot && kgN !== null && kgN > lot.wet_kg + 0.01
  const canSubmit = role.perms.submit || role.isBGD
  const canQc = role.isQC || role.isBGD
  const canReceive = role.isKeeper || role.isBGD

  async function xuat() {
    if (!facilityId || !lot || !kgOk || qua) return
    setBusy('xuat'); setMsg(null)
    try {
      const id = await rawLotService.taoLenhXuatTheoMa({ facilityId, rawLotId: lot.raw_lot_id, mucDich: 'production', productionOrderId: poId || null, note: note.trim() || null })
      const r = await rawLotService.ghiCanTheoMa(id, kgN!, null)
      await rawIssueService.ky(id, 'submit')
      setMsg({ ok: true, text: `✅ ${r.code}: xuất mã ${lot.ma} ${fmtKg(kgN)} kg ướt (${r.so_dong} xe), bạn đã ký giao — chờ QC rồi thủ kho` })
      setLot(null); setKg(''); setNote(''); setPoId(''); await load()
    } catch (e: any) { setMsg({ ok: false, text: dichLoiHeThong(e, 'Không xuất được') }) }
    finally { setBusy(null) }
  }

  async function ky(o: RawIssueOrder, buoc: 'qc_confirm' | 'receive' | 'cancel') {
    setBusy(o.id); setMsg(null)
    try {
      const r = await rawIssueService.ky(o.id, buoc, buoc === 'cancel' ? 'Hủy từ điện thoại' : null)
      setMsg({ ok: true, text: buoc === 'receive' ? `✅ ${o.code}: thủ kho đã nhận, trừ sổ ${fmtKg(r.kho_kg)} kg khô` : buoc === 'qc_confirm' ? `✅ ${o.code}: QC đã xác nhận` : `${o.code} đã hủy` })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: `${o.code}: ${dichLoiHeThong(e, 'Không ký được')}` }) }
    finally { setBusy(null) }
  }

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <button type="button" className="kmx-back" aria-label="Về kho" onClick={() => nav('/m/kho')}>{I.back}</button>
        <div className="kmx-hd-txt"><span className="kmx-eyebrow">Kho NVL · {facility?.code || ''}</span><span className="kmx-title">Xuất sản xuất theo mã</span></div>
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        <Msg m={loadErr ? { ok: false, text: loadErr } : null} onRetry={() => load()} />
        {!lot ? (
          <>
            <h2 className="kmx-h2" style={{ padding: '0 2px' }}>Chọn mã đem chạy · {lots.length} mã còn hàng</h2>
            {loading && !lots.length && <div className="kmx-skel" />}
            {!loading && !loadErr && !lots.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Kho chưa có mã nào còn hàng</div>}
            {lots.map((l) => (
              <button key={l.raw_lot_id} type="button" className="kmx-card press" style={{ font: 'inherit', textAlign: 'left', width: '100%' }} disabled={!canSubmit} onClick={() => { setLot(l); setKg(String(Math.round(l.wet_kg))) }}>
                <span className="kmx-row"><span className="kmx-mono kmx-strong" style={{ fontSize: 17, fontWeight: 800 }}>{l.ma}</span><span className={`kmx-chip ${RAW_LOT_TRANG_THAI_CHIP[l.trang_thai]}`}>{RAW_LOT_TRANG_THAI_LABELS[l.trang_thai]}</span></span>
                <span className="kmx-row" style={{ alignItems: 'flex-end' }}>
                  <span className="kmx-col"><span style={{ fontSize: 14, fontWeight: 600 }}>{l.rubber_type_name || '—'} · {l.so_xe_con_hang} xe còn hàng</span><span className="kmx-sm">về {fmtD(l.ngay_dau)}{l.tuoi_ngay !== null ? ` · ${l.tuoi_ngay} ngày` : ''} · DRC {fmtNum(l.drc_pct, 2)} %</span></span>
                  <span className="kmx-col" style={{ alignItems: 'flex-end' }}><span className="kmx-num lg">{fmtKg(l.wet_kg)}</span><span className="kmx-sm" style={{ fontWeight: 600 }}>kg ướt · {fmtKg(l.dry_kg)} khô</span></span>
                </span>
              </button>
            ))}
            {!canSubmit && !role.loading && <span className="kmx-sm kmx-center">Tài khoản này chưa được ký bước giao.</span>}
          </>
        ) : (
          <>
            <div className="kmx-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="kmx-col"><span className="kmx-lbl">Mã đem chạy</span><span className="kmx-mono kmx-strong" style={{ fontSize: 18, fontWeight: 800 }}>{lot.ma}</span><span className="kmx-sm">{lot.rubber_type_name} · {lot.so_xe_con_hang} xe · tồn {fmtKg(lot.wet_kg)} kg ướt / {fmtKg(lot.dry_kg)} khô</span></span>
              <button type="button" className="kmx-pill sm" onClick={() => { setLot(null); setKg('') }}>Đổi</button>
            </div>
            <section className="kmx-card" aria-label="Số cân" style={{ gap: 8 }}>
              <label htmlFor="xk-kg" className="kmx-strong" style={{ fontSize: 13 }}>Tổng kg ướt cân được cho cả mã</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input id="xk-kg" className={`kmx-input${qua ? ' red' : ''}`} type="number" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} />
                <span className="kmx-unit" style={{ fontSize: 18, fontWeight: 700 }}>kg</span>
              </div>
              <div className={`kmx-tint${qua ? ' red' : ''}`}><span>{qua ? 'Nhiều hơn tồn của mã' : 'Máy chia về từng xe theo tỷ lệ còn lại'}</span><span className="kmx-num sm">{kgOk && !qua && lot.drc_pct ? `≈ ${fmtKg((kgN! * lot.drc_pct) / 100)} kg khô` : `tồn ${fmtKg(lot.wet_kg)} kg`}</span></div>
              <button type="button" className="kmx-pill" onClick={() => setKg(String(Math.round(lot.wet_kg)))}>Lấy hết mã · {fmtKg(lot.wet_kg)} kg</button>
            </section>
            {posErr && (
              <div className="kmx-note amb" role="alert">
                {I.info}
                <span style={{ flex: 1, minWidth: 0 }}><b>Chưa tải được danh sách lệnh sản xuất</b> — vẫn xuất được, chỉ là lệnh xuất chưa gắn LSX.<br />{posErr}</span>
                <button type="button" className="kmx-pill sm" onClick={() => load()}>Thử lại</button>
              </div>
            )}
            {pos.length > 0 && <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="xk-po" className="kmx-lbl">Lệnh sản xuất (nếu có)</label><select id="xk-po" className="kmx-text" value={poId} onChange={(e) => setPoId(e.target.value)}><option value="">— không gắn —</option>{pos.map((p) => <option key={p.id} value={p.id}>{p.code}{p.target_grade ? ` · ${p.target_grade}` : ''}</option>)}</select></div>}
            <input className="kmx-text" placeholder="Ghi chú (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Ghi chú" />
          </>
        )}

        {open.length > 0 && (
          <>
            <h2 className="kmx-h2" style={{ padding: '6px 2px 0' }}>Lệnh xuất đang mở · {open.length}</h2>
            <KhoLimitNote shown={open.length} limit={LIMIT_LENH}>Đang hiện {LIMIT_LENH} lệnh mở mới nhất — lệnh cũ hơn xem đủ ở máy tính (/wms/nvl/xuat).</KhoLimitNote>
            {open.map((o) => {
              const ma = (o as any).ma_nvl as string | null
              return (
                <section key={o.id} className="kmx-card" style={{ gap: 8 }}>
                  <div className="kmx-row"><span className="kmx-mono kmx-strong">{o.code}</span><span className={`kmx-chip ${kmxChip(RAW_ISSUE_STATUS_COLORS[o.status])}`}>{nhanLenh(o.status)}</span></div>
                  <div className="kmx-row"><span className="kmx-md">{ma ? `Mã ${ma}` : 'Chọn lô lẻ'} · {o.so_dong} xe{o.production_code ? ` · LSX ${o.production_code}` : ''}</span><span className="kmx-num md">{fmtKg(o.actual_wet_kg ?? o.planned_wet_kg)} <span className="kmx-sm">kg ướt</span></span></div>
                  {o.status === 'submitted' && (canQc ? <button type="button" className="kmx-btn md" disabled={busy === o.id} onClick={() => ky(o, 'qc_confirm')}>{I.check}QC xác nhận</button> : <span className="kmx-sm">Chờ QC xác nhận</span>)}
                  {o.status === 'qc_confirmed' && (canReceive ? <button type="button" className="kmx-btn md" disabled={busy === o.id} onClick={() => ky(o, 'receive')}>{I.intake}Thủ kho nhận · trừ sổ</button> : <span className="kmx-sm">Chờ thủ kho nhận</span>)}
                  {o.status === 'draft' && <span className="kmx-sm">Lệnh nháp tạo trên máy tính — cân từng xe ở /wms/nvl/xuat</span>}
                  {o.status !== 'received' && canSubmit && <XacNhanTaiCho nut="Hủy lệnh" hoi={<>Hủy lệnh {o.code}? Lệnh chưa trừ sổ nên tồn kho giữ nguyên; các chữ ký đã có bỏ hết — muốn xuất lại phải tạo lệnh mới.</>} xacNhan="Xác nhận hủy lệnh" busy={busy === o.id} onOk={() => ky(o, 'cancel')} />}
                </section>
              )
            })}
          </>
        )}
      </div></div>
      {!lot && <KhoToast m={msg} onClose={() => setMsg(null)} />}
      {lot && (
        <div className="kmx-foot">
          <KhoToast m={msg} onClose={() => setMsg(null)} inline />
          <button type="button" className="kmx-btn" disabled={!kgOk || qua || busy === 'xuat'} onClick={xuat}>{I.pen}{busy === 'xuat' ? 'Đang ghi…' : `Xuất mã ${lot.ma} · ${fmtKg(kgN)} kg · ký giao`}</button>
          <span className="kmx-sm kmx-center">Một chạm = tạo lệnh + ghi cân + chữ ký 1/3; QC và thủ kho ký tiếp ở dưới</span>
        </div>
      )}
    </div>
  )
}
