// ============================================================================
// KhoLots — tab "Lô NVL": tồn theo MÃ NGUYÊN LIỆU (GĐ6), chạm mã → thấy từng lô xe,
// chạm xe → cân lại; nút "Xuất cả mã" đi sang màn xuất sản xuất theo mã.
// Hệ kmx-* (Đợt 3 audit UI 17/11/2026 — trước dựng bằng ops-*, chip 30px chữ 10px).
// File: src/pages/mobile/kho/KhoLots.tsx · Route: /m/kho
// ============================================================================
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { rawStockService, type RawBatchBalance } from '../../../services/wms/rawStockService'
import { rawLotService, RAW_LOT_TRANG_THAI_CHIP, RAW_LOT_TRANG_THAI_LABELS, type RawLotBalance, type RawLotChen } from '../../../services/wms/rawLotService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { fmtNum } from '../../../utils/format'
import { FacilitySelect, KhoLimitNote, KhoToast, Msg, fmtD, fmtKg, useKhoFacility } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

const LIMIT_XE = 1000   // tải một lần tối đa chừng này lô xe còn hàng — chạm trần thì báo, không im lặng

export default function KhoLots() {
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
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [chenErr, setChenErr] = useState<string | null>(null)   // số chèn theo mã không tải được — báo, đừng làm mất khối im lặng
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [maMoi, setMaMoi] = useState('')   // tạo mã trước khi hàng về

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true); setLoadErr(null)
    try {
      // Số chèn là phần phụ: hỏng thì danh sách mã vẫn hiện, nhưng NÓI RA (trước .catch(() => []) → khối "Chèn vào mã" biến mất im lặng)
      const chenP = rawLotService.chen(facilityId).then((x) => ({ x, e: null as unknown }), (e: unknown) => ({ x: [] as RawLotChen[], e }))
      const [l, b, s, c] = await Promise.all([rawLotService.list(facilityId, { includeClosed: true }), rawStockService.getBatches({ facilityId, limit: LIMIT_XE }), rawSettingsService.getForFacility(facilityId), chenP])
      setLots(l); setRows(b); setSettings(s); setChen(new Map(c.x.map((x) => [x.raw_lot_id, x])))
      setChenErr(c.e ? dichLoiHeThong(c.e, 'Lỗi tải số chèn') : null)
    } catch (e: any) { setLoadErr(dichLoiHeThong(e, 'Không tải được lô')) }
    finally { setLoading(false) }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const due = (r: RawBatchBalance) => r.ngay_tu_lan_do >= settings.chu_ky_can_lai_ngay
  const byLot = useMemo(() => {
    const m = new Map<string, RawBatchBalance[]>()
    for (const r of rows) { const k = r.raw_lot_id || '__none__'; (m.get(k) ?? m.set(k, []).get(k)!).push(r) }
    return m
  }, [rows])
  const list = useMemo(() => {
    const s = q.trim().toUpperCase()
    return lots
      .filter((l) => filter === 'done' ? l.trang_thai === 'da_chay_xong' || l.status !== 'mo' : l.dry_kg > 0.005 || (l.status === 'mo' && (l.trang_thai === 'trong' || l.trang_thai === 'dang_chay')))   // mã tạo trước / đang chạy chưa có hàng vẫn hiện
      .filter((l) => filter !== 'due' || (byLot.get(l.raw_lot_id) ?? []).some(due))
      .filter((l) => !s || l.ma.includes(s) || l.rubber_type_name.toUpperCase().includes(s) || (byLot.get(l.raw_lot_id) ?? []).some((r) => r.batch_no.toUpperCase().includes(s)))
  }, [lots, q, filter, byLot]) // eslint-disable-line react-hooks/exhaustive-deps
  const chuaGan = byLot.get('__none__') ?? []
  const tongKho = lots.reduce((s, l) => s + l.dry_kg, 0)
  const tongUot = lots.reduce((s, l) => s + l.wet_kg, 0)
  const nDue = rows.filter(due).length
  const coQuyen = role.isKeeper || role.isQC || role.isBGD

  async function ganMa(batch: RawBatchBalance, rawLotId: string) {
    setBusy(batch.batch_id); setMsg(null)
    try { await rawStockService.ganMa(batch.batch_id, rawLotId); setMsg({ ok: true, text: `✅ ${batch.batch_no} đã gán mã` }); setGan(null); await load() }
    catch (e: any) { setMsg({ ok: false, text: dichLoiHeThong(e, 'Không gán được') }) }
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
      setMsg({ ok: true, text: ganCho ? `✅ ${ganCho.batch_no} đã gán mã ${ma}` : `✅ Đã tạo mã ${ma} (Chưa có hàng) — chọn được ở tab Chèn (Bắt đầu lệnh) và sổ ca` })
      setMaMoi(''); setGan(null); await load()
    } catch (e: any) { setMsg({ ok: false, text: dichLoiHeThong(e, 'Không tạo được mã') }) }
    finally { setBusy(null) }
  }

  const XeCard = ({ r }: { r: RawBatchBalance }) => (
    <Link to={`/m/kho/lo/${r.batch_id}`} className="kmx-link" style={{ justifyContent: 'space-between', padding: '10px 12px' }}>
      <span className="kmx-col">
        <span className="kmx-mono kmx-strong" style={{ fontSize: 13 }}>{r.xe_no ? `Xe ${r.xe_no} · ` : ''}{r.batch_no}</span>
        <span className="kmx-sm">{r.supplier_name || ''}{r.received_date ? ` · ${fmtD(r.received_date)}` : ''} · {r.tuoi_ngay} ng{due(r) ? ' · cân lại' : ''}</span>
      </span>
      <span className="kmx-col" style={{ alignItems: 'flex-end', flex: '0 0 auto' }}>
        <span className="kmx-mono kmx-strong" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{fmtKg(r.dry_kg)} <span className="kmx-sm">khô</span></span>
        <span className="kmx-sm kmx-mono" style={{ whiteSpace: 'nowrap' }}>{fmtKg(r.wet_kg)} ướt · {fmtNum(r.drc_pct, 2)} %</span>
      </span>
    </Link>
  )

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <div className="kmx-hd-txt">
          <span className="kmx-eyebrow">Kho NVL mủ · {facility?.name || facility?.code || ''} · {role.isKeeper ? 'Thủ kho' : role.isQC ? 'QC' : role.isBGD ? 'BGĐ' : 'Chỉ xem'}</span>
          <span className="kmx-title">Tồn theo mã</span>
        </div>
        <FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        <Msg m={loadErr ? { ok: false, text: loadErr } : null} onRetry={() => load()} />
        {chenErr && !loadErr && (
          <div className="kmx-note amb" role="alert">
            {I.info}
            <span style={{ flex: 1, minWidth: 0 }}><b>Chưa hiện được số chèn vào từng mã</b> — danh sách mã vẫn dùng được, chỉ thiếu khối "Chèn vào mã".<br />{chenErr}</span>
            <button type="button" className="kmx-pill sm" onClick={() => load()}>Thử lại</button>
          </div>
        )}
        <section className="kmx-card hero" aria-label="Tồn kho NVL" style={{ gap: 6 }}>
          <div className="kmx-row" style={{ alignItems: 'flex-end' }}>
            <span className="kmx-col"><span className="kmx-lbl ok">Tồn khô</span><span className="kmx-num lg">{fmtKg(tongKho)}<span className="kmx-unit"> kg</span></span></span>
            <span className="kmx-col" style={{ alignItems: 'flex-end' }}><span className="kmx-lbl">Ướt</span><span className="kmx-num md">{fmtKg(tongUot)}<span className="kmx-unit"> kg</span></span></span>
          </div>
          <span className="kmx-sm">{lots.filter((l) => l.dry_kg > 0.005).length} mã còn hàng · {rows.length} lô xe</span>
        </section>
        <KhoLimitNote shown={rows.length} limit={LIMIT_XE}>Chỉ tải {fmtNum(LIMIT_XE)} lô xe còn hàng cũ nhất — số xe của các mã mới về có thể thiếu; xem đủ ở máy tính (/wms/nvl).</KhoLimitNote>
        <input className="kmx-text" placeholder="Tìm mã (TMHG-40), loại mủ, mã lô xe…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm" />
        <div className="kmx-seg" role="group" aria-label="Lọc mã">
          {([['all', 'Còn hàng'], ['due', `Có xe đến hạn cân lại · ${nDue}`], ['done', 'Đã chạy xong / đóng']] as const).map(([k, t]) => (
            <button key={k} type="button" className={filter === k ? 'on' : ''} aria-pressed={filter === k} onClick={() => setFilter(k)}>{t}</button>
          ))}
        </div>
        {coQuyen && (
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="kmx-text" style={{ flex: 1, minWidth: 0 }} placeholder="Tạo mã trước khi hàng về: TMHG-41, KHMN 15…" value={maMoi} onChange={(e) => setMaMoi(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') taoMa(maMoi) }} aria-label="Mã mới" />
            <button type="button" className="kmx-btn sec" style={{ width: 'auto', flex: '0 0 auto', padding: '0 16px' }} disabled={!maMoi.trim() || busy === 'ma_moi'} onClick={() => taoMa(maMoi)}>{busy === 'ma_moi' ? 'Đang tạo…' : 'Tạo mã'}</button>
          </div>
        )}
        {loading && !lots.length && <><div className="kmx-skel" /><div className="kmx-skel" /></>}
        {!loading && !loadErr && !list.length && (
          <div className="kmx-card muted kmx-center" style={{ gap: 4 }}>
            <span className="kmx-strong">Không có mã</span>
            <span className="kmx-sm">{lots.length ? 'Đổi bộ lọc hoặc từ khóa' : 'Kho chưa có mã nguyên liệu nào — nhập từ phiếu cân ở tab Nhập'}</span>
          </div>
        )}

        {list.map((l) => {
          const xe = byLot.get(l.raw_lot_id) ?? []
          const isOpen = open === l.raw_lot_id
          const toggle = () => setOpen(isOpen ? null : l.raw_lot_id)
          const c = chen.get(l.raw_lot_id)
          const loai = c && c.chen_kg > 0 ? [c.chen_be_kg > 0 ? `bể Slap ${fmtKg(c.chen_be_kg)}` : '', c.chen_mix_kg > 0 ? `máy Mix ${fmtKg(c.chen_mix_kg)}` : '', c.chen_bt_kg > 0 ? `băng tải ${fmtKg(c.chen_bt_kg)}` : '', c.chen_loi_kg > 0 ? `lỗi ${fmtKg(c.chen_loi_kg)}` : '', c.chen_dkl_kg > 0 ? `DKL ${fmtKg(c.chen_dkl_kg)}` : '', c.chen_chuan_kg > 0 ? `chuẩn ${fmtKg(c.chen_chuan_kg)}` : '', c.chen_khac_kg > 0 ? `khác ${fmtKg(c.chen_khac_kg)}` : ''].filter(Boolean).join(' · ') : ''
          return (
            <section key={l.raw_lot_id} className="kmx-card" aria-label={`Mã ${l.ma}`} style={{ gap: 8 }}>
              <div className="kmx-row" onClick={toggle} role="button" tabIndex={0} aria-expanded={isOpen} onKeyDown={(e) => e.key === 'Enter' && toggle()} style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
                <span className="kmx-col">
                  <span className="kmx-mono kmx-strong" style={{ fontSize: 17, fontWeight: 800 }}>{l.ma}</span>
                  <span className="kmx-sm">{l.rubber_type_name || '—'} · {l.so_xe} xe{l.ngay_dau ? ` · về ${fmtD(l.ngay_dau)}${l.ngay_cuoi && l.ngay_cuoi !== l.ngay_dau ? `→${fmtD(l.ngay_cuoi)}` : ''}` : ''}{l.tuoi_ngay !== null ? ` · ${l.tuoi_ngay} ng` : ''}</span>
                </span>
                <span className="kmx-col" style={{ alignItems: 'flex-end', flex: '0 0 auto' }}>
                  <span className="kmx-num md" style={{ whiteSpace: 'nowrap' }}>{fmtKg(l.dry_kg)} <span className="kmx-sm">kg khô</span></span>
                  <span className="kmx-sm kmx-mono" style={{ whiteSpace: 'nowrap' }}>{fmtKg(l.wet_kg)} ướt · DRC {fmtNum(l.drc_pct, 2)} %</span>
                </span>
              </div>
              <span><span className={`kmx-chip ${RAW_LOT_TRANG_THAI_CHIP[l.trang_thai]}`}>{RAW_LOT_TRANG_THAI_LABELS[l.trang_thai]}{l.xuat_sx_kho_kg ? ` · đã xuất ${fmtKg(l.xuat_sx_kho_kg)} khô` : ''}</span></span>
              {c && c.chen_kg > 0 && (
                <div className="kmx-note amb" style={{ flexDirection: 'column', gap: 2, padding: '8px 12px', fontSize: 12.5 }}>
                  <span><b>Chèn vào mã:</b> <span className="kmx-mono">{fmtKg(c.chen_kg)} kg</span>{c.so_banh_chen ? ` · ${c.so_banh_chen} bành` : ''} · {c.so_phieu_chen} phiếu{c.ty_le_chen_pct !== null ? ` · ${fmtNum(c.ty_le_chen_pct, 2)} % hàng vào máy` : ''}</span>
                  {loai && <span>{loai} kg</span>}
                  {isOpen && c.chi_tiet.map((d, k) => <span key={`${d.lot_code}-${d.vi_tri}-${k}`} className="kmx-mono">· {d.so_lo || d.lot_code}{d.vi_tri ? ` ${d.vi_tri === 'be_slap' ? 'bể Slap' : 'máy Mix'}` : ''}{d.desc ? ` (${d.desc})` : ''} {fmtKg(d.kg)} kg{d.so_banh ? ` · ${d.so_banh} bành` : ''}{d.co_chung ? ' · chèn chung mã khác' : ''}</span>)}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {l.dry_kg > 0.005 && <Link to={`/m/kho/xuat?lot=${l.raw_lot_id}`} className="kmx-btn sec">{I.intake}Xuất cả mã</Link>}
                <button type="button" className="kmx-btn sec" aria-expanded={isOpen} onClick={toggle}>{isOpen ? 'Thu gọn' : `${xe.length} xe ›`}</button>
              </div>
              {isOpen && <div className="kmx-col" style={{ gap: 6 }}>{xe.map((r) => <XeCard key={r.batch_id} r={r} />)}{!xe.length && <span className="kmx-sm">Mã chưa có lô xe còn hàng</span>}</div>}
            </section>
          )
        })}

        {chuaGan.length > 0 && (
          <>
            <h2 className="kmx-h2" style={{ padding: '6px 2px 0' }}>Lô xe chưa gán mã · {chuaGan.length}</h2>
            {chuaGan.map((r) => (
              <section key={r.batch_id} className="kmx-card" aria-label={`Lô xe ${r.batch_no}`} style={{ gap: 8 }}>
                <XeCard r={r} />
                {gan === r.batch_id ? (
                  <div className="kmx-col" style={{ gap: 8 }}>
                    <span className="kmx-lbl">Mã đang mở · chạm để gán</span>
                    <div className="kmx-seg">{lots.filter((l) => l.status === 'mo').map((l) => <button key={l.raw_lot_id} type="button" disabled={busy === r.batch_id} onClick={() => ganMa(r, l.raw_lot_id)}>{l.ma}</button>)}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input className="kmx-text" style={{ flex: 1, minWidth: 0 }} placeholder="Mã mới…" value={maMoi} onChange={(e) => setMaMoi(e.target.value)} aria-label="Mã mới để gán" />
                      <button type="button" className="kmx-btn sec" style={{ width: 'auto', flex: '0 0 auto', padding: '0 14px' }} disabled={!maMoi.trim() || busy === 'ma_moi'} onClick={() => taoMa(maMoi, r)}>Tạo mã & gán</button>
                    </div>
                    <button type="button" className="kmx-btn ghost" onClick={() => setGan(null)}>Thôi</button>
                  </div>
                ) : <button type="button" className="kmx-btn sec" disabled={!coQuyen} onClick={() => setGan(r.batch_id)}>Gán mã nguyên liệu</button>}
              </section>
            ))}
          </>
        )}
      </div></div>
      <KhoToast m={msg} onClose={() => setMsg(null)} />
    </div>
  )
}
