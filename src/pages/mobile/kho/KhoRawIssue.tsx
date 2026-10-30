// ============================================================================
// KhoRawIssue — XUẤT SẢN XUẤT THEO MÃ trên điện thoại (GĐ6): chọn mã → gõ MỘT số cân cho cả mã
// → máy chia về từng lô xe → lệnh tạo + ký bên giao trong một chạm; QS / thủ kho ký ở dưới.
// File: src/pages/mobile/kho/KhoRawIssue.tsx · Route: /m/kho/xuat
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { rawLotService, RAW_LOT_TRANG_THAI_LABELS, type RawLotBalance } from '../../../services/wms/rawLotService'
import { rawIssueService, type ProductionOrderLite, type RawIssueOrder } from '../../../services/wms/rawIssueService'
import { useRawRole } from '../../../hooks/useRawRole'
import { fmtD, fmtKg, useKhoFacility } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

const ST: Record<string, { t: string; c: string }> = { draft: { t: 'Nháp · chưa cân', c: 'mut' }, submitted: { t: 'Bên giao đã ký · chờ QS', c: 'amb' }, qc_confirmed: { t: 'QS đã ký · chờ thủ kho', c: 'blue' }, received: { t: 'Đã trừ sổ', c: 'ok' }, cancelled: { t: 'Đã hủy', c: 'red' } }

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
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true)
    try {
      const [l, o, p] = await Promise.all([rawLotService.list(facilityId, { onlyWithStock: true }), rawIssueService.list({ facilityId, status: 'open', limit: 30 }), rawIssueService.listProductionOrders().catch(() => [])])
      setLots(l); setOpen(o); setPos(p)
      const pre = sp.get('lot'); if (pre && !lot) { const hit = l.find((x) => x.raw_lot_id === pre); if (hit) setLot(hit) }
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không tải được' }) }
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
      setMsg({ ok: true, text: `✅ ${r.code}: xuất mã ${lot.ma} ${fmtKg(kgN)} kg ướt (${r.so_dong} xe), bạn đã ký giao — chờ QS rồi thủ kho` })
      setLot(null); setKg(''); setNote(''); setPoId(''); await load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không xuất được' }) }
    finally { setBusy(null) }
  }

  async function ky(o: RawIssueOrder, buoc: 'qc_confirm' | 'receive' | 'cancel') {
    setBusy(o.id); setMsg(null)
    try {
      const r = await rawIssueService.ky(o.id, buoc, buoc === 'cancel' ? 'Hủy từ điện thoại' : null)
      setMsg({ ok: true, text: buoc === 'receive' ? `✅ ${o.code}: thủ kho đã nhận, trừ sổ ${fmtKg(r.kho_kg)} kg khô` : buoc === 'qc_confirm' ? `✅ ${o.code}: QS đã xác nhận` : `${o.code} đã hủy` })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không ký được' }) }
    finally { setBusy(null) }
  }

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <button type="button" className="kmx-back" aria-label="Về kho" onClick={() => nav('/m/kho')}>{I.back}</button>
        <div className="kmx-hd-txt"><span className="kmx-eyebrow">Kho NVL · {facility?.code || ''}</span><span className="kmx-title">Xuất sản xuất theo mã</span></div>
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        {msg && <div className={`kmx-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        {!lot ? (
          <>
            <h2 className="kmx-h2" style={{ padding: '0 2px' }}>Chọn mã đem chạy · {lots.length} mã còn hàng</h2>
            {loading && !lots.length && <div className="kmx-skel" />}
            {!loading && !lots.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Kho chưa có mã nào còn hàng</div>}
            {lots.map((l) => (
              <button key={l.raw_lot_id} type="button" className="kmx-card press" style={{ font: 'inherit', textAlign: 'left', width: '100%' }} disabled={!canSubmit} onClick={() => { setLot(l); setKg(String(Math.round(l.wet_kg))) }}>
                <span className="kmx-row"><span className="kmx-mono" style={{ fontSize: 17, fontWeight: 800, color: '#0D2E25' }}>{l.ma}</span><span className={`kmx-chip ${l.trang_thai === 'dang_chay' ? 'amb' : 'ok'}`}>{RAW_LOT_TRANG_THAI_LABELS[l.trang_thai]}</span></span>
                <span className="kmx-row" style={{ alignItems: 'flex-end' }}>
                  <span className="kmx-col"><span style={{ fontSize: 14, fontWeight: 600 }}>{l.rubber_type_name || '—'} · {l.so_xe_con_hang} xe còn hàng</span><span className="kmx-sm">về {fmtD(l.ngay_dau)}{l.tuoi_ngay !== null ? ` · ${l.tuoi_ngay} ngày` : ''} · DRC {l.drc_pct ?? '—'} %</span></span>
                  <span className="kmx-col" style={{ alignItems: 'flex-end' }}><span className="kmx-num lg">{fmtKg(l.wet_kg)}</span><span className="kmx-sm" style={{ fontWeight: 600 }}>kg ướt · {fmtKg(l.dry_kg)} khô</span></span>
                </span>
              </button>
            ))}
            {!canSubmit && !role.loading && <span className="kmx-sm kmx-center">Tài khoản này chưa được ký bước giao.</span>}
          </>
        ) : (
          <>
            <div className="kmx-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="kmx-col"><span className="kmx-lbl">Mã đem chạy</span><span className="kmx-mono" style={{ fontSize: 18, fontWeight: 800, color: '#0D2E25' }}>{lot.ma}</span><span className="kmx-sm">{lot.rubber_type_name} · {lot.so_xe_con_hang} xe · tồn {fmtKg(lot.wet_kg)} kg ướt / {fmtKg(lot.dry_kg)} khô</span></span>
              <button type="button" className="kmx-pill sm" onClick={() => { setLot(null); setKg('') }}>Đổi</button>
            </div>
            <section className="kmx-card" aria-label="Số cân" style={{ gap: 8 }}>
              <label htmlFor="xk-kg" className="kmx-strong" style={{ fontSize: 13 }}>Tổng kg ướt cân được cho cả mã</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input id="xk-kg" className={`kmx-input${qua ? ' red' : ''}`} type="number" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} />
                <span style={{ fontSize: 18, fontWeight: 700, color: '#6B7280' }}>kg</span>
              </div>
              <div className="kmx-tint" style={qua ? { background: '#FEE2E2', color: '#B91C1C' } : undefined}><span>{qua ? 'Nhiều hơn tồn của mã' : 'Máy chia về từng xe theo tỷ lệ còn lại'}</span><span className="kmx-num sm">{kgOk && !qua && lot.drc_pct ? `≈ ${fmtKg((kgN! * lot.drc_pct) / 100)} kg khô` : `tồn ${fmtKg(lot.wet_kg)} kg`}</span></div>
              <button type="button" className="kmx-pill" onClick={() => setKg(String(Math.round(lot.wet_kg)))}>Lấy hết mã · {fmtKg(lot.wet_kg)} kg</button>
            </section>
            {pos.length > 0 && <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="xk-po" className="kmx-lbl">Lệnh sản xuất (nếu có)</label><select id="xk-po" className="kmx-text" value={poId} onChange={(e) => setPoId(e.target.value)}><option value="">— không gắn —</option>{pos.map((p) => <option key={p.id} value={p.id}>{p.code}{p.target_grade ? ` · ${p.target_grade}` : ''}</option>)}</select></div>}
            <input className="kmx-text" placeholder="Ghi chú (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Ghi chú" />
          </>
        )}

        {open.length > 0 && (
          <>
            <h2 className="kmx-h2" style={{ padding: '6px 2px 0' }}>Lệnh xuất đang mở · {open.length}</h2>
            {open.map((o) => {
              const st = ST[o.status] ?? { t: o.status, c: 'mut' }
              const ma = (o as any).ma_nvl as string | null
              return (
                <section key={o.id} className="kmx-card" style={{ gap: 8 }}>
                  <div className="kmx-row"><span className="kmx-mono" style={{ fontWeight: 700, color: '#0D2E25' }}>{o.code}</span><span className={`kmx-chip ${st.c}`}>{st.t}</span></div>
                  <div className="kmx-row"><span className="kmx-md">{ma ? `Mã ${ma}` : 'Chọn lô lẻ'} · {o.so_dong} xe{o.production_code ? ` · LSX ${o.production_code}` : ''}</span><span className="kmx-num md">{fmtKg(o.actual_wet_kg ?? o.planned_wet_kg)} <span className="kmx-sm">kg ướt</span></span></div>
                  {o.status === 'submitted' && (canQc ? <button type="button" className="kmx-btn md" disabled={busy === o.id} onClick={() => ky(o, 'qc_confirm')}>{I.check}QS xác nhận</button> : <span className="kmx-sm">Chờ QS xác nhận</span>)}
                  {o.status === 'qc_confirmed' && (canReceive ? <button type="button" className="kmx-btn md" disabled={busy === o.id} onClick={() => ky(o, 'receive')}>{I.intake}Thủ kho nhận · trừ sổ</button> : <span className="kmx-sm">Chờ thủ kho nhận</span>)}
                  {o.status === 'draft' && <span className="kmx-sm">Lệnh nháp tạo trên máy tính — cân từng xe ở /wms/nvl/xuat</span>}
                  {o.status !== 'received' && canSubmit && <button type="button" className="kmx-btn ghost" style={{ color: '#B91C1C', fontSize: 13 }} disabled={busy === o.id} onClick={() => { if (window.confirm(`Hủy lệnh ${o.code}?`)) ky(o, 'cancel') }}>Hủy lệnh</button>}
                </section>
              )
            })}
          </>
        )}
      </div></div>
      {lot && (
        <div className="kmx-foot">
          <button type="button" className="kmx-btn" disabled={!kgOk || qua || busy === 'xuat'} onClick={xuat}>{I.pen}{busy === 'xuat' ? 'Đang ghi…' : `Xuất mã ${lot.ma} · ${fmtKg(kgN)} kg · ký giao`}</button>
          <span className="kmx-sm kmx-center">Một chạm = tạo lệnh + ghi cân + chữ ký 1/3; QS và thủ kho ký tiếp ở dưới</span>
        </div>
      )}
    </div>
  )
}
