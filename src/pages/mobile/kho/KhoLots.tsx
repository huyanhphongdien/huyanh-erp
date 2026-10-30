// ============================================================================
// KhoLots — tab "Lô NVL": tồn theo MÃ NGUYÊN LIỆU (GĐ6), chạm mã → thấy từng lô xe,
// chạm xe → cân lại; nút "Xuất cả mã" đi sang màn xuất sản xuất theo mã.
// File: src/pages/mobile/kho/KhoLots.tsx · Route: /m/kho
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { rawStockService, type RawBatchBalance } from '../../../services/wms/rawStockService'
import { rawLotService, RAW_LOT_TRANG_THAI_CHIP, RAW_LOT_TRANG_THAI_LABELS, type RawLotBalance, type RawLotChen } from '../../../services/wms/rawLotService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { FacilitySelect, KhoAppBar, Msg, fmtD, fmtKg, inp, useKhoFacility } from './khoCommon'

export default function KhoLots() {
  const nav = useNavigate()
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const role = useRawRole(facilityId)
  const [lots, setLots] = useState<RawLotBalance[]>([])
  const [rows, setRows] = useState<RawBatchBalance[]>([])
  const [chen, setChen] = useState<Map<string, RawLotChen>>(new Map())
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'due' | 'done'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [gan, setGan] = useState<string | null>(null)   // batch đang gán mã
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [maMoi, setMaMoi] = useState('')   // tạo mã trước khi hàng về

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true)
    try {
      const [l, b, s, c] = await Promise.all([rawLotService.list(facilityId, { includeClosed: true }), rawStockService.getBatches({ facilityId, limit: 1000 }), rawSettingsService.getForFacility(facilityId), rawLotService.chen(facilityId).catch(() => [] as RawLotChen[])])
      setLots(l); setRows(b); setSettings(s); setChen(new Map(c.map((x) => [x.raw_lot_id, x])))
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không tải được lô' }) }
    finally { setLoading(false) }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const due = (r: RawBatchBalance) => r.ngay_tu_lan_do >= settings.chu_ky_can_lai_ngay
  const byLot = useMemo(() => {
    const m = new Map<string, RawBatchBalance[]>()
    for (const r of rows) { const k = (r as any).raw_lot_id || '__none__'; (m.get(k) ?? m.set(k, []).get(k)!).push(r) }
    return m
  }, [rows])
  const list = useMemo(() => {
    const s = q.trim().toUpperCase()
    return lots
      .filter((l) => filter === 'done' ? l.trang_thai === 'da_chay_xong' || l.status !== 'mo' : l.dry_kg > 0.005)
      .filter((l) => filter !== 'due' || (byLot.get(l.raw_lot_id) ?? []).some(due))
      .filter((l) => !s || l.ma.includes(s) || l.rubber_type_name.toUpperCase().includes(s) || (byLot.get(l.raw_lot_id) ?? []).some((r) => r.batch_no.toUpperCase().includes(s)))
  }, [lots, q, filter, byLot]) // eslint-disable-line react-hooks/exhaustive-deps
  const chuaGan = byLot.get('__none__') ?? []
  const tongKho = lots.reduce((s, l) => s + l.dry_kg, 0)
  const tongUot = lots.reduce((s, l) => s + l.wet_kg, 0)
  const nDue = rows.filter(due).length

  async function ganMa(batch: RawBatchBalance, rawLotId: string) {
    setBusy(batch.batch_id); setMsg(null)
    try { await rawStockService.ganMa(batch.batch_id, rawLotId); setMsg({ ok: true, text: `✅ ${batch.batch_no} đã gán mã` }); setGan(null); await load() }
    catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không gán được' }) }
    finally { setBusy(null) }
  }

  // tạo mã trước khi hàng về (bình thường mã sinh lúc nhận phiếu cân vào kho) — để khai lệnh chạy / sổ ca sớm; có thể gán ngay cho lô xe chưa mã
  async function taoMa(text: string, ganCho?: RawBatchBalance) {
    const raw = text.trim(); if (!raw || !facilityId) return
    setBusy('ma_moi'); setMsg(null)
    try {
      const p = await rawLotService.parse(raw).catch(() => null)
      const ma = p?.ma || raw.toUpperCase().replace(/\s+/g, '-')
      const id = await rawLotService.layHoacTao(facilityId, ma)
      if (ganCho) await rawStockService.ganMa(ganCho.batch_id, id)
      setMsg({ ok: true, text: ganCho ? `✅ ${ganCho.batch_no} đã gán mã ${ma}` : `✅ Đã tạo mã ${ma} — chọn được ở tab Chèn (Bắt đầu lệnh) và sổ ca; chưa có hàng nên chưa hiện ở "Còn hàng"` })
      setMaMoi(''); setGan(null); await load()
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không tạo được mã' }) }
    finally { setBusy(null) }
  }

  const XeCard = ({ r }: { r: RawBatchBalance }) => (
    <div className="ops-card press" style={{ padding: '9px 12px', boxShadow: 'none', border: '1px solid var(--line)' }} onClick={() => nav(`/m/kho/lo/${r.batch_id}`)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/m/kho/lo/${r.batch_id}`)}>
      <div className="ops-rw">
        <div><div className="ops-mono" style={{ fontWeight: 700, fontSize: 13 }}>{(r as any).xe_no ? `Xe ${(r as any).xe_no} · ` : ''}{r.batch_no}</div><div className="ops-sm">{r.supplier_name || ''}{r.received_date ? ` · ${fmtD(r.received_date)}` : ''} · {r.tuoi_ngay} ng{due(r) ? ' · cân lại' : ''}</div></div>
        <div style={{ textAlign: 'right' }}><div className="ops-mono" style={{ fontWeight: 700 }}>{fmtKg(r.dry_kg)} <span className="ops-sm">khô</span></div><div className="ops-sm ops-mono">{fmtKg(r.wet_kg)} ướt · {r.drc_pct ?? '—'} %</div></div>
      </div>
    </div>
  )

  return (
    <>
      <KhoAppBar title="Kho NVL mủ · theo mã" sub={<span>{facility?.name || facility?.code || ''} · {role.isKeeper ? 'Thủ kho' : role.isQC ? 'QC' : role.isBGD ? 'BGĐ' : 'Xem'}</span>}
        right={<FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />} />
      <div className="ops-body">
        <div className="ops-inner">
          <div className="ops-card tint">
            <div className="ops-rw">
              <div><div className="ops-lbl">Tồn khô</div><div className="ops-big">{fmtKg(tongKho)}<span className="ops-sm"> kg</span></div></div>
              <div style={{ textAlign: 'right' }}><div className="ops-lbl">Ướt · mã</div><div className="ops-mid">{fmtKg(tongUot)} kg</div><div className="ops-sm">{lots.filter((l) => l.dry_kg > 0.005).length} mã còn hàng · {rows.length} lô xe</div></div>
            </div>
          </div>
          <Msg m={msg} />
          <input style={inp} placeholder="Tìm mã (TMHG-40), loại mủ, mã lô xe…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm" />
          <div style={{ display: 'flex', gap: 6 }}>
            {([['all', 'Còn hàng'], ['due', `Có xe đến hạn cân lại · ${nDue}`], ['done', 'Đã chạy xong / đóng']] as const).map(([k, t]) => (
              <button key={k} className={`ops-chip ${filter === k ? 'lime' : 'mut'}`} style={{ border: 0, cursor: 'pointer', padding: '7px 11px', fontSize: 12 }} onClick={() => setFilter(k)}>{t}</button>
            ))}
          </div>
          {(role.isKeeper || role.isQC || role.isBGD) && (
            <div style={{ display: 'flex', gap: 6 }}>
              <input style={{ ...inp, flex: 1 }} placeholder="Tạo mã trước khi hàng về: TMHG-41, KHMN 15…" value={maMoi} onChange={(e) => setMaMoi(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') taoMa(maMoi) }} aria-label="Mã mới" />
              <button type="button" className="ops-btn o" style={{ width: 'auto', padding: '0 14px' }} disabled={!maMoi.trim() || busy === 'ma_moi'} onClick={() => taoMa(maMoi)}>{busy === 'ma_moi' ? '…' : 'Tạo mã'}</button>
            </div>
          )}
          {loading && !lots.length && <><div className="ops-skel" /><div className="ops-skel" /></>}
          {!loading && !list.length && <div className="ops-empty"><div className="em">📦</div><div className="et">Không có mã</div><div className="ed">{lots.length ? 'Đổi bộ lọc hoặc từ khóa' : 'Kho chưa có mã nguyên liệu nào — nhập từ phiếu cân ở tab Nhập'}</div></div>}

          {list.map((l) => {
            const xe = byLot.get(l.raw_lot_id) ?? []
            const isOpen = open === l.raw_lot_id
            return (
              <div key={l.raw_lot_id} className="ops-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="ops-rw" onClick={() => setOpen(isOpen ? null : l.raw_lot_id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen(isOpen ? null : l.raw_lot_id)} style={{ cursor: 'pointer' }}>
                  <div><div className="ops-mono" style={{ fontWeight: 800, fontSize: 17 }}>{l.ma}</div><div className="ops-sm">{l.rubber_type_name || '—'} · {l.so_xe} xe{l.ngay_dau ? ` · về ${fmtD(l.ngay_dau)}${l.ngay_cuoi && l.ngay_cuoi !== l.ngay_dau ? `→${fmtD(l.ngay_cuoi)}` : ''}` : ''}{l.tuoi_ngay !== null ? ` · ${l.tuoi_ngay} ng` : ''}</div></div>
                  <div style={{ textAlign: 'right' }}><div className="ops-mid ops-mono">{fmtKg(l.dry_kg)} <span className="ops-sm">kg khô</span></div><div className="ops-sm ops-mono">{fmtKg(l.wet_kg)} ướt · DRC {l.drc_pct ?? '—'} %</div></div>
                </div>
                <div className="ops-rw">
                  <span className={`ops-chip ${RAW_LOT_TRANG_THAI_CHIP[l.trang_thai]}`}>{RAW_LOT_TRANG_THAI_LABELS[l.trang_thai]}{l.xuat_sx_kho_kg ? ` · đã xuất ${fmtKg(l.xuat_sx_kho_kg)} khô` : ''}</span>
                  <span style={{ display: 'flex', gap: 6 }}>
                    {l.dry_kg > 0.005 && <Link to={`/m/kho/xuat?lot=${l.raw_lot_id}`} className="ops-chip lime" style={{ textDecoration: 'none', padding: '7px 11px', fontSize: 12 }}>Xuất cả mã ›</Link>}
                    <button type="button" className="ops-chip mut" style={{ border: 0, cursor: 'pointer', padding: '7px 11px', fontSize: 12 }} onClick={() => setOpen(isOpen ? null : l.raw_lot_id)}>{isOpen ? 'Thu gọn' : `${xe.length} xe ›`}</button>
                  </span>
                </div>
                {(() => {
                  const c = chen.get(l.raw_lot_id)
                  if (!c || c.chen_kg <= 0) return null
                  const loai = [c.chen_be_kg > 0 ? `bể Slap ${fmtKg(c.chen_be_kg)}` : '', c.chen_mix_kg > 0 ? `máy Mix ${fmtKg(c.chen_mix_kg)}` : '', c.chen_loi_kg > 0 ? `lỗi ${fmtKg(c.chen_loi_kg)}` : '', c.chen_dkl_kg > 0 ? `DKL ${fmtKg(c.chen_dkl_kg)}` : '', c.chen_chuan_kg > 0 ? `chuẩn ${fmtKg(c.chen_chuan_kg)}` : '', c.chen_khac_kg > 0 ? `khác ${fmtKg(c.chen_khac_kg)}` : ''].filter(Boolean).join(' · ')
                  return (
                    <div className="ops-sm" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 8px', background: 'var(--tint, #FFF7E6)', borderRadius: 8 }}>
                      <span><b>Chèn vào mã:</b> <span className="ops-mono">{fmtKg(c.chen_kg)} kg</span>{c.so_banh_chen ? ` · ${c.so_banh_chen} bành` : ''} · {c.so_phieu_chen} phiếu{c.ty_le_chen_pct !== null ? ` · ${c.ty_le_chen_pct} % hàng vào máy` : ''}</span>
                      {loai && <span>{loai} kg</span>}
                      {isOpen && c.chi_tiet.map((d, k) => <span key={`${d.lot_code}-${d.vi_tri}-${k}`} className="ops-mono">· {d.so_lo || d.lot_code}{d.vi_tri ? ` ${d.vi_tri === 'be_slap' ? 'bể Slap' : 'máy Mix'}` : ''}{d.desc ? ` (${d.desc})` : ''} {fmtKg(d.kg)} kg{d.so_banh ? ` · ${d.so_banh} bành` : ''}{d.co_chung ? ' · chèn chung mã khác' : ''}</span>)}
                    </div>
                  )
                })()}
                {isOpen && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{xe.map((r) => <XeCard key={r.batch_id} r={r} />)}{!xe.length && <span className="ops-sm">Mã chưa có lô xe còn hàng</span>}</div>}
              </div>
            )
          })}

          {chuaGan.length > 0 && (
            <>
              <div className="ops-sh">Lô xe chưa gán mã · {chuaGan.length}</div>
              {chuaGan.map((r) => (
                <div key={r.batch_id} className="ops-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <XeCard r={r} />
                  {gan === r.batch_id ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {lots.filter((l) => l.status === 'mo').map((l) => <button key={l.raw_lot_id} type="button" className="ops-chip lime" style={{ border: 0, cursor: 'pointer', padding: '8px 11px', fontSize: 12.5 }} disabled={busy === r.batch_id} onClick={() => ganMa(r, l.raw_lot_id)}>{l.ma}</button>)}
                      <input style={{ ...inp, width: 150, flex: '0 0 150px', padding: 8 }} placeholder="Mã mới…" value={maMoi} onChange={(e) => setMaMoi(e.target.value)} aria-label="Mã mới để gán" />
                      <button type="button" className="ops-chip lime" style={{ border: 0, cursor: 'pointer', padding: '8px 11px', fontSize: 12.5 }} disabled={!maMoi.trim() || busy === 'ma_moi'} onClick={() => taoMa(maMoi, r)}>Tạo mã & gán</button>
                      <button type="button" className="ops-chip mut" style={{ border: 0, cursor: 'pointer', padding: '8px 11px', fontSize: 12.5 }} onClick={() => setGan(null)}>Thôi</button>
                    </div>
                  ) : <button type="button" className="ops-btn o" style={{ padding: 9, fontSize: 13 }} disabled={!(role.isKeeper || role.isQC || role.isBGD)} onClick={() => setGan(r.batch_id)}>Gán mã nguyên liệu</button>}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  )
}
