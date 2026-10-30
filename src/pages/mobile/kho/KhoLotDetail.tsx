// ============================================================================
// KhoLotDetail — thẻ lô + CÂN LẠI ngay tại bãi (kg ướt, DRC mới nếu có mẫu, lý do khi lệch)
// File: src/pages/mobile/kho/KhoLotDetail.tsx · Route: /m/kho/lo/:batchId
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { rawStockService, type RawBatchBalance } from '../../../services/wms/rawStockService'
import { rawRecheckService } from '../../../services/wms/rawRecheckService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { KhoAppBar, Msg, fmtKg, fmtSigned, inp, inpBig, lbl } from './khoCommon'

const LY_DO = ['Tạp chất / đất lẫn', 'Mẫu DRC đầu vào không đại diện', 'Cân sai lúc nhập', 'Lô chồng lẫn, cân lẫn lô', 'Mất mát / thất thoát', 'Khác']
const TXN: Record<string, string> = { opening: 'Tồn đầu', in: 'Nhập', in_transfer: 'Nhập chuyển', out_production: 'Xuất SX', out_sale: 'Xuất bán', out_transfer: 'Xuất chuyển', recheck_adjust: 'Cân lại', stocktake_adjust: 'Kiểm kê' }

export default function KhoLotDetail() {
  const { batchId } = useParams<{ batchId: string }>()
  const [b, setB] = useState<RawBatchBalance | null>(null)
  const [ledger, setLedger] = useState<any[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [err, setErr] = useState<string | null>(null)
  const role = useRawRole(b?.facility_id ?? null)
  const [wet, setWet] = useState<string>('')
  const [drc, setDrc] = useState<string>('')
  const [lyDo, setLyDo] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [openForm, setOpenForm] = useState(false)

  const load = useCallback(async () => {
    if (!batchId) return
    setErr(null)
    try {
      const x = await rawStockService.getBatch(batchId)
      if (!x) { setErr('Không tìm thấy lô'); return }
      const [l, s] = await Promise.all([rawStockService.getLedger(batchId).catch(() => []), rawSettingsService.getForFacility(x.facility_id)])
      setB(x); setLedger(l as any[]); setSettings(s); setWet(String(x.wet_kg))
    } catch (e: any) { setErr(e?.message || 'Không tải được lô') }
  }, [batchId])
  useEffect(() => { load() }, [load])

  const canWrite = role.isKeeper || role.isQC || role.isBGD
  const wetN = wet === '' ? null : Number(wet)
  const drcN = drc === '' ? null : Number(drc)
  const preview = b && wetN !== null && Number.isFinite(wetN) ? rawRecheckService.preview(b, wetN, drcN, settings.nguong_lech_kho_pct) : null
  const due = b ? b.ngay_tu_lan_do >= settings.chu_ky_can_lai_ngay : false

  async function submit() {
    if (!b || wetN === null || !Number.isFinite(wetN) || wetN < 0) { setMsg({ ok: false, text: 'Nhập kg ướt cân lại' }); return }
    if (preview?.vuotNguong && !lyDo) { setMsg({ ok: false, text: `Lệch khô quá ${settings.nguong_lech_kho_pct} %, chọn lý do` }); return }
    setBusy(true); setMsg(null)
    try {
      const r = await rawRecheckService.canLai(b.batch_id, wetN, drcN, lyDo || null, note.trim() || null)
      setMsg({ ok: true, text: `✅ ${r.batch_no}: khô ${fmtKg(r.kho_truoc)} → ${fmtKg(r.kho_sau)} kg (${fmtSigned(r.lech_kho_pct ?? 0, 2)} %)` })
      setOpenForm(false); setDrc(''); setLyDo(''); setNote(''); await load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không ghi được' }) }
    finally { setBusy(false) }
  }

  return (
    <>
      <KhoAppBar title={b?.batch_no || 'Lô NVL'} sub={b ? `${b.rubber_type_name} · ${b.facility_code || ''}` : ''} back="/m/kho" red={due} />
      <div className="ops-body">
        <div className="ops-inner">
          {err && <div className="ops-card" style={{ color: 'var(--red)', fontWeight: 700 }}>{err}</div>}
          {!b && !err && <><div className="ops-skel" /><div className="ops-skel" /></>}
          {b && (
            <>
              <div className="ops-card tint">
                <div className="ops-rw">
                  <div><div className="ops-lbl">Khô (sổ)</div><div className="ops-big">{fmtKg(b.dry_kg)}<span className="ops-sm"> kg</span></div></div>
                  <div style={{ textAlign: 'right' }}><div className="ops-lbl">Ướt · DRC</div><div className="ops-mid ops-mono">{fmtKg(b.wet_kg)} kg</div><div className="ops-sm">DRC {b.drc_pct ?? '—'} %{b.ton_dau_uoc ? ' (ước)' : ''}</div></div>
                </div>
                <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                  <span className="ops-chip mut">tuổi {b.tuoi_ngay} ng</span>
                  <span className={`ops-chip ${due ? 'red' : 'ok'}`}>{due ? `đến hạn cân lại · ${b.ngay_tu_lan_do} ng` : `đo cách ${b.ngay_tu_lan_do} ng`}</span>
                  {b.supplier_name && <span className="ops-chip mut">{b.supplier_name}</span>}
                  {b.qc_status && <span className="ops-chip mut">QC {b.qc_status}</span>}
                </div>
              </div>
              <Msg m={msg} />

              {!openForm ? (
                <button className="ops-btn g" disabled={!canWrite} onClick={() => { setOpenForm(true); setMsg(null) }}>⚖️ Cân lại lô này</button>
              ) : (
                <div className="ops-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="ops-sh" style={{ margin: 0 }}>Cân lại</div>
                  <div><label style={lbl} htmlFor="kho-wet">Kg ướt cân được</label><input id="kho-wet" style={inpBig} type="number" inputMode="decimal" value={wet} onChange={(e) => setWet(e.target.value)} /></div>
                  <div><label style={lbl} htmlFor="kho-drc">DRC mới (%) · bỏ trống nếu không lấy mẫu</label><input id="kho-drc" style={inp} type="number" inputMode="decimal" step="0.1" placeholder={b.ton_dau_uoc ? 'Lô tồn đầu ước, nên đo' : String(b.drc_pct ?? '')} value={drc} onChange={(e) => setDrc(e.target.value)} /></div>
                  {preview && (
                    <div className="ops-card" style={{ background: preview.vuotNguong ? 'var(--red-bg)' : 'var(--ok-bg)', color: preview.vuotNguong ? 'var(--red)' : 'var(--ok)', padding: 10 }}>
                      <div style={{ fontWeight: 800 }}>Khô {fmtKg(b.dry_kg)} → {fmtKg(preview.khoSau)} kg ({fmtSigned(preview.lechPct ?? 0, 2)} %)</div>
                      <div style={{ fontSize: 12 }}>Ướt {fmtSigned(preview.chenhUot)} kg · {preview.vuotNguong ? `vượt ngưỡng ${settings.nguong_lech_kho_pct} %, phải ghi lý do` : 'trong ngưỡng, hao ướt là khô tự nhiên'}</div>
                    </div>
                  )}
                  {preview?.vuotNguong && (
                    <div><label style={lbl} htmlFor="kho-lydo">Lý do lệch khô</label>
                      <select id="kho-lydo" style={inp} value={lyDo} onChange={(e) => setLyDo(e.target.value)}><option value="">— chọn —</option>{LY_DO.map((v) => <option key={v} value={v}>{v}</option>)}</select></div>
                  )}
                  <div><label style={lbl} htmlFor="kho-note">Ghi chú</label><input id="kho-note" style={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mẫu số, người đo…" /></div>
                  <button className="ops-btn g" disabled={busy || wetN === null || (preview?.vuotNguong && !lyDo)} onClick={submit}>{busy ? 'Đang ghi…' : 'Ghi vào sổ'}</button>
                  <button className="ops-btn o" disabled={busy} onClick={() => setOpenForm(false)}>Hủy</button>
                </div>
              )}

              <div className="ops-sh">Sổ lô · {ledger.length} dòng</div>
              {ledger.slice().reverse().slice(0, 20).map((r: any) => (
                <div key={r.id} className="ops-card" style={{ padding: '9px 12px' }}>
                  <div className="ops-rw">
                    <div><span className="ops-chip mut">{TXN[r.txn_type] || r.txn_type}</span> <span className="ops-sm">{new Date(r.txn_date).toLocaleDateString('vi-VN')}</span></div>
                    <div className="ops-mono" style={{ textAlign: 'right', fontWeight: 700, color: Number(r.dry_kg) < 0 ? 'var(--red)' : 'var(--ok)' }}>{fmtSigned(Number(r.dry_kg))} khô<div className="ops-sm">{fmtSigned(Number(r.wet_kg))} ướt{r.drc_pct ? ` · ${r.drc_pct} %` : ''}</div></div>
                  </div>
                  {(r.note || r.ly_do) && <div className="ops-sm" style={{ marginTop: 2 }}>{r.ly_do ? `${r.ly_do} · ` : ''}{r.note || ''}</div>}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}
