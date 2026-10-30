// ============================================================================
// KhoIntake — tab "Nhập": phiếu cân chờ nhập kho; MÃ NGUYÊN LIỆU đọc sẵn từ phiếu (GĐ6),
// thủ kho xác nhận / chạm chọn mã đang mở / tạo mã mới; ghi DRC tại chỗ; thủ kho bấm "Nhận".
// File: src/pages/mobile/kho/KhoIntake.tsx · Route: /m/kho/nhap
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { rawStockService, type RawIntakeQueueRow } from '../../../services/wms/rawStockService'
import { rawLotService, RAW_LOT_TRANG_THAI_LABELS, type MaGoiY, type RawLotBalance } from '../../../services/wms/rawLotService'
import { useRawRole } from '../../../hooks/useRawRole'
import { FacilitySelect, KhoAppBar, Msg, fmtDt, fmtKg, inp, useKhoFacility } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

interface MaChon { rawLotId?: string; ma?: string; label: string; moi?: boolean }

export default function KhoIntake() {
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const role = useRawRole(facilityId)
  const [rows, setRows] = useState<RawIntakeQueueRow[]>([])
  const [goiY, setGoiY] = useState<Record<string, MaGoiY>>({})
  const [lots, setLots] = useState<RawLotBalance[]>([])
  const [nguon, setNguon] = useState<{ nguon: string; so_max: number }[]>([])
  const [chon, setChon] = useState<Record<string, MaChon>>({})
  const [picker, setPicker] = useState<string | null>(null)   // ticket_id đang chọn mã
  const [moiNguon, setMoiNguon] = useState('')
  const [moiSo, setMoiSo] = useState('')
  const [moiText, setMoiText] = useState('')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [drcEdit, setDrcEdit] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true)
    try {
      const r = await rawStockService.getIntakeQueue({ facilityId, limit: 100 })
      const [g, l, n] = await Promise.all([rawLotService.goiY(r.map((x) => x.ticket_id)), rawLotService.list(facilityId), rawLotService.nguon(facilityId)])
      setRows(r); setGoiY(g); setLots(l); setNguon(n)
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không tải được hàng đợi' }) }
    finally { setLoading(false) }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const canReceive = role.isKeeper || role.isBGD || (!role.perms.co_thu_kho && role.perms.receive)
  const canDrc = role.isQC || role.isKeeper || role.isBGD
  const lotsMo = useMemo(() => lots.filter((l) => l.status === 'mo' && l.trang_thai !== 'da_chay_xong'), [lots])

  /** Mã hiệu lực của một phiếu: người chọn > gợi ý từ phiếu */
  const maCua = (r: RawIntakeQueueRow): MaChon | null => {
    const c = chon[r.ticket_id]; if (c) return c
    const g = goiY[r.ticket_id]
    if (g?.ma) return { rawLotId: g.raw_lot_id ?? undefined, ma: g.ma, label: g.ma + (g.xe ? ` · xe ${g.xe}` : ''), moi: !g.raw_lot_id }
    return null
  }

  async function nhan(r: RawIntakeQueueRow) {
    const m = maCua(r)
    if (!m) { setMsg({ ok: false, text: `${r.code}: chưa có mã nguyên liệu, chạm "Chọn mã" trước` }); setPicker(r.ticket_id); return }
    setBusy(r.ticket_id); setMsg(null)
    try {
      const res = await rawStockService.nhapKho(r.ticket_id, { rawLotId: m.rawLotId ?? null, ma: m.rawLotId ? null : (m.ma ?? null) })
      setMsg({ ok: true, text: `✅ Mã ${m.ma || ''}: nhập ${res.length} lô xe, ${fmtKg(res.reduce((s, x) => s + x.dry_kg, 0))} kg khô` })
      setChon((c) => { const y = { ...c }; delete y[r.ticket_id]; return y })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không nhập được' }) }
    finally { setBusy(null) }
  }

  async function ghiDrc(r: RawIntakeQueueRow) {
    const v = Number(drcEdit[r.ticket_id])
    if (!Number.isFinite(v) || v <= 0 || v > 100) { setMsg({ ok: false, text: 'DRC phải trong 0–100 %' }); return }
    setBusy(r.ticket_id); setMsg(null)
    try { await rawStockService.ghiDrcPhieu(r.ticket_id, v); setMsg({ ok: true, text: `✅ Đã ghi DRC ${v} % cho ${r.code}` }); await load() }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không ghi được DRC' }) }
    finally { setBusy(null) }
  }

  const chonMa = (ticketId: string, m: MaChon) => { setChon((c) => ({ ...c, [ticketId]: m })); setPicker(null); setMoiText(''); setMoiSo(''); setMoiNguon('') }
  const openPicker = (r: RawIntakeQueueRow) => {
    setPicker(r.ticket_id)
    const g = goiY[r.ticket_id]
    setMoiNguon(g?.nguon || nguon[0]?.nguon || ''); setMoiSo(g?.so ? String(g.so) : nguon[0] ? String(nguon[0].so_max + 1) : ''); setMoiText('')
  }

  const ready = rows.filter((r) => r.san_sang)
  const waiting = rows.filter((r) => !r.san_sang)

  return (
    <>
      <KhoAppBar title="Nhập NVL từ phiếu cân" sub={<span>{facility?.code || ''} · {ready.length} sẵn sàng · {waiting.length} chờ</span>}
        right={<FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />} />
      <div className="ops-body">
        <div className="ops-inner">
          <Msg m={msg} />
          {loading && !rows.length && <><div className="ops-skel" /><div className="ops-skel" /></>}
          {!loading && !rows.length && <div className="ops-empty"><div className="em">✅</div><div className="et">Không có phiếu chờ</div><div className="ed">Phiếu cân hoàn tất sau ngày mở sổ sẽ hiện ở đây</div></div>}
          {rows.map((r) => {
            const cho = r.ly_do_cho
            const m = maCua(r)
            const g = goiY[r.ticket_id]
            const isPick = picker === r.ticket_id
            return (
              <div key={r.ticket_id} className="ops-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="ops-rw">
                  <div className="ops-mono" style={{ fontWeight: 800 }}>{r.code}</div>
                  <span className={`ops-chip ${r.san_sang ? 'ok' : cho === 'loai_mu_la' ? 'red' : 'amb'}`}>{r.san_sang ? 'sẵn sàng' : cho === 'cho_drc' ? 'chờ DRC' : 'loại mủ lạ'}</span>
                </div>
                <div className="ops-rw">
                  <div><div style={{ fontWeight: 700 }}>{r.rubber_type_name || r.rubber_type_goc || '—'}</div><div className="ops-sm">{r.supplier_name || ''}{r.vehicle_plate ? ` · ${r.vehicle_plate}` : ''} · {fmtDt(r.completed_at)}</div></div>
                  <div style={{ textAlign: 'right' }}><div className="ops-mid ops-mono">{fmtKg(r.net_weight)} <span className="ops-sm">kg ướt</span></div><div className="ops-sm ops-mono">DRC {r.drc_dung ?? '—'} %{r.dry_kg_du_kien ? ` → ${fmtKg(r.dry_kg_du_kien)} khô` : ''}</div></div>
                </div>

                {/* ── Mã nguyên liệu ── */}
                <div className="ops-rw" style={{ background: m ? 'var(--ok-bg)' : 'var(--red-bg)', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="ops-lbl" style={{ marginBottom: 0 }}>Mã nguyên liệu</div>
                    {m ? <div className="ops-mono" style={{ fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>{m.label}{m.moi && <span className="ops-chip amb" style={{ marginLeft: 6 }}>mã mới</span>}</div> : <div style={{ fontWeight: 700, color: 'var(--red)' }}>Chưa có mã · phải chọn</div>}
                    {g?.ma_goc && <div className="ops-sm">phiếu cân gõ: "{g.ma_goc.trim()}"</div>}
                  </div>
                  <button type="button" className="ops-btn o" style={{ width: 'auto', padding: '8px 12px', fontSize: 13 }} onClick={() => (isPick ? setPicker(null) : openPicker(r))}>{isPick ? 'Đóng' : m ? 'Đổi' : 'Chọn mã'}</button>
                </div>
                {isPick && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surf-2)', borderRadius: 10, padding: 10 }}>
                    <div className="ops-lbl" style={{ marginBottom: 0 }}>Mã đang mở · chạm để chọn</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {lotsMo.slice(0, 12).map((l) => (
                        <button key={l.raw_lot_id} type="button" className="ops-chip lime" style={{ border: 0, cursor: 'pointer', padding: '8px 11px', fontSize: 12.5 }} onClick={() => chonMa(r.ticket_id, { rawLotId: l.raw_lot_id, ma: l.ma, label: l.ma })}>
                          {l.ma}<span style={{ opacity: .7 }}> · {fmtKg(l.wet_kg)} kg · {RAW_LOT_TRANG_THAI_LABELS[l.trang_thai]}</span>
                        </button>
                      ))}
                      {!lotsMo.length && <span className="ops-sm">Chưa có mã nào đang mở</span>}
                    </div>
                    <div className="ops-lbl" style={{ marginBottom: 0 }}>Mã mới · nguồn + số</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {nguon.slice(0, 8).map((n) => <button key={n.nguon} type="button" className={`ops-chip ${moiNguon === n.nguon ? 'lime' : 'mut'}`} style={{ border: 0, cursor: 'pointer', padding: '8px 11px', fontSize: 12.5 }} onClick={() => { setMoiNguon(n.nguon); setMoiSo(String(n.so_max + 1)) }}>{n.nguon}<span style={{ opacity: .7 }}> · tới {n.so_max}</span></button>)}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input style={{ ...inp, flex: 1 }} placeholder="Nguồn (TMHG)" value={moiNguon} onChange={(e) => setMoiNguon(e.target.value.toUpperCase())} aria-label="Nguồn" />
                      <input style={{ ...inp, width: 90, flex: '0 0 90px' }} type="number" inputMode="numeric" placeholder="Số" value={moiSo} onChange={(e) => setMoiSo(e.target.value)} aria-label="Số lô" />
                      <button type="button" className="ops-btn g" style={{ width: 'auto', padding: '0 14px' }} disabled={!moiNguon.trim() || !moiSo.trim()} onClick={() => { const ma = `${moiNguon.trim().replace(/\s+/g, '')}-${moiSo.trim()}`; const ex = lots.find((l) => l.ma === ma); chonMa(r.ticket_id, ex ? { rawLotId: ex.raw_lot_id, ma, label: ma } : { ma, label: ma, moi: true }) }}>Dùng</button>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input style={{ ...inp, flex: 1 }} placeholder="Hoặc gõ nguyên chữ trên phiếu (SBR-1502, TMMN 25 07…)" value={moiText} onChange={(e) => setMoiText(e.target.value)} aria-label="Mã tự do" />
                      <button type="button" className="ops-btn o" style={{ width: 'auto', padding: '0 14px' }} disabled={!moiText.trim()} onClick={async () => { try { const p = await rawLotService.parse(moiText); const ma = p?.ma || moiText.trim().toUpperCase(); const ex = lots.find((l) => l.ma === ma); chonMa(r.ticket_id, ex ? { rawLotId: ex.raw_lot_id, ma, label: ma } : { ma, label: ma + (p?.xe ? ` · xe ${p.xe}` : ''), moi: true }) } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không đọc được mã' }) } }}>Đọc</button>
                    </div>
                  </div>
                )}

                {cho === 'cho_drc' && canDrc && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input style={{ ...inp, flex: 1 }} type="number" inputMode="decimal" step="0.1" placeholder={`DRC % (NCC báo ${r.expected_drc ?? '—'})`} value={drcEdit[r.ticket_id] ?? ''} onChange={(e) => setDrcEdit((d) => ({ ...d, [r.ticket_id]: e.target.value }))} aria-label="DRC" />
                    <button type="button" className="ops-btn o" style={{ width: 'auto', padding: '0 16px' }} disabled={busy === r.ticket_id} onClick={() => ghiDrc(r)}>Ghi DRC</button>
                  </div>
                )}
                {cho === 'loai_mu_la' && <div className="ops-sm" style={{ color: 'var(--red)' }}>Loại mủ "{r.rubber_type_goc}" chưa có trong danh mục, báo BGĐ thêm mã trên ERP.</div>}
                {r.san_sang && <button type="button" className="ops-btn g" disabled={!canReceive || busy === r.ticket_id} onClick={() => nhan(r)}>{busy === r.ticket_id ? 'Đang nhập…' : m ? `📥 Nhận vào mã ${m.ma}` : '📥 Chọn mã rồi nhận'}</button>}
                {r.san_sang && !canReceive && <div className="ops-sm">Chỉ thủ kho NVL được chỉ định mới bấm nhận.</div>}
              </div>
            )
          })}
        </div>
      </div>
      <span style={{ display: 'none' }}>{I.check}</span>
    </>
  )
}
