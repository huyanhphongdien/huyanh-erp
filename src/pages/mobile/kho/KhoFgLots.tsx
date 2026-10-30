// ============================================================================
// KhoFgLots — tab "Thành phẩm" (GĐ7): tồn TP theo chủng loại (đạt / chưa kiểm / lỗi),
// lô TP của ngày, tổ ép THÊM LÔ ngay lúc nhập kho (số lô, chủng loại, số bành, ca, mã NVL).
// File: src/pages/mobile/kho/KhoFgLots.tsx · Route: /m/kho/tp
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../../stores/authStore'
import { fgLotService, goiYSoLoKeTiep, FG_QC_CHIP, FG_QC_LABELS, type FgLot, type FgStockByMaterial } from '../../../services/wms/fgLotService'
import { rawLotService, type RawLotBalance } from '../../../services/wms/rawLotService'
import { shiftBookService, type ShiftMaterial } from '../../../services/wms/shiftBookService'
import { mixService } from '../../../services/wms/mixService'
import type { OpsShiftOption } from '../../../services/opsService'
import { useRawRole } from '../../../hooks/useRawRole'
import { FacilitySelect, KhoAppBar, Msg, fmtD, fmtKg, inp, inpBig, lbl, todayLocal, useKhoFacility } from './khoCommon'
import { detectShift, hhmm, type ShiftPick } from './khoMixUtil'
import './khoMix.css'

export default function KhoFgLots() {
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const role = useRawRole(facilityId)
  const user = useAuthStore((s) => s.user)
  const [stock, setStock] = useState<FgStockByMaterial[]>([])
  const [lots, setLots] = useState<FgLot[]>([])
  const [date, setDate] = useState(todayLocal())
  const [filter, setFilter] = useState<'ngay' | 'loi' | 'chua_kiem'>('ngay')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  // thêm lô
  const [adding, setAdding] = useState(false)
  const [materials, setMaterials] = useState<ShiftMaterial[]>([])
  const [rawLots, setRawLots] = useState<RawLotBalance[]>([])
  const [shift, setShift] = useState<ShiftPick | null>(null)
  const [shifts, setShifts] = useState<OpsShiftOption[]>([])
  const [pickShift, setPickShift] = useState(false)
  const [teams, setTeams] = useState<string[]>(['Đen', 'Vàng'])
  const [team, setTeam] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [soLo, setSoLo] = useState('')
  const [soBanh, setSoBanh] = useState('')
  const [rawLotId, setRawLotId] = useState('')
  const [coChen, setCoChen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true)
    try {
      const [s, l] = await Promise.all([fgLotService.stockByMaterial(facilityId), filter === 'ngay' ? fgLotService.list(facilityId, { date, status: ['ton', 'het'] }) : filter === 'loi' ? fgLotService.list(facilityId, { qc: ['cxl', 'loai'], onlyTon: true }) : fgLotService.list(facilityId, { qc: ['chua_kiem'], onlyTon: true })])
      setStock(s); setLots(l)
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không tải được thành phẩm' }) }
    finally { setLoading(false) }
  }, [facilityId, date, filter])
  useEffect(() => { load() }, [load])

  async function openAdd() {
    if (!facilityId) return
    setAdding(true); setMsg(null)
    try {
      const [m, r, d, t] = await Promise.all([shiftBookService.listMaterials(), rawLotService.list(facilityId, { onlyWithStock: false }), detectShift(user?.employee_id || null), mixService.listTeams(facilityId)])
      setMaterials(m.filter((x) => x.weightPerUnit && !['CHEN'].includes(x.code))); setRawLots(r.filter((x) => x.trang_thai === 'dang_chay' || x.trang_thai === 'san_sang' || x.trang_thai === 'da_chay_xong').slice(0, 20)); setShifts(d.shifts); setShift(d.pick); setTeams([...new Set([...t, 'Đen', 'Vàng'])])
      const dc = r.find((x) => x.trang_thai === 'dang_chay'); if (dc) setRawLotId(dc.raw_lot_id)
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không tải được danh mục' }) }
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
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không ghi được' }) }
    finally { setBusy(false) }
  }

  const tong = stock.reduce((a, s) => ({ dat: a.dat + s.dat_banh, loi: a.loi + s.loi_banh, chua: a.chua + s.chua_kiem_banh, kg: a.kg + s.ton_kg }), { dat: 0, loi: 0, chua: 0, kg: 0 })
  const canAdd = role.perms.submit || role.isBGD

  return (
    <>
      <KhoAppBar title="Kho thành phẩm · theo lô" sub={<span>{facility?.code || ''} · tồn {fmtKg(tong.kg)} kg</span>} right={<FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />} />
      <div className="ops-body">
        <div className="ops-inner">
          <Msg m={msg} />
          <div className="ops-card tint">
            <div className="ops-rw">
              <div><div className="ops-lbl">Đạt · chờ xuất</div><div className="ops-big">{tong.dat}<span className="ops-sm"> bành</span></div></div>
              <div style={{ textAlign: 'right' }}><div className="ops-lbl">Chưa kiểm · lỗi</div><div className="ops-mid ops-mono">{tong.chua} · <span style={{ color: tong.loi ? 'var(--red)' : undefined }}>{tong.loi}</span> bành</div><div className="ops-sm">{stock.length} chủng loại</div></div>
            </div>
          </div>

          {!adding ? (
            <button type="button" className="ops-btn l" disabled={!canAdd} onClick={openAdd}>➕ Thêm lô vừa ép xong</button>
          ) : (
            <div className="kmx" style={{ flex: 'none', background: 'transparent' }}>
              <section className="kmx-card" style={{ gap: 10 }}>
                <div className="kmx-row"><span className="kmx-strong" style={{ fontSize: 15 }}>Lô thành phẩm mới</span><button type="button" className="kmx-pill sm" onClick={() => setAdding(false)}>Đóng</button></div>
                <div className="kmx-col" style={{ gap: 6 }}>
                  <span className="kmx-lbl">Chủng loại</span>
                  <div className="kmx-seg">{materials.map((m) => <button key={m.id} type="button" className={materialId === m.id ? 'on' : ''} style={{ minWidth: 0, height: 40, fontSize: 12.5, padding: '0 10px' }} onClick={() => { setMaterialId(m.id); setSoLo('') }}>{m.name}</button>)}</div>
                </div>
                <div className="kmx-grid2">
                  <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="fg-solo" className="kmx-lbl">Số lô</label><input id="fg-solo" className="kmx-text" style={{ fontFamily: 'var(--mono)', fontWeight: 700, textTransform: 'uppercase' }} placeholder={lastOfMaterial ? `sau ${lastOfMaterial.so_lo}` : 'S2308AB'} value={soLo} onChange={(e) => setSoLo(e.target.value.toUpperCase())} /></div>
                  <div className="kmx-col" style={{ gap: 4 }}><label htmlFor="fg-banh" className="kmx-lbl">Số bành</label><input id="fg-banh" className="kmx-input" style={{ height: 48, fontSize: 24 }} type="number" inputMode="numeric" placeholder="0" value={soBanh} onChange={(e) => setSoBanh(e.target.value)} /></div>
                </div>
                {material && <div className="kmx-tint"><span>{material.name} · {material.weightPerUnit} kg/bành</span><span className="kmx-num sm">{kgTinh !== null ? `${fmtKg(kgTinh)} kg` : '—'}</span></div>}
                <div className="kmx-row">
                  <span className="kmx-col"><span className="kmx-lbl">Ca · tổ</span><span className="kmx-strong" style={{ fontSize: 14 }}>{shift ? `${shift.name}${shift.start_time ? ` · ${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : ''}` : 'Chưa chọn ca'}</span></span>
                  <button type="button" className="kmx-pill sm" onClick={() => setPickShift((v) => !v)}>{pickShift ? 'Đóng' : 'Đổi ca'}</button>
                </div>
                {pickShift && <div className="kmx-seg">{shifts.map((s) => <button key={s.id} type="button" className={shift?.id === s.id ? 'on' : ''} onClick={() => { setShift({ id: s.id, name: s.name, code: s.code, start_time: s.start_time, end_time: s.end_time, nguon: 'tay' }); setPickShift(false) }}>{s.name}</button>)}</div>}
                <div className="kmx-seg">{teams.map((t) => <button key={t} type="button" className={team === t ? 'on' : ''} style={{ height: 40 }} onClick={() => setTeam(t)}>Tổ {t}</button>)}</div>
                <div className="kmx-col" style={{ gap: 4 }}>
                  <label htmlFor="fg-ma" className="kmx-lbl">Mã nguyên liệu đang chạy</label>
                  <select id="fg-ma" className="kmx-text" value={rawLotId} onChange={(e) => setRawLotId(e.target.value)}><option value="">— chưa rõ —</option>{rawLots.map((r) => <option key={r.raw_lot_id} value={r.raw_lot_id}>{r.ma} · {r.rubber_type_name} · {r.trang_thai === 'dang_chay' ? 'đang chạy' : r.trang_thai === 'san_sang' ? 'sẵn sàng' : 'đã chạy xong'}</option>)}</select>
                </div>
                <label className="kmx-check-row" htmlFor="fg-chen"><input id="fg-chen" type="checkbox" checked={coChen} onChange={(e) => setCoChen(e.target.checked)} /><span>Lô có chèn (SBR / hàng lỗi chạy lại)</span></label>
                <input className="kmx-text" placeholder="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Ghi chú" />
                <button type="button" className="kmx-btn" disabled={busy || !materialId || !soLo.trim() || !banhOk || !shift} onClick={ghi}>{busy ? 'Đang ghi…' : banhOk && material ? `Nhập kho TP · ${banhN} bành ${material.name}` : 'Nhập kho TP'}</button>
                <span className="kmx-sm kmx-center">Ghi xong, dòng chủng loại trong phiếu ca tự cộng số bành; QC kiểm sau.</span>
              </section>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6 }}>
            {([['ngay', 'Theo ngày'], ['chua_kiem', `Chưa kiểm`], ['loi', `Lỗi (CXL/Loại)`]] as const).map(([k, t]) => <button key={k} className={`ops-chip ${filter === k ? 'lime' : 'mut'}`} style={{ border: 0, cursor: 'pointer', padding: '7px 11px', fontSize: 12 }} onClick={() => setFilter(k)}>{t}</button>)}
          </div>
          {filter === 'ngay' && <input style={inp} type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value || todayLocal())} aria-label="Ngày" />}
          {loading && !lots.length && <div className="ops-skel" />}
          {!loading && !lots.length && <div className="ops-card ops-sm" style={{ textAlign: 'center' }}>Không có lô</div>}
          {lots.map((l) => (
            <Link key={l.id} to={`/m/kho/tp/${l.id}`} className="ops-card press" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div className="ops-rw">
                <div className="ops-mono" style={{ fontWeight: 800, fontSize: 15 }}>{l.so_lo}</div>
                <span style={{ display: 'flex', gap: 4 }}><span className={`ops-chip ${FG_QC_CHIP[l.qc_status] === 'ok' ? 'ok' : FG_QC_CHIP[l.qc_status] === 'red' ? 'red' : FG_QC_CHIP[l.qc_status] === 'amb' ? 'amb' : 'mut'}`}>{FG_QC_LABELS[l.qc_status]}</span>{l.status === 'het' && <span className="ops-chip mut">hết</span>}</span>
              </div>
              <div className="ops-rw" style={{ marginTop: 4 }}>
                <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{l.material_name}{l.co_chen ? ' · có chèn' : ''}</div><div className="ops-sm">{fmtD(l.shift_date)}{l.shift_name ? ` · ${l.shift_name}` : ''}{l.team ? ` · Tổ ${l.team}` : ''}{l.ma_nvl ? ` · NVL ${l.ma_nvl}` : ''}</div></div>
                <div style={{ textAlign: 'right' }}><div className="ops-mid ops-mono">{l.ton_banh}<span className="ops-sm">/{l.so_banh} bành</span></div><div className="ops-sm ops-mono">{fmtKg(l.ton_kg)} kg</div></div>
              </div>
            </Link>
          ))}

          {stock.length > 0 && (
            <>
              <div className="ops-sh">Tồn theo chủng loại (theo lô)</div>
              <div className="ops-card" style={{ padding: '4px 13px' }}>
                {stock.map((s) => (
                  <div key={s.material_id} className="ops-rw" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <div><div style={{ fontWeight: 700, fontSize: 13 }}>{s.material_name}</div><div className="ops-sm">đạt {s.dat_banh}{s.chua_kiem_banh ? ` · chưa kiểm ${s.chua_kiem_banh}` : ''}{s.loi_banh ? ` · lỗi ${s.loi_banh}` : ''} · {s.so_lo} lô</div></div>
                    <div className="ops-mono" style={{ textAlign: 'right', fontWeight: 700 }}>{s.ton_banh} <span className="ops-sm">bành</span><div className="ops-sm">{fmtKg(s.ton_kg)} kg</div></div>
                  </div>
                ))}
              </div>
            </>
          )}
          <span style={{ display: 'none' }}>{lbl && inpBig && null}</span>
        </div>
      </div>
    </>
  )
}
