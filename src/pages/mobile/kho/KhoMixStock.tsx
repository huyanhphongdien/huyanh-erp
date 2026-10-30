// ============================================================================
// KhoMixStock — Kho chèn trên điện thoại: tồn theo lô, đánh dấu đã xử lý kim loại,
// nhập lô mới, sổ chuyển động 14 ngày.
// File: src/pages/mobile/kho/KhoMixStock.tsx · Route: /m/kho/chen/kho
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { mixService, MIX_LOT_STATUS_LABELS, MIX_SOURCE_LABELS, type MixBalance, type MixLot, type MixMovement } from '../../../services/wms/mixService'
import { useRawRole } from '../../../hooks/useRawRole'
import { FacilitySelect, fmtDt, fmtKg, useKhoFacility } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

const CHIP: Record<MixLot['source_type'], string> = { loi: 'amb', dkl: 'red', std: 'blue', mua_ngoai: 'mut', khac: 'mut' }

export default function KhoMixStock() {
  const nav = useNavigate()
  const loc = useLocation()
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const role = useRawRole(facilityId)
  const [bal, setBal] = useState<MixBalance | null>(null)
  const [lots, setLots] = useState<MixLot[]>([])
  const [moves, setMoves] = useState<MixMovement[]>([])
  const [all, setAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(() => (loc.state as any)?.msg ? { ok: true, text: (loc.state as any).msg } : null)
  const [busy, setBusy] = useState<string | null>(null)
  const [huyAsk, setHuyAsk] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true)
    try {
      const [b, l, m] = await Promise.all([mixService.balance(facilityId), mixService.listLots(facilityId, all), mixService.movements(facilityId, 14)])
      setBal(b); setLots(l); setMoves(m)
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không tải được kho chèn' }) }
    finally { setLoading(false) }
  }, [facilityId, all])
  useEffect(() => { load() }, [load])

  const canWrite = role.isKeeper || role.isQC || role.isBGD

  async function sua(l: MixLot, patch: Parameters<typeof mixService.suaLo>[1], ok: string) {
    setBusy(l.id); setMsg(null)
    try { await mixService.suaLo(l.id, patch); setMsg({ ok: true, text: ok }); setHuyAsk(null); await load() }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không sửa được' }) }
    finally { setBusy(null) }
  }

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <button type="button" className="kmx-back" aria-label="Về hàng chèn" onClick={() => nav('/m/kho/chen')}>{I.back}</button>
        <div className="kmx-hd-txt"><span className="kmx-eyebrow">Kho chèn · {facility?.name || facility?.code || ''}</span><span className="kmx-title">Tồn kho chèn</span></div>
        <FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        {msg && <div className={`kmx-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        <section className="kmx-card kmx-grid3" style={{ display: 'grid' }} aria-label="Tổng">
          <div className="kmx-col kmx-center"><span className="kmx-lbl">Tại kho</span><span className="kmx-num md">{fmtKg(bal?.tai_kho_kg)}</span></div>
          <div className="kmx-col kmx-center"><span className="kmx-lbl">Dây chuyền</span><span className="kmx-num md" style={{ color: (bal?.o_day_chuyen_kg ?? 0) > 0 ? '#B45309' : undefined }}>{fmtKg(bal?.o_day_chuyen_kg)}</span></div>
          <div className="kmx-col kmx-center"><span className="kmx-lbl">Nhập tháng</span><span className="kmx-num md">{fmtKg(bal?.nhap_thang_kg)}</span></div>
        </section>
        <Link to="/m/kho/chen/kho/nhap" className="kmx-btn" onClick={(e) => { if (!canWrite) e.preventDefault() }} style={!canWrite ? { opacity: 0.45 } : undefined}>{I.plus}Nhập lô chèn</Link>
        {!canWrite && !role.loading && <span className="kmx-sm kmx-center">Chỉ thủ kho NVL, QC hoặc BGĐ mới nhập / sửa lô chèn.</span>}

        <div className="kmx-row" style={{ padding: '0 2px' }}>
          <h2 className="kmx-h2">Lô chèn · {lots.length}</h2>
          <button type="button" className="kmx-pill sm" onClick={() => setAll((v) => !v)}>{all ? 'Chỉ lô còn hàng' : 'Cả lô đã hết / hủy'}</button>
        </div>
        {loading && !lots.length && <div className="kmx-skel" />}
        {!loading && !lots.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Kho chèn trống. Bấm "Nhập lô chèn" để nhập tồn.</div>}
        {lots.map((l) => {
          const khoa = l.source_type === 'dkl' && !l.metal_cleared
          return (
            <section key={l.id} className="kmx-card" aria-label={`Lô ${l.code}`} style={{ gap: 8 }}>
              <div className="kmx-row">
                <span className="kmx-mono" style={{ fontSize: 15, fontWeight: 700, color: '#0D2E25' }}>{l.code}</span>
                <span style={{ display: 'flex', gap: 4 }}><span className={`kmx-chip ${CHIP[l.source_type]}`}>{MIX_SOURCE_LABELS[l.source_type].replace(/ \(.*\)/, '')}</span>{l.status !== 'available' && <span className={`kmx-chip ${l.status === 'in_use' ? 'ok' : 'mut'}`}>{MIX_LOT_STATUS_LABELS[l.status]}</span>}</span>
              </div>
              <div className="kmx-row" style={{ alignItems: 'flex-end' }}>
                <span className="kmx-col">
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{l.source_desc || MIX_SOURCE_LABELS[l.source_type]}{l.grade ? ` · ${l.grade}` : ''}</span>
                  <span className="kmx-sm">{l.po !== null ? `Po ${l.po}` : ''}{l.mooney !== null ? ` · Mooney ${l.mooney}` : ''}{l.pri !== null ? ` · PRI ${l.pri}` : ''}{l.qc_allow_mix_pct !== null ? ` · trộn ≤ ${l.qc_allow_mix_pct} %` : ''}{!l.qc_allow_rerun ? ' · KHÔNG chạy lại' : ''} · nhập {new Date(l.received_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} · {l.tuoi_ngay} ng</span>
                </span>
                <span className="kmx-col" style={{ alignItems: 'flex-end' }}><span className={`kmx-num lg${khoa || l.ton_kg <= 0.005 ? ' mut' : ''}`}>{fmtKg(l.ton_kg)}</span><span className="kmx-sm" style={{ fontWeight: 600 }}>kg tại kho</span></span>
              </div>
              <div className="kmx-grid3" style={{ gap: 6 }}>
                <div className="kmx-stat"><span className="kmx-lbl" style={{ fontSize: 10 }}>Nhập</span><span className="kmx-num sm">{fmtKg(l.kg_in)}</span></div>
                <div className="kmx-stat"><span className="kmx-lbl" style={{ fontSize: 10 }}>Tiêu hao</span><span className="kmx-num sm">{fmtKg(l.kg_used)}</span></div>
                <div className="kmx-stat" style={l.kg_at_line > 0 ? { background: '#FEF3C7' } : undefined}><span className="kmx-lbl" style={{ fontSize: 10 }}>Dây chuyền</span><span className="kmx-num sm" style={l.kg_at_line > 0 ? { color: '#B45309' } : undefined}>{fmtKg(l.kg_at_line)}</span></div>
              </div>
              {khoa && (
                <div className="kmx-col" style={{ gap: 6 }}>
                  <span className="kmx-sm" style={{ color: '#B91C1C', fontWeight: 600 }}>Dính kim loại, chưa xử lý: chưa lấy chèn được.</span>
                  <button type="button" className="kmx-btn sec" disabled={!canWrite || busy === l.id} onClick={() => sua(l, { metalCleared: true }, `${l.code}: đã đánh dấu xử lý kim loại, lấy chèn được rồi`)}>{I.check}Đã xử lý kim loại, mở lấy</button>
                </div>
              )}
              {l.note && <span className="kmx-sm">Ghi chú: {l.note}</span>}
              <div className="kmx-grid2">
                <Link to={`/m/kho/chen/phieu?lot=${l.id}`} className="kmx-btn ghost" style={{ color: '#1B4D3E', fontSize: 13 }}>Phiếu của lô</Link>
                {l.status !== 'cancelled' && l.kg_used <= 0.005 && l.kg_at_line <= 0.005 && canWrite && (
                  huyAsk === l.id
                    ? <button type="button" className="kmx-btn red" style={{ minHeight: 44 }} disabled={busy === l.id} onClick={() => sua(l, { huy: true, note: 'Hủy lô từ điện thoại' }, `${l.code}: đã hủy lô`)}>Xác nhận hủy lô</button>
                    : <button type="button" className="kmx-btn ghost" style={{ color: '#B91C1C', fontSize: 13 }} onClick={() => setHuyAsk(l.id)}>Nhập nhầm? Hủy lô</button>
                )}
              </div>
            </section>
          )
        })}

        <h2 className="kmx-h2" style={{ padding: '6px 2px 0' }}>Sổ chuyển động · 14 ngày</h2>
        {!moves.length && !loading && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Chưa có chuyển động</div>}
        {moves.length > 0 && (
          <div className="kmx-list">
            {moves.map((m, k) => (
              <div key={`${m.loai}-${m.lot_id}-${m.issue_id ?? ''}-${m.thoi_diem}-${k}`} className="kmx-li">
                <span className="kmx-col">
                  <span style={{ fontSize: 13, fontWeight: 600 }}><span className={`kmx-chip ${m.loai === 'nhap_lo' ? 'ok' : m.loai === 'lay' ? 'blue' : 'amb'}`} style={{ marginRight: 6 }}>{m.loai === 'nhap_lo' ? 'Nhập lô' : m.loai === 'lay' ? 'Lấy' : 'Trả'}</span>{m.issue_code ? <Link to={`/m/kho/chen/phieu/${m.issue_id}`} className="kmx-mono" style={{ color: '#1B4D3E' }}>{m.issue_code}</Link> : <span className="kmx-mono">{m.lot_code}</span>}</span>
                  <span className="kmx-sm">{fmtDt(m.thoi_diem)} · {m.mo_ta || ''}{m.nguoi ? ` · ${m.nguoi}` : ''}</span>
                </span>
                <span className="kmx-num sm" style={{ color: m.kg < 0 ? '#B91C1C' : '#15803D', whiteSpace: 'nowrap' }}>{m.kg > 0 ? '+' : ''}{fmtKg(m.kg)}</span>
              </div>
            ))}
          </div>
        )}
      </div></div>
    </div>
  )
}
