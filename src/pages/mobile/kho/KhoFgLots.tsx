// ============================================================================
// KhoFgLots — tab "Thành phẩm" (GĐ7): tồn TP theo chủng loại (đạt / chưa kiểm / lỗi),
// lô TP của ngày, tổ ép THÊM LÔ ngay lúc nhập kho (số lô, chủng loại, số bành, ca, tổ, mã NVL).
// Hệ kmx-* (Đợt 3 audit UI 17/11/2026 — trước một màn trộn ops-* và kmx-*).
// File: src/pages/mobile/kho/KhoFgLots.tsx · Route: /m/kho/tp
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../../stores/authStore'
import { fgLotService, goiYSoLoKeTiep, FG_QC_CHIP, FG_QC_LABELS, type FgLot, type FgStockByMaterial } from '../../../services/wms/fgLotService'
import { rawLotService, RAW_LOT_TRANG_THAI_LABELS, type RawLotBalance } from '../../../services/wms/rawLotService'
import { shiftBookService, type ShiftMaterial } from '../../../services/wms/shiftBookService'
import type { OpsShiftOption } from '../../../services/opsService'
import { useRawRole } from '../../../hooks/useRawRole'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { fmtNum } from '../../../utils/format'
import { FacilitySelect, KHO_TEAMS, KhoLimitNote, KhoToast, Msg, fmtD, fmtKg, teamLabel, todayLocal, useKhoFacility, useKhoTeam } from './khoCommon'
import { I, detectShift, hhmm, type ShiftPick } from './khoMixUtil'
import './khoMix.css'

const LIMIT_LO = 200   // lô TP tải một lần (mới nhất trước) — chạm trần thì báo

export default function KhoFgLots() {
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const role = useRawRole(facilityId)
  const user = useAuthStore((s) => s.user)
  const [stock, setStock] = useState<FgStockByMaterial[]>([])
  const [lots, setLots] = useState<FgLot[]>([])
  const [date, setDate] = useState(todayLocal())
  const [filter, setFilter] = useState<'ngay' | 'loi' | 'chua_kiem'>('ngay')
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // thêm lô
  const [adding, setAdding] = useState(false)
  const [materials, setMaterials] = useState<ShiftMaterial[]>([])
  const [rawLots, setRawLots] = useState<RawLotBalance[]>([])
  const [shift, setShift] = useState<ShiftPick | null>(null)
  const [shifts, setShifts] = useState<OpsShiftOption[]>([])
  const [pickShift, setPickShift] = useState(false)
  const [team, setTeam] = useKhoTeam()   // nhớ tổ theo máy, chung key với màn Lấy / Trả hàng chèn
  const [materialId, setMaterialId] = useState('')
  const [soLo, setSoLo] = useState('')
  const [soBanh, setSoBanh] = useState('')
  const [rawLotId, setRawLotId] = useState('')
  const [coChen, setCoChen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setLoadErr(null)
    try {
      const [s, l] = await Promise.all([fgLotService.stockByMaterial(facilityId), filter === 'ngay' ? fgLotService.list(facilityId, { date, status: ['ton', 'het'], limit: LIMIT_LO }) : filter === 'loi' ? fgLotService.list(facilityId, { qc: ['cxl', 'loai'], onlyTon: true, limit: LIMIT_LO }) : fgLotService.list(facilityId, { qc: ['chua_kiem'], onlyTon: true, limit: LIMIT_LO })])
      setStock(s); setLots(l)
    } catch (e: any) { setLoadErr(dichLoiHeThong(e, 'Không tải được thành phẩm')) }
    finally { setLoading(false) }
  }, [facilityId, date, filter])
  useEffect(() => { load() }, [load])

  async function openAdd() {
    if (!facilityId) return
    setAdding(true); setMsg(null)
    try {
      const [m, r, d] = await Promise.all([shiftBookService.listMaterials(), rawLotService.list(facilityId, { onlyWithStock: false }), detectShift(user?.employee_id || null)])
      setMaterials(m.filter((x) => x.weightPerUnit && !['CHEN'].includes(x.code))); setRawLots(r.filter((x) => x.trang_thai === 'dang_chay' || x.trang_thai === 'san_sang' || x.trang_thai === 'trong' || x.trang_thai === 'da_chay_xong').slice(0, 20)); setShifts(d.shifts); setShift(d.pick)
      const dc = r.find((x) => x.trang_thai === 'dang_chay'); if (dc) setRawLotId(dc.raw_lot_id)
    } catch (e: any) { setMsg({ ok: false, text: dichLoiHeThong(e, 'Không tải được danh mục') }) }
  }

  const material = materials.find((m) => m.id === materialId)
  const lastOfMaterial = useMemo(() => lots.filter((l) => l.material_id === materialId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0], [lots, materialId])
  useEffect(() => { if (materialId && !soLo && lastOfMaterial) setSoLo(goiYSoLoKeTiep(lastOfMaterial.so_lo)) }, [materialId, lastOfMaterial]) // eslint-disable-line react-hooks/exhaustive-deps
  const banhN = soBanh === '' ? null : Number(soBanh)
  const banhOk = banhN !== null && Number.isInteger(banhN) && banhN > 0
  const kgTinh = material?.weightPerUnit && banhOk ? banhN! * material.weightPerUnit : null

  async function ghi() {
    if (!facilityId || !materialId || !banhOk || !shift) return
    setBusy(true); setMsg(null)
    try {
      await fgLotService.taoLo({ facilityId, soLo, materialId, soBanh: banhN!, shiftDate: todayLocal(), shiftId: shift.id, team: team.trim() || null, rawLotId: rawLotId || null, coChen, note: note.trim() || null })
      setMsg({ ok: true, text: `✅ Lô ${soLo.toUpperCase()} · ${material?.name} · ${banhN} bành (${fmtKg(kgTinh)} kg) đã vào kho TP, phiếu ca đã cộng` })
      setSoLo(''); setSoBanh(''); setNote(''); setCoChen(false); setAdding(false); await load()
    } catch (e: any) { setMsg({ ok: false, text: dichLoiHeThong(e, 'Không ghi được') }) }
    finally { setBusy(false) }
  }

  const tong = stock.reduce((a, s) => ({ dat: a.dat + s.dat_banh, loi: a.loi + s.loi_banh, chua: a.chua + s.chua_kiem_banh, kg: a.kg + s.ton_kg }), { dat: 0, loi: 0, chua: 0, kg: 0 })
  const canAdd = role.perms.submit || role.isBGD

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <div className="kmx-hd-txt">
          <span className="kmx-eyebrow">Kho thành phẩm · {facility?.code || ''}</span>
          <span className="kmx-title">Thành phẩm theo lô</span>
        </div>
        <span className="kmx-hd-right">tồn<br />{fmtKg(tong.kg)} kg</span>
        <FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        <Msg m={loadErr ? { ok: false, text: loadErr } : null} onRetry={() => load()} />
        <section className="kmx-card hero" aria-label="Tồn thành phẩm" style={{ gap: 8 }}>
          <div className="kmx-grid3">
            <div className="kmx-stat ok"><span className="kmx-lbl ok">Đạt</span><span className="kmx-num md ok">{tong.dat}</span><span className="kmx-sm">bành chờ xuất</span></div>
            <div className="kmx-stat"><span className="kmx-lbl">Chưa kiểm</span><span className="kmx-num md">{tong.chua}</span><span className="kmx-sm">bành</span></div>
            <div className="kmx-stat"><span className="kmx-lbl">Lỗi</span><span className={`kmx-num md${tong.loi ? ' red' : ''}`}>{tong.loi}</span><span className="kmx-sm">bành CXL · loại</span></div>
          </div>
          <span className="kmx-sm kmx-center">{stock.length} chủng loại · tồn {fmtKg(tong.kg)} kg</span>
        </section>

        {!adding ? (
          <button type="button" className="kmx-btn" disabled={!canAdd} onClick={openAdd}>{I.plus}Thêm lô vừa ép xong</button>
        ) : (
          <section className="kmx-card" aria-label="Lô thành phẩm mới" style={{ gap: 10 }}>
            <div className="kmx-row"><span className="kmx-strong" style={{ fontSize: 15 }}>Lô thành phẩm mới</span><button type="button" className="kmx-pill sm" onClick={() => setAdding(false)}>Đóng</button></div>
            <div className="kmx-col" style={{ gap: 6 }}>
              <span className="kmx-lbl">Chủng loại</span>
              <div className="kmx-seg">{materials.map((m) => <button key={m.id} type="button" className={materialId === m.id ? 'on' : ''} aria-pressed={materialId === m.id} style={{ minWidth: 0, padding: '0 10px' }} onClick={() => { setMaterialId(m.id); setSoLo('') }}>{m.name}</button>)}</div>
            </div>
            <div className="kmx-grid2">
              <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="fg-solo" className="kmx-lbl">Số lô</label><input id="fg-solo" className="kmx-text" style={{ fontFamily: 'var(--mono)', fontWeight: 700, textTransform: 'uppercase' }} placeholder={lastOfMaterial ? `sau ${lastOfMaterial.so_lo}` : 'S2308AB'} value={soLo} onChange={(e) => setSoLo(e.target.value.toUpperCase())} /></div>
              <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="fg-banh" className="kmx-lbl">Số bành</label><input id="fg-banh" className="kmx-input" style={{ height: 48, fontSize: 24 }} type="number" inputMode="numeric" placeholder="0" value={soBanh} onChange={(e) => setSoBanh(e.target.value)} /></div>
            </div>
            {material && <div className="kmx-tint"><span>{material.name} · {fmtNum(material.weightPerUnit, 2)} kg/bành</span><span className="kmx-num sm">{kgTinh !== null ? `${fmtKg(kgTinh)} kg` : '—'}</span></div>}
            <div className="kmx-row">
              <span className="kmx-col"><span className="kmx-lbl">Ca làm việc</span><span className="kmx-strong" style={{ fontSize: 14 }}>{shift ? `${shift.name}${shift.start_time ? ` · ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : ''}` : 'Chưa chọn ca'}</span></span>
              <button type="button" className="kmx-pill sm" onClick={() => setPickShift((v) => !v)}>{pickShift ? 'Đóng' : 'Đổi ca'}</button>
            </div>
            {pickShift && <div className="kmx-seg">{shifts.map((s) => <button key={s.id} type="button" className={shift?.id === s.id ? 'on' : ''} onClick={() => { setShift({ id: s.id, name: s.name, code: s.code, start_time: s.start_time, end_time: s.end_time, nguon: 'tay' }); setPickShift(false) }}>{s.name}</button>)}</div>}
            <div className="kmx-col" style={{ gap: 6 }}>
              <span className="kmx-lbl">Tổ (theo tổ trưởng)</span>
              <div className="kmx-seg" role="group" aria-label="Tổ">{KHO_TEAMS.map((t) => <button key={t} type="button" className={team === t ? 'on' : ''} aria-pressed={team === t} onClick={() => setTeam(t)}>{teamLabel(t)}</button>)}</div>
            </div>
            <div className="kmx-col" style={{ gap: 4 }}>
              <label htmlFor="fg-ma" className="kmx-lbl">Mã nguyên liệu đang chạy</label>
              <select id="fg-ma" className="kmx-text" value={rawLotId} onChange={(e) => setRawLotId(e.target.value)}><option value="">— chưa rõ —</option>{rawLots.map((r) => <option key={r.raw_lot_id} value={r.raw_lot_id}>{r.ma}{r.rubber_type_name ? ` · ${r.rubber_type_name}` : ''} · {RAW_LOT_TRANG_THAI_LABELS[r.trang_thai]}</option>)}</select>
            </div>
            <label className="kmx-check-row" htmlFor="fg-chen"><input id="fg-chen" type="checkbox" checked={coChen} onChange={(e) => setCoChen(e.target.checked)} /><span>Lô có chèn (SBR / hàng lỗi chạy lại)</span></label>
            <input className="kmx-text" placeholder="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Ghi chú" />
            <button type="button" className="kmx-btn" disabled={busy || !materialId || !soLo.trim() || !banhOk || !shift} onClick={ghi}>{busy ? 'Đang ghi…' : banhOk && material ? `Nhập kho TP · ${banhN} bành ${material.name}` : 'Nhập kho TP'}</button>
            <span className="kmx-sm kmx-center">Ghi xong, dòng chủng loại trong phiếu ca tự cộng số bành; QC kiểm sau.</span>
          </section>
        )}

        <div className="kmx-seg" role="group" aria-label="Lọc lô">
          {([['ngay', 'Theo ngày'], ['chua_kiem', 'Chưa kiểm'], ['loi', 'Lỗi (CXL/Loại)']] as const).map(([k, t]) => <button key={k} type="button" className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{t}</button>)}
        </div>
        {filter === 'ngay' && <input className="kmx-text" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value || todayLocal())} aria-label="Ngày" />}
        {loading && !lots.length && <div className="kmx-skel" />}
        <KhoLimitNote shown={lots.length} limit={LIMIT_LO}>Đang hiện {LIMIT_LO} lô mới nhất — đổi ngày hoặc bộ lọc để xem lô cũ hơn.</KhoLimitNote>
        {!loading && !loadErr && !lots.length && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>Không có lô</div>}
        {lots.map((l) => (
          <Link key={l.id} to={`/m/kho/tp/${l.id}`} className="kmx-card press" aria-label={`Lô ${l.so_lo}`} style={{ gap: 6 }}>
            <span className="kmx-row">
              <span className="kmx-mono kmx-strong" style={{ fontSize: 15, fontWeight: 800 }}>{l.so_lo}</span>
              <span style={{ display: 'flex', gap: 4 }}><span className={`kmx-chip ${FG_QC_CHIP[l.qc_status] ?? 'mut'}`}>{FG_QC_LABELS[l.qc_status]}</span>{l.status === 'het' && <span className="kmx-chip mut">hết</span>}</span>
            </span>
            <span className="kmx-row" style={{ alignItems: 'flex-start' }}>
              <span className="kmx-col"><span style={{ fontWeight: 700, fontSize: 14 }}>{l.material_name}{l.co_chen ? ' · có chèn' : ''}</span><span className="kmx-sm">{fmtD(l.shift_date)}{l.shift_name ? ` · ${l.shift_name}` : ''}{l.team ? ` · ${teamLabel(l.team)}` : ''}{l.ma_nvl ? ` · NVL ${l.ma_nvl}` : ''}</span></span>
              <span className="kmx-col" style={{ alignItems: 'flex-end', flex: '0 0 auto' }}><span className="kmx-num md" style={{ whiteSpace: 'nowrap' }}>{l.ton_banh}<span className="kmx-sm">/{l.so_banh} bành</span></span><span className="kmx-sm kmx-mono">{fmtKg(l.ton_kg)} kg</span></span>
            </span>
          </Link>
        ))}

        {stock.length > 0 && (
          <section aria-label="Tồn theo chủng loại" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 className="kmx-h2" style={{ padding: '6px 2px 0' }}>Tồn theo chủng loại (theo lô)</h2>
            <div className="kmx-list">
              {stock.map((s) => (
                <div key={s.material_id} className="kmx-li">
                  <span className="kmx-col"><span style={{ fontWeight: 700, fontSize: 14 }}>{s.material_name}</span><span className="kmx-sm">đạt {s.dat_banh}{s.chua_kiem_banh ? ` · chưa kiểm ${s.chua_kiem_banh}` : ''}{s.loi_banh ? ` · lỗi ${s.loi_banh}` : ''} · {s.so_lo} lô</span></span>
                  <span className="kmx-col" style={{ alignItems: 'flex-end', flex: '0 0 auto' }}><span className="kmx-num sm">{s.ton_banh} <span className="kmx-sm">bành</span></span><span className="kmx-sm">{fmtKg(s.ton_kg)} kg</span></span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div></div>
      <KhoToast m={msg} onClose={() => setMsg(null)} />
    </div>
  )
}
