// ============================================================================
// KhoIntake — tab "Nhập": phiếu cân chờ nhập kho; ghi DRC tại chỗ; thủ kho bấm "Nhận"
// File: src/pages/mobile/kho/KhoIntake.tsx · Route: /m/kho/nhap
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { rawStockService, type RawIntakeQueueRow } from '../../../services/wms/rawStockService'
import { useRawRole } from '../../../hooks/useRawRole'
import { FacilitySelect, KhoAppBar, Msg, fmtDt, fmtKg, inp, useKhoFacility } from './khoCommon'

export default function KhoIntake() {
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const role = useRawRole(facilityId)
  const [rows, setRows] = useState<RawIntakeQueueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [drcEdit, setDrcEdit] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true)
    try { setRows(await rawStockService.getIntakeQueue({ facilityId, limit: 100 })) }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không tải được hàng đợi' }) }
    finally { setLoading(false) }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const canReceive = role.isKeeper || role.isBGD || (!role.perms.co_thu_kho && role.perms.receive)
  const canDrc = role.isQC || role.isKeeper || role.isBGD

  async function nhan(r: RawIntakeQueueRow) {
    setBusy(r.ticket_id); setMsg(null)
    try {
      const res = await rawStockService.nhapKho(r.ticket_id)
      setMsg({ ok: true, text: `✅ Đã nhập ${res.length} lô: ${res.map((x) => `${x.batch_no} ${fmtKg(x.dry_kg)} kg khô`).join(', ')}` })
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
                {cho === 'cho_drc' && canDrc && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input style={{ ...inp, flex: 1 }} type="number" inputMode="decimal" step="0.1" placeholder={`DRC % (NCC báo ${r.expected_drc ?? '—'})`} value={drcEdit[r.ticket_id] ?? ''} onChange={(e) => setDrcEdit((d) => ({ ...d, [r.ticket_id]: e.target.value }))} aria-label="DRC" />
                    <button className="ops-btn o" style={{ width: 'auto', padding: '0 16px' }} disabled={busy === r.ticket_id} onClick={() => ghiDrc(r)}>Ghi DRC</button>
                  </div>
                )}
                {cho === 'loai_mu_la' && <div className="ops-sm" style={{ color: 'var(--red)' }}>Loại mủ "{r.rubber_type_goc}" chưa có trong danh mục, báo BGĐ thêm mã trên ERP.</div>}
                {r.san_sang && <button className="ops-btn g" disabled={!canReceive || busy === r.ticket_id} onClick={() => nhan(r)}>{busy === r.ticket_id ? 'Đang nhập…' : '📥 Thủ kho nhận vào kho'}</button>}
                {r.san_sang && !canReceive && <div className="ops-sm">Chỉ thủ kho NVL được chỉ định mới bấm nhận.</div>}
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
