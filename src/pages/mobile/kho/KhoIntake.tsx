// ============================================================================
// KhoIntake — tab "Nhập": phiếu cân chờ nhập kho; MÃ NGUYÊN LIỆU đọc sẵn từ phiếu (GĐ6),
// thủ kho xác nhận / chạm chọn mã đang mở / tạo mã mới; ghi DRC tại chỗ; thủ kho bấm "Nhận".
// Hệ kmx-* (Đợt 3 audit UI 17/11/2026 — trước dựng bằng ops-*, chip 30px chữ 10px).
// File: src/pages/mobile/kho/KhoIntake.tsx · Route: /m/kho/nhap
// ============================================================================
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { rawStockService, type RawIntakeQueueRow } from '../../../services/wms/rawStockService'
import { rawLotService, RAW_LOT_TRANG_THAI_LABELS, type MaGoiY, type RawLotBalance } from '../../../services/wms/rawLotService'
import { useRawRole } from '../../../hooks/useRawRole'
import { FacilitySelect, KhoLimitNote, KhoToast, Msg, fmtDt, fmtKg, useKhoFacility } from './khoCommon'
import { dichLoiHeThong } from '../../../utils/dichLoiHeThong'
import { fmtNum } from '../../../utils/format'
import { I } from './khoMixUtil'
import './khoMix.css'

interface MaChon { rawLotId?: string; ma?: string; label: string; moi?: boolean }
const LIMIT_PHIEU = 100   // hàng đợi tải một lần (mới nhất trước) — chạm trần thì báo

export default function KhoIntake() {
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const role = useRawRole(facilityId)
  const [chon, setChon] = useState<Record<string, MaChon>>({})
  const [picker, setPicker] = useState<string | null>(null)   // ticket_id đang chọn mã
  const [moiNguon, setMoiNguon] = useState('')
  const [moiSo, setMoiSo] = useState('')
  const [moiText, setMoiText] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [rowErr, setRowErr] = useState<{ id: string; text: string } | null>(null)   // lỗi nhập liệu của ĐÚNG phiếu đang thao tác — hiện trong thẻ
  const [drcEdit, setDrcEdit] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  // Hàng đợi nhập = màn chờ việc hằng ngày → TanStack Query tự làm mới mỗi 25 s (audit 17/11/2026)
  const query = useQuery({
    queryKey: ['kho-intake-queue', facilityId],
    queryFn: async () => {
      const r = await rawStockService.getIntakeQueue({ facilityId: facilityId!, limit: LIMIT_PHIEU })
      const [g, l, n] = await Promise.all([rawLotService.goiY(r.map((x) => x.ticket_id)), rawLotService.list(facilityId!), rawLotService.nguon(facilityId!)])
      return { rows: r, goiY: g, lots: l, nguon: n }
    },
    enabled: !!facilityId,
    refetchInterval: 25000,
    refetchOnWindowFocus: true,
  })
  const rows: RawIntakeQueueRow[] = query.data?.rows ?? []
  const goiY: Record<string, MaGoiY> = query.data?.goiY ?? {}
  const lots: RawLotBalance[] = query.data?.lots ?? []
  const nguon: { nguon: string; so_max: number }[] = query.data?.nguon ?? []
  const loading = query.isPending
  const load = () => query.refetch()

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
    if (!m) { setRowErr({ id: r.ticket_id, text: 'Chưa có mã nguyên liệu — chọn mã ở trên rồi bấm nhận' }); setPicker(r.ticket_id); return }
    setBusy(r.ticket_id); setMsg(null); setRowErr(null)
    try {
      const res = await rawStockService.nhapKho(r.ticket_id, { rawLotId: m.rawLotId ?? null, ma: m.rawLotId ? null : (m.ma ?? null) })
      setMsg({ ok: true, text: `✅ ${r.code} · mã ${m.ma || ''}: nhập ${res.length} lô xe, ${fmtKg(res.reduce((s, x) => s + x.dry_kg, 0))} kg khô` })
      setChon((c) => { const y = { ...c }; delete y[r.ticket_id]; return y })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: `${r.code}: ${dichLoiHeThong(e, 'Không nhập được')}` }) }
    finally { setBusy(null) }
  }

  async function ghiDrc(r: RawIntakeQueueRow) {
    const v = Number(drcEdit[r.ticket_id])
    if (!Number.isFinite(v) || v <= 0 || v > 100) { setRowErr({ id: r.ticket_id, text: 'DRC phải trong 0–100 %' }); return }
    setBusy(r.ticket_id); setMsg(null); setRowErr(null)
    try { await rawStockService.ghiDrcPhieu(r.ticket_id, v); setMsg({ ok: true, text: `✅ Đã ghi DRC ${fmtNum(v, 2)} % cho ${r.code}` }); await load() }
    catch (e: any) { setMsg({ ok: false, text: `${r.code}: ${dichLoiHeThong(e, 'Không ghi được DRC')}` }) }
    finally { setBusy(null) }
  }

  const chonMa = (ticketId: string, m: MaChon) => { setChon((c) => ({ ...c, [ticketId]: m })); setPicker(null); setMoiText(''); setMoiSo(''); setMoiNguon(''); if (rowErr?.id === ticketId) setRowErr(null) }
  const openPicker = (r: RawIntakeQueueRow) => {
    setPicker(r.ticket_id)
    const g = goiY[r.ticket_id]
    setMoiNguon(g?.nguon || nguon[0]?.nguon || ''); setMoiSo(g?.so ? String(g.so) : nguon[0] ? String(nguon[0].so_max + 1) : ''); setMoiText('')
  }

  const ready = rows.filter((r) => r.san_sang)
  const waiting = rows.filter((r) => !r.san_sang)

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <div className="kmx-hd-txt">
          <span className="kmx-eyebrow">Nhập NVL · {facility?.code || ''}</span>
          <span className="kmx-title">Phiếu cân chờ nhập</span>
        </div>
        <span className="kmx-hd-right">{ready.length} sẵn sàng<br />{waiting.length} chờ</span>
        <FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        {query.error != null && <Msg m={{ ok: false, text: dichLoiHeThong(query.error, 'Không tải được hàng đợi') }} onRetry={() => query.refetch()} />}
        {loading && !rows.length && <><div className="kmx-skel" /><div className="kmx-skel" /></>}
        <KhoLimitNote shown={rows.length} limit={LIMIT_PHIEU}>Đang hiện {LIMIT_PHIEU} phiếu chờ mới nhất — phiếu cũ hơn chưa hiện ở đây; nhập bớt hoặc xem đủ ở máy tính (/wms/nvl/nhap).</KhoLimitNote>
        {!loading && query.error == null && !rows.length && (
          <div className="kmx-card muted kmx-center" style={{ gap: 4 }}>
            <span className="kmx-strong">Không có phiếu chờ</span>
            <span className="kmx-sm">Phiếu cân hoàn tất sau ngày mở sổ sẽ hiện ở đây</span>
          </div>
        )}
        {rows.map((r) => {
          const cho = r.ly_do_cho
          const m = maCua(r)
          const g = goiY[r.ticket_id]
          const isPick = picker === r.ticket_id
          const err = rowErr?.id === r.ticket_id ? rowErr.text : null
          return (
            <section key={r.ticket_id} className="kmx-card" aria-label={`Phiếu ${r.code}`} style={{ gap: 8 }}>
              <div className="kmx-row">
                <span className="kmx-mono kmx-strong" style={{ fontSize: 15, fontWeight: 800 }}>{r.code}</span>
                <span className={`kmx-chip ${r.san_sang ? 'ok' : cho === 'loai_mu_la' ? 'red' : 'amb'}`}>{r.san_sang ? 'sẵn sàng' : cho === 'cho_drc' ? 'chờ DRC' : 'loại mủ lạ'}</span>
              </div>
              <div className="kmx-row" style={{ alignItems: 'flex-start' }}>
                <span className="kmx-col"><span style={{ fontSize: 14, fontWeight: 700 }}>{r.rubber_type_name || r.rubber_type_goc || '—'}</span><span className="kmx-sm">{r.supplier_name || ''}{r.vehicle_plate ? ` · ${r.vehicle_plate}` : ''} · {fmtDt(r.completed_at)}</span></span>
                <span className="kmx-col" style={{ alignItems: 'flex-end', flex: '0 0 auto' }}><span className="kmx-num md" style={{ whiteSpace: 'nowrap' }}>{fmtKg(r.net_weight)} <span className="kmx-sm">kg ướt</span></span><span className="kmx-sm kmx-mono" style={{ whiteSpace: 'nowrap' }}>DRC {fmtNum(r.drc_dung, 2)} %{r.dry_kg_du_kien ? ` → ${fmtKg(r.dry_kg_du_kien)} khô` : ''}</span></span>
              </div>

              {/* ── Mã nguyên liệu ── */}
              <div className={`kmx-tint${m ? '' : ' red'}`} style={{ alignItems: 'center' }}>
                <span className="kmx-col">
                  <span className="kmx-lbl">Mã nguyên liệu</span>
                  {m ? <span className="kmx-mono kmx-strong" style={{ fontSize: 15, fontWeight: 800 }}>{m.label}{m.moi && <span className="kmx-chip amb" style={{ marginLeft: 6 }}>mã mới</span>}</span> : <span style={{ fontWeight: 700 }}>Chưa có mã · phải chọn</span>}
                  {g?.ma_goc && <span className="kmx-sm">phiếu cân gõ: "{g.ma_goc.trim()}"</span>}
                </span>
                <button type="button" className="kmx-pill sm" aria-expanded={isPick} onClick={() => (isPick ? setPicker(null) : openPicker(r))}>{isPick ? 'Đóng' : m ? 'Đổi' : 'Chọn mã'}</button>
              </div>
              {isPick && (
                <div className="kmx-col" style={{ gap: 8 }}>
                  <span className="kmx-lbl">Mã đang mở · chạm để chọn</span>
                  {lotsMo.length ? (
                    <div className="kmx-seg">
                      {lotsMo.slice(0, 12).map((l) => (
                        <button key={l.raw_lot_id} type="button" style={{ lineHeight: 1.2, padding: '0 10px' }} onClick={() => chonMa(r.ticket_id, { rawLotId: l.raw_lot_id, ma: l.ma, label: l.ma })}>
                          {l.ma}<br /><small style={{ fontSize: 11, fontWeight: 500, opacity: 0.75 }}>{fmtKg(l.wet_kg)} kg · {RAW_LOT_TRANG_THAI_LABELS[l.trang_thai]}</small>
                        </button>
                      ))}
                    </div>
                  ) : <span className="kmx-sm">Chưa có mã nào đang mở</span>}
                  <span className="kmx-lbl">Mã mới · nguồn + số</span>
                  {nguon.length > 0 && <div className="kmx-seg">{nguon.slice(0, 8).map((n) => <button key={n.nguon} type="button" className={moiNguon === n.nguon ? 'on' : ''} aria-pressed={moiNguon === n.nguon} onClick={() => { setMoiNguon(n.nguon); setMoiSo(String(n.so_max + 1)) }}>{n.nguon}<span style={{ opacity: 0.7, fontWeight: 500 }}> · tới {n.so_max}</span></button>)}</div>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="kmx-text" style={{ flex: 1, minWidth: 0 }} placeholder="Nguồn (TMHG)" value={moiNguon} onChange={(e) => setMoiNguon(e.target.value.toUpperCase())} aria-label="Nguồn" />
                    <input className="kmx-text" style={{ width: 90, flex: '0 0 90px' }} type="number" inputMode="numeric" placeholder="Số" value={moiSo} onChange={(e) => setMoiSo(e.target.value)} aria-label="Số lô" />
                    <button type="button" className="kmx-btn" style={{ width: 'auto', flex: '0 0 auto', minHeight: 48, fontSize: 15, padding: '0 16px' }} disabled={!moiNguon.trim() || !moiSo.trim()} onClick={() => { const ma = `${moiNguon.trim().replace(/\s+/g, '')}-${moiSo.trim()}`; const ex = lots.find((l) => l.ma === ma); chonMa(r.ticket_id, ex ? { rawLotId: ex.raw_lot_id, ma, label: ma } : { ma, label: ma, moi: true }) }}>Dùng</button>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="kmx-text" style={{ flex: 1, minWidth: 0 }} placeholder="Hoặc gõ nguyên chữ trên phiếu (SBR-1502, TMMN 25 07…)" value={moiText} onChange={(e) => setMoiText(e.target.value)} aria-label="Mã tự do" />
                    <button type="button" className="kmx-btn sec" style={{ width: 'auto', flex: '0 0 auto', padding: '0 16px' }} disabled={!moiText.trim()} onClick={async () => { try { const p = await rawLotService.parse(moiText); const ma = p?.ma || moiText.trim().toUpperCase(); const ex = lots.find((l) => l.ma === ma); chonMa(r.ticket_id, ex ? { rawLotId: ex.raw_lot_id, ma, label: ma } : { ma, label: ma + (p?.xe ? ` · xe ${p.xe}` : ''), moi: true }) } catch (e: any) { setRowErr({ id: r.ticket_id, text: dichLoiHeThong(e, 'Không đọc được mã') }) } }}>Đọc</button>
                  </div>
                </div>
              )}

              {cho === 'cho_drc' && canDrc && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="kmx-text" style={{ flex: 1, minWidth: 0 }} type="number" inputMode="decimal" step="0.1" placeholder={`DRC % (NCC báo ${r.expected_drc ?? '—'})`} value={drcEdit[r.ticket_id] ?? ''} onChange={(e) => setDrcEdit((d) => ({ ...d, [r.ticket_id]: e.target.value }))} aria-label="DRC" />
                  <button type="button" className="kmx-btn sec" style={{ width: 'auto', flex: '0 0 auto', padding: '0 16px' }} disabled={busy === r.ticket_id} onClick={() => ghiDrc(r)}>Ghi DRC</button>
                </div>
              )}
              {cho === 'loai_mu_la' && <div className="kmx-note red" style={{ padding: '8px 12px' }}>{I.info}<span>Loại mủ "{r.rubber_type_goc}" chưa có trong danh mục, báo BGĐ thêm mã trên ERP.</span></div>}
              {err && <div className="kmx-note red" role="alert" style={{ padding: '8px 12px' }}>{I.info}<span>{err}</span></div>}
              {r.san_sang && <button type="button" className="kmx-btn md" disabled={!canReceive || busy === r.ticket_id} onClick={() => nhan(r)}>{I.intake}{busy === r.ticket_id ? 'Đang nhập…' : m ? `Nhận vào mã ${m.ma}` : 'Chọn mã rồi nhận'}</button>}
              {r.san_sang && !canReceive && <span className="kmx-sm">Chỉ thủ kho NVL được chỉ định mới bấm nhận.</span>}
            </section>
          )
        })}
      </div></div>
      <KhoToast m={msg} onClose={() => setMsg(null)} />
    </div>
  )
}
