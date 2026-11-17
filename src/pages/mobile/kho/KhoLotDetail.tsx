// ============================================================================
// KhoLotDetail — thẻ lô + CÂN LẠI ngay tại bãi (kg ướt, DRC mới nếu có mẫu, lý do khi lệch)
// Hệ kmx-* (Đợt 3 audit UI 17/11/2026 — trước dựng bằng ops-*).
// File: src/pages/mobile/kho/KhoLotDetail.tsx · Route: /m/kho/lo/:batchId
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { rawStockService, RAW_TXN_LABELS, type RawBatchBalance, type RawLedgerRow } from '../../../services/wms/rawStockService'
import { rawRecheckService } from '../../../services/wms/rawRecheckService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { BATCH_QC_STATUS_COLORS, BATCH_QC_STATUS_LABELS } from '../../../services/wms/wms.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { fmtDate, fmtNum } from '../../../utils/format'
import { KhoToast, Msg, fmtKg, fmtSigned, kmxChip } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

const LY_DO = ['Tạp chất / đất lẫn', 'Mẫu DRC đầu vào không đại diện', 'Cân sai lúc nhập', 'Lô chồng lẫn, cân lẫn lô', 'Mất mát / thất thoát', 'Khác']
const SO_DONG_DAU = 20   // sổ lô hiện 20 dòng mới nhất trước, còn lại bấm "Xem thêm"

type LedgerRow = RawLedgerRow & { ly_do?: string | null }

export default function KhoLotDetail() {
  const { batchId } = useParams<{ batchId: string }>()
  const nav = useNavigate()
  const [b, setB] = useState<RawBatchBalance | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [ledgerErr, setLedgerErr] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [err, setErr] = useState<string | null>(null)
  const role = useRawRole(b?.facility_id ?? null)
  const [wet, setWet] = useState<string>('')
  const [drc, setDrc] = useState<string>('')
  const [lyDo, setLyDo] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)   // lỗi nhập liệu của form cân lại — hiện ngay trong form
  const [openForm, setOpenForm] = useState(false)

  const load = useCallback(async () => {
    if (!batchId) return
    setErr(null); setLedgerErr(null)
    try {
      const x = await rawStockService.getBatch(batchId)
      if (!x) { setErr('Không tìm thấy lô'); return }
      // sổ lô lỗi KHÔNG được hiện thành "0 dòng" — báo riêng, phần thẻ lô vẫn dùng được
      const [l, s] = await Promise.all([rawStockService.getLedger(batchId).catch((e) => { setLedgerErr(dichLoiHeThong(e, 'Không đọc được sổ lô')); return null }), rawSettingsService.getForFacility(x.facility_id)])
      setB(x); if (l) setLedger(l as LedgerRow[]); setSettings(s); setWet(String(x.wet_kg))
    } catch (e: any) { setErr(dichLoiHeThong(e, 'Không tải được lô')) }
  }, [batchId])
  useEffect(() => { load() }, [load])

  const canWrite = role.isKeeper || role.isQC || role.isBGD
  const wetN = wet === '' ? null : Number(wet)
  const drcN = drc === '' ? null : Number(drc)
  const preview = b && wetN !== null && Number.isFinite(wetN) ? rawRecheckService.preview(b, wetN, drcN, settings.nguong_lech_kho_pct) : null
  const due = b ? b.ngay_tu_lan_do >= settings.chu_ky_can_lai_ngay : false

  async function submit() {
    if (!b || wetN === null || !Number.isFinite(wetN) || wetN < 0) { setFormErr('Nhập kg ướt cân lại'); return }
    if (preview?.vuotNguong && !lyDo) { setFormErr(`Lệch khô quá ${settings.nguong_lech_kho_pct} %, chọn lý do`); return }
    setBusy(true); setMsg(null); setFormErr(null)
    try {
      const r = await rawRecheckService.canLai(b.batch_id, wetN, drcN, lyDo || null, note.trim() || null)
      setMsg({ ok: true, text: `✅ ${r.batch_no}: khô ${fmtKg(r.kho_truoc)} → ${fmtKg(r.kho_sau)} kg (${fmtSigned(r.lech_kho_pct ?? 0, 2)} %)` })
      setOpenForm(false); setDrc(''); setLyDo(''); setNote(''); await load()
    } catch (e: any) { setMsg({ ok: false, text: dichLoiHeThong(e, 'Không ghi được') }) }
    finally { setBusy(false) }
  }

  const moiNhat = ledger.slice().reverse()
  const hien = showAll ? moiNhat : moiNhat.slice(0, SO_DONG_DAU)

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <button type="button" className="kmx-back" aria-label="Về tồn theo mã" onClick={() => nav('/m/kho')}>{I.back}</button>
        <div className="kmx-hd-txt">
          <span className="kmx-eyebrow">{b ? `Lô NVL · ${b.rubber_type_name} · ${b.facility_code || ''}` : 'Lô NVL'}</span>
          <span className="kmx-title kmx-mono">{b?.batch_no || 'Lô NVL'}</span>
        </div>
        {due && <span className="kmx-chip red" style={{ flex: '0 0 auto' }}>đến hạn cân lại</span>}
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        <Msg m={err ? { ok: false, text: err } : null} onRetry={() => load()} />
        {!b && !err && <><div className="kmx-skel" /><div className="kmx-skel" /></>}
        {b && (
          <>
            <section className="kmx-card hero" aria-label="Tồn lô" style={{ gap: 8 }}>
              <div className="kmx-row" style={{ alignItems: 'flex-end' }}>
                <span className="kmx-col"><span className="kmx-lbl ok">Khô (sổ)</span><span className="kmx-num lg">{fmtKg(b.dry_kg)}<span className="kmx-unit"> kg</span></span></span>
                <span className="kmx-col" style={{ alignItems: 'flex-end' }}><span className="kmx-lbl">Ướt · DRC</span><span className="kmx-num md">{fmtKg(b.wet_kg)}<span className="kmx-unit"> kg</span></span><span className="kmx-sm">DRC {fmtNum(b.drc_pct, 2)} %{b.ton_dau_uoc ? ' (ước)' : ''}</span></span>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="kmx-chip mut">tuổi {b.tuoi_ngay} ng</span>
                <span className={`kmx-chip ${due ? 'red' : 'ok'}`}>{due ? `đến hạn cân lại · ${b.ngay_tu_lan_do} ng` : `đo cách ${b.ngay_tu_lan_do} ng`}</span>
                {b.supplier_name && <span className="kmx-chip mut">{b.supplier_name}</span>}
                {b.qc_status && <span className={`kmx-chip ${kmxChip(BATCH_QC_STATUS_COLORS[b.qc_status])}`}>QC: {BATCH_QC_STATUS_LABELS[b.qc_status] ?? b.qc_status}</span>}
              </div>
            </section>

            {!openForm ? (
              <button type="button" className="kmx-btn" disabled={!canWrite} onClick={() => { setOpenForm(true); setMsg(null); setFormErr(null) }}>Cân lại lô này</button>
            ) : (
              <section className="kmx-card" aria-label="Cân lại" style={{ gap: 10 }}>
                <h2 className="kmx-h2">Cân lại</h2>
                <div className="kmx-col" style={{ gap: 4 }}><label className="kmx-lbl" htmlFor="kho-wet">Kg ướt cân được</label><input id="kho-wet" className="kmx-input" type="number" inputMode="decimal" value={wet} onChange={(e) => setWet(e.target.value)} /></div>
                <div className="kmx-col" style={{ gap: 4 }}><label className="kmx-lbl" htmlFor="kho-drc">DRC mới (%) · bỏ trống nếu không lấy mẫu</label><input id="kho-drc" className="kmx-text" type="number" inputMode="decimal" step="0.1" placeholder={b.ton_dau_uoc ? 'Lô tồn đầu ước, nên đo' : String(b.drc_pct ?? '')} value={drc} onChange={(e) => setDrc(e.target.value)} /></div>
                {preview && (
                  <div className={`kmx-tint col${preview.vuotNguong ? ' red' : ''}`}>
                    <span style={{ fontWeight: 800 }}>Khô {fmtKg(b.dry_kg)} → {fmtKg(preview.khoSau)} kg ({fmtSigned(preview.lechPct ?? 0, 2)} %)</span>
                    <span style={{ fontSize: 12 }}>Ướt {fmtSigned(preview.chenhUot)} kg · {preview.vuotNguong ? `vượt ngưỡng ${settings.nguong_lech_kho_pct} %, phải ghi lý do` : 'trong ngưỡng, hao ướt là khô tự nhiên'}</span>
                  </div>
                )}
                {preview?.vuotNguong && (
                  <div className="kmx-col" style={{ gap: 4 }}><label className="kmx-lbl" htmlFor="kho-lydo">Lý do lệch khô</label>
                    <select id="kho-lydo" className="kmx-text" value={lyDo} onChange={(e) => setLyDo(e.target.value)}><option value="">— chọn —</option>{LY_DO.map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                )}
                <div className="kmx-col" style={{ gap: 4 }}><label className="kmx-lbl" htmlFor="kho-note">Ghi chú</label><input id="kho-note" className="kmx-text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mẫu số, người đo…" /></div>
                {formErr && <div className="kmx-note red" role="alert" style={{ padding: '8px 12px' }}>{I.info}<span>{formErr}</span></div>}
                <div className="kmx-grid2">
                  <button type="button" className="kmx-btn md" disabled={busy || wetN === null || (preview?.vuotNguong && !lyDo)} onClick={submit}>{busy ? 'Đang ghi…' : 'Ghi vào sổ'}</button>
                  <button type="button" className="kmx-btn sec" disabled={busy} onClick={() => { setOpenForm(false); setFormErr(null) }}>Thôi</button>
                </div>
              </section>
            )}

            <h2 className="kmx-h2" style={{ padding: '6px 2px 0' }}>Sổ lô · {ledger.length} dòng{!showAll && ledger.length > SO_DONG_DAU ? ` · hiện ${SO_DONG_DAU} mới nhất` : ''}</h2>
            {ledgerErr ? <Msg m={{ ok: false, text: ledgerErr }} onRetry={() => load()} /> : (
              <>
                {!ledger.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Sổ lô chưa có dòng nào</div>}
                {ledger.length > 0 && (
                  <div className="kmx-list">
                    {hien.map((r) => (
                      <div key={r.id} className="kmx-li" style={{ alignItems: 'flex-start' }}>
                        <span className="kmx-col" style={{ gap: 4 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}><span className="kmx-chip mut">{RAW_TXN_LABELS[r.txn_type] || r.txn_type}</span><span className="kmx-sm">{fmtDate(r.txn_date)}</span></span>
                          {(r.note || r.ly_do) && <span className="kmx-sm">{r.ly_do ? `${r.ly_do} · ` : ''}{r.note || ''}</span>}
                        </span>
                        <span className="kmx-col" style={{ alignItems: 'flex-end', flex: '0 0 auto' }}>
                          <span className={`kmx-num sm ${Number(r.dry_kg) < 0 ? 'red' : 'ok'}`} style={{ whiteSpace: 'nowrap' }}>{fmtSigned(Number(r.dry_kg))} <span className="kmx-sm">khô</span></span>
                          <span className="kmx-sm kmx-mono" style={{ whiteSpace: 'nowrap' }}>{fmtSigned(Number(r.wet_kg))} ướt{r.drc_pct ? ` · ${fmtNum(r.drc_pct, 2)} %` : ''}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {ledger.length > SO_DONG_DAU && <button type="button" className="kmx-btn sec" onClick={() => setShowAll((v) => !v)}>{showAll ? `Thu gọn · ${SO_DONG_DAU} dòng mới nhất` : `Xem thêm ${ledger.length - SO_DONG_DAU} dòng cũ`}</button>}
              </>
            )}
          </>
        )}
      </div></div>
      <KhoToast m={msg} onClose={() => setMsg(null)} />
    </div>
  )
}
