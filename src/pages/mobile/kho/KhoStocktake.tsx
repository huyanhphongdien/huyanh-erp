// ============================================================================
// KhoStocktake — tab "Kiểm kê": đếm từng lô ngay tại bãi (quét tem hoặc chạm), ghi kg ướt
// đếm được (+ DRC nếu lấy mẫu), lý do khi lệch khô quá ngưỡng, Hoàn tất đếm → BGĐ duyệt.
// File: src/pages/mobile/kho/KhoStocktake.tsx · Route: /m/kho/kiem-ke
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import OpsQrScanner from '../OpsQrScanner'
import { rawStocktakeService, RAW_STOCKTAKE_STATUS_LABELS, type RawStocktake, type RawStocktakeLine } from '../../../services/wms/rawStocktakeService'
import { rawSettingsService } from '../../../services/wms/rawSettingsService'
import { RAW_SETTINGS_DEFAULT, type RawSettings } from '../../../services/wms/raw.types'
import { useRawRole } from '../../../hooks/useRawRole'
import { FacilitySelect, fmtKg, fmtSigned, parseKhoScan, todayLocal, useKhoFacility } from './khoCommon'
import { I } from './khoMixUtil'
import './khoMix.css'

const LY_DO = ['Tạp chất / đất lẫn', 'Mẫu DRC đầu vào không đại diện', 'Cân sai lúc nhập', 'Lô chồng lẫn, cân lẫn lô', 'Mất mát / thất thoát', 'Khác']

export default function KhoStocktake() {
  const { facilities, facilityId, facility, setFacilityId } = useKhoFacility()
  const role = useRawRole(facilityId)
  const [list, setList] = useState<RawStocktake[]>([])
  const [st, setSt] = useState<RawStocktake | null>(null)
  const [lines, setLines] = useState<RawStocktakeLine[]>([])
  const [settings, setSettings] = useState<RawSettings>(RAW_SETTINGS_DEFAULT)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [edit, setEdit] = useState<Record<string, { wet: string; drc: string; lyDo: string }>>({})
  const [filter, setFilter] = useState<'chua' | 'tat_ca'>('chua')
  const [q, setQ] = useState('')
  const [scan, setScan] = useState(false)
  const [hi, setHi] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLElement | null>>({})

  const load = useCallback(async (keepId?: string | null) => {
    if (!facilityId) return
    setLoading(true)
    try {
      const [l, s] = await Promise.all([rawStocktakeService.list(facilityId, 20), rawSettingsService.getForFacility(facilityId)])
      setList(l); setSettings(s)
      const open = l.find((x) => x.status === 'draft') || l.find((x) => x.status === 'counted') || (keepId ? l.find((x) => x.id === keepId) : null) || l[0] || null
      if (open) { const d = await rawStocktakeService.get(open.id); setSt(d?.stocktake ?? open); setLines(d?.lines ?? []) } else { setSt(null); setLines([]) }
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Không tải được kiểm kê' }) }
    finally { setLoading(false) }
  }, [facilityId])
  useEffect(() => { load() }, [load])

  const canCount = role.isKeeper || role.isQC || role.isBGD
  const canApprove = role.perms.approve_adjust || role.isBGD
  const editing = !!st && st.status === 'draft'
  const nguong = settings.nguong_lech_kho_pct
  const daDem = lines.filter((l) => l.counted_wet_kg !== null).length

  const rows = useMemo(() => {
    const s = q.trim().toUpperCase()
    return lines.filter((l) => (filter === 'chua' ? l.counted_wet_kg === null : true)).filter((l) => !s || l.batch_no.toUpperCase().includes(s) || l.rubber_type_name.toUpperCase().includes(s))
  }, [lines, filter, q])

  const preview = (l: RawStocktakeLine) => {
    const e = edit[l.id]; const wet = e && e.wet !== '' ? Number(e.wet) : null
    if (wet === null || !Number.isFinite(wet)) return null
    const drc = e.drc !== '' && Number.isFinite(Number(e.drc)) ? Number(e.drc) : (l.book_drc_pct ?? 0)
    const dry = Math.round(wet * drc) / 100
    const lech = l.book_dry_kg > 0 ? (100 * (dry - l.book_dry_kg)) / l.book_dry_kg : null
    return { dry, chenh: dry - l.book_dry_kg, lech, vuot: lech !== null && Math.abs(lech) > nguong }
  }

  async function ghi(l: RawStocktakeLine) {
    const e = edit[l.id]; const p = preview(l)
    if (!e || !p) { setMsg({ ok: false, text: 'Nhập kg ướt đếm được' }); return }
    if (p.vuot && !e.lyDo) { setMsg({ ok: false, text: `${l.batch_no}: lệch khô quá ${nguong} %, chọn lý do` }); return }
    setBusy(l.id); setMsg(null)
    try {
      const r = await rawStocktakeService.ghiDem(l.id, Number(e.wet), e.drc !== '' ? Number(e.drc) : null, e.lyDo || null, null)
      setMsg({ ok: true, text: `${l.batch_no}: đếm ${fmtKg(Number(e.wet))} kg ướt → ${fmtKg(r.counted_dry_kg)} kg khô (${fmtSigned(r.chenh_kho_kg)} kg)` })
      setEdit((x) => { const y = { ...x }; delete y[l.id]; return y })
      await load(st?.id)
    } catch (e2: any) { setMsg({ ok: false, text: e2?.message || 'Không ghi được' }) }
    finally { setBusy(null) }
  }

  async function act(buoc: 'count_done' | 'approve' | 'cancel' | 'create') {
    if (!facilityId) return
    setBusy(buoc); setMsg(null)
    try {
      if (buoc === 'create') { const id = await rawStocktakeService.create(facilityId, todayLocal(), 'Tạo từ điện thoại'); setMsg({ ok: true, text: 'Đã tạo phiếu kiểm kê hôm nay' }); await load(id); return }
      if (!st) return
      const r = await rawStocktakeService.ky(st.id, buoc)
      setMsg({ ok: true, text: buoc === 'count_done' ? 'Đã hoàn tất đếm, chờ BGĐ duyệt' : buoc === 'approve' ? `Đã duyệt: điều chỉnh ${r.so_lo_dieu_chinh} lô, ${fmtSigned(r.chenh_kho_kg)} kg khô, khóa sổ đến ${new Date(st.ngay_kiem_ke).toLocaleDateString('vi-VN')}` : 'Đã hủy phiếu kiểm kê' })
      await load(st.id)
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Thao tác thất bại' }) }
    finally { setBusy(null) }
  }

  function onScan(raw: string) {
    setScan(false)
    const p = parseKhoScan(raw); if (!p) return
    const l = lines.find((x) => (p.kind === 'batch_id' ? x.batch_id === p.value : x.batch_no.toUpperCase() === p.value))
    if (!l) { setMsg({ ok: false, text: `Lô "${p.value}" không có trong phiếu kiểm kê này` }); return }
    setFilter('tat_ca'); setQ(''); setHi(l.id)
    setTimeout(() => refs.current[l.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
  }

  return (
    <div className="kmx">
      <header className="kmx-hd">
        <div className="kmx-hd-txt">
          <span className="kmx-eyebrow">Kiểm kê NVL · {facility?.code || ''}</span>
          <span className="kmx-title">{st ? `${st.code}` : 'Chưa có phiếu kiểm kê'}</span>
        </div>
        {st && <span className={`kmx-chip ${st.status === 'draft' ? 'amb' : st.status === 'counted' ? 'blue' : st.status === 'approved' ? 'ok' : 'red'}`} style={{ flex: '0 0 auto' }}>{RAW_STOCKTAKE_STATUS_LABELS[st.status]}</span>}
        <FacilitySelect value={facilityId} onChange={setFacilityId} facilities={facilities} />
      </header>
      <div className="kmx-body"><div className="kmx-inner">
        {msg && <div className={`kmx-msg ${msg.ok ? 'ok' : 'err'}`}>{msg.text}</div>}
        {loading && !st && <div className="kmx-skel" />}
        {!loading && !st && (
          <section className="kmx-card hero" style={{ gap: 10 }}>
            <span className="kmx-strong" style={{ fontSize: 17 }}>Chưa có phiếu kiểm kê nào</span>
            <span className="kmx-md">Tạo phiếu cho hôm nay: máy chụp số sổ của từng lô còn hàng, bạn đi đếm và cân lại từng lô. Duyệt xong là khóa sổ đến hết ngày kiểm kê, nên làm kiểm kê vào cuối ngày.</span>
            <button type="button" className="kmx-btn" disabled={!canCount || busy === 'create'} onClick={() => act('create')}>{I.plus}Tạo kiểm kê hôm nay</button>
          </section>
        )}
        {st && (
          <>
            <section className="kmx-card" style={{ gap: 8 }}>
              <div className="kmx-row">
                <span className="kmx-col"><span className="kmx-lbl">Tiến độ đếm</span><span className="kmx-num lg">{daDem}<span className="kmx-unit"> / {lines.length} lô</span></span></span>
                <span className="kmx-col" style={{ alignItems: 'flex-end' }}><span className="kmx-sm">ngày {new Date(st.ngay_kiem_ke).toLocaleDateString('vi-VN')}</span>{st.counted_name && <span className="kmx-sm">đếm xong: {st.counted_name}</span>}{st.approved_name && <span className="kmx-sm">duyệt: {st.approved_name}</span>}</span>
              </div>
              <div className="kmx-bar"><span style={{ width: `${lines.length ? Math.round((100 * daDem) / lines.length) : 0}%` }} /></div>
              {editing && daDem === lines.length && lines.length > 0 && <button type="button" className="kmx-btn md" disabled={busy === 'count_done'} onClick={() => act('count_done')}>{I.check}Hoàn tất đếm · gửi duyệt</button>}
              {st.status === 'counted' && (canApprove ? <button type="button" className="kmx-btn md" disabled={busy === 'approve'} onClick={() => act('approve')}>{I.check}Duyệt · điều chỉnh sổ & khóa kỳ</button> : <span className="kmx-md kmx-center">Đã đếm xong, chờ BGĐ duyệt.</span>)}
              {st.status === 'approved' && <span className="kmx-md kmx-center">Phiếu đã duyệt, sổ đã khóa đến hết ngày kiểm kê.</span>}
            </section>
            {editing && (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="kmx-pill" onClick={() => setScan(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{I.qr}Quét tem lô</button>
                  <button type="button" className={`kmx-pill${filter === 'chua' ? '' : ''}`} style={filter === 'chua' ? { background: '#1B4D3E', color: '#fff', borderColor: '#1B4D3E' } : undefined} onClick={() => setFilter((f) => (f === 'chua' ? 'tat_ca' : 'chua'))}>{filter === 'chua' ? `Chưa đếm · ${lines.length - daDem}` : 'Tất cả lô'}</button>
                </div>
                <input className="kmx-text" placeholder="Tìm mã lô, loại mủ…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Tìm lô" />
              </>
            )}
            {!rows.length && !loading && <div className="kmx-card muted kmx-center" style={{ fontSize: 13 }}>{filter === 'chua' && lines.length ? 'Đã đếm hết. Bấm "Hoàn tất đếm" ở trên.' : 'Không có lô'}</div>}
            {rows.map((l) => {
              const e = edit[l.id] ?? { wet: '', drc: '', lyDo: '' }
              const p = preview(l)
              const done = l.counted_wet_kg !== null
              return (
                <section key={l.id} ref={(el) => { refs.current[l.id] = el }} className="kmx-card" aria-label={`Lô ${l.batch_no}`} style={{ gap: 8, boxShadow: hi === l.id ? '0 0 0 2px #E8A838' : undefined }}>
                  <div className="kmx-row">
                    <span className="kmx-mono" style={{ fontSize: 15, fontWeight: 700, color: '#0D2E25' }}>{l.batch_no}</span>
                    {done ? <span className={`kmx-chip ${Math.abs(l.lech_kho_pct ?? 0) > nguong ? 'red' : 'ok'}`}>{I.checkSm}đếm {fmtKg(l.counted_wet_kg)} · {fmtSigned(l.lech_kho_pct, 2)} %</span> : <span className="kmx-chip amb">chưa đếm</span>}
                  </div>
                  <span className="kmx-md">{l.rubber_type_name}{l.supplier_name ? ` · ${l.supplier_name}` : ''}{l.tuoi_ngay !== null ? ` · ${l.tuoi_ngay} ng` : ''}</span>
                  <div className="kmx-grid3" style={{ gap: 6 }}>
                    <div className="kmx-stat"><span className="kmx-lbl" style={{ fontSize: 10 }}>Sổ · ướt</span><span className="kmx-num sm">{fmtKg(l.book_wet_kg)}</span></div>
                    <div className="kmx-stat"><span className="kmx-lbl" style={{ fontSize: 10 }}>DRC</span><span className="kmx-num sm">{l.book_drc_pct ?? '—'} %</span></div>
                    <div className="kmx-stat"><span className="kmx-lbl" style={{ fontSize: 10 }}>Sổ · khô</span><span className="kmx-num sm">{fmtKg(l.book_dry_kg)}</span></div>
                  </div>
                  {editing && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input className="kmx-input" style={{ height: 56, fontSize: 28 }} type="number" inputMode="decimal" placeholder={done ? String(l.counted_wet_kg) : 'kg ướt đếm'} value={e.wet} onChange={(ev) => setEdit((x) => ({ ...x, [l.id]: { ...e, wet: ev.target.value } }))} aria-label={`Kg ướt đếm lô ${l.batch_no}`} />
                        <input className="kmx-text" style={{ width: 96, flex: '0 0 96px', textAlign: 'right' }} type="number" inputMode="decimal" step="0.1" placeholder={`DRC ${l.book_drc_pct ?? ''}`} value={e.drc} onChange={(ev) => setEdit((x) => ({ ...x, [l.id]: { ...e, drc: ev.target.value } }))} aria-label="DRC mới" />
                      </div>
                      {p && <div className="kmx-tint" style={p.vuot ? { background: '#FEE2E2', color: '#B91C1C' } : undefined}><span>Khô {fmtKg(l.book_dry_kg)} → {fmtKg(p.dry)} kg</span><span className="kmx-num sm" style={p.vuot ? { color: '#B91C1C' } : undefined}>{fmtSigned(p.chenh)} kg ({fmtSigned(p.lech, 2)} %)</span></div>}
                      {p?.vuot && <select className="kmx-text" value={e.lyDo} onChange={(ev) => setEdit((x) => ({ ...x, [l.id]: { ...e, lyDo: ev.target.value } }))} aria-label="Lý do lệch"><option value="">— lý do lệch quá {nguong} % —</option>{LY_DO.map((v) => <option key={v} value={v}>{v}</option>)}</select>}
                      <button type="button" className={`kmx-btn ${done ? 'sec' : 'md'}`} disabled={!canCount || !p || busy === l.id || (p.vuot && !e.lyDo)} onClick={() => ghi(l)}>{busy === l.id ? 'Đang ghi…' : done ? 'Ghi lại số đếm' : 'Ghi số đếm'}</button>
                    </>
                  )}
                  {done && l.ly_do && <span className="kmx-sm">Lý do: {l.ly_do}</span>}
                </section>
              )
            })}
            {editing && canCount && <button type="button" className="kmx-btn ghost" style={{ color: '#B91C1C' }} disabled={busy === 'cancel'} onClick={() => { if (window.confirm('Hủy phiếu kiểm kê này?')) act('cancel') }}>Hủy phiếu kiểm kê</button>}
            {list.length > 1 && <span className="kmx-sm kmx-center">Phiếu cũ: {list.filter((x) => x.id !== st.id).slice(0, 3).map((x) => `${x.code} (${RAW_STOCKTAKE_STATUS_LABELS[x.status]})`).join(' · ')}</span>}
          </>
        )}
      </div></div>
      {scan && <OpsQrScanner onClose={() => setScan(false)} onDetect={onScan} />}
    </div>
  )
}
